import { unzipSync, zipSync } from 'fflate';
import type { ProjectFS } from './fs.js';
import { ensurePermission, FolderFS, folderAccessSupported, LocalFS } from './fs.js';
import { idbDelete, idbGetAll, idbPut, STORES } from './idb.js';
import { baseName, normalizePath } from './paths.js';

/**
 * Projects are folders of Forme files plus assets. Two kinds, both without any account:
 * - local:  stored in this browser (IndexedDB), saved automatically
 * - folder: a real folder on disk, opened via the File System Access API
 */
export type ProjectInfo =
  | { kind: 'local'; id: string; name: string; deckPath: string; updated: number }
  /** Opened by the VS Code extension (files come from VS Code, nothing is stored here). */
  | { kind: 'host'; id: string; name: string; deckPath: string; updated: number }
  | { kind: 'folder'; id: string; name: string; deckPath: string; updated: number; handle: FileSystemDirectoryHandle };

export interface OpenProject {
  info: ProjectInfo;
  fs: ProjectFS;
}

export type FileMap = Record<string, string | Uint8Array>;

function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export async function listProjects(): Promise<ProjectInfo[]> {
  const locals = await idbGetAll<Extract<ProjectInfo, { kind: 'local' }>>(STORES.projects);
  const folders = await idbGetAll<Extract<ProjectInfo, { kind: 'folder' }>>(STORES.folders);
  return [...locals, ...folders].sort((a, b) => b.updated - a.updated);
}

export function fsFor(info: ProjectInfo): ProjectFS {
  if (info.kind === 'host') throw new Error('Projekte aus VS Code kommen über die Erweiterung');
  return info.kind === 'local' ? new LocalFS(info.id) : new FolderFS(info.handle);
}

export async function saveInfo(info: ProjectInfo): Promise<void> {
  if (info.kind === 'host') return; // VS Code owns these files, nothing to remember here
  await idbPut(info.kind === 'local' ? STORES.projects : STORES.folders, info);
}

export async function touchProject(info: ProjectInfo): Promise<ProjectInfo> {
  const next = { ...info, updated: Date.now() };
  await saveInfo(next);
  return next;
}

export async function createLocalProject(name: string, files: FileMap, deckPath: string): Promise<OpenProject> {
  const info: ProjectInfo = { kind: 'local', id: newId(), name, deckPath, updated: Date.now() };
  const fs = new LocalFS(info.id);
  for (const [path, data] of Object.entries(files)) {
    if (typeof data === 'string') await fs.writeText(path, data);
    else await fs.writeBytes(path, data);
  }
  await saveInfo(info);
  return { info, fs };
}

/** Open a project. Remembered folders ask for permission again (needs a click). */
export async function openProject(info: ProjectInfo): Promise<OpenProject | null> {
  if (info.kind === 'folder' && !(await ensurePermission(info.handle))) return null;
  return { info: await touchProject(info), fs: fsFor(info) };
}

export async function deleteProject(info: ProjectInfo): Promise<void> {
  if (info.kind === 'host') return;
  if (info.kind === 'local') {
    await new LocalFS(info.id).removeAll();
    await idbDelete(STORES.projects, info.id);
  } else await idbDelete(STORES.folders, info.id);
}

/** Deck files of a project: .forme files whose first operation is `deck` or `slide`. */
export async function findDecks(fs: ProjectFS): Promise<string[]> {
  const decks: string[] = [];
  for (const p of await fs.list()) {
    if (!p.endsWith('.forme')) continue;
    const text = (await fs.readText(p)) ?? '';
    const first = text.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
    if (first && /^(deck|slide)\b/.test(first.trim())) decks.push(p);
  }
  return decks.sort((a, b) => (baseName(a) === 'deck.forme' ? -1 : 0) - (baseName(b) === 'deck.forme' ? -1 : 0) || a.localeCompare(b));
}

/** Let the user pick a folder on disk. */
export async function pickFolder(): Promise<{ handle: FileSystemDirectoryHandle; decks: string[] } | null> {
  if (!folderAccessSupported() || !window.showDirectoryPicker) return null;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await window.showDirectoryPicker({ id: 'forme', mode: 'readwrite' });
  } catch {
    return null; // cancelled
  }
  return { handle, decks: await findDecks(new FolderFS(handle)) };
}

export async function registerFolder(handle: FileSystemDirectoryHandle, deckPath: string): Promise<OpenProject> {
  const existing = (await idbGetAll<Extract<ProjectInfo, { kind: 'folder' }>>(STORES.folders)).find((f) => f.name === handle.name && f.deckPath === deckPath);
  const info: ProjectInfo = { kind: 'folder', id: existing?.id ?? newId(), name: handle.name, deckPath, updated: Date.now(), handle };
  await saveInfo(info);
  return { info, fs: new FolderFS(handle) };
}

/** Copy all files of a project into a folder on disk and continue working there. */
export async function saveToFolder(project: OpenProject): Promise<OpenProject | null> {
  const picked = await pickFolder();
  if (!picked) return null;
  const target = new FolderFS(picked.handle);
  for (const path of await project.fs.list()) {
    const data = await project.fs.readBytes(path);
    if (data) await target.writeBytes(path, data);
  }
  return registerFolder(picked.handle, project.info.deckPath);
}

/** Read uploaded files (a .zip or a folder selected with webkitdirectory). */
export async function readUpload(files: File[]): Promise<{ name: string; files: FileMap } | null> {
  if (!files.length) return null;
  const out: FileMap = {};
  const first = files[0] as File;
  if (files.length === 1 && first.name.toLowerCase().endsWith('.zip')) {
    const entries = unzipSync(new Uint8Array(await first.arrayBuffer()));
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
      out[name] = data;
    }
    return { name: first.name.replace(/\.zip$/i, ''), files: stripCommonFolder(out) };
  }
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const p = normalizePath(rel);
    if (p) out[p] = new Uint8Array(await f.arrayBuffer());
  }
  const top = ((first as File & { webkitRelativePath?: string }).webkitRelativePath || '').split('/')[0] || 'Import';
  return { name: top, files: stripCommonFolder(out) };
}

function stripCommonFolder(files: FileMap): FileMap {
  const paths = Object.keys(files);
  const tops = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  if (tops.size !== 1 || tops.has('')) return files;
  const top = [...tops][0] as string;
  return Object.fromEntries(Object.entries(files).map(([p, d]) => [p.slice(top.length + 1), d]));
}

/** Pick deck files out of an uploaded file map. */
export function decksIn(files: FileMap): string[] {
  const dec = new TextDecoder();
  return Object.entries(files)
    .filter(([p, d]) => {
      if (!p.endsWith('.forme')) return false;
      const text = typeof d === 'string' ? d : dec.decode(d);
      const first = text.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
      return !!first && /^(deck|slide)\b/.test(first.trim());
    })
    .map(([p]) => p)
    .sort((a, b) => (baseName(a) === 'deck.forme' ? -1 : 0) - (baseName(b) === 'deck.forme' ? -1 : 0) || a.localeCompare(b));
}

export async function zipProject(project: OpenProject): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const path of await project.fs.list()) {
    const data = await project.fs.readBytes(path);
    if (data) entries[path] = data;
  }
  return new Blob([zipSync(entries, { level: 6 }).slice().buffer as ArrayBuffer], { type: 'application/zip' });
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'praesentation';
}
