import type { Document, OpNode, SceneNode, Span, Token } from '@forme/core';
import { CREATE_VERBS, walkOps } from '@forme/core';

/**
 * Editor-independent language features (outline, definitions, references, colors, hover).
 * No `vscode` import here, so everything is unit-testable.
 */

export interface IdHit {
  name: string;
  span: Span;
}

export function tokenAt(doc: Document, offset: number): Token | null {
  for (const line of doc.lines) {
    if (offset < line.start || offset > line.fullEnd) continue;
    for (const t of line.tokens) if (offset >= t.start && offset <= t.end && t.kind !== 'ws' && t.kind !== 'newline') return t;
    return null;
  }
  return null;
}

/** The `@id` under the cursor. */
export function idAt(doc: Document, offset: number): IdHit | null {
  const t = tokenAt(doc, offset);
  return t?.kind === 'id' ? { name: t.text.slice(1), span: { start: t.start, end: t.end } } : null;
}

/** Ops that introduce an id: create ops, slides, slots, components, groups and containers. */
const DEFINING = new Set<string>([...CREATE_VERBS, 'slide', 'slot']);

function definedId(op: OpNode): IdHit | null {
  if (!DEFINING.has(op.verb)) return null;
  const first = op.args[0];
  if (!first || first.key !== undefined || first.value.k !== 'id') return null;
  return { name: first.value.name, span: first.span };
}

/** Top-level block (slide, layout, master, component) that contains an offset. */
export function blockAt(doc: Document, offset: number): OpNode | null {
  return doc.ops.find((op) => offset >= op.line.start && offset <= op.blockFullEnd) ?? null;
}

/**
 * Where `@name` is defined. Ids live per slide (and per layout/master/component), so the block
 * around `near` wins; a slide id is found anywhere.
 */
export function definitionsOf(doc: Document, name: string, near?: number): Span[] {
  const block = near === undefined ? null : blockAt(doc, near);
  const all = walkOps(doc.ops)
    .map((op) => ({ op, hit: definedId(op) }))
    .filter((x): x is { op: OpNode; hit: IdHit } => x.hit?.name === name);
  const local = block ? all.filter((x) => walkOps([block]).includes(x.op)) : [];
  return (local.length ? local : all).map((x) => x.hit.span);
}

/** Every `@name` token in the document. */
export function referencesOf(doc: Document, name: string): Span[] {
  const out: Span[] = [];
  for (const line of doc.lines) for (const t of line.tokens) if (t.kind === 'id' && t.text === `@${name}`) out.push({ start: t.start, end: t.end });
  return out;
}

export type SymbolKind = 'slide' | 'section' | 'object' | 'container' | 'layout' | 'master' | 'component' | 'style' | 'token' | 'color' | 'font' | 'deck';

export interface OutlineSymbol {
  name: string;
  detail: string;
  kind: SymbolKind;
  span: Span;
  selection: Span;
  children: OutlineSymbol[];
}

function str(op: OpNode, i = 0): string {
  const a = op.args.filter((x) => x.key === undefined)[i];
  if (!a) return '';
  const v = a.value;
  if (v.k === 'str') return v.value;
  if (v.k === 'name') return v.name;
  if (v.k === 'id') return `@${v.name}`;
  return '';
}

function keyText(op: OpNode, key: string): string {
  const a = op.args.find((x) => x.key === key);
  if (!a) return '';
  return a.value.k === 'name' ? a.value.name : '';
}

function symbolFor(op: OpNode): OutlineSymbol | null {
  const span = { start: op.line.start + op.indent, end: op.blockEnd };
  const id = definedId(op);
  const children = op.children.map(symbolFor).filter((s): s is OutlineSymbol => !!s);
  if (op.verb === 'slide') {
    const layout = keyText(op, 'layout');
    return { name: id ? `@${id.name}` : 'Folie', detail: layout ? `layout=${layout}` : '', kind: 'slide', span, selection: id?.span ?? op.verbSpan, children };
  }
  if (op.verb === 'section' && !op.parent) return { name: str(op) || 'Abschnitt', detail: 'Abschnitt', kind: 'section', span, selection: op.verbSpan, children: [] };
  if (op.verb === 'deck') return { name: str(op) || 'deck', detail: 'Präsentation', kind: 'deck', span, selection: op.verbSpan, children: [] };
  if (['layout', 'master', 'component', 'style', 'token', 'color', 'font'].includes(op.verb) && !op.parent) {
    return { name: str(op) || op.verb, detail: op.verb, kind: op.verb as SymbolKind, span, selection: op.args[0]?.span ?? op.verbSpan, children };
  }
  if (id) {
    const container = op.verb === 'row' || op.verb === 'column' || op.verb === 'group';
    return { name: `@${id.name}`, detail: op.verb, kind: container ? 'container' : 'object', span, selection: id.span, children };
  }
  return null;
}

/** Outline: slides with their objects (deck), or layouts, masters, components, styles and tokens (theme). */
export function outline(doc: Document): OutlineSymbol[] {
  return doc.ops.map(symbolFor).filter((s): s is OutlineSymbol => !!s);
}

export interface ColorHit {
  span: Span;
  rgba: [number, number, number, number];
}

export function parseHex(text: string): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (!m) return null;
  let h = m[1] as string;
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

export function toHex([r, g, b, a]: [number, number, number, number]): string {
  const h = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(a) : ''}`;
}

/** Hex colors in the file, for swatches and the color picker. */
export function colorsIn(doc: Document): ColorHit[] {
  const out: ColorHit[] = [];
  for (const line of doc.lines) {
    for (const t of line.tokens) {
      if (t.kind !== 'color') continue;
      const rgba = parseHex(t.text);
      if (rgba) out.push({ span: { start: t.start, end: t.end }, rgba });
    }
  }
  return out;
}

const r = (v: number): string => String(Math.round(v * 10) / 10);

/** Markdown hover for an object: kind, computed box and where the position comes from. */
export function hoverText(node: SceneNode, slideId: string): string {
  const b = node.box;
  const lines = [`**@${node.id}** · ${node.kind}${node.layout ? ` (${node.layout})` : ''} auf Folie @${slideId}`, '', `x ${r(b.x)} · y ${r(b.y)} · w ${r(b.w)} · h ${r(b.h)}`];
  const prov = node.prov.x;
  if (prov?.layout) lines.push('', `Position kommt aus dem Container (${prov.layout === 'parent' ? 'Eltern-Layout' : 'eigenes Layout'})`);
  else if (prov?.semantic) lines.push('', `Position berechnet von \`${prov.op.verb}\` (Zeile ${prov.op.line + 1})`);
  else if (node.from !== 'slide') lines.push('', `Stammt aus ${node.from === 'layout' ? 'dem Layout' : node.from === 'master' ? 'dem Master' : node.from === 'component' ? 'einer Komponente' : 'dem Theme'}`);
  return lines.join('\n');
}

/** First op of a file decides its role: `theme` heads a theme, everything else is a deck. */
export function isThemeSource(source: string): boolean {
  const first = source.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
  return !!first && /^theme\s+"/.test(first.trim());
}
