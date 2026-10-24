import {
  applyEdits,
  collectImagePaths,
  computeEdit,
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
import { assetUrl } from '../../shared/api.js';
import type { ExportKind } from '../../shared/api.js';
import { api } from './api.js';
import { dirOf, joinPath } from './paths.js';

export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'image';
export type ChangeOrigin = 'code' | 'canvas' | 'external' | 'undo' | 'load';

export interface SourceFile {
  role: FileRole;
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
  hasSoffice: boolean;
  measurer: TextMeasurer;
  imageSizes: Record<string, ImageSize>;
  exporting: ExportKind | null;
}

const toastId = { n: 0 };

function makeFile(role: FileRole, path: string | null, source: string): SourceFile {
  return { role, path, source, doc: parse(source), saved: source };
}

function evalScene(deck: SourceFile, theme: SourceFile | null, measurer: TextMeasurer, imageSizes: Record<string, ImageSize>): DeckScene {
  return evaluate(deck.doc, { theme: theme ? theme.doc : null, measurer, imageSizes });
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
  hasSoffice: false,
  measurer: initialMeasurer,
  imageSizes: {},
  exporting: null,
}));

const get = useEditor.getState;
const set = useEditor.setState;

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

export function resolveAsset(path: string, s: EditorState = get()): string {
  if (/^(https?|data):/.test(path)) return path;
  const isFont = s.scene.theme.fonts.some((f) => f.file === path);
  const base = isFont && s.theme?.path ? dirOf(s.theme.path) : s.deck.path ? dirOf(s.deck.path) : null;
  return assetUrl(base ? joinPath(base, path) : path);
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
  const deckPath = get().deck.path;
  for (const p of missing) {
    const abs = await api.resolvePath(deckPath, p);
    const bytes = await api.readBytes(abs);
    found[p] = (bytes && imageSize(bytes)) || { w: 4, h: 3 };
  }
  reevaluate({ imageSizes: { ...get().imageSizes, ...found } });
}

async function loadFonts(): Promise<void> {
  const s = get();
  const fonts: LoadedFont[] = [];
  for (const f of s.scene.theme.fonts) {
    if (!f.file) continue;
    const abs = await api.resolvePath(s.theme?.path ?? s.deck.path, f.file);
    const bytes = await api.readBytes(abs);
    if (bytes) fonts.push({ family: f.family, weight: f.weight, italic: f.italic, data: bytes.slice().buffer as ArrayBuffer });
  }
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
  const abs = await api.resolvePath(s.deck.path, rel);
  if (!force && s.theme?.path === abs) return;
  const source = await api.readText(abs);
  if (source === null) {
    reevaluate({ theme: null, themeError: `Theme-Datei „${rel}“ nicht gefunden`, mode: 'deck' });
    return;
  }
  reevaluate({ theme: makeFile('theme', abs, source), themeError: null });
  api.watch([s.deck.path, abs].filter((p): p is string => !!p));
  void loadFonts();
}

// ---------------------------------------------------------------------------
// Text changes (the single path for every modification)

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
  if (role === 'deck' && themePathOf(next.doc) !== themePathOf(file.doc)) void syncTheme();
  if (role === 'theme') void loadFonts();
  updateTitle();
}

function updateTitle(): void {
  const s = get();
  const dirty = s.deck.source !== s.deck.saved || (!!s.theme && s.theme.source !== s.theme.saved);
  api.setTitle(s.scene.title || fileName(s.deck.path) || 'Unbenannt', dirty);
}

function fileName(p: string | null): string {
  return p ? (p.split(/[\\/]/).pop() ?? p) : '';
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
      const ok = await api.confirm('Objekt trotzdem löschen?', `${res.error}:\n${res.warnings.join('\n')}`);
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

  async newDeck(): Promise<void> {
    if (!(await confirmDiscard())) return;
    const deck = makeFile('deck', null, NEW_DECK_SOURCE);
    set({ undoStack: [], redoStack: [], lastGood: {}, selection: [], mode: 'deck' });
    reevaluate({ deck, theme: null, themeError: null, revision: get().revision + 1, lastOrigin: 'load', slideId: null });
    set({ slideId: get().scene.slides[0]?.id ?? null });
    void loadFonts();
    updateTitle();
  },

  async open(file?: { path: string; source: string } | null): Promise<void> {
    if (!file && !(await confirmDiscard())) return;
    const opened = file ?? (await api.openDialog());
    if (!opened) return;
    const deck = makeFile('deck', opened.path, opened.source);
    set({ undoStack: [], redoStack: [], lastGood: {}, selection: [], mode: 'deck', theme: null, themeError: null, imageSizes: {} });
    reevaluate({ deck, revision: get().revision + 1, lastOrigin: 'load', slideId: null });
    set({ slideId: get().scene.slides[0]?.id ?? null });
    api.watch([opened.path]);
    await syncTheme(true);
    updateTitle();
  },

  async save(as = false): Promise<boolean> {
    const s = get();
    let path = s.deck.path;
    if (!path || as) {
      path = await api.saveDialog(`${s.scene.title || 'praesentation'}.forme`);
      if (!path) return false;
    }
    const ok = await api.writeText(path, s.deck.source);
    if (!ok) {
      toast('Speichern fehlgeschlagen', 'error');
      return false;
    }
    const pathChanged = path !== s.deck.path;
    let theme = s.theme;
    if (theme?.path && theme.source !== theme.saved) {
      if (await api.writeText(theme.path, theme.source)) theme = { ...theme, saved: theme.source };
    }
    set({ deck: { ...get().deck, path, saved: s.deck.source }, theme });
    if (pathChanged) await syncTheme(true);
    api.watch([path, theme?.path].filter((p): p is string => !!p));
    updateTitle();
    toast('Gespeichert');
    return true;
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
    set({ exporting: kind });
    try {
      const res = await api.exportDeck({
        kind,
        deckPath: s.deck.path,
        deckSource: s.deck.source,
        themeSource: s.theme?.source ?? null,
        suggestedName: (fileName(s.deck.path).replace(/\.forme$/, '') || s.scene.title || 'praesentation').replace(/[\\/:*?"<>|]/g, '_'),
      });
      if (res.cancelled) return;
      if (!res.ok) toast(res.error ?? 'Export fehlgeschlagen', 'error');
      else {
        toast(`Exportiert: ${fileName(res.path ?? '')}`);
        for (const l of res.log ?? []) toast(l, 'info');
      }
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

  async init(): Promise<void> {
    set({ hasSoffice: await api.hasSoffice() });
    const initial = await api.initialFile();
    if (initial) await actions.open(initial);
    else updateTitle();
  },
};

async function confirmDiscard(): Promise<boolean> {
  const s = get();
  const dirty = s.deck.source !== s.deck.saved || (!!s.theme && s.theme.source !== s.theme.saved);
  return !dirty || api.confirm('Ungespeicherte Änderungen verwerfen?');
}
