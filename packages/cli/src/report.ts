import type { Diagnostic } from '@forme/core';

export interface Style {
  red: (s: string) => string;
  yellow: (s: string) => string;
  blue: (s: string) => string;
  green: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

const wrap =
  (open: number, close: number) =>
  (s: string): string =>
    `\x1b[${open}m${s}\x1b[${close}m`;

export const COLORS: Style = { red: wrap(31, 39), yellow: wrap(33, 39), blue: wrap(34, 39), green: wrap(32, 39), dim: wrap(2, 22), bold: wrap(1, 22) };
const id = (s: string): string => s;
export const PLAIN: Style = { red: id, yellow: id, blue: id, green: id, dim: id, bold: id };

export function lineCol(src: string, offset: number): { line: number; col: number } {
  const before = src.slice(0, Math.max(0, Math.min(offset, src.length)));
  const line = before.split('\n').length;
  return { line, col: offset - before.lastIndexOf('\n') };
}

/**
 * One diagnostic with a code frame, like compilers do:
 *
 *   Fehler: Unbekannte Referenz @foo
 *     ┌─ deck.forme:4:12
 *   4 │   rect @a like=@foo
 *     │                ^^^^
 */
export function formatDiagnostic(d: Diagnostic, file: string, src: string, style: Style = PLAIN): string {
  const { line, col } = lineCol(src, d.span.start);
  const label = d.severity === 'error' ? style.red(style.bold('Fehler')) : d.severity === 'warning' ? style.yellow(style.bold('Warnung')) : style.blue(style.bold('Hinweis'));
  const text = src.split('\n')[line - 1] ?? '';
  const width = Math.max(1, Math.min(d.span.end, d.span.start + text.length - col + 1) - d.span.start);
  const gutter = String(line);
  const pad = ' '.repeat(gutter.length);
  const caret = (d.severity === 'error' ? style.red : style.yellow)('^'.repeat(width));
  return [
    `${label}: ${style.bold(d.message)}`,
    `${pad} ${style.blue('┌─')} ${file}:${line}:${col}`,
    `${style.blue(`${gutter} │`)} ${text}`,
    `${pad} ${style.blue('│')} ${' '.repeat(col - 1)}${caret}`,
  ].join('\n');
}

/** Machine-readable form (`forme check --json`), positions are 1-based. */
export function diagnosticJson(d: Diagnostic, file: string, src: string): Record<string, unknown> {
  const start = lineCol(src, d.span.start);
  const end = lineCol(src, d.span.end);
  return { file, severity: d.severity, message: d.message, line: start.line, column: start.col, endLine: end.line, endColumn: end.col };
}
