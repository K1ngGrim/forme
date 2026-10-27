import {
  applyEdits,
  collectImagePaths,
  computeEdit,
  createEvalCache,
  createMetricMeasurer,
  evaluate,
  imageSize,
  NEW_DECK_SOURCE,
  parse,
  themePathOf,
} from '@forme/core';
import type { DeckScene, Diagnostic, Document, EditResult, FileRole, ImageSize, Intent, SlideScene, TextEdit, TextMeasurer } from '@forme/core';
import { createFontMeasurer } from '@forme/render';
import type { LoadedFont } from '@forme/render';
import { create } from 'zustand';
import { assetUrl, invalidateAsset, onAssetsLoaded, prepareAssets, resetAssets } from './platform/assets.js';
import { buildPptx, printPdf } from './platform/export.js';
import type { ProjectFS } from './platform/fs.js';
import { folderAccessSupported } from './platform/fs.js';
import { host, HostFS } from './platform/host.js';
import type { HostToEditor } from './platform/host-protocol.js';
import { diffEdit, textHash } from './platform/host-protocol.js';
import { baseName, relativeTo, resolveFrom } from './platform/paths.js';
import type { OpenProject, ProjectInfo } from './platform/projects.js';
import { downloadBlob, listProjects, openProject, safeFileName, saveInfo, saveToFolder, touchProject, zipProject } from './platform/projects.js';

export type ExportKind = 'pdf' | 'pptx' | 'odp';

export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image';
export type ChangeOrigin = 'code' | 'canvas' | 'external' | 'undo' | 'load';

export interface SourceFile {
  role: FileRole;
  /** Project-relative path ("deck.forme"). */
  path: string | null;
  source: string;
  doc: Document;
  saved: string;
}

interface UndoEntry {
  file: FileRole;
  before: string;
  after: string;
  selection: string[];
  slideId: string | null;
  time: number;
  group: string | null;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface EditorState {
  deck: SourceFile;
  theme: SourceFile | null;
  /** Error loading the theme file (shown as diagnostic). */
  themeError: string | null;
  scene: DeckScene;
  lastGood: Record<string, SlideScene>;
  mode: 'deck' | 'theme';
  slideId: string | null;
  selection: string[];
  /** Where the last selection change came from; the code view scrolls only for canvas selections. */
  selectionOrigin: 'canvas' | 'code';
  tool: Tool;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  /** Bumped on every source change not typed in the code view (code view syncs on it). */
  revision: number;
  lastOrigin: ChangeOrigin;
  toasts: Toast[];
  presenting: boolean;
  commandFocus: number;
  zoomFit: number;
  measurer: TextMeasurer;
  imageSizes: Record<string, ImageSize>;
  exporting: ExportKind | null;
  /** Open project (null until one is chosen in the project dialog). */
  project: ProjectInfo | null;
  projectsOpen: boolean;
  saving: boolean;
  /** Bumped when images/fonts finished loading (re-render). */
  assetVersion: number;
  /** Code view next to the canvas (in VS Code hidden by default: its own text editor is the code view). */
  codeVisible: boolean;
}

const toastId = { n: 0 };

function makeFile(role: FileRole, path: string | null, source: string): SourceFile {
  return { role, path, source, doc: parse(source), saved: source };
}

/** Slides whose source and context did not change are reused (only affected slides are re-evaluated). */
const evalCache = createEvalCache();

function evalScene(deck: SourceFile, theme: SourceFile | null, measurer: TextMeasurer, imageSizes: Record<string, ImageSize>): DeckScene {
  return evaluate(deck.doc, { theme: theme ? theme.doc : null, measurer, imageSizes, cache: evalCache });
}

const initialDeck = makeFile('deck', null, NEW_DECK_SOURCE);
const initialMeasurer = createMetricMeasurer();
const initialScene = evalScene(initialDeck, null, initialMeasurer, {});

export const useEditor = create<EditorState>(() => ({
  deck: initialDeck,
  theme: null,
  themeError: null,
  scene: initialScene,
  lastGood: Object.fromEntries(initialScene.slides.map((s) => [s.id, s])),
  mode: 'deck',
  slideId: initialScene.slides[0]?.id ?? null,
  selection: [],
  selectionOrigin: 'canvas',
  tool: 'select',
  undoStack: [],
  redoStack: [],
  revision: 0,
  lastOrigin: 'load',
  toasts: [],
  presenting: false,
  commandFocus: 0,
  zoomFit: 0,
  measurer: initialMeasurer,
  imageSizes: {},
  exporting: null,
  project: null,
  projectsOpen: false,
  saving: false,
  assetVersion: 0,
  codeVisible: !host,
}));

const get = useEditor.getState;
const set = useEditor.setState;

/** File access of the open project (not part of the reactive state). */
let projectFs: ProjectFS | null = null;
/** Last seen modification times of watched files (folder projects). */
const seenModified = new Map<string, number>();

onAssetsLoaded(() => set({ assetVersion: get().assetVersion + 1 }));

// ---------------------------------------------------------------------------
// Derived data

export interface DisplaySlide {
  slide: SlideScene;
  stale: boolean;
}

export function displaySlide(s: EditorState = get()): DisplaySlide | null {
  const slide = s.scene.slides.find((x) => x.id === s.slideId) ?? s.scene.slides[0];
  if (!slide) return null;
  if (slide.hasErrors && s.lastGood[slide.id]) return { slide: s.lastGood[slide.id] as SlideScene, stale: true };
  return { slide, stale: slide.hasErrors };
}

export function activeFile(s: EditorState = get()): SourceFile {
  return s.mode === 'theme' && s.theme ? s.theme : s.deck;
}

export function diagnosticsFor(role: FileRole, s: EditorState = get()): Diagnostic[] {
  const ds = s.scene.diagnostics.filter((d) => (d.file ?? 'deck') === role);
  if (role === 'deck' && s.themeError) {
    const op = s.deck.doc.ops.find((o) => o.verb === 'theme');
    ds.push({ severity: 'error', message: s.themeError, span: op ? op.span : { start: 0, end: 0 }, file: 'deck' });
  }
  return ds;
}

/** Project path of a file referenced in the deck (fonts are relative to the theme file). */
export function projectPath(path: string, s: EditorState = get()): string | null {
  const isFont = s.scene.theme.fonts.some((f) => f.file === path);
  const from = isFont && s.theme?.path ? s.theme.path : (s.deck.path ?? 'deck.forme');
  return resolveFrom(from, path);
}

export function resolveAsset(path: string, s: EditorState = get()): string {
  if (/^(https?|data|blob):/.test(path)) return path;
  const p = projectPath(path, s);
  return p ? assetUrl(p) : '';
}

export function isDirty(s: EditorState = get()): boolean {
  return s.deck.source !== s.deck.saved || (!!s.theme && s.theme.source !== s.theme.saved);
}

// ---------------------------------------------------------------------------
// Evaluation

function reevaluate(partial: Partial<EditorState> = {}): void {
  const s = { ...get(), ...partial };
  const scene = evalScene(s.deck, s.theme, s.measurer, s.imageSizes);
  const lastGood = { ...s.lastGood };
  for (const slide of scene.slides) if (!slide.hasErrors) lastGood[slide.id] = slide;
  let slideId = s.slideId;
  if (!scene.slides.some((x) => x.id === slideId)) slideId = scene.slides[Math.min(scene.slides.length - 1, Math.max(0, s.scene.slides.findIndex((x) => x.id === s.slideId)))]?.id ?? null;
  const slide = scene.slides.find((x) => x.id === slideId);
  const selection = partial.selection ?? s.selection.filter((id) => slide?.byId.has(id));
  set({ ...partial, scene, lastGood, slideId, selection });
  void loadImageSizes(scene);
}

async function loadImageSizes(scene: DeckScene): Promise<void> {
  const paths = new Set<string>();
  for (const s of scene.slides) collectImagePaths(s.nodes, paths);
  const sizes = get().imageSizes;
  const missing = [...paths].filter((p) => !(p in sizes));
  if (!missing.length) return;
  const found: Record<string, ImageSize> = {};
  const fs = projectFs;
  for (const p of missing) {
    const path = projectPath(p);
    const bytes = fs && path ? await fs.readBytes(path) : null;
    found[p] = (bytes && imageSize(bytes)) || { w: 4, h: 3 };
  }
  if (fs !== projectFs) return;
  reevaluate({ imageSizes: { ...get().imageSizes, ...found } });
}

async function loadFonts(): Promise<void> {
  const s = get();
  const fonts: LoadedFont[] = [];
  const fs = projectFs;
  for (const f of s.scene.theme.fonts) {
    if (!f.file || !fs) continue;
    const path = resolveFrom(s.theme?.path ?? s.deck.path ?? 'deck.forme', f.file);
    const bytes = path ? await fs.readBytes(path) : null;
    if (bytes) fonts.push({ family: f.family, weight: f.weight, italic: f.italic, data: bytes.slice().buffer as ArrayBuffer });
  }
  if (fs !== projectFs) return;
  reevaluate({ measurer: fonts.length ? createFontMeasurer(fonts) : createMetricMeasurer() });
}

/** (Re)load the theme referenced by the deck when its path changed. */
async function syncTheme(force = false): Promise<void> {
  const s = get();
  const rel = themePathOf(s.deck.doc);
  if (!rel) {
    if (s.theme || s.themeError) {
      reevaluate({ theme: null, themeError: null, mode: 'deck' });
      void loadFonts();
    }
    return;
  }
  const path = resolveFrom(s.deck.path ?? 'deck.forme', rel);
  if (!force && path && s.theme?.path === path) return;
  const source = path && projectFs ? await projectFs.readText(path) : null;
  if (source === null || !path) {
    reevaluate({ theme: null, themeError: `Theme-Datei „${rel}“ nicht gefunden${path ? '' : ' (liegt außerhalb des Projektordners)'}`, mode: 'deck' });
    return;
  }
  reevaluate({ theme: makeFile('theme', path, source), themeError: null });
  void rememberModified(path);
  void loadFonts();
}

// ---------------------------------------------------------------------------
// Text changes (the single path for every modification)

/** In VS Code the file lives in VS Code: every change made here is sent there as a text edit. */
function pushToHost(role: FileRole, before: string, after: string): void {
  const file = role === 'theme' ? get().theme : get().deck;
  const edit = diffEdit(before, after);
  if (!host || !file?.path || !edit) return;
  host.post({ type: 'edit', path: file.path, hash: textHash(before), edits: [edit] });
}

const GROUP_MS = 1000;

function commit(role: FileRole, text: string, origin: ChangeOrigin, opts: { group?: string | null; select?: string[]; slideId?: string | null } = {}): void {
  const s = get();
  const file = role === 'theme' ? s.theme : s.deck;
  if (!file || file.source === text) return;
  const now = Date.now();
  const undoStack = [...s.undoStack];
  const last = undoStack[undoStack.length - 1];
  const group = opts.group ?? null;
  if (last && group && last.group === group && last.file === role && now - last.time < GROUP_MS && last.after === file.source) {
    undoStack[undoStack.length - 1] = { ...last, after: text, time: now };
  } else {
    undoStack.push({ file: role, before: file.source, after: text, selection: s.selection, slideId: s.slideId, time: now, group });
    if (undoStack.length > 500) undoStack.shift();
  }
  const next: SourceFile = { ...file, source: text, doc: parse(text) };
  const partial: Partial<EditorState> = {
    [role]: next,
    undoStack,
    redoStack: [],
    lastOrigin: origin,
    revision: origin === 'code' ? s.revision : s.revision + 1,
  };
  if (opts.select) {
    partial.selection = opts.select;
    partial.selectionOrigin = 'canvas';
  }
  if (opts.slideId !== undefined) partial.slideId = opts.slideId;
  reevaluate(partial);
  if (origin !== 'external' && origin !== 'load') pushToHost(role, file.source, text);
  if (role === 'deck' && themePathOf(next.doc) !== themePathOf(file.doc)) void syncTheme();
  if (role === 'theme') void loadFonts();
  updateTitle();
  scheduleAutosave();
}

function updateTitle(): void {
  const s = get();
  const title = s.scene.title || s.project?.name || 'Unbenannt';
  document.title = `${isDirty(s) ? '• ' : ''}${title} – Forme`;
}

// ---------------------------------------------------------------------------
// Saving: browser projects save automatically, folders on Ctrl+S

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(): void {
  if (get().project?.kind !== 'local') return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    void writeFiles();
  }, 600);
}

async function writeFiles(): Promise<boolean> {
  const s = get();
  const fs = projectFs;
  if (!fs || !s.project) return false;
  set({ saving: true });
  try {
    const deckSrc = s.deck.source;
    const themeSrc = s.theme?.source;
    if (s.deck.path && deckSrc !== s.deck.saved) await fs.writeText(s.deck.path, deckSrc);
    if (s.theme?.path && themeSrc !== undefined && themeSrc !== s.theme.saved) await fs.writeText(s.theme.path, themeSrc);
    const cur = get();
    if (fs !== projectFs) return false;
    set({
      deck: { ...cur.deck, saved: deckSrc },
      theme: cur.theme && themeSrc !== undefined ? { ...cur.theme, saved: themeSrc } : cur.theme,
      project: await touchProject(cur.project ?? s.project),
    });
    for (const p of [s.deck.path, s.theme?.path]) if (p) void rememberModified(p);
    updateTitle();
    return true;
  } catch (e) {
    toast(`Speichern fehlgeschlagen: ${(e as Error).message}`, 'error');
    return false;
  } finally {
    set({ saving: false });
  }
}

async function rememberModified(path: string): Promise<void> {
  const m = projectFs ? await projectFs.modified(path) : null;
  if (m !== null) seenModified.set(path, m);
}

/** Detect edits made by other programs to the deck or theme of a folder project. */
async function pollExternalChanges(): Promise<void> {
  const s = get();
  const fs = projectFs;
  if (!fs || s.project?.kind !== 'folder' || document.visibilityState !== 'visible') return;
  for (const path of [s.deck.path, s.theme?.path]) {
    if (!path) continue;
    const m = await fs.modified(path);
    if (m === null || m === seenModified.get(path)) continue;
    seenModified.set(path, m);
    const text = await fs.readText(path);
    if (text !== null && fs === projectFs) actions.fileChanged(path, text);
  }
}

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId.n;
  set({ toasts: [...get().toasts, { id, text, kind }] });
  setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3500);
}

// ---------------------------------------------------------------------------
// Actions

export const actions = {
  /** Changes typed in the code view. */
  codeChanged(role: FileRole, text: string): void {
    commit(role, text, 'code', { group: 'typing' });
  },

  applyEdits(role: FileRole, edits: TextEdit[], origin: ChangeOrigin = 'canvas', opts: { select?: string[]; slideId?: string | null; group?: string } = {}): void {
    const file = role === 'theme' ? get().theme : get().deck;
    if (!file) return;
    commit(role, applyEdits(file.source, edits).text, origin, opts);
  },

  /** Editor gesture -> intent -> minimal text edits -> re-evaluation. */
  async intent(intent: Intent, group?: string): Promise<boolean> {
    const s = get();
    const display = displaySlide(s);
    const slideLevel = ['addSlide', 'deleteSlide', 'moveSlide', 'rename', 'command'].includes(intent.type);
    if (display?.stale && !slideLevel) {
      toast('Die Folie enthält Fehler und ist bis zur Korrektur nicht editierbar.', 'error');
      return false;
    }
    const ctx = {
      deck: s.deck.doc,
      theme: s.theme?.doc ?? null,
      scene: s.scene,
      mode: s.mode,
      evaluate: (src: string) => evaluate(parse(src), { theme: s.theme?.doc ?? null, measurer: s.measurer, imageSizes: s.imageSizes }),
    };
    let res: EditResult = computeEdit(ctx, intent);
    if (res.error && intent.type === 'delete' && res.warnings.length) {
      const ok = window.confirm(`Objekt trotzdem löschen?\n\n${res.error}:\n${res.warnings.join('\n')}`);
      if (!ok) return false;
      res = computeEdit(ctx, { ...intent, force: true });
    }
    if (res.error) {
      toast(res.error, 'error');
      return false;
    }
    if (!res.edits.length) return false;
    actions.applyEdits(res.file, res.edits, 'canvas', {
      ...(res.select ? { select: res.select } : {}),
      ...(res.slide ? { slideId: res.slide } : {}),
      ...(group ? { group } : {}),
    });
    return true;
  },

  undo(): void {
    const s = get();
    const entry = s.undoStack[s.undoStack.length - 1];
    if (!entry) return;
    const file = entry.file === 'theme' ? s.theme : s.deck;
    if (!file) return;
    const next: SourceFile = { ...file, source: entry.before, doc: parse(entry.before) };
    pushToHost(entry.file, file.source, entry.before);
    reevaluate({
      [entry.file]: next,
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, entry],
      lastOrigin: 'undo',
      revision: s.revision + 1,
      selection: entry.selection,
      slideId: entry.slideId ?? s.slideId,
    });
    if (entry.file === 'deck' && themePathOf(next.doc) !== themePathOf(file.doc)) void syncTheme();
    updateTitle();
  },

  redo(): void {
    const s = get();
    const entry = s.redoStack[s.redoStack.length - 1];
    if (!entry) return;
    const file = entry.file === 'theme' ? s.theme : s.deck;
    if (!file) return;
    const next: SourceFile = { ...file, source: entry.after, doc: parse(entry.after) };
    pushToHost(entry.file, file.source, entry.after);
    reevaluate({
      [entry.file]: next,
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, entry],
      lastOrigin: 'undo',
      revision: s.revision + 1,
    });
    if (entry.file === 'deck' && themePathOf(next.doc) !== themePathOf(file.doc)) void syncTheme();
    updateTitle();
  },

  select(ids: string[], origin: 'canvas' | 'code' = 'canvas'): void {
    set({ selection: ids, selectionOrigin: origin });
  },

  setSlide(id: string): void {
    if (get().slideId === id) return;
    set({ slideId: id, selection: [], selectionOrigin: 'canvas' });
  },

  /** Cursor moved in the code view: select the slide and objects of the op under the cursor. */
  cursorMoved(role: FileRole, offset: number): void {
    const s = get();
    const file = role === 'theme' ? s.theme : s.deck;
    if (!file) return;
    const line = file.doc.lines.find((l) => offset >= l.start && offset <= l.fullEnd);
    if (!line) return;
    let slideId = s.slideId;
    if (role === 'deck') {
      const slide = s.scene.slides.find((sl) => offset >= sl.op.blockSpan.start && offset <= sl.op.blockSpan.end + 1);
      if (slide) slideId = slide.id;
    }
    const slide = s.scene.slides.find((sl) => sl.id === slideId);
    const ids = slide?.opTargets.get(`${role}:${line.index}`) ?? [];
    if (slideId === s.slideId && ids.join() === s.selection.join()) return;
    set({ slideId, selection: ids, selectionOrigin: 'code' });
  },

  setTool(tool: Tool): void {
    set({ tool });
  },

  setMode(mode: 'deck' | 'theme'): void {
    const s = get();
    if (mode === 'theme' && !s.theme) {
      toast('Dieses Deck verwendet das eingebaute Standard-Theme. Für den Theme-Modus eine Theme-Datei per „theme \"./pfad.forme\"“ einbinden.', 'error');
      return;
    }
    set({ mode, revision: s.revision + 1, lastOrigin: 'load' });
  },

  /** Show the project dialog (templates, recent projects, folders, import). */
  showProjects(on = true): void {
    set({ projectsOpen: on });
  },

  /** Switch to a project: load its deck and theme. */
  async openProject(project: OpenProject): Promise<boolean> {
    if (get().project && !(await flushOrConfirm())) return false;
    const source = await project.fs.readText(project.info.deckPath);
    if (source === null) {
      toast(`„${project.info.deckPath}“ wurde im Projekt nicht gefunden`, 'error');
      return false;
    }
    projectFs = project.fs;
    resetAssets(project.fs);
    seenModified.clear();
    evalCache.slides.clear();
    try {
      if (project.info.kind !== 'host') localStorage.setItem('forme.lastProject', JSON.stringify({ kind: project.info.kind, id: project.info.id }));
    } catch {
      // storage unavailable (private mode): only the last-project shortcut is lost
    }
    const deck = makeFile('deck', project.info.deckPath, source);
    set({ undoStack: [], redoStack: [], lastGood: {}, selection: [], mode: 'deck', theme: null, themeError: null, imageSizes: {}, project: project.info, projectsOpen: false });
    reevaluate({ deck, revision: get().revision + 1, lastOrigin: 'load', slideId: null });
    set({ slideId: get().scene.slides[0]?.id ?? null });
    void rememberModified(project.info.deckPath);
    await syncTheme(true);
    if (!get().theme) void loadFonts();
    updateTitle();
    return true;
  },

  async save(): Promise<boolean> {
    if (host) {
      host.post({ type: 'save' });
      return true;
    }
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
    const ok = await writeFiles();
    if (ok && get().project?.kind === 'folder') toast('Gespeichert');
    return ok;
  },

  /** Copy a browser project into a folder on disk (Chrome/Edge) and continue there. */
  async saveToFolder(): Promise<void> {
    const s = get();
    if (!s.project || !projectFs) return;
    if (!folderAccessSupported()) {
      toast('Dieser Browser kann keine Ordner beschreiben. Stattdessen „Als ZIP herunterladen“ verwenden.', 'error');
      return;
    }
    await writeFiles();
    const next = await saveToFolder({ info: s.project, fs: projectFs });
    if (!next) return;
    await actions.openProject(next);
    toast(`Projekt liegt jetzt im Ordner „${next.info.name}“`);
  },

  async downloadZip(): Promise<void> {
    const s = get();
    if (!s.project || !projectFs) return;
    await writeFiles();
    downloadBlob(`${safeFileName(s.project.name)}.zip`, await zipProject({ info: s.project, fs: projectFs }));
  },

  async renameProject(name: string): Promise<void> {
    const s = get();
    if (!s.project || !name.trim() || s.project.kind !== 'local') return;
    const info = { ...s.project, name: name.trim() };
    await saveInfo(info);
    set({ project: info });
    updateTitle();
  },

  /** Let the user pick an image, copy it into the project and return its path relative to the deck. */
  async addImage(): Promise<string | null> {
    const file = await pickFile('image/png,image/jpeg,image/gif,image/svg+xml,image/webp');
    const s = get();
    if (!file || !projectFs || !s.deck.path) return null;
    const existing = new Set(await projectFs.list());
    const clean = file.name.replace(/[^\w.\-äöüÄÖÜß]+/g, '_');
    let path = `img/${clean}`;
    for (let i = 2; existing.has(path); i++) path = `img/${clean.replace(/(\.[^.]+)?$/, `-${i}$1`)}`;
    await projectFs.writeBytes(path, new Uint8Array(await file.arrayBuffer()));
    invalidateAsset(path);
    return relativeTo(s.deck.path, path);
  },

  /** External change of a watched file. */
  fileChanged(path: string, source: string): void {
    const s = get();
    if (s.deck.path === path && s.deck.source !== source) {
      commit('deck', source, 'external');
      set({ deck: { ...get().deck, saved: source } });
    } else if (s.theme?.path === path && s.theme.source !== source) {
      commit('theme', source, 'external');
      set({ theme: { ...(get().theme as SourceFile), saved: source } });
    }
    updateTitle();
  },

  async exportDeck(kind: ExportKind): Promise<void> {
    const s = get();
    if (s.exporting) return;
    if (host) {
      // printing and downloads do not work in a webview: the extension exports from disk
      host.post({ type: 'export', kind });
      return;
    }
    if (kind === 'odp') {
      toast('ODP braucht LibreOffice und ist im Browser nicht verfügbar. Per CLI: pnpm forme render deck.forme --out deck.odp', 'error');
      return;
    }
    set({ exporting: kind });
    try {
      const paths = new Set<string>();
      for (const sl of s.scene.slides) {
        collectImagePaths(sl.nodes, paths);
        if (sl.background.image) paths.add(sl.background.image);
      }
      for (const f of s.scene.theme.fonts) if (f.file) paths.add(f.file);
      await prepareAssets([...paths].map((p) => projectPath(p)).filter((p): p is string => !!p));
      const name = safeFileName(s.scene.title || s.project?.name || 'praesentation');
      if (kind === 'pdf') {
        await printPdf(s.scene, (p) => resolveAsset(p));
        return;
      }
      const fs = projectFs;
      const { blob, log } = await buildPptx(s.scene, async (p) => {
        const path = projectPath(p);
        return fs && path ? fs.readBytes(path) : null;
      });
      downloadBlob(`${name}.pptx`, blob);
      toast(`Exportiert: ${name}.pptx`);
      for (const l of log) toast(`[${l.slide}${l.id ? ` @${l.id}` : ''}] ${l.message}`);
    } catch (e) {
      toast(`Export fehlgeschlagen: ${(e as Error).message}`, 'error');
    } finally {
      set({ exporting: null });
    }
  },

  present(on: boolean): void {
    set({ presenting: on });
  },

  focusCommandLine(): void {
    set({ commandFocus: get().commandFocus + 1 });
  },

  zoomToFit(): void {
    set({ zoomFit: get().zoomFit + 1 });
  },

  showCode(on: boolean): void {
    set({ codeVisible: on });
  },

  /** An image or font of the project changed on disk. */
  assetChanged(path: string): void {
    invalidateAsset(path);
    const s = get();
    const sizes = Object.fromEntries(Object.entries(s.imageSizes).filter(([p]) => projectPath(p) !== path));
    reevaluate({ imageSizes: sizes, assetVersion: s.assetVersion + 1 });
    if (s.scene.theme.fonts.some((f) => f.file && resolveFrom(s.theme?.path ?? s.deck.path ?? 'deck.forme', f.file) === path)) void loadFonts();
  },

  /** Start: reopen the last browser project, otherwise show the project dialog. */
  async init(): Promise<void> {
    if (host) {
      connectHost();
      return;
    }
    let last: { kind: string; id: string } | null = null;
    try {
      last = JSON.parse(localStorage.getItem('forme.lastProject') ?? 'null') as { kind: string; id: string } | null;
    } catch {
      last = null;
    }
    const info = last && last.kind === 'local' ? (await listProjects()).find((p) => p.id === last.id) : undefined;
    const project = info ? await openProject(info) : null;
    if (project) await actions.openProject(project);
    else set({ projectsOpen: true });
    setInterval(() => void pollExternalChanges(), 2000);
  },
};

/** Before switching projects: browser projects are saved, folders ask about unsaved edits. */
async function flushOrConfirm(): Promise<boolean> {
  const s = get();
  if (s.project?.kind === 'host') return true;
  if (s.project?.kind === 'local') {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
    await writeFiles();
    return true;
  }
  return !isDirty(s) || window.confirm('Ungespeicherte Änderungen verwerfen?');
}

/** Inside VS Code: the extension says which deck to open and reports changes made there. */
function connectHost(): void {
  const bridge = host;
  if (!bridge) return;
  const fs = new HostFS(bridge);
  const roleOf = (path: string): FileRole | null => {
    const s = get();
    return s.deck.path === path ? 'deck' : s.theme?.path === path ? 'theme' : null;
  };
  bridge.on((m: HostToEditor) => {
    switch (m.type) {
      case 'init':
        void actions.openProject({ info: { kind: 'host', id: 'vscode', name: m.name, deckPath: m.deckPath, updated: Date.now() }, fs }).then(() => {
          if (m.mode === 'theme') actions.setMode('theme');
        });
        break;
      case 'text':
        actions.fileChanged(m.path, m.text);
        break;
      case 'cursor': {
        const role = roleOf(m.path);
        if (role) actions.cursorMoved(role, m.offset);
        break;
      }
      case 'asset':
        actions.assetChanged(m.path);
        break;
      case 'command':
        if (m.command === 'undo') actions.undo();
        else if (m.command === 'redo') actions.redo();
        else if (m.command === 'commandLine') actions.focusCommandLine();
        else if (m.command === 'themeMode') actions.setMode(get().mode === 'theme' ? 'deck' : 'theme');
        else if (m.command === 'present') actions.present(true);
        else if (m.command === 'toggleCode') actions.showCode(!get().codeVisible);
        break;
      default:
        break;
    }
  });
  // canvas selection -> highlight the object's ops in VS Code's text editor
  useEditor.subscribe((s, prev) => {
    if (s.selection === prev.selection || s.selectionOrigin !== 'canvas') return;
    const file = activeFile(s);
    const slide = displaySlide(s)?.slide;
    if (!file.path || !slide) return;
    const nodes = s.selection.map((id) => slide.byId.get(id)).filter((n) => !!n);
    const spans = nodes.flatMap((n) => n.touchedBy.filter((o) => o.file === file.role).map((o) => o.span));
    const origin = nodes[0]?.origin.file === file.role ? nodes[0].origin.span : (spans[0] ?? null);
    bridge.post({ type: 'select', path: file.path, reveal: origin, spans });
  });
  bridge.post({ type: 'ready' });
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function projectFileName(): string {
  const p = get().deck.path;
  return p ? baseName(p) : '';
}
