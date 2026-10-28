import type { FileRole, Span } from './diagnostics.js';
import { escapeString, isRawString, unescapeString } from './lexer.js';
import type { Document, OpNode } from './parser.js';
import { argByKey, positional, walkOps } from './parser.js';
import type { WriteValue } from './printer.js';
import { formatNumber, formatRawString, formatValue, wrapIfSpaced } from './printer.js';
import type { Box, DeckScene, Prov, SceneNode, SlideScene } from './scene.js';
import { referencedIds } from './values.js';

export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

export interface EditResult {
  file: FileRole;
  edits: TextEdit[];
  /** Non-fatal notes for the user (e.g. dangling references on delete). */
  warnings: string[];
  /** Objects to select after applying. */
  select?: string[];
  /** Slide to show after applying. */
  slide?: string;
  /** The intent could not be applied. */
  error?: string;
}

export type ArrangeVerb = 'align' | 'distribute' | 'stack' | 'grid';

export type Intent =
  | { type: 'move'; slide: string; ids: string[]; dx: number; dy: number }
  | { type: 'resize'; slide: string; id: string; box: Box; height: boolean }
  | { type: 'setProps'; slide: string; id: string; props: Record<string, WriteValue> }
  | { type: 'text'; slide: string; id: string; text: string }
  | { type: 'create'; slide: string; kind: string; props: Record<string, WriteValue>; content?: string }
  | { type: 'delete'; slide: string; ids: string[]; force?: boolean }
  | { type: 'duplicate'; slide: string; ids: string[] }
  | { type: 'arrange'; slide: string; verb: ArrangeVerb; mode?: string; ids: string[]; bake: boolean; extra?: string }
  | { type: 'number'; slide: string; id: string; counter: string; caption: string }
  | { type: 'z'; slide: string; id: string; mode: 'front' | 'back' | 'forward' | 'backward' }
  /** Move an object to another position inside its row/column container. */
  | { type: 'reorder'; slide: string; id: string; index: number }
  | { type: 'rename'; from: string; to: string }
  | { type: 'command'; slide: string; text: string }
  | { type: 'addSlide'; after?: string; layout?: string }
  | { type: 'deleteSlide'; slide: string }
  | { type: 'moveSlide'; slide: string; to: number };

export interface EditContext {
  deck: Document;
  theme: Document | null;
  scene: DeckScene;
  /** 'theme' = theme editing mode: gestures change the theme file. */
  mode: 'deck' | 'theme';
  /** Re-evaluate a modified deck source (needed for baking semantic ops). */
  evaluate?: (deckSource: string) => DeckScene;
}

// ---------------------------------------------------------------------------
// Applying edits

/** Apply non-overlapping edits given in original coordinates. Returns new text and the inverse edits. */
export function applyEdits(src: string, edits: TextEdit[]): { text: string; inverse: TextEdit[] } {
  const sorted = edits.map((e, i) => ({ e, i })).sort((a, b) => a.e.from - b.e.from || a.i - b.i);
  let out = '';
  let pos = 0;
  let delta = 0;
  const inverse: TextEdit[] = [];
  for (const { e } of sorted) {
    if (e.from < pos) continue; // overlapping edit: skip defensively
    out += src.slice(pos, e.from) + e.insert;
    const removed = src.slice(e.from, e.to);
    inverse.push({ from: e.from + delta, to: e.from + delta + e.insert.length, insert: removed });
    delta += e.insert.length - (e.to - e.from);
    pos = e.to;
  }
  out += src.slice(pos);
  return { text: out, inverse };
}

/** Map a position through edits (for cursor/selection preservation). */
export function mapPos(pos: number, edits: TextEdit[]): number {
  let d = 0;
  for (const e of [...edits].sort((a, b) => a.from - b.from)) {
    if (e.to <= pos) d += e.insert.length - (e.to - e.from);
    else if (e.from < pos) return e.from + d + e.insert.length;
  }
  return pos + d;
}

// ---------------------------------------------------------------------------
// Builder

interface Override {
  node: SceneNode;
  props: Map<string, string>;
  anchor: OpNode | null;
}

class Builder {
  readonly edits: TextEdit[] = [];
  readonly themeEdits: TextEdit[] = [];
  readonly warnings: string[] = [];
  readonly overrides = new Map<string, Override>();
  readonly themeOverrides = new Map<string, Override>();
  readonly appended = new Map<OpNode, string[]>();
  readonly replaced = new Set<string>();
  error: string | undefined;

  constructor(
    readonly ctx: EditContext,
    readonly slide: SlideScene,
  ) {}

  doc(file: FileRole): Document {
    return file === 'theme' ? (this.ctx.theme as Document) : this.ctx.deck;
  }

  push(file: FileRole, e: TextEdit): void {
    (file === 'theme' ? this.themeEdits : this.edits).push(e);
  }

  replace(file: FileRole, span: Span, text: string): void {
    const key = `${file}:${span.start}:${span.end}`;
    if (this.replaced.has(key)) {
      const list = file === 'theme' ? this.themeEdits : this.edits;
      const i = list.findIndex((e) => e.from === span.start && e.to === span.end);
      if (i >= 0) list.splice(i, 1);
    }
    this.replaced.add(key);
    this.push(file, { from: span.start, to: span.end, insert: text });
  }

  opOf(file: FileRole, line: number): OpNode | null {
    const doc = file === 'theme' ? this.ctx.theme : this.ctx.deck;
    return doc?.lines[line]?.op ?? null;
  }

  slideOp(): OpNode {
    return this.ctx.deck.lines[this.slide.op.line]?.op as OpNode;
  }

  inSlide(ref: { file: FileRole; span: Span }): boolean {
    const b = this.slide.op.blockSpan;
    return ref.file === 'deck' && ref.span.start > b.start && ref.span.end <= b.end;
  }

  appendArg(file: FileRole, op: OpNode, key: string, text: string): void {
    const list = this.appended.get(op) ?? [];
    list.push(`${key}=${text}`);
    this.appended.set(op, list);
    void file;
  }

  /** Write one property following the write-back rules. */
  writeProp(node: SceneNode, key: string, value: WriteValue): void {
    const prov = node.prov[key];
    const text = wrapIfSpaced(formatValue(value));
    if (prov?.layout) {
      // placed by a layout container: positions follow the flow (reorder instead),
      // a new size becomes the object's own size so the container reflows around it
      if (key === 'x' || key === 'y') return;
      const file: FileRole = node.origin.file;
      const own = file === 'deck' ? this.inSlide(node.origin) : this.ctx.mode === 'theme';
      const op = own && isCreation(node.origin.verb) ? this.opOf(file, node.origin.line) : null;
      if (op) {
        const a = argByKey(op, key);
        if (a) this.replace(file, a.value.span, text);
        else this.appendArg(file, op, key, text);
        return;
      }
    }
    if (this.ctx.mode === 'theme') {
      if (prov && prov.op.file === 'theme' && prov.literal && !prov.semantic && !prov.inherited && prov.value) {
        this.replace('theme', prov.value, this.literalText(prov, key, value, node));
      } else if (!prov && node.origin.file === 'theme' && isCreation(node.origin.verb)) {
        const op = this.opOf('theme', node.origin.line);
        if (op) this.appendArg('theme', op, key, text);
      } else if (node.origin.file === 'theme' && node.origin.scope !== 'component') {
        // expression in the theme: override inside the same master/layout block
        const writer = prov && prov.op.file === 'theme' && !prov.inherited ? this.opOf('theme', prov.op.line) : null;
        const own = this.opOf('theme', node.origin.line);
        const anchor = writer && own && writer.span.start > own.span.start ? writer : own;
        if (!anchor) return;
        const ov = this.themeOverrides.get(node.id) ?? { node, props: new Map(), anchor };
        ov.props.set(key, text);
        this.themeOverrides.set(node.id, ov);
      } else {
        this.error = `@${node.id} ist nicht im Theme definiert – im Theme-Modus nur Theme-Objekte bearbeiten`;
      }
      return;
    }
    if (prov && prov.literal && !prov.semantic && !prov.inherited && prov.value && this.inSlide(prov.op)) {
      // rule 1: literal on the current slide
      this.replace('deck', prov.value, this.literalText(prov, key, value, node));
      return;
    }
    if (!prov && this.inSlide(node.origin) && isCreation(node.origin.verb)) {
      const op = this.opOf('deck', node.origin.line);
      if (op) {
        this.appendArg('deck', op, key, text);
        return;
      }
    }
    // rule 2: override with a set line after the last writer in this slide
    let anchor = prov && this.inSlide(prov.op) ? this.opOf('deck', prov.op.line) : null;
    // never place the override before the object exists (like= copies) or before a later op
    // that targets it (e.g. an align that happened not to change this property)
    for (const ref of [node.origin, ...node.touchedBy]) {
      if (!this.inSlide(ref)) continue;
      const op = this.opOf('deck', ref.line);
      if (op && (!anchor || op.span.start > anchor.span.start)) anchor = op;
    }
    const ov = this.overrides.get(node.id) ?? { node, props: new Map(), anchor: null };
    ov.props.set(key, text);
    if (anchor && (!ov.anchor || anchor.span.start > ov.anchor.span.start)) ov.anchor = anchor;
    this.overrides.set(node.id, ov);
  }

  literalText(prov: Prov, key: string, value: WriteValue, node: SceneNode): string {
    if (typeof value !== 'number') return formatValue(value);
    if (prov.relative && prov.value) {
      const src = this.doc(prov.op.file).source.slice(prov.value.start, prov.value.end);
      const old = Number(src.replace(/px$/, ''));
      const cur = typeof node.props[key] === 'number' ? (node.props[key] as number) : 0;
      return formatNumber((Number.isFinite(old) ? old : 0) + (value - cur));
    }
    if (prov.unit === '%') {
      const isY = ['y', 'h', 'y2', 'dy'].includes(key);
      const base = isY ? this.ctx.scene.height : this.ctx.scene.width;
      return `${formatNumber((value / base) * 100)}%`;
    }
    if (prov.unit === 'px') return `${formatNumber(value)}px`;
    return formatNumber(value);
  }

  finish(): void {
    for (const [op, args] of this.appended) {
      const file: FileRole = this.ctx.deck.lines[op.line.index]?.op === op ? 'deck' : 'theme';
      this.push(file, { from: op.span.end, to: op.span.end, insert: ' ' + args.join(' ') });
    }
    for (const ov of this.overrides.values()) this.flushOverride(ov, 'deck');
    for (const ov of this.themeOverrides.values()) this.flushOverride(ov, 'theme');
  }

  flushOverride(ov: Override, file: FileRole): void {
    const doc = this.doc(file);
    const slideOp = file === 'deck' ? this.slideOp() : null;
    const anchor = ov.anchor;
    const siblings = anchor ? (anchor.parent ? anchor.parent.children : doc.ops) : (slideOp as OpNode).children;
    const next = anchor ? siblings[siblings.indexOf(anchor) + 1] : siblings[0];
    if (next && next.verb === 'set') {
      const targets = positional(next).filter((a) => a.value.k === 'id');
      if (targets.length === 1 && targets[0]!.value.k === 'id' && targets[0]!.value.name === ov.node.id) {
        const extra: string[] = [];
        for (const [k, t] of ov.props) {
          const a = argByKey(next, k);
          if (a) this.replace(file, a.value.span, t);
          else extra.push(`${k}=${t}`);
        }
        if (extra.length) this.push(file, { from: next.span.end, to: next.span.end, insert: ' ' + extra.join(' ') });
        return;
      }
    }
    const line = `set @${ov.node.id} ${[...ov.props].map(([k, t]) => `${k}=${t}`).join(' ')}`;
    if (anchor) this.push(file, { from: anchor.blockEnd, to: anchor.blockEnd, insert: `\n${' '.repeat(anchor.indent)}${line}` });
    else if (slideOp) for (const e of insertInBlock(slideOp, [line], 'start')) this.push(file, e);
  }

  result(extra: Partial<EditResult> = {}): EditResult {
    this.finish();
    if (this.error) return { file: 'deck', edits: [], warnings: this.warnings, error: this.error };
    if (this.themeEdits.length && this.edits.length) {
      return { file: 'deck', edits: [], warnings: this.warnings, error: 'Änderung würde Deck und Theme gleichzeitig betreffen' };
    }
    const file: FileRole = this.themeEdits.length ? 'theme' : 'deck';
    return { file, edits: file === 'theme' ? this.themeEdits : this.edits, warnings: this.warnings, ...extra };
  }
}

const CREATION = new Set(['rect', 'ellipse', 'line', 'arrow', 'polygon', 'path', 'text', 'list', 'image', 'table', 'group', 'use', 'slot', 'row', 'column', 'box']);

function isCreation(verb: string): boolean {
  return CREATION.has(verb);
}

function bodyIndent(op: OpNode): string {
  const first = op.children[0];
  return ' '.repeat(first ? first.indent : op.indent + 2);
}

/**
 * Edits that insert lines into the block of an op, at its start or its end.
 * An op without block gets `{ … }`.
 */
export function insertInBlock(op: OpNode, lines: string[], at: 'start' | 'end'): TextEdit[] {
  const ind = bodyIndent(op);
  const body = lines.map((l) => ind + l);
  const close = ' '.repeat(op.indent) + '}';
  if (op.open && op.close && op.close.line !== op.line) {
    if (at === 'start') return [{ from: op.line.end, to: op.line.end, insert: '\n' + body.join('\n') }];
    return [{ from: op.close.line.start, to: op.close.line.start, insert: body.join('\n') + '\n' }];
  }
  if (op.open && op.close) {
    // `{}` on the op line
    return [{ from: op.open.start, to: op.close.brace.end, insert: `{\n${body.join('\n')}\n${close}` }];
  }
  if (op.open) {
    // unclosed block: keep it unclosed, append after the last line
    return [{ from: op.blockEnd, to: op.blockEnd, insert: '\n' + body.join('\n') }];
  }
  if (op.span.end === op.line.end) return [{ from: op.span.end, to: op.span.end, insert: ` {\n${body.join('\n')}\n${close}` }];
  return [
    { from: op.span.end, to: op.span.end, insert: ' {' },
    { from: op.line.end, to: op.line.end, insert: `\n${body.join('\n')}\n${close}` },
  ];
}

function findSlide(ctx: EditContext, id: string): SlideScene | undefined {
  return ctx.scene.slides.find((s) => s.id === id);
}

function fail(error: string): EditResult {
  return { file: 'deck', edits: [], warnings: [], error };
}

/** Append a line at the end of a slide block. */
function appendToSlide(ctx: EditContext, slide: SlideScene, line: string): TextEdit[] {
  return insertInBlock(ctx.deck.lines[slide.op.line]?.op as OpNode, [line], 'end');
}

/** Allocate a fresh id like `rect3`. */
export function freshId(scene: DeckScene, slide: SlideScene | undefined, base: string, taken: Set<string> = new Set()): string {
  const used = new Set<string>(taken);
  for (const s of scene.slides) for (const id of s.byId.keys()) used.add(id);
  for (const s of scene.slides) used.add(s.id);
  void slide;
  for (let i = 1; ; i++) {
    const id = `${base}${i}`;
    if (!used.has(id)) return id;
  }
}

function anchorFactor(node: SceneNode): number {
  const a = node.props.anchor;
  return a === 'right' ? 1 : a === 'center' ? 0.5 : 0;
}

function isLineKind(n: SceneNode): boolean {
  return n.kind === 'line' || n.kind === 'arrow';
}

function writeMove(b: Builder, node: SceneNode, dx: number, dy: number): void {
  const num = (k: string, d = 0): number => (typeof node.props[k] === 'number' ? (node.props[k] as number) : d);
  if (dx) b.writeProp(node, 'x', num('x') + dx);
  if (dy) b.writeProp(node, 'y', num('y') + dy);
  if (isLineKind(node)) {
    if (dx) b.writeProp(node, 'x2', num('x2', num('x') + 200) + dx);
    if (dy) b.writeProp(node, 'y2', num('y2', num('y')) + dy);
  }
}

function writeBox(b: Builder, node: SceneNode, box: Box, height: boolean): void {
  const cur = node.box;
  const num = (k: string, d = 0): number => (typeof node.props[k] === 'number' ? (node.props[k] as number) : d);
  if (isLineKind(node)) {
    const map = (v: number, o: number, os: number, ns: number, n: number): number => (os ? n + ((v - o) / os) * ns : n);
    const ox = cur.x - Math.min(num('x'), num('x2'));
    const oy = cur.y - Math.min(num('y'), num('y2'));
    const pts = { x: num('x'), y: num('y'), x2: num('x2', num('x') + 200), y2: num('y2', num('y')) };
    const nx = (v: number): number => map(v + ox, cur.x, cur.w, box.w, box.x) - ox;
    const ny = (v: number): number => map(v + oy, cur.y, cur.h, box.h, box.y) - oy;
    const next = { x: nx(pts.x), y: ny(pts.y), x2: nx(pts.x2), y2: ny(pts.y2) };
    for (const k of ['x', 'y', 'x2', 'y2'] as const) if (Math.abs(next[k] - pts[k]) > 0.001) b.writeProp(node, k, round(next[k]));
    return;
  }
  const f = anchorFactor(node);
  const offX = num('x') - cur.x - f * cur.w;
  const offY = num('y') - cur.y;
  const nx = box.x + offX + f * box.w;
  const ny = box.y + offY;
  if (Math.abs(nx - num('x')) > 0.001) b.writeProp(node, 'x', round(nx));
  if (Math.abs(ny - num('y')) > 0.001) b.writeProp(node, 'y', round(ny));
  if (Math.abs(box.w - cur.w) > 0.001) b.writeProp(node, 'w', round(box.w));
  const textual = node.kind === 'text' || node.kind === 'list' || node.kind === 'table';
  if (Math.abs(box.h - cur.h) > 0.001 && (!textual || height) && node.kind !== 'table') b.writeProp(node, 'h', round(box.h));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Delete

/** Remove a top-level block together with the blank lines separating it from the previous content. */
function removeBlock(doc: Document, op: OpNode): TextEdit {
  for (let i = op.line.index - 1; i >= 0; i--) {
    const l = doc.lines[i];
    if (l && l.tokens.some((t) => t.kind !== 'ws' && t.kind !== 'newline')) return { from: l.end, to: op.blockEnd, insert: '' };
  }
  return { from: op.line.start, to: op.blockFullEnd, insert: '' };
}

function removeLines(doc: Document, op: OpNode): TextEdit {
  let from = op.line.start;
  let to = op.blockFullEnd;
  if (to === op.blockEnd && from > 0) {
    // last line without newline: remove the preceding newline instead
    const prev = doc.lines[op.line.index - 1];
    if (prev) from = prev.end;
  }
  return { from, to, insert: '' };
}

function deleteIntent(ctx: EditContext, slide: SlideScene, ids: string[], force: boolean): EditResult {
  const deck = ctx.deck;
  const slideOp = deck.lines[slide.op.line]?.op as OpNode;
  const edits: TextEdit[] = [];
  const warnings: string[] = [];
  const removed = new Set<OpNode>();
  const idSet = new Set(ids);
  const ops = walkOps(slideOp.children);
  const removeOp = (op: OpNode): void => {
    for (let p: OpNode | null = op; p; p = p.parent) if (removed.has(p)) return;
    removed.add(op);
  };
  const hides: string[] = [];
  for (const id of ids) {
    const node = slide.byId.get(id);
    if (!node) continue;
    if (node.origin.file === 'deck' && node.origin.span.start > slide.op.blockSpan.start && node.origin.span.end <= slide.op.blockSpan.end) {
      const op = deck.lines[node.origin.line]?.op;
      if (!op) continue;
      if (op.verb === 'number') {
        const cap = argByKey(op, 'caption');
        if (cap) edits.push({ from: cap.span.start - 1, to: cap.span.end, insert: '' });
      } else removeOp(op);
    } else hides.push(id);
  }
  // references from other ops in this slide
  for (const op of ops) {
    if (removed.has(op)) continue;
    const targets = positional(op).filter((a) => a.value.k === 'id');
    const hit = targets.filter((a) => a.value.k === 'id' && idSet.has(a.value.name));
    if (hit.length) {
      if (hit.length === targets.length && op.verb !== 'fill') removeOp(op);
      else if (op.verb === 'fill') removeOp(op);
      else for (const a of hit) edits.push({ from: a.span.start - 1, to: a.span.end, insert: '' });
    }
    for (const a of op.args) {
      if (a.key === undefined && a.value.k === 'id') continue;
      const refs = referencedIds(a.value).filter((r) => idSet.has(r));
      if (refs.length) warnings.push(`Zeile ${op.line.index + 1}: „${deck.source.slice(op.span.start, op.span.end)}“ verweist auf @${refs[0]}`);
    }
  }
  if (warnings.length && !force) {
    return { file: 'deck', edits: [], warnings, error: 'Andere Operationen verweisen auf das Objekt' };
  }
  const ranges = [...removed].map((op) => removeLines(deck, op)).sort((a, b) => a.from - b.from);
  const merged: TextEdit[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  const filtered = [...edits.filter((e) => !merged.some((r) => e.from >= r.from && e.to <= r.to)), ...merged];
  if (hides.length) filtered.push(...insertInBlock(slideOp, [`hide ${hides.map((h) => '@' + h).join(' ')}`], 'start'));
  return { file: 'deck', edits: filtered, warnings, select: [] };
}

// ---------------------------------------------------------------------------
// Public entry

function opLine(kind: string, id: string, props: Record<string, WriteValue>, content?: string): string {
  const parts = [kind, `@${id}`];
  if (content !== undefined) parts.push(escapeString(content));
  for (const [k, v] of Object.entries(props)) parts.push(`${k}=${wrapIfSpaced(formatValue(v))}`);
  return parts.join(' ');
}

/** Turn an editor intent into minimal text edits. Pure. */
export function computeEdit(ctx: EditContext, intent: Intent): EditResult {
  switch (intent.type) {
    case 'rename':
      return renameIntent(ctx, intent.from, intent.to);
    case 'addSlide':
      return addSlide(ctx, intent.after, intent.layout);
    case 'deleteSlide': {
      const s = findSlide(ctx, intent.slide);
      if (!s) return fail('Folie nicht gefunden');
      const op = ctx.deck.lines[s.op.line]?.op as OpNode;
      return { file: 'deck', edits: [removeBlock(ctx.deck, op)], warnings: [] };
    }
    case 'moveSlide':
      return moveSlide(ctx, intent.slide, intent.to);
    default:
      break;
  }
  const slide = findSlide(ctx, intent.slide);
  if (!slide) return fail('Folie nicht gefunden');
  const b = new Builder(ctx, slide);
  switch (intent.type) {
    case 'move': {
      for (const id of intent.ids) {
        const node = slide.byId.get(id);
        if (node) writeMove(b, node, intent.dx, intent.dy);
      }
      return b.result({ select: intent.ids });
    }
    case 'resize': {
      const node = slide.byId.get(intent.id);
      if (!node) return fail('Objekt nicht gefunden');
      writeBox(b, node, intent.box, intent.height);
      return b.result({ select: [intent.id] });
    }
    case 'setProps': {
      const node = slide.byId.get(intent.id);
      if (!node) return fail('Objekt nicht gefunden');
      for (const [k, v] of Object.entries(intent.props)) {
        if (k === 'radius') for (const c of ['tl', 'tr', 'br', 'bl']) writeRadius(b, node, `radius.${c}`, v);
        else b.writeProp(node, k, v);
      }
      return b.result({ select: [intent.id] });
    }
    case 'text':
      return textIntent(ctx, b, slide, intent.id, intent.text);
    case 'create': {
      if (ctx.mode === 'theme') return fail('Im Theme-Modus werden keine Objekte auf Folien erzeugt');
      const id = freshId(ctx.scene, slide, intent.kind);
      return { file: 'deck', edits: appendToSlide(ctx, slide, opLine(intent.kind, id, intent.props, intent.content)), warnings: [], select: [id] };
    }
    case 'delete':
      return deleteIntent(ctx, slide, intent.ids, !!intent.force);
    case 'duplicate':
      return duplicateIntent(ctx, slide, intent.ids);
    case 'arrange':
      return arrangeIntent(ctx, b, slide, intent);
    case 'number': {
      const line = `number ${intent.counter} @${intent.id} caption=${escapeString(intent.caption)}`;
      return { file: 'deck', edits: appendToSlide(ctx, slide, line), warnings: [], select: [intent.id] };
    }
    case 'z':
      return { file: 'deck', edits: appendToSlide(ctx, slide, `z @${intent.id} ${intent.mode}`), warnings: [], select: [intent.id] };
    case 'reorder':
      return reorderIntent(ctx, slide, intent.id, intent.index);
    case 'command': {
      const text = intent.text.trim();
      if (!text) return fail('Leere Eingabe');
      return { file: 'deck', edits: appendToSlide(ctx, slide, text), warnings: [] };
    }
  }
  return fail('Unbekannte Aktion');
}

/**
 * Rounding all corners: when all four corners come from the same `radius=` literal,
 * replace it once; otherwise write each corner.
 */
function writeRadius(b: Builder, node: SceneNode, key: string, v: WriteValue): void {
  const prov = node.prov[key];
  if (prov && prov.key === 'radius' && prov.value && prov.literal && b.inSlide(prov.op)) {
    b.replace('deck', prov.value, formatValue(v));
    return;
  }
  if (!prov && b.inSlide(node.origin) && isCreation(node.origin.verb)) {
    if (key === 'radius.tl') {
      const op = b.opOf('deck', node.origin.line);
      if (op) b.appendArg('deck', op, 'radius', formatValue(v));
    }
    return;
  }
  b.writeProp(node, key, v);
}

function textIntent(ctx: EditContext, b: Builder, slide: SlideScene, id: string, text: string): EditResult {
  const node = slide.byId.get(id);
  if (!node) return fail('Objekt nicht gefunden');
  if (node.kind === 'list') {
    const op = node.origin.file === 'deck' && b.inSlide(node.origin) ? ctx.deck.lines[node.origin.line]?.op : null;
    if (!op) return fail('Diese Liste ist nicht auf der Folie definiert');
    const lines = text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const m = /^(\s*)(.*)$/.exec(l) as RegExpExecArray;
        const level = Math.floor((m[1] as string).length / 2) + 1;
        return `item ${escapeString((m[2] as string).replace(/^[-•]\s*/, ''))}${level > 1 ? ` level=${level}` : ''}`;
      });
    if (op.children.length) {
      const first = op.children[0] as OpNode;
      const last = op.children[op.children.length - 1] as OpNode;
      const indent = ' '.repeat(first.indent);
      return { file: 'deck', edits: [{ from: first.line.start, to: last.blockEnd, insert: lines.map((l) => indent + l).join('\n') }], warnings: [], select: [id] };
    }
    return { file: 'deck', edits: insertInBlock(op, lines, 'end'), warnings: [], select: [id] };
  }
  const key = node.kind === 'image' ? 'src' : 'text';
  const prov = node.prov[key];
  if (node.slot && ctx.mode === 'deck' && (!prov || !b.inSlide(prov.op))) {
    // unfilled slot (or filled from elsewhere): add a fill op at the top of the slide
    const slideOp = ctx.deck.lines[slide.op.line]?.op as OpNode;
    return { file: 'deck', edits: insertInBlock(slideOp, [`fill @${id} ${escapeString(text)}`], 'start'), warnings: [], select: [id] };
  }
  // strings on this slide are replaced in place, interpolations included
  if (prov && prov.value && b.inSlide(prov.op) && ctx.deck.source[prov.value.start] === '"' && !prov.semantic && !prov.inherited) {
    // raw strings stay raw (code, multi-line text)
    const op = ctx.deck.lines[prov.op.line]?.op;
    const raw = isRawString(ctx.deck.source.slice(prov.value.start, prov.value.end)) && op ? formatRawString(text, ' '.repeat(op.indent)) : null;
    b.replace('deck', prov.value, raw ?? escapeString(text));
    return b.result({ select: [id] });
  }
  b.writeProp(node, key, text);
  return b.result({ select: [id] });
}

/** Raw (unevaluated) text of a node's text property, so editing keeps `{interpolation}`. */
export function rawText(deck: Document, theme: Document | null, node: SceneNode): string {
  if (node.kind === 'list') return (node.items ?? []).map((i) => `${'  '.repeat(Math.max(0, i.level - 1))}${i.text}`).join('\n');
  const key = node.kind === 'image' ? 'src' : 'text';
  const prov = node.prov[key];
  const value = node.props[key];
  if (prov && prov.value) {
    const src = (prov.op.file === 'theme' ? theme?.source : deck.source) ?? '';
    const raw = src.slice(prov.value.start, prov.value.end);
    if (raw.startsWith('"')) return unescapeString(raw);
  }
  return typeof value === 'string' ? value : '';
}

function duplicateIntent(ctx: EditContext, slide: SlideScene, ids: string[]): EditResult {
  const edits: TextEdit[] = [];
  const select: string[] = [];
  const taken = new Set<string>();
  for (const id of ids) {
    const node = slide.byId.get(id);
    if (!node || node.origin.file !== 'deck') continue;
    const op = ctx.deck.lines[node.origin.line]?.op;
    if (!op || !isCreation(op.verb) || op.verb === 'slot') continue;
    const newId = freshId(ctx.scene, slide, op.verb, taken);
    taken.add(newId);
    const src = ctx.deck.source;
    // copy the block, replace the id, shift literal x/y by 24px
    const idArg = positional(op)[0];
    const shifts: TextEdit[] = [];
    for (const k of ['x', 'y', 'x2', 'y2']) {
      const a = argByKey(op, k);
      if (a && a.value.k === 'num' && a.value.unit !== '%') shifts.push({ from: a.value.span.start, to: a.value.span.end, insert: formatNumber(a.value.value + 24) });
    }
    if (idArg && idArg.value.k === 'id') shifts.push({ from: idArg.value.span.start, to: idArg.value.span.end, insert: `@${newId}` });
    const block = src.slice(op.line.start, op.blockEnd);
    const rel = shifts.map((s) => ({ from: s.from - op.line.start, to: s.to - op.line.start, insert: s.insert }));
    const copy = applyEdits(block, rel).text;
    const slideOp = ctx.deck.lines[slide.op.line]?.op as OpNode;
    edits.push(...insertInBlock(slideOp, [copy.replace(/^ */, '')], 'end'));
    select.push(newId);
  }
  if (!edits.length) return fail('Nur auf der Folie erzeugte Objekte können dupliziert werden');
  return { file: 'deck', edits, warnings: [], select };
}

function arrangeIntent(ctx: EditContext, b: Builder, slide: SlideScene, intent: Extract<Intent, { type: 'arrange' }>): EditResult {
  const line = [intent.verb, intent.mode ?? '', ...intent.ids.map((i) => '@' + i), intent.extra ?? ''].filter(Boolean).join(' ');
  if (!intent.bake) return { file: 'deck', edits: appendToSlide(ctx, slide, line), warnings: [], select: intent.ids };
  if (!ctx.evaluate) return fail('Backen nicht verfügbar');
  // evaluate with the semantic op appended, then write the computed literals
  const tmp = applyEdits(ctx.deck.source, appendToSlide(ctx, slide, line)).text;
  const after = ctx.evaluate(tmp);
  const s2 = after.slides[slide.index];
  if (!s2) return fail('Auswertung fehlgeschlagen');
  for (const id of intent.ids) {
    const before = slide.byId.get(id);
    const now = s2.byId.get(id);
    if (!before || !now) continue;
    if (Math.abs(now.box.w - before.box.w) > 0.01 || Math.abs(now.box.h - before.box.h) > 0.01) writeBox(b, before, now.box, true);
    else writeMove(b, before, round(now.box.x - before.box.x), round(now.box.y - before.box.y));
  }
  return b.result({ select: intent.ids });
}

/** Move the creation op of a container child before the sibling at `index` (after removal). */
function reorderIntent(ctx: EditContext, slide: SlideScene, id: string, index: number): EditResult {
  const node = slide.byId.get(id);
  if (!node || node.origin.file !== 'deck') return fail('Nur Objekte aus dem Deck lassen sich umordnen');
  const op = ctx.deck.lines[node.origin.line]?.op;
  const parent = op?.parent;
  if (!op || !parent || (parent.verb !== 'row' && parent.verb !== 'column')) return fail('Das Objekt liegt in keiner Zeile oder Spalte');
  const siblings = parent.children.filter((c) => isCreation(c.verb));
  const from = siblings.indexOf(op);
  const rest = siblings.filter((c) => c !== op);
  const to = Math.max(0, Math.min(rest.length, Math.round(index)));
  if (to === from) return fail('Keine Änderung');
  const src = ctx.deck.source;
  const block = src.slice(op.line.start, op.blockEnd);
  const edits: TextEdit[] = [removeLines(ctx.deck, op)];
  const before = rest[to];
  if (before) edits.push({ from: before.line.start, to: before.line.start, insert: `${block}\n` });
  else {
    const last = rest[rest.length - 1] as OpNode;
    edits.push({ from: last.blockEnd, to: last.blockEnd, insert: `\n${block}` });
  }
  return { file: 'deck', edits, warnings: [], select: [id] };
}

function renameIntent(ctx: EditContext, from: string, to: string): EditResult {
  if (!/^[A-Za-z_À-ɏ][A-Za-z0-9_À-ɏ]*$/.test(to)) return fail(`„${to}“ ist keine gültige ID`);
  const file: FileRole = ctx.mode;
  const doc = file === 'theme' ? ctx.theme : ctx.deck;
  if (!doc) return fail('Keine Theme-Datei');
  const exists = ctx.scene.slides.some((s) => s.id === to || s.byId.has(to));
  if (exists) return fail(`ID „@${to}“ ist bereits vergeben`);
  const edits: TextEdit[] = [];
  for (const line of doc.lines) {
    for (const t of line.tokens) {
      if (t.kind === 'id' && t.text === `@${from}`) edits.push({ from: t.start, to: t.end, insert: `@${to}` });
    }
  }
  if (!edits.length) return fail(`„@${from}“ kommt in der Datei nicht vor`);
  return { file, edits, warnings: [], select: [to] };
}

function addSlide(ctx: EditContext, after: string | undefined, layout: string | undefined): EditResult {
  const scene = ctx.scene;
  const id = freshId(scene, undefined, 's');
  const lay = layout ?? (scene.theme.layouts.includes('content') ? 'content' : scene.theme.layouts[0]);
  const slots = lay ? scene.theme.slots[lay] ?? [] : [];
  const head = `slide @${id}${lay ? ` layout=${lay}` : ''}`;
  const text = slots.includes('title') ? `${head} {\n  fill @title "Titel"\n}` : head;
  const ref = after ? scene.slides.find((s) => s.id === after) : scene.slides[scene.slides.length - 1];
  if (ref) {
    const op = ctx.deck.lines[ref.op.line]?.op as OpNode;
    return { file: 'deck', edits: [{ from: op.blockEnd, to: op.blockEnd, insert: `\n\n${text}` }], warnings: [], slide: id };
  }
  const src = ctx.deck.source;
  const sep = src.length === 0 ? '' : src.endsWith('\n\n') ? '' : src.endsWith('\n') ? '\n' : '\n\n';
  return { file: 'deck', edits: [{ from: src.length, to: src.length, insert: `${sep}${text}\n` }], warnings: [], slide: id };
}

function moveSlide(ctx: EditContext, id: string, to: number): EditResult {
  const slides = ctx.scene.slides;
  const from = slides.findIndex((s) => s.id === id);
  if (from < 0) return fail('Folie nicht gefunden');
  const target = Math.max(0, Math.min(slides.length - 1, to));
  if (target === from) return fail('Keine Änderung');
  const op = ctx.deck.lines[slides[from]!.op.line]?.op as OpNode;
  const block = ctx.deck.source.slice(op.line.start, op.blockEnd);
  const removal = removeBlock(ctx.deck, op);
  const other = ctx.deck.lines[slides[target]!.op.line]?.op as OpNode;
  const insert =
    target < from
      ? { from: other.line.start, to: other.line.start, insert: `${block}\n\n` }
      : { from: other.blockEnd, to: other.blockEnd, insert: `\n\n${block}` };
  return { file: 'deck', edits: [removal, insert], warnings: [], slide: id };
}
