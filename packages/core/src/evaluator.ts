import { DEFAULT_THEME_SOURCE } from './builtin.js';
import type { Diagnostic, FileRole } from './diagnostics.js';
import { diag } from './diagnostics.js';
import type { Expr } from './expr.js';
import { isLiteral } from './expr.js';
import type { FontSpec, TextMeasurer } from './metrics.js';
import { createMetricMeasurer } from './metrics.js';
import type { Arg, Document, OpNode } from './parser.js';
import { argByKey, parse, positional } from './parser.js';
import { layoutParagraphs, parseRich } from './richtext.js';
import type {
  Background,
  Box,
  DeckScene,
  FontDef,
  NodeKind,
  OpRef,
  PropValue,
  Props,
  Prov,
  Scope,
  SceneNode,
  SlideScene,
  TableLayout,
  ThemeInfo,
} from './scene.js';
import type { Axis, EvalEnv } from './values.js';
import { axisOf, evalExpr } from './values.js';
import {
  ALIGN_MODES,
  ARRANGE_VERBS,
  BOOL_KEYS,
  COLOR_KEYS,
  CREATE_VERBS,
  KEYS_BY_VERB,
  MODIFY_VERBS,
  NUMERIC_KEYS,
} from './vocab.js';

export interface ImageSize {
  w: number;
  h: number;
}

export interface EvaluateOptions {
  /** Parsed theme file referenced by the deck. Built-in theme when omitted. */
  theme?: Document | null;
  measurer?: TextMeasurer;
  /** Natural image sizes keyed by the path as written in the file. */
  imageSizes?: Record<string, ImageSize>;
  /**
   * Reuse slides whose source and context did not change since the last call
   * (incremental re-evaluation). Pass the same object on every call.
   */
  cache?: EvalCache;
}

interface CacheEntry {
  key: string;
  scene: SlideScene;
  blockStart: number;
  line: number;
  countersAfter: Record<string, number>;
}

/** Per-slide evaluation cache. Opaque to callers. */
export interface EvalCache {
  theme?: Document;
  measurer?: TextMeasurer;
  imageSizes?: Record<string, ImageSize>;
  slides: Map<string, CacheEntry>;
  /** Number of slides reused by the last evaluation (for tests and diagnostics). */
  reused: number;
}

export function createEvalCache(): EvalCache {
  return { slides: new Map(), reused: 0 };
}

/** Move all deck-file source positions of a cached slide by a delta. */
function shiftSlide(scene: SlideScene, d: number, dl: number): void {
  if (!d && !dl) return;
  const seen = new Set<object>();
  const shiftSpan = (sp: { start: number; end: number }): { start: number; end: number } => ({ start: sp.start + d, end: sp.end + d });
  const ref = (r: OpRef): void => {
    if (r.file !== 'deck' || seen.has(r)) return;
    seen.add(r);
    r.span = shiftSpan(r.span);
    r.blockSpan = shiftSpan(r.blockSpan);
    r.line += dl;
  };
  const prov = (p: Prov | undefined): void => {
    if (!p || seen.has(p)) return;
    seen.add(p);
    if (p.op.file !== 'deck') return;
    ref(p.op);
    if (p.value) p.value = shiftSpan(p.value);
  };
  const node = (n: SceneNode): void => {
    if (seen.has(n)) return;
    seen.add(n);
    ref(n.origin);
    n.touchedBy.forEach(ref);
    Object.values(n.prov).forEach(prov);
    n.children.forEach(node);
  };
  ref(scene.op);
  scene.nodes.forEach(node);
  scene.byId.forEach(node);
  prov(scene.background.prov);
  for (const diag of scene.diagnostics) if (diag.file === 'deck') diag.span = shiftSpan(diag.span);
  const targets = new Map<string, string[]>();
  for (const [k, v] of scene.opTargets) {
    const [file, line] = k.split(':');
    targets.set(file === 'deck' ? `deck:${Number(line) + dl}` : k, v);
  }
  scene.opTargets = targets;
}

interface Src {
  doc: Document;
  file: FileRole;
  scope: Scope;
}

interface StyleDef {
  props: Props;
  prov: Record<string, Prov>;
}

interface Theme {
  info: ThemeInfo;
  doc: Document;
  tokens: Record<string, PropValue>;
  styles: Map<string, StyleDef>;
  fonts: Map<string, FontDef>;
  masters: Map<string, OpNode>;
  layouts: Map<string, { op: OpNode; master: string | null }>;
  components: Map<string, { op: OpNode; defaults: Props }>;
  counters: Record<string, number>;
}

interface Ctx {
  theme: Theme;
  slide: SlideScene;
  env: EvalEnv;
  m: TextMeasurer;
  imageSizes: Record<string, ImageSize>;
  pendingFills: Map<string, OpNode>;
  deckDoc: Document;
  parents: Map<SceneNode, SceneNode>;
  autoId: number;
  /** Local object table for component instances (not visible on the slide). */
  componentObjects: Map<string, SceneNode> | null;
}

const DEFAULT_FILL = '#D1D5DB';
const DEFAULT_TEXT = '#111827';

let defaultThemeDoc: Document | null = null;
let defaultMeasurer: TextMeasurer | undefined;

export function defaultTheme(): Document {
  if (!defaultThemeDoc) defaultThemeDoc = parse(DEFAULT_THEME_SOURCE);
  return defaultThemeDoc;
}

function opRef(op: OpNode, src: Src): OpRef {
  return {
    file: src.file,
    span: op.span,
    blockSpan: { start: op.line.start, end: op.blockEnd },
    line: op.line.index,
    verb: op.verb,
    scope: src.scope,
  };
}

function useSrc(env: EvalEnv, src: Src): void {
  env.src = src.doc.source;
  env.file = src.file;
}

function report(ctxOrEnv: EvalEnv, msg: string, span: { start: number; end: number }, sev: 'error' | 'warning' = 'error'): void {
  ctxOrEnv.diags.push(diag(sev, msg, span, ctxOrEnv.file));
}

function num(v: PropValue | undefined, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function str(v: PropValue | undefined, d: string): string {
  return typeof v === 'string' ? v : d;
}

// ---------------------------------------------------------------------------
// Theme

function baseEnv(src: Document, file: FileRole, diags: Diagnostic[]): EvalEnv {
  return {
    src: src.source,
    file,
    diags,
    slideW: 1920,
    slideH: 1080,
    slideN: 1,
    deckTotal: 1,
    deckTitle: '',
    deckSections: 0,
    section: '',
    sectionN: 0,
    tokens: {},
    counters: {},
    regions: {},
    objects: null,
    params: null,
    origin: { x: 0, y: 0 },
  };
}

function evalTheme(doc: Document, diags: Diagnostic[]): Theme {
  const env = baseEnv(doc, 'theme', diags);
  const src: Src = { doc, file: 'theme', scope: 'theme' };
  const theme: Theme = {
    info: {
      name: '',
      width: 1920,
      height: 1080,
      tokens: {},
      styles: {},
      fonts: [],
      layouts: [],
      masters: [],
      components: [],
      regions: {},
      slots: {},
    },
    doc,
    tokens: env.tokens,
    styles: new Map(),
    fonts: new Map(),
    masters: new Map(),
    layouts: new Map(),
    components: new Map(),
    counters: {},
  };
  const nameArg = (op: OpNode, idx = 0): string | null => {
    const p = positional(op)[idx];
    if (!p) return null;
    if (p.value.k === 'name' || p.value.k === 'member') return dottedName(p.value);
    if (p.value.k === 'str') return p.value.value;
    if (p.value.k === 'tok') return p.value.name;
    return null;
  };
  doc.ops.forEach((op, i) => {
    switch (op.verb) {
      case 'theme': {
        if (i !== 0) report(env, '„theme“ muss die erste Zeile der Theme-Datei sein', op.span, 'warning');
        const p = positional(op)[0];
        theme.info.name = p && p.value.k === 'str' ? p.value.value : '';
        break;
      }
      case 'size': {
        const p = positional(op)[0];
        if (p && p.value.k === 'dim') {
          theme.info.width = p.value.w;
          theme.info.height = p.value.h;
          env.slideW = p.value.w;
          env.slideH = p.value.h;
        } else report(env, 'Größe erwartet, z. B. „size 1920x1080“', op.span);
        break;
      }
      case 'token':
      case 'color': {
        const name = nameArg(op);
        const valueArg = positional(op)[1];
        if (!name || !valueArg) {
          report(env, `„${op.verb}“ erwartet Name und Wert`, op.span);
          break;
        }
        const v = evalExpr(env, valueArg.value);
        if (v !== undefined) env.tokens[name] = v;
        break;
      }
      case 'font': {
        const name = nameArg(op);
        const fam = positional(op)[1];
        if (!name || !fam || fam.value.k !== 'str') {
          report(env, '„font“ erwartet Name und Schriftfamilie, z. B. font body "Inter"', op.span);
          break;
        }
        const def: FontDef = { name, family: fam.value.value, weight: 400, italic: false };
        for (const a of op.args) {
          if (!a.key) continue;
          const v = evalExpr(env, a.value);
          if (a.key === 'weight') def.weight = num(v, 400);
          else if (a.key === 'italic') def.italic = v === true || v === 'true';
          else if (a.key === 'file') def.file = str(v, '');
          else report(env, `Unbekannte Eigenschaft „${a.key}“ für font`, a.span, 'warning');
        }
        theme.fonts.set(name, def);
        break;
      }
      case 'style': {
        const name = nameArg(op);
        if (!name) {
          report(env, '„style“ erwartet einen Namen', op.span);
          break;
        }
        const def: StyleDef = { props: {}, prov: {} };
        for (const a of op.args) {
          if (!a.key) continue;
          if (a.key === 'base') {
            const baseName = a.value.k === 'name' ? a.value.name : '';
            const base = theme.styles.get(baseName);
            if (!base) report(env, `Unbekannter Basis-Stil „${baseName}“`, a.value.span);
            else {
              Object.assign(def.props, base.props);
              Object.assign(def.prov, base.prov);
            }
            continue;
          }
          const v = coerce(env, a.key, evalExpr(env, a.value, axisOf(a.key)), a.value);
          if (v === undefined) continue;
          for (const [k, val] of expandKey(a.key, v)) {
            def.props[k] = val;
            def.prov[k] = {
              op: opRef(op, src),
              value: a.value.span,
              literal: isLiteral(a.value),
              semantic: false,
              inherited: true,
              key: a.key,
            };
          }
        }
        theme.styles.set(name, def);
        break;
      }
      case 'master': {
        const name = nameArg(op);
        if (name) theme.masters.set(name, op);
        else report(env, '„master“ erwartet einen Namen', op.span);
        break;
      }
      case 'layout': {
        const name = nameArg(op);
        if (!name) {
          report(env, '„layout“ erwartet einen Namen', op.span);
          break;
        }
        const m = argByKey(op, 'master');
        const master = m && m.value.k === 'name' ? m.value.name : theme.masters.has('default') ? 'default' : null;
        if (master && !theme.masters.has(master)) report(env, `Unbekannter Master „${master}“`, m ? m.value.span : op.span);
        theme.layouts.set(name, { op, master });
        break;
      }
      case 'component': {
        const name = nameArg(op);
        if (!name) {
          report(env, '„component“ erwartet einen Namen', op.span);
          break;
        }
        const defaults: Props = { w: 200, h: 120 };
        for (const a of op.args) {
          if (!a.key) continue;
          const v = evalExpr(env, a.value, axisOf(a.key));
          if (v !== undefined) defaults[a.key] = v;
        }
        theme.components.set(name, { op, defaults });
        break;
      }
      case 'counter': {
        const name = nameArg(op);
        if (!name) report(env, '„counter“ erwartet einen Namen', op.span);
        else theme.counters[name] = num(evalExpr(env, argByKey(op, 'start')?.value ?? { k: 'num', value: 0, unit: '', span: op.span }), 0);
        break;
      }
      case 'deck':
      case 'slide':
        report(env, `„${op.verb}“ gehört in eine Deck-Datei, nicht ins Theme`, op.span);
        break;
      default:
        report(env, `„${op.verb}“ ist auf oberster Ebene eines Themes nicht erlaubt`, op.verbSpan);
    }
  });
  const info = theme.info;
  info.tokens = { ...env.tokens };
  info.fonts = [...theme.fonts.values()];
  info.layouts = [...theme.layouts.keys()];
  info.masters = [...theme.masters.keys()];
  info.components = [...theme.components.keys()];
  for (const [k, v] of theme.styles) info.styles[k] = v.props;
  for (const [name, { op }] of theme.layouts) {
    info.slots[name] = op.children.filter((c) => c.verb === 'slot').flatMap((c) => idOf(c) ?? []);
    info.regions[name] = op.children.filter((c) => c.verb === 'region').flatMap((c) => {
      const p = positional(c)[0];
      return p && p.value.k === 'name' ? [p.value.name] : [];
    });
  }
  return theme;
}

// ---------------------------------------------------------------------------
// Values and props

function dottedName(e: Expr): string | null {
  if (e.k === 'name') return e.name;
  if (e.k === 'member') {
    const base = dottedName(e.obj);
    return base === null ? null : `${base}.${e.prop}`;
  }
  return null;
}

function idOf(op: OpNode): string | null {
  const p = op.args.find((a) => !a.key);
  return p && p.value.k === 'id' ? p.value.name : null;
}

function expandKey(key: string, v: PropValue): [string, PropValue][] {
  if (key === 'radius') return ['radius.tl', 'radius.tr', 'radius.br', 'radius.bl'].map((k) => [k, v]);
  if (key === 'stroke.color') return [['stroke', v]];
  return [[key, v]];
}

function coerce(env: EvalEnv, key: string, v: PropValue | undefined, e: Expr): PropValue | undefined {
  if (v === undefined) return undefined;
  const base = key === 'radius' ? 'radius.tl' : key;
  if (NUMERIC_KEYS.has(base) && typeof v !== 'number') {
    report(env, `„${key}“ erwartet eine Zahl`, e.span);
    return undefined;
  }
  if (BOOL_KEYS.has(key)) {
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    report(env, `„${key}“ erwartet true oder false`, e.span);
    return undefined;
  }
  if (COLOR_KEYS.has(key) && typeof v === 'string' && !/^(#|rgba?\(|none$|transparent$)/.test(v)) {
    report(env, `„${key}“ erwartet eine Farbe, z. B. #1E40AF oder $primary`, e.span);
    return undefined;
  }
  return v;
}

function argProv(op: OpNode, src: Src, a: Arg | { value: Expr; key?: string }, extra: Partial<Prov> = {}): Prov {
  const e = a.value;
  const unit = e.k === 'num' ? e.unit : e.k === 'neg' && e.e.k === 'num' ? e.e.unit : undefined;
  const p: Prov = {
    op: opRef(op, src),
    value: e.span,
    literal: isLiteral(e),
    semantic: false,
    inherited: false,
    ...extra,
  };
  if (unit !== undefined) p.unit = unit;
  if (a.key) p.key = a.key;
  return p;
}

function semanticProv(op: OpNode, src: Src): Prov {
  return { op: opRef(op, src), literal: false, semantic: true, inherited: false };
}

function setProp(node: SceneNode, key: string, v: PropValue, prov: Prov): void {
  node.props[key] = v;
  node.prov[key] = prov;
}

function touch(ctx: Ctx, node: SceneNode, op: OpNode, src: Src): void {
  const ref = opRef(op, src);
  if (!node.touchedBy.some((r) => r.file === ref.file && r.line === ref.line)) node.touchedBy.push(ref);
  const key = `${src.file}:${op.line.index}`;
  const list = ctx.slide.opTargets.get(key) ?? [];
  if (!list.includes(node.id)) list.push(node.id);
  ctx.slide.opTargets.set(key, list);
}

// ---------------------------------------------------------------------------
// Geometry and layout

function originOf(ctx: Ctx, node: SceneNode): { x: number; y: number } {
  const parent = ctx.parents.get(node);
  if (!parent) return { x: 0, y: 0 };
  const o = originOf(ctx, parent);
  return { x: o.x + num(parent.props.x, 0), y: o.y + num(parent.props.y, 0) };
}

function fontSpec(ctx: Ctx, props: Props): FontSpec & { css: string } {
  const fontName = str(props.font, '');
  const def = ctx.theme.fonts.get(fontName);
  const family = def ? def.family : fontName || 'Inter';
  const weight = typeof props.weight === 'number' ? props.weight : def ? def.weight : 400;
  const italic = props.italic === true || (props.italic === undefined && !!def?.italic);
  return { family, size: num(props.size, 32), weight, italic, css: family };
}

function bulletFor(style: string, level: number, index: number): string {
  if (style === 'none') return '';
  if (style === 'number') return `${index}.`;
  if (style === 'dash') return '–';
  return ['•', '–', '◦', '▪'][(level - 1) % 4] as string;
}

function layoutTable(ctx: Ctx, node: SceneNode): TableLayout {
  const rows = node.rows ?? [];
  const font = fontSpec(ctx, node.props);
  const pad = num(node.props.pad, 16);
  const line = num(node.props.line, 1.3);
  const w = num(node.props.w, 800);
  const ncols = Math.max(1, ...rows.map((r) => r.length));
  const ratios = str(node.props.cols, '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  while (ratios.length < ncols) ratios.push(1);
  const total = ratios.slice(0, ncols).reduce((a, b) => a + b, 0);
  const colWidths = ratios.slice(0, ncols).map((r) => (w * r) / total);
  const header = node.props.header !== false;
  const cells: TableLayout['cells'] = [];
  const rowHeights: number[] = [];
  let y = 0;
  rows.forEach((row, ri) => {
    const isHeader = header && ri === 0;
    let x = 0;
    const rowCells = colWidths.map((cw, ci) => {
      const f = { ...font, weight: isHeader ? Math.max(font.weight, 700) : font.weight };
      const text = layoutParagraphs([{ runs: parseRich(row[ci] ?? ''), indent: 0 }], { font: f, maxWidth: cw - 2 * pad, lineHeight: line, align: 'left' }, ctx.m);
      const cell = { box: { x, y, w: cw, h: 0 }, text, header: isHeader };
      x += cw;
      return cell;
    });
    const h = Math.max(font.size * line, ...rowCells.map((c) => c.text.height)) + 2 * pad;
    for (const c of rowCells) c.box.h = h;
    rowHeights.push(h);
    cells.push(rowCells);
    y += h;
  });
  return { cells, colWidths, rowHeights };
}

function parsePoints(s: string): [number, number][] {
  const nums = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i] as number, nums[i + 1] as number]);
  return pts;
}

/** Approximate bbox of SVG path data from its coordinates (absolute and relative commands). */
export function pathBounds(d: string): Box {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  let cmd = 'M';
  let args: number[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const flush = (): void => {
    const lc = cmd.toLowerCase();
    const n = arity[lc] ?? 2;
    const rel = cmd !== cmd.toUpperCase();
    if (n === 0) {
      cx = sx;
      cy = sy;
      return;
    }
    for (let i = 0; i + n <= args.length; i += n) {
      const a = args.slice(i, i + n);
      if (lc === 'h') cx = (rel ? cx : 0) + (a[0] as number);
      else if (lc === 'v') cy = (rel ? cy : 0) + (a[0] as number);
      else {
        for (let j = 0; j + 1 < n; j += 2) {
          if (lc === 'a' && j < 5) continue;
          add((rel ? cx : 0) + (a[j] as number), (rel ? cy : 0) + (a[j + 1] as number));
        }
        cx = (rel ? cx : 0) + (a[n - 2] as number);
        cy = (rel ? cy : 0) + (a[n - 1] as number);
      }
      add(cx, cy);
      if (lc === 'm' && i === 0) {
        sx = cx;
        sy = cy;
      }
    }
  };
  for (const m of d.matchAll(re)) {
    if (m[1]) {
      flush();
      cmd = m[1];
      args = [];
      if (cmd === 'Z' || cmd === 'z') flush();
    } else args.push(Number(m[2]));
  }
  flush();
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function isTextual(node: SceneNode): boolean {
  return node.kind === 'text' || node.kind === 'list';
}

/** Recompute layout and absolute box of a node (and its children). */
function refresh(ctx: Ctx, node: SceneNode): void {
  const o = originOf(ctx, node);
  const p = node.props;
  const pad = num(p.pad, 0);
  switch (node.kind) {
    case 'text':
    case 'list': {
      const font = fontSpec(ctx, p);
      const autoW = !('w' in node.prov);
      const autoH = !('h' in node.prov);
      const maxWidth = autoW ? undefined : Math.max(1, num(p.w, 0) - 2 * pad);
      const align = (str(p.align, 'left') as 'left' | 'center' | 'right') ?? 'left';
      if (node.kind === 'list') {
        const items = node.items ?? [];
        const style = str(p.bullet, 'disc');
        const counters: number[] = [];
        const indentStep = font.size * 1.3;
        const paras = items.map((it) => {
          const lvl = Math.max(1, Math.round(it.level));
          counters.length = lvl;
          counters[lvl - 1] = (counters[lvl - 1] ?? 0) + 1;
          const bullet = bulletFor(style, lvl, counters[lvl - 1] as number);
          return {
            runs: parseRich(it.text),
            indent: (lvl - 1) * indentStep + (bullet ? indentStep : 0),
            bullet,
            bulletIndent: (lvl - 1) * indentStep,
          };
        });
        node.text = layoutParagraphs(paras, { font, maxWidth, lineHeight: num(p.line, 1.3), align: 'left', paragraphGap: font.size * 0.35 }, ctx.m);
      } else {
        const content = node.placeholder ? str(p.placeholder, '') : str(p.text, '');
        node.text = layoutParagraphs([{ runs: parseRich(content), indent: 0 }], { font, maxWidth, lineHeight: num(p.line, 1.25), align }, ctx.m);
      }
      const w = autoW ? node.text.width + 2 * pad : num(p.w, 0);
      const h = autoH ? Math.max(node.text.height, font.size * num(p.line, 1.25)) + 2 * pad : num(p.h, 0);
      if (autoW) p.w = w;
      if (autoH) p.h = h;
      const anchor = str(p.anchor, 'left');
      const ax = anchor === 'right' ? w : anchor === 'center' ? w / 2 : 0;
      node.box = { x: o.x + num(p.x, 0) - ax, y: o.y + num(p.y, 0), w, h };
      break;
    }
    case 'table': {
      node.table = layoutTable(ctx, node);
      const h = node.table.rowHeights.reduce((a, b) => a + b, 0);
      p.h = h;
      node.box = { x: o.x + num(p.x, 0), y: o.y + num(p.y, 0), w: num(p.w, 800), h };
      break;
    }
    case 'line':
    case 'arrow': {
      const x1 = num(p.x, 0);
      const y1 = num(p.y, 0);
      const x2 = num(p.x2, x1 + 200);
      const y2 = num(p.y2, y1);
      node.box = { x: o.x + Math.min(x1, x2), y: o.y + Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
      break;
    }
    case 'polygon': {
      const pts = parsePoints(str(p.points, ''));
      const b = boundsOf(pts);
      const w = 'w' in node.prov ? num(p.w, b.w) : b.w;
      const h = 'h' in node.prov ? num(p.h, b.h) : b.h;
      const sx = b.w ? w / b.w : 1;
      const sy = b.h ? h / b.h : 1;
      node.points = pts.map(([x, y]) => [(x - b.x) * sx, (y - b.y) * sy]);
      p.w = w;
      p.h = h;
      node.box = { x: o.x + num(p.x, 0), y: o.y + num(p.y, 0), w, h };
      break;
    }
    case 'path': {
      const b = pathBounds(str(p.d, ''));
      node.viewBox = b;
      const w = 'w' in node.prov ? num(p.w, b.w) : b.w;
      const h = 'h' in node.prov ? num(p.h, b.h) : b.h;
      p.w = w;
      p.h = h;
      node.box = { x: o.x + num(p.x, 0), y: o.y + num(p.y, 0), w, h };
      break;
    }
    case 'image': {
      const w = num(p.w, 400);
      let h = num(p.h, NaN);
      if (!('h' in node.prov) || Number.isNaN(h)) {
        const size = ctx.imageSizes[str(p.src, '')];
        h = size && size.w > 0 ? (w * size.h) / size.w : w * 0.75;
        p.h = h;
      }
      node.box = { x: o.x + num(p.x, 0), y: o.y + num(p.y, 0), w, h };
      break;
    }
    case 'group': {
      for (const c of node.children) refresh(ctx, c);
      const ox = o.x + num(p.x, 0);
      const oy = o.y + num(p.y, 0);
      if (node.component) {
        node.box = { x: ox, y: oy, w: num(p.w, 0), h: num(p.h, 0) };
      } else if (node.children.length) {
        node.box = unionBoxes(node.children.map((c) => c.box));
      } else node.box = { x: ox, y: oy, w: 0, h: 0 };
      break;
    }
    default:
      node.box = { x: o.x + num(p.x, 0), y: o.y + num(p.y, 0), w: num(p.w, 0), h: num(p.h, 0) };
  }
  // keep enclosing groups in sync
  const parent = ctx.parents.get(node);
  if (parent && parent.kind === 'group' && !parent.component && parent.children.length) {
    parent.box = unionBoxes(parent.children.map((c) => c.box));
  }
}

function boundsOf(pts: [number, number][]): Box {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBoxes(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
}

// ---------------------------------------------------------------------------
// Op evaluation

function lookup(ctx: Ctx, id: string): SceneNode | undefined {
  return ctx.componentObjects?.get(id) ?? (ctx.componentObjects ? undefined : ctx.slide.byId.get(id));
}

function resolveTargets(ctx: Ctx, op: OpNode, args: Arg[]): SceneNode[] {
  const out: SceneNode[] = [];
  for (const a of args) {
    if (a.value.k !== 'id') continue;
    const n = lookup(ctx, a.value.name);
    if (!n) report(ctx.env, `Unbekanntes Objekt „@${a.value.name}“ (Objekte müssen vor ihrer Verwendung definiert sein)`, a.value.span);
    else out.push(n);
  }
  if (!out.length && !args.some((a) => a.value.k === 'id')) report(ctx.env, `„${op.verb}“ braucht mindestens ein Ziel (@id)`, op.verbSpan);
  return out;
}

function defaultsFor(kind: NodeKind): Props {
  switch (kind) {
    case 'rect':
    case 'ellipse':
      return { x: 0, y: 0, w: 200, h: 120, fill: DEFAULT_FILL };
    case 'polygon':
    case 'path':
      return { x: 0, y: 0, fill: DEFAULT_FILL };
    case 'line':
    case 'arrow':
      return { x: 0, y: 0, stroke: DEFAULT_TEXT, 'stroke.width': 4, head: kind === 'arrow' ? 'end' : 'none' };
    case 'text':
      return { x: 0, y: 0, size: 32, color: DEFAULT_TEXT, line: 1.25, text: '' };
    case 'list':
      return { x: 0, y: 0, size: 32, color: DEFAULT_TEXT, line: 1.3, bullet: 'disc' };
    case 'image':
      return { x: 0, y: 0, w: 400, fit: 'contain', src: '' };
    case 'table':
      return { x: 0, y: 0, w: 800, size: 24, color: DEFAULT_TEXT, pad: 16, border: '#D1D5DB', 'header.fill': '#F3F4F6' };
    case 'group':
      return { x: 0, y: 0 };
  }
}

function newNode(ctx: Ctx, kind: NodeKind, id: string, op: OpNode, src: Src): SceneNode {
  const ref = opRef(op, src);
  return {
    id,
    kind,
    props: defaultsFor(kind),
    prov: {},
    origin: ref,
    touchedBy: [],
    box: { x: 0, y: 0, w: 0, h: 0 },
    children: [],
    parentId: null,
    slot: false,
    placeholder: false,
    from: src.scope,
  };
}

function applyStyle(ctx: Ctx, node: SceneNode, name: string, span: { start: number; end: number }): void {
  const style = ctx.theme.styles.get(name);
  if (!style) {
    report(ctx.env, `Unbekannter Stil „${name}“`, span);
    return;
  }
  for (const [k, v] of Object.entries(style.props)) {
    node.props[k] = v;
    node.prov[k] = style.prov[k] as Prov;
  }
}

/** Apply keyed arguments (like=, style=, in= and properties) to a node. */
function applyKeyed(ctx: Ctx, node: SceneNode, op: OpNode, src: Src, verbForKeys: string): void {
  const allowed = new Set(KEYS_BY_VERB[verbForKeys] ?? []);
  const keyed = op.args.filter((a) => a.key !== undefined);
  const like = keyed.find((a) => a.key === 'like');
  if (like) {
    if (like.value.k !== 'id') report(ctx.env, '„like“ erwartet ein Objekt, z. B. like=@card1', like.value.span);
    else {
      const other = lookup(ctx, like.value.name);
      if (!other) report(ctx.env, `Unbekanntes Objekt „@${like.value.name}“`, like.value.span);
      else {
        for (const [k, v] of Object.entries(other.props)) {
          if (!(k in other.prov)) continue;
          node.props[k] = v;
          node.prov[k] = { ...(other.prov[k] as Prov), inherited: true, literal: false };
        }
        if (other.items) node.items = other.items.map((i) => ({ ...i }));
        if (other.rows) node.rows = other.rows.map((r) => [...r]);
      }
    }
  }
  const style = keyed.find((a) => a.key === 'style');
  if (style) {
    const name = style.value.k === 'name' ? style.value.name : style.value.k === 'str' ? style.value.value : '';
    applyStyle(ctx, node, name, style.value.span);
  }
  let inArg: Arg | undefined;
  for (const a of keyed) {
    const key = a.key as string;
    if (key === 'like' || key === 'style') continue;
    if (key === 'in') {
      inArg = a;
      continue;
    }
    if (!allowed.has(key) && !(node.kind === 'group' && node.component)) {
      report(ctx.env, `Unbekannte Eigenschaft „${key}“ für ${verbForKeys}`, a.keySpan ?? a.span, 'warning');
    }
    const v = coerce(ctx.env, key, evalExpr(ctx.env, a.value, axisOf(key)), a.value);
    if (v === undefined) continue;
    if (key === 'shadow' && v === 'none') {
      for (const k of ['shadow.x', 'shadow.y', 'shadow.blur', 'shadow.color']) {
        delete node.props[k];
        delete node.prov[k];
      }
      continue;
    }
    for (const [k, val] of expandKey(key, v)) setProp(node, k, val, argProv(op, src, a));
  }
  if (inArg) {
    if (inArg.value.k !== 'id') report(ctx.env, '„in“ erwartet ein Objekt, z. B. in=@card1', inArg.value.span);
    else {
      const box = lookup(ctx, inArg.value.name);
      if (!box) report(ctx.env, `Unbekanntes Objekt „@${inArg.value.name}“`, inArg.value.span);
      else {
        const o = originOf(ctx, node);
        const prov = argProv(op, src, inArg, { semantic: true, literal: false });
        const inset = isTextual(node) ? 0 : num(node.props.pad, 0);
        setProp(node, 'x', box.box.x - o.x + inset, prov);
        setProp(node, 'y', box.box.y - o.y + inset, prov);
        setProp(node, 'w', box.box.w - 2 * inset, prov);
        if (!isTextual(node) || 'valign' in node.props) setProp(node, 'h', box.box.h - 2 * inset, prov);
      }
    }
  }
}

function addNode(ctx: Ctx, node: SceneNode, parent: SceneNode | null, span: { start: number; end: number }): boolean {
  const table = ctx.componentObjects ?? ctx.slide.byId;
  if (table.has(node.id)) {
    report(ctx.env, `ID „@${node.id}“ ist bereits vergeben`, span);
    return false;
  }
  table.set(node.id, node);
  if (parent) {
    node.parentId = parent.id;
    ctx.parents.set(node, parent);
    parent.children.push(node);
  } else ctx.slide.nodes.push(node);
  return true;
}

function createOp(ctx: Ctx, op: OpNode, src: Src, parent: SceneNode | null): void {
  const verb = op.verb;
  const pos = positional(op);
  const idArg = pos[0] && pos[0].value.k === 'id' ? pos[0] : undefined;
  let rest = idArg ? pos.slice(1) : pos;
  let id = idArg && idArg.value.k === 'id' ? idArg.value.name : '';
  if (!id) id = `_${verb}${++ctx.autoId}`;

  if (verb === 'use') {
    createUse(ctx, op, src, parent, id, rest);
    return;
  }
  const isSlot = verb === 'slot';
  let kind: NodeKind = isSlot ? 'text' : (verb as NodeKind);
  if (isSlot) {
    const k = argByKey(op, 'kind');
    if (k && k.value.k === 'name' && k.value.name === 'image') kind = 'image';
  }
  const node = newNode(ctx, kind, id, op, src);
  node.slot = isSlot;
  if (isSlot) {
    node.placeholder = true;
    node.props.placeholder = kind === 'image' ? 'Bild' : id;
  }
  if (!addNode(ctx, node, parent, idArg ? idArg.value.span : op.verbSpan)) return;
  touch(ctx, node, op, src);

  // positional content
  if ((kind === 'text' || kind === 'image') && !isSlot && rest[0]) {
    const a = rest[0];
    const v = evalExpr(ctx.env, a.value);
    if (typeof v === 'string') setProp(node, kind === 'text' ? 'text' : 'src', v, argProv(op, src, a));
    else if (v !== undefined) report(ctx.env, 'Zeichenkette erwartet', a.value.span);
    rest = rest.slice(1);
  }
  for (const a of rest) report(ctx.env, 'Unerwartetes Argument', a.span, 'warning');

  if (kind === 'list') {
    node.items = [];
    for (const c of op.children) {
      if (c.verb !== 'item') {
        report(ctx.env, `In einer Liste ist nur „item“ erlaubt`, c.verbSpan);
        continue;
      }
      const t = positional(c)[0];
      const lv = argByKey(c, 'level');
      const text = t ? evalExpr(ctx.env, t.value) : '';
      node.items.push({ text: typeof text === 'string' ? text : '', level: lv ? num(evalExpr(ctx.env, lv.value), 1) : 1 });
      touch(ctx, node, c, src);
    }
  } else if (kind === 'table') {
    node.rows = [];
    for (const c of op.children) {
      if (c.verb !== 'row') {
        report(ctx.env, `In einer Tabelle ist nur „row“ erlaubt`, c.verbSpan);
        continue;
      }
      node.rows.push(positional(c).map((a) => String(evalExpr(ctx.env, a.value) ?? '')));
      touch(ctx, node, c, src);
    }
  }

  applyKeyed(ctx, node, op, src, verb);

  if (isSlot) {
    const fill = ctx.pendingFills.get(id);
    if (fill) applyFill(ctx, node, fill, { doc: ctx.deckDoc, file: 'deck', scope: 'slide' }, src);
  }
  refresh(ctx, node);

  if (kind === 'group') {
    const savedOrigin = ctx.env.origin;
    const o = originOf(ctx, node);
    ctx.env.origin = { x: o.x + num(node.props.x, 0), y: o.y + num(node.props.y, 0) };
    for (const c of op.children) evalOp(ctx, c, src, node, 'group');
    ctx.env.origin = savedOrigin;
    refresh(ctx, node);
  }
}

function createUse(ctx: Ctx, op: OpNode, src: Src, parent: SceneNode | null, id: string, rest: Arg[]): void {
  const nameArg = rest[0];
  const compName = nameArg && nameArg.value.k === 'name' ? nameArg.value.name : '';
  const comp = ctx.theme.components.get(compName);
  if (!comp) {
    report(ctx.env, compName ? `Unbekannte Komponente „${compName}“` : '„use“ erwartet einen Komponentennamen', nameArg ? nameArg.value.span : op.verbSpan);
    return;
  }
  const node = newNode(ctx, 'group', id, op, src);
  node.component = compName;
  Object.assign(node.props, comp.defaults);
  if (!addNode(ctx, node, parent, op.verbSpan)) return;
  touch(ctx, node, op, src);
  const params: Props = { ...comp.defaults };
  // like=@other copies position, size and all parameters of another instance
  const like = op.args.find((a) => a.key === 'like');
  if (like) {
    const other = like.value.k === 'id' ? lookup(ctx, like.value.name) : undefined;
    if (like.value.k !== 'id') report(ctx.env, '„like“ erwartet ein Objekt, z. B. like=@p1', like.value.span);
    else if (!other) report(ctx.env, `Unbekanntes Objekt „@${like.value.name}“`, like.value.span);
    else if (other.component !== compName) report(ctx.env, `„@${other.id}“ ist keine Instanz von „${compName}“`, like.value.span);
    else {
      for (const [k, v] of Object.entries(other.props)) {
        if (!(k in comp.defaults) && k !== 'x' && k !== 'y' && k !== 'opacity') continue;
        node.props[k] = v;
        const p = other.prov[k];
        if (p) node.prov[k] = { ...p, inherited: true, literal: false };
        if (k in comp.defaults) params[k] = v;
      }
    }
  }
  for (const a of op.args) {
    if (!a.key || a.key === 'like') continue;
    const v = evalExpr(ctx.env, a.value, axisOf(a.key));
    if (v === undefined) continue;
    setProp(node, a.key, v, argProv(op, src, a));
    params[a.key] = v;
  }
  // evaluate component body in the theme file with local ids
  const saved = { comp: ctx.componentObjects, params: ctx.env.params, objects: ctx.env.objects, src: ctx.env.src, file: ctx.env.file, origin: ctx.env.origin };
  const o = originOf(ctx, node);
  ctx.env.origin = { x: o.x + num(node.props.x, 0), y: o.y + num(node.props.y, 0) };
  const local = new Map<string, SceneNode>();
  ctx.componentObjects = local;
  ctx.env.params = params;
  ctx.env.objects = local;
  const csrc: Src = { doc: ctx.theme.doc, file: 'theme', scope: 'component' };
  useSrc(ctx.env, csrc);
  for (const c of comp.op.children) evalOp(ctx, c, csrc, node, 'component');
  ctx.componentObjects = saved.comp;
  ctx.env.params = saved.params;
  ctx.env.objects = saved.objects;
  ctx.env.src = saved.src;
  ctx.env.file = saved.file;
  ctx.env.origin = saved.origin;
  refresh(ctx, node);
}

function translate(ctx: Ctx, node: SceneNode, dx: number, dy: number, prov: Prov): void {
  if (dx) setProp(node, 'x', num(node.props.x, 0) + dx, prov);
  if (dy) setProp(node, 'y', num(node.props.y, 0) + dy, prov);
  if (node.kind === 'line' || node.kind === 'arrow') {
    if (dx) setProp(node, 'x2', num(node.props.x2, num(node.props.x, 0) - dx + 200) + dx, prov);
    if (dy) setProp(node, 'y2', num(node.props.y2, num(node.props.y, 0) - dy) + dy, prov);
  }
  refresh(ctx, node);
}

function placeAt(ctx: Ctx, node: SceneNode, x: number | null, y: number | null, prov: Prov): void {
  translate(ctx, node, x === null ? 0 : x - node.box.x, y === null ? 0 : y - node.box.y, prov);
}

function resolveWithin(ctx: Ctx, a: Arg | undefined): Box | null {
  if (!a) return null;
  if (a.value.k === 'name') {
    if (a.value.name === 'slide') return { x: 0, y: 0, w: ctx.env.slideW, h: ctx.env.slideH };
    const r = ctx.slide.regions[a.value.name];
    if (r) return r;
    report(ctx.env, `Unbekannte Region „${a.value.name}“`, a.value.span);
    return null;
  }
  if (a.value.k === 'id') {
    const n = lookup(ctx, a.value.name);
    if (n) return n.box;
    report(ctx.env, `Unbekanntes Objekt „@${a.value.name}“`, a.value.span);
    return null;
  }
  report(ctx.env, 'Region, „slide“ oder @id erwartet', a.value.span);
  return null;
}

function arrangeOp(ctx: Ctx, op: OpNode, src: Src): void {
  const pos = positional(op);
  const prov = semanticProv(op, src);
  if (op.verb === 'grid') {
    const nodes = resolveTargets(ctx, op, pos);
    nodes.forEach((n) => touch(ctx, n, op, src));
    if (!nodes.length) return;
    const cols = Math.max(1, Math.round(num(evalArg(ctx, op, 'cols'), 2)));
    const gap = num(evalArg(ctx, op, 'gap', 'x'), 24);
    const within = resolveWithin(ctx, argByKey(op, 'within'));
    const first = nodes[0] as SceneNode;
    const x0 = num(evalArg(ctx, op, 'x', 'x'), within ? within.x : first.box.x);
    const y0 = num(evalArg(ctx, op, 'y', 'y'), within ? within.y : first.box.y);
    const W = num(evalArg(ctx, op, 'w', 'x'), within ? within.w : first.box.w * cols + gap * (cols - 1));
    const rowh = evalArg(ctx, op, 'rowh', 'y');
    const cw = (W - gap * (cols - 1)) / cols;
    let y = y0;
    for (let r = 0; r * cols < nodes.length; r++) {
      const row = nodes.slice(r * cols, r * cols + cols);
      row.forEach((n, ci) => {
        if (n.kind !== 'line' && n.kind !== 'arrow') {
          setProp(n, 'w', cw, prov);
          if (typeof rowh === 'number') setProp(n, 'h', rowh, prov);
          refresh(ctx, n);
        }
        placeAt(ctx, n, x0 + ci * (cw + gap), y, prov);
      });
      y += Math.max(...row.map((n) => n.box.h)) + gap;
    }
    return;
  }
  const mode = pos[0];
  const modeName = mode && mode.value.k === 'name' ? mode.value.name : '';
  const nodes = resolveTargets(ctx, op, pos.slice(1));
  nodes.forEach((n) => touch(ctx, n, op, src));
  if (!nodes.length) return;
  if (op.verb === 'align') {
    if (!ALIGN_MODES.includes(modeName)) {
      report(ctx.env, `Ausrichtung erwartet: ${ALIGN_MODES.join(', ')}`, mode ? mode.value.span : op.verbSpan);
      return;
    }
    const toArg = argByKey(op, 'to');
    let ref: Box;
    if (toArg && toArg.value.k === 'name' && (toArg.value.name === 'first' || toArg.value.name === 'last')) {
      ref = (toArg.value.name === 'first' ? nodes[0] : nodes[nodes.length - 1])!.box;
    } else if (toArg) {
      ref = resolveWithin(ctx, toArg) ?? unionBoxes(nodes.map((n) => n.box));
    } else ref = nodes.length === 1 ? { x: 0, y: 0, w: ctx.env.slideW, h: ctx.env.slideH } : unionBoxes(nodes.map((n) => n.box));
    for (const n of nodes) {
      const b = n.box;
      switch (modeName) {
        case 'left':
          placeAt(ctx, n, ref.x, null, prov);
          break;
        case 'right':
          placeAt(ctx, n, ref.x + ref.w - b.w, null, prov);
          break;
        case 'center':
          placeAt(ctx, n, ref.x + (ref.w - b.w) / 2, null, prov);
          break;
        case 'top':
          placeAt(ctx, n, null, ref.y, prov);
          break;
        case 'bottom':
          placeAt(ctx, n, null, ref.y + ref.h - b.h, prov);
          break;
        case 'middle':
          placeAt(ctx, n, null, ref.y + (ref.h - b.h) / 2, prov);
          break;
      }
    }
    return;
  }
  if (modeName !== 'h' && modeName !== 'v') {
    report(ctx.env, 'Richtung „h“ oder „v“ erwartet', mode ? mode.value.span : op.verbSpan);
    return;
  }
  const horiz = modeName === 'h';
  const size = (b: Box): number => (horiz ? b.w : b.h);
  const start = (b: Box): number => (horiz ? b.x : b.y);
  if (op.verb === 'distribute') {
    const within = resolveWithin(ctx, argByKey(op, 'within'));
    const gapV = evalArg(ctx, op, 'gap', horiz ? 'x' : 'y');
    const total = nodes.reduce((s, n) => s + size(n.box), 0);
    let s0: number;
    let gap: number;
    if (within) {
      s0 = horiz ? within.x : within.y;
      gap = typeof gapV === 'number' ? gapV : nodes.length > 1 ? ((horiz ? within.w : within.h) - total) / (nodes.length - 1) : 0;
      if (typeof gapV === 'number') s0 += ((horiz ? within.w : within.h) - total - gapV * (nodes.length - 1)) / 2;
    } else {
      const first = nodes[0] as SceneNode;
      const last = nodes[nodes.length - 1] as SceneNode;
      s0 = start(first.box);
      const end = start(last.box) + size(last.box);
      gap = typeof gapV === 'number' ? gapV : nodes.length > 1 ? (end - s0 - total) / (nodes.length - 1) : 0;
    }
    let cur = s0;
    for (const n of nodes) {
      placeAt(ctx, n, horiz ? cur : null, horiz ? null : cur, prov);
      cur += size(n.box) + gap;
    }
    return;
  }
  // stack
  const gap = num(evalArg(ctx, op, 'gap', horiz ? 'x' : 'y'), 0);
  const first = nodes[0] as SceneNode;
  const sx = evalArg(ctx, op, 'x', 'x');
  const sy = evalArg(ctx, op, 'y', 'y');
  const ox = typeof sx === 'number' ? sx : first.box.x;
  const oy = typeof sy === 'number' ? sy : first.box.y;
  const alignArg = argByKey(op, 'align');
  const cross = alignArg && alignArg.value.k === 'name' ? alignArg.value.name : 'start';
  const crossSize = Math.max(...nodes.map((n) => (horiz ? n.box.h : n.box.w)));
  let cur = horiz ? ox : oy;
  for (const n of nodes) {
    const cs = horiz ? n.box.h : n.box.w;
    const off = cross === 'center' ? (crossSize - cs) / 2 : cross === 'end' ? crossSize - cs : 0;
    if (horiz) placeAt(ctx, n, cur, oy + off, prov);
    else placeAt(ctx, n, ox + off, cur, prov);
    cur += (horiz ? n.box.w : n.box.h) + gap;
  }
}

function evalArg(ctx: Ctx, op: OpNode, key: string, axis: Axis = null): PropValue | undefined {
  const a = argByKey(op, key);
  return a ? evalExpr(ctx.env, a.value, axis) : undefined;
}

function applyFill(ctx: Ctx, node: SceneNode, op: OpNode, src: Src, restoreSrc: Src): void {
  const value = positional(op)[1];
  if (!value) return;
  useSrc(ctx.env, src);
  const v = evalExpr(ctx.env, value.value);
  if (typeof v === 'string') {
    setProp(node, node.kind === 'image' ? 'src' : 'text', v, argProv(op, src, value));
    node.placeholder = false;
  }
  // keyed overrides on the fill line (e.g. color=)
  for (const a of op.args) {
    if (!a.key) continue;
    const kv = coerce(ctx.env, a.key, evalExpr(ctx.env, a.value, axisOf(a.key)), a.value);
    if (kv !== undefined) for (const [k, val] of expandKey(a.key, kv)) setProp(node, k, val, argProv(op, src, a));
  }
  useSrc(ctx.env, restoreSrc);
}

function modifyOp(ctx: Ctx, op: OpNode, src: Src): void {
  const pos = positional(op);
  const idArgs = pos.filter((a) => a.value.k === 'id');
  const others = pos.filter((a) => a.value.k !== 'id');
  const nodes = resolveTargets(ctx, op, idArgs);
  for (const node of nodes) {
    touch(ctx, node, op, src);
    switch (op.verb) {
      case 'set':
        applyKeyed(ctx, node, op, src, 'set');
        break;
      case 'move': {
        const dxA = argByKey(op, 'dx') ?? others[0];
        const dyA = argByKey(op, 'dy') ?? others[1];
        const dx = dxA ? num(evalExpr(ctx.env, dxA.value, 'x'), 0) : 0;
        const dy = dyA ? num(evalExpr(ctx.env, dyA.value, 'y'), 0) : 0;
        if (dx) translate(ctx, node, dx, 0, argProv(op, src, dxA as Arg, { relative: true }));
        if (dy) translate(ctx, node, 0, dy, argProv(op, src, dyA as Arg, { relative: true }));
        break;
      }
      case 'resize': {
        const wA = argByKey(op, 'w') ?? others[0];
        const hA = argByKey(op, 'h') ?? others[1];
        if (wA) {
          const v = evalExpr(ctx.env, wA.value, 'x');
          if (typeof v === 'number') setProp(node, 'w', v, argProv(op, src, wA));
        }
        if (hA) {
          const v = evalExpr(ctx.env, hA.value, 'y');
          if (typeof v === 'number') setProp(node, 'h', v, argProv(op, src, hA));
        }
        break;
      }
      case 'round': {
        const all = others[0];
        if (all) {
          const v = evalExpr(ctx.env, all.value);
          if (typeof v === 'number') for (const [k, val] of expandKey('radius', v)) setProp(node, k, val, argProv(op, src, all));
        }
        for (const c of ['tl', 'tr', 'br', 'bl']) {
          const a = argByKey(op, c);
          if (!a) continue;
          const v = evalExpr(ctx.env, a.value);
          if (typeof v === 'number') setProp(node, `radius.${c}`, v, argProv(op, src, a));
        }
        break;
      }
      case 'style': {
        const n = others[0];
        const name = n && n.value.k === 'name' ? n.value.name : n && n.value.k === 'str' ? n.value.value : '';
        applyStyle(ctx, node, name, n ? n.value.span : op.verbSpan);
        break;
      }
      case 'stroke': {
        const c = argByKey(op, 'color') ?? others[0];
        const w = argByKey(op, 'width') ?? others[1];
        const d = argByKey(op, 'dash');
        if (c) {
          const v = coerce(ctx.env, 'stroke', evalExpr(ctx.env, c.value), c.value);
          if (v !== undefined) setProp(node, 'stroke', v, argProv(op, src, c));
        }
        if (w) {
          const v = evalExpr(ctx.env, w.value);
          if (typeof v === 'number') setProp(node, 'stroke.width', v, argProv(op, src, w));
        } else if (c && !('stroke.width' in node.props)) node.props['stroke.width'] = 2;
        if (d) {
          const v = evalExpr(ctx.env, d.value);
          if (typeof v === 'number') setProp(node, 'stroke.dash', v, argProv(op, src, d));
        }
        break;
      }
      case 'shadow': {
        const first = others[0];
        if (first && first.value.k === 'name' && first.value.name === 'none') {
          for (const k of ['shadow.x', 'shadow.y', 'shadow.blur', 'shadow.color']) {
            delete node.props[k];
            delete node.prov[k];
          }
          break;
        }
        const defaults: Record<string, PropValue> = { x: 0, y: 8, blur: 24, color: 'rgba(0,0,0,0.25)' };
        for (const k of ['x', 'y', 'blur', 'color']) {
          const a = argByKey(op, k);
          if (a) {
            const v = evalExpr(ctx.env, a.value);
            if (v !== undefined) setProp(node, `shadow.${k}`, v, argProv(op, src, a));
          } else setProp(node, `shadow.${k}`, defaults[k] as PropValue, semanticProv(op, src));
        }
        break;
      }
      case 'opacity': {
        const a = others[0];
        const v = a ? evalExpr(ctx.env, a.value) : undefined;
        if (typeof v === 'number') setProp(node, 'opacity', Math.max(0, Math.min(1, v)), argProv(op, src, a as Arg));
        else report(ctx.env, '„opacity“ erwartet eine Zahl zwischen 0 und 1', op.verbSpan);
        break;
      }
      case 'hide':
      case 'show':
        setProp(node, 'hidden', op.verb === 'hide', semanticProv(op, src));
        break;
      case 'z': {
        const a = others[0];
        const mode = a ? (a.value.k === 'name' ? a.value.name : evalExpr(ctx.env, a.value)) : 'front';
        const parent = ctx.parents.get(node);
        const list = parent ? parent.children : ctx.slide.nodes;
        const i = list.indexOf(node);
        if (i < 0) break;
        list.splice(i, 1);
        let j = i;
        if (mode === 'front') j = list.length;
        else if (mode === 'back') j = 0;
        else if (mode === 'forward') j = Math.min(list.length, i + 1);
        else if (mode === 'backward') j = Math.max(0, i - 1);
        else if (typeof mode === 'number') j = Math.max(0, Math.min(list.length, Math.round(mode)));
        else report(ctx.env, '„z“ erwartet front, back, forward, backward oder eine Zahl', a ? a.value.span : op.verbSpan);
        list.splice(j, 0, node);
        break;
      }
    }
    refresh(ctx, node);
  }
}

type Place = 'master' | 'layout' | 'slide' | 'group' | 'component';

function evalOp(ctx: Ctx, op: OpNode, src: Src, parent: SceneNode | null, place: Place): void {
  const verb = op.verb;
  if ((CREATE_VERBS as readonly string[]).includes(verb)) {
    createOp(ctx, op, src, parent);
    return;
  }
  if ((MODIFY_VERBS as readonly string[]).includes(verb)) {
    modifyOp(ctx, op, src);
    return;
  }
  if ((ARRANGE_VERBS as readonly string[]).includes(verb)) {
    if (place === 'group') report(ctx.env, `„${verb}“ ist in Gruppen nicht erlaubt`, op.verbSpan);
    else arrangeOp(ctx, op, src);
    return;
  }
  switch (verb) {
    case 'slot':
      if (place !== 'layout' && place !== 'master') report(ctx.env, '„slot“ ist nur in Layouts erlaubt', op.verbSpan);
      else createOp(ctx, op, src, parent);
      return;
    case 'region': {
      if (place === 'group' || place === 'component') break;
      const p = positional(op)[0];
      if (!p || p.value.k !== 'name') {
        report(ctx.env, '„region“ erwartet einen Namen', op.verbSpan);
        return;
      }
      const box = { x: 0, y: 0, w: ctx.env.slideW, h: ctx.env.slideH };
      for (const k of ['x', 'y', 'w', 'h'] as const) {
        const v = evalArg(ctx, op, k, axisOf(k));
        if (typeof v === 'number') box[k] = v;
      }
      ctx.slide.regions[p.value.name] = box;
      return;
    }
    case 'background': {
      if (place === 'group' || place === 'component') break;
      const bg: Background = { ...ctx.slide.background };
      const f = argByKey(op, 'fill');
      if (f) {
        const v = coerce(ctx.env, 'fill', evalExpr(ctx.env, f.value), f.value);
        if (typeof v === 'string') {
          bg.fill = v;
          bg.prov = argProv(op, src, f);
        }
      }
      const img = argByKey(op, 'image');
      if (img) {
        const v = evalExpr(ctx.env, img.value);
        if (typeof v === 'string') bg.image = v;
      }
      const fit = argByKey(op, 'fit');
      if (fit) {
        const v = evalExpr(ctx.env, fit.value);
        if (typeof v === 'string') bg.fit = v;
      }
      ctx.slide.background = bg;
      return;
    }
    case 'fill': {
      if (place !== 'slide') {
        report(ctx.env, '„fill“ ist nur auf Folien erlaubt', op.verbSpan);
        return;
      }
      const t = positional(op)[0];
      if (!t || t.value.k !== 'id') {
        report(ctx.env, '„fill“ erwartet einen Slot, z. B. fill @title "Text"', op.verbSpan);
        return;
      }
      const node = lookup(ctx, t.value.name);
      if (!node) {
        report(ctx.env, `Unbekannter Slot „@${t.value.name}“ – das Layout definiert ihn nicht`, t.value.span);
        return;
      }
      if (!node.slot) {
        report(ctx.env, `„@${t.value.name}“ ist kein Slot`, t.value.span);
        return;
      }
      touch(ctx, node, op, src);
      applyFill(ctx, node, op, src, src);
      refresh(ctx, node);
      return;
    }
    case 'notes': {
      if (place !== 'slide') break;
      const t = positional(op)[0];
      const v = t ? evalExpr(ctx.env, t.value) : undefined;
      if (typeof v === 'string') ctx.slide.notes = ctx.slide.notes ? `${ctx.slide.notes}\n${v}` : v;
      else report(ctx.env, '„notes“ erwartet eine Zeichenkette', op.verbSpan);
      return;
    }
    case 'number': {
      if (place !== 'slide') break;
      numberOp(ctx, op, src);
      return;
    }
    case 'item':
    case 'row':
      report(ctx.env, `„${verb}“ ist nur in ${verb === 'item' ? 'Listen' : 'Tabellen'} erlaubt`, op.verbSpan);
      return;
    default:
      report(ctx.env, `Unbekannte Operation „${verb}“`, op.verbSpan);
      return;
  }
  report(ctx.env, `„${verb}“ ist hier nicht erlaubt`, op.verbSpan);
}

function numberOp(ctx: Ctx, op: OpNode, src: Src): void {
  const pos = positional(op);
  const c = pos[0];
  if (!c || c.value.k !== 'name') {
    report(ctx.env, '„number“ erwartet einen Zählernamen, z. B. number figure @chart', op.verbSpan);
    return;
  }
  const name = c.value.name;
  ctx.env.counters[name] = (ctx.env.counters[name] ?? 0) + 1;
  const target = pos[1];
  if (!target) return;
  if (target.value.k !== 'id') {
    report(ctx.env, 'Ziel @id erwartet', target.value.span);
    return;
  }
  const node = lookup(ctx, target.value.name);
  if (!node) {
    report(ctx.env, `Unbekanntes Objekt „@${target.value.name}“`, target.value.span);
    return;
  }
  touch(ctx, node, op, src);
  const capArg = argByKey(op, 'caption');
  if (!capArg) return;
  const text = evalExpr(ctx.env, capArg.value);
  if (typeof text !== 'string') return;
  const cap = newNode(ctx, 'text', `${node.id}_caption`, op, src);
  const styleName = ctx.theme.styles.has('caption') ? 'caption' : ctx.theme.styles.has('footer') ? 'footer' : null;
  if (!addNode(ctx, cap, null, capArg.span)) return;
  touch(ctx, cap, op, src);
  const styleArg = argByKey(op, 'style');
  const sName = styleArg && styleArg.value.k === 'name' ? styleArg.value.name : styleName;
  if (sName) applyStyle(ctx, cap, sName, styleArg ? styleArg.value.span : op.verbSpan);
  setProp(cap, 'text', text, argProv(op, src, capArg));
  const prov = semanticProv(op, src);
  const gap = num(evalArg(ctx, op, 'gap', 'y'), 16);
  setProp(cap, 'w', node.box.w, prov);
  setProp(cap, 'x', node.box.x, prov);
  refresh(ctx, cap);
  const posArg = argByKey(op, 'pos');
  const above = posArg && posArg.value.k === 'name' && posArg.value.name === 'above';
  setProp(cap, 'y', above ? node.box.y - gap - cap.box.h : node.box.y + node.box.h + gap, prov);
  refresh(ctx, cap);
}

// ---------------------------------------------------------------------------
// Deck

function slideIdOf(op: OpNode, index: number): string {
  return idOf(op) ?? `_slide${index + 1}`;
}

function isHiddenSlide(op: OpNode): boolean {
  const h = argByKey(op, 'hidden');
  return !!h && h.value.k === 'name' && h.value.name === 'true';
}

/** Evaluate a deck into a scene graph. Pure: never throws, never touches the outside world. */
export function evaluate(deck: Document, opts: EvaluateOptions = {}): DeckScene {
  const m = opts.measurer ?? (defaultMeasurer ??= createMetricMeasurer());
  const diags: Diagnostic[] = [];
  const deckEnv = baseEnv(deck, 'deck', diags);
  let title = '';
  let themePath: string | null = null;
  const slideOps: { op: OpNode; section: string; sectionN: number }[] = [];
  let section = '';
  let sectionN = 0;
  const deckCounters: Record<string, number> = {};

  deck.ops.forEach((op, i) => {
    switch (op.verb) {
      case 'deck': {
        if (i !== 0) report(deckEnv, '„deck“ sollte in der ersten Zeile stehen', op.verbSpan, 'warning');
        const p = positional(op)[0];
        if (p && p.value.k === 'str') title = p.value.value;
        else report(deckEnv, '„deck“ erwartet einen Titel in Anführungszeichen', op.verbSpan);
        break;
      }
      case 'theme': {
        const p = positional(op)[0];
        if (p && p.value.k === 'str') themePath = p.value.value;
        else report(deckEnv, '„theme“ erwartet einen Dateipfad in Anführungszeichen', op.verbSpan);
        break;
      }
      case 'section': {
        const p = positional(op)[0];
        if (p && p.value.k === 'str') {
          section = p.value.value;
          sectionN++;
        } else report(deckEnv, '„section“ erwartet einen Namen in Anführungszeichen', op.verbSpan);
        break;
      }
      case 'counter': {
        const p = positional(op)[0];
        if (p && p.value.k === 'name') deckCounters[p.value.name] = num(evalExpr(deckEnv, argByKey(op, 'start')?.value ?? { k: 'num', value: 0, unit: '', span: op.span }), 0);
        else report(deckEnv, '„counter“ erwartet einen Namen', op.verbSpan);
        break;
      }
      case 'slide':
        slideOps.push({ op, section, sectionN });
        break;
      case 'token':
      case 'color':
      case 'font':
      case 'style':
      case 'master':
      case 'layout':
      case 'component':
      case 'size':
        report(deckEnv, `„${op.verb}“ ist eine Theme-Definition und gehört in eine Theme-Datei`, op.verbSpan);
        break;
      default:
        report(deckEnv, `„${op.verb}“ muss innerhalb einer Folie stehen`, op.verbSpan);
    }
  });

  const themeDoc = opts.theme ?? defaultTheme();
  const theme = evalTheme(themeDoc, diags);
  for (const d of themeDoc.diagnostics) diags.push({ ...d, file: 'theme' });
  for (const d of deck.diagnostics) diags.push({ ...d, file: 'deck' });

  const cache = opts.cache;
  if (cache && (cache.theme !== themeDoc || cache.measurer !== m || cache.imageSizes !== opts.imageSizes)) {
    cache.slides.clear();
    cache.theme = themeDoc;
    cache.measurer = m;
    if (opts.imageSizes) cache.imageSizes = opts.imageSizes;
    else delete cache.imageSizes;
  }
  if (cache) cache.reused = 0;
  const total = slideOps.filter((s) => !isHiddenSlide(s.op)).length;
  const counters: Record<string, number> = { ...theme.counters, ...deckCounters };
  const slides: SlideScene[] = [];
  const seenIds = new Set<string>();
  let visible = 0;

  slideOps.forEach(({ op, section: sec, sectionN: secN }, index) => {
    const hidden = isHiddenSlide(op);
    if (!hidden) visible++;
    const id = slideIdOf(op, index);
    const key = cache
      ? [id, visible, total, sec, secN, sectionN, title, JSON.stringify(counters), seenIds.has(id), deck.source.slice(op.line.start, op.blockEnd)].join('\u0000')
      : '';
    const cached = cache?.slides.get(id);
    if (cache && cached && cached.key === key) {
      shiftSlide(cached.scene, op.line.start - cached.blockStart, op.line.index - cached.line);
      cached.blockStart = op.line.start;
      cached.line = op.line.index;
      cached.scene.index = index;
      for (const k of Object.keys(counters)) delete counters[k];
      Object.assign(counters, cached.countersAfter);
      seenIds.add(id);
      cache.reused++;
      slides.push(cached.scene);
      return;
    }
    const slideDiags: Diagnostic[] = [];
    if (seenIds.has(id)) slideDiags.push(diag('error', `Folien-ID „@${id}“ ist bereits vergeben`, op.span, 'deck'));
    seenIds.add(id);
    const deckSrc: Src = { doc: deck, file: 'deck', scope: 'slide' };
    const scene: SlideScene = {
      id,
      index,
      n: hidden ? 0 : visible,
      hidden,
      layout: null,
      master: null,
      op: opRef(op, deckSrc),
      background: { fill: '#FFFFFF' },
      nodes: [],
      byId: new Map(),
      notes: '',
      section: sec,
      regions: {},
      opTargets: new Map(),
      diagnostics: slideDiags,
      hasErrors: false,
    };
    const env: EvalEnv = {
      src: deck.source,
      file: 'deck',
      diags: slideDiags,
      slideW: theme.info.width,
      slideH: theme.info.height,
      slideN: scene.n,
      deckTotal: total,
      deckTitle: title,
      deckSections: sectionN,
      section: sec,
      sectionN: secN,
      tokens: theme.tokens,
      counters,
      regions: scene.regions,
      objects: scene.byId,
      params: null,
      origin: { x: 0, y: 0 },
    };
    const ctx: Ctx = {
      theme,
      slide: scene,
      env,
      m,
      imageSizes: opts.imageSizes ?? {},
      pendingFills: new Map(),
      deckDoc: deck,
      parents: new Map(),
      autoId: 0,
      componentObjects: null,
    };
    for (const c of op.children) {
      if (c.verb === 'fill') {
        const t = positional(c)[0];
        if (t && t.value.k === 'id') ctx.pendingFills.set(t.value.name, c);
      }
    }
    // layout / master selection
    const layoutArg = argByKey(op, 'layout');
    let layoutName = layoutArg && layoutArg.value.k === 'name' ? layoutArg.value.name : null;
    if (layoutName && !theme.layouts.has(layoutName)) {
      slideDiags.push(diag('error', `Unbekanntes Layout „${layoutName}“`, layoutArg!.value.span, 'deck'));
      layoutName = null;
    }
    const layout = layoutName ? theme.layouts.get(layoutName) : undefined;
    const masterArg = argByKey(op, 'master');
    let masterName = masterArg && masterArg.value.k === 'name' ? masterArg.value.name : layout ? layout.master : theme.masters.has('default') ? 'default' : null;
    if (masterName && !theme.masters.has(masterName)) {
      slideDiags.push(diag('error', `Unbekannter Master „${masterName}“`, masterArg ? masterArg.value.span : op.verbSpan, 'deck'));
      masterName = null;
    }
    scene.layout = layoutName;
    scene.master = masterName;
    const masterOp = masterName ? theme.masters.get(masterName) : undefined;
    if (masterOp) {
      const s: Src = { doc: themeDoc, file: 'theme', scope: 'master' };
      useSrc(env, s);
      for (const c of masterOp.children) evalOp(ctx, c, s, null, 'master');
    }
    if (layout) {
      const s: Src = { doc: themeDoc, file: 'theme', scope: 'layout' };
      useSrc(env, s);
      for (const c of layout.op.children) evalOp(ctx, c, s, null, 'layout');
    }
    useSrc(env, deckSrc);
    for (const c of op.children) evalOp(ctx, c, deckSrc, null, 'slide');
    for (const d of slideDiags) if (!d.file) d.file = env.file;
    scene.hasErrors = slideDiags.some((d) => d.severity === 'error' && d.file === 'deck');
    for (const d of deck.diagnostics) {
      if (d.severity === 'error' && d.span.start >= scene.op.blockSpan.start && d.span.start <= scene.op.blockSpan.end) scene.hasErrors = true;
    }
    slides.push(scene);
    cache?.slides.set(id, { key, scene, blockStart: op.line.start, line: op.line.index, countersAfter: { ...counters } });
  });

  const all = dedupe([...diags, ...slides.flatMap((s) => s.diagnostics)]);
  return {
    title,
    width: theme.info.width,
    height: theme.info.height,
    slides,
    theme: theme.info,
    themePath,
    diagnostics: all,
  };
}

function dedupe(ds: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const d of ds) {
    const k = `${d.file}:${d.span.start}:${d.span.end}:${d.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
}

/** Find the theme path declared in a deck without evaluating it. */
export function themePathOf(deck: Document): string | null {
  for (const op of deck.ops) {
    if (op.verb !== 'theme') continue;
    const p = positional(op)[0];
    if (p && p.value.k === 'str') return p.value.value;
  }
  return null;
}
