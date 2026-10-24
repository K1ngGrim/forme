import type { Document } from './parser.js';
import { escapeString } from './lexer.js';

/** Lossless printer: reproduces the source byte for byte. */
export function print(doc: Document): string {
  let out = '';
  for (const line of doc.lines) for (const t of line.tokens) out += t.text;
  return out;
}

/** Format a number for writing back into a file: max 2 decimals, no trailing zeros. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  const s = String(Object.is(r, -0) ? 0 : r);
  return s;
}

export type WriteValue = number | string | { color: string } | { ident: string } | { raw: string };

export function formatValue(v: WriteValue): string {
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return escapeString(v);
  if ('color' in v) return v.color;
  if ('ident' in v) return v.ident;
  return v.raw;
}

/** Wrap a value in parentheses if it contains whitespace (language rule). */
export function wrapIfSpaced(text: string): string {
  if (text.startsWith('"')) return text;
  return /\s/.test(text) && !(text.startsWith('(') && text.endsWith(')')) ? `(${text})` : text;
}
