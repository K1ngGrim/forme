import { idbDelete, idbGet, idbKeys, idbPut, STORES } from './idb.js';
import { normalizePath } from './paths.js';

/** Files of one project. Paths are project-relative ("deck.forme", "img/a.png"). */
export interface ProjectFS {
  readonly kind: 'local' | 'folder';
  readText(path: string): Promise<string | null>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /** All file paths of the project. */
  list(): Promise<string[]>;
  /** Last modification time (folders only, for detecting external edits). */
  modified(path: string): Promise<number | null>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function checked(path: string): string {
  const p = normalizePath(path);
  if (p === null || p === '') throw new Error(`Ungültiger Pfad „${path}“`);
  return p;
}

// ---------------------------------------------------------------------------
// Browser-local projects (IndexedDB): work in every browser, saved automatically

type Stored = string | Uint8Array;

export class LocalFS implements ProjectFS {
  readonly kind = 'local';
  constructor(readonly projectId: string) {}

  private key(path: string): [string, string] {
    return [this.projectId, checked(path)];
  }

  private async get(path: string): Promise<Stored | undefined> {
    const p = normalizePath(path);
    if (!p) return undefined;
    return idbGet<Stored>(STORES.files, [this.projectId, p]);
  }

  async readText(path: string): Promise<string | null> {
    const v = await this.get(path);
    if (v === undefined) return null;
    return typeof v === 'string' ? v : decoder.decode(v);
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const v = await this.get(path);
    if (v === undefined) return null;
    return typeof v === 'string' ? encoder.encode(v) : v;
  }

  async writeText(path: string, text: string): Promise<void> {
    await idbPut(STORES.files, text, this.key(path));
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await idbPut(STORES.files, data, this.key(path));
  }

  async list(): Promise<string[]> {
    const keys = await idbKeys(STORES.files, IDBKeyRange.bound([this.projectId, ''], [this.projectId, '￿']));
    return keys.map((k) => (k as [string, string])[1]);
  }

  async modified(): Promise<number | null> {
    return null;
  }

  async removeAll(): Promise<void> {
    await idbDelete(STORES.files, IDBKeyRange.bound([this.projectId, ''], [this.projectId, '￿']));
  }
}

// ---------------------------------------------------------------------------
// Real folders on disk (File System Access API: Chrome, Edge, Opera)

export interface PermissionHandle {
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function folderAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Ask for read/write access to a remembered folder (needs a user gesture). */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as PermissionHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export class FolderFS implements ProjectFS {
  readonly kind = 'folder';
  constructor(readonly root: FileSystemDirectoryHandle) {}

  private async dir(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let d = this.root;
    for (const s of segments) {
      try {
        d = await d.getDirectoryHandle(s, { create });
      } catch {
        return null;
      }
    }
    return d;
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const p = normalizePath(path);
    if (!p) return null;
    const parts = p.split('/');
    const name = parts.pop() as string;
    const d = await this.dir(parts, create);
    if (!d) return null;
    try {
      return await d.getFileHandle(name, { create });
    } catch {
      return null;
    }
  }

  async readText(path: string): Promise<string | null> {
    const f = await this.file(path, false);
    return f ? (await f.getFile()).text() : null;
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const f = await this.file(path, false);
    return f ? new Uint8Array(await (await f.getFile()).arrayBuffer()) : null;
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.writeBytes(path, encoder.encode(text));
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const f = await this.file(checked(path), true);
    if (!f) throw new Error(`„${path}“ kann nicht geschrieben werden`);
    const w = await f.createWritable();
    await w.write(data.slice().buffer as ArrayBuffer);
    await w.close();
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (d: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> => {
      for await (const [name, h] of (d as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
        if (name.startsWith('.') || name === 'node_modules') continue;
        if (h.kind === 'file') out.push(prefix + name);
        else if (depth < 6) await walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
      }
    };
    await walk(this.root, '', 0);
    return out.sort();
  }

  async modified(path: string): Promise<number | null> {
    const f = await this.file(path, false);
    return f ? (await f.getFile()).lastModified : null;
  }
}
