import type { FontSpec, TextMeasurer } from './metrics.js';
import type { LayoutLine, TextLayout, TextRun } from './scene.js';

/**
 * Minimal rich-text markup inside strings:
 *   **bold**   *italic*   [label](https://link)   [label](#FF0000)  (colored run)
 * A backslash escapes the next markup character: \*  \[
 */
export function parseRich(src: string): TextRun[] {
  const runs: TextRun[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = (extra?: Partial<TextRun>): void => {
    if (!buf) return;
    runs.push({ text: buf, bold, italic, ...extra });
    buf = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (ch === '\\' && i + 1 < src.length && '*[]_\\'.includes(src[i + 1] as string)) {
      buf += src[++i];
      continue;
    }
    if (ch === '*' && src[i + 1] === '*') {
      flush();
      bold = !bold;
      i++;
      continue;
    }
    if (ch === '*') {
      flush();
      italic = !italic;
      continue;
    }
    if (ch === '[') {
      const close = src.indexOf('](', i + 1);
      const end = close >= 0 ? src.indexOf(')', close + 2) : -1;
      if (close >= 0 && end >= 0) {
        flush();
        const label = src.slice(i + 1, close);
        const target = src.slice(close + 2, end);
        const inner = parseRich(label).map((r) => ({
          ...r,
          bold: r.bold || bold,
          italic: r.italic || italic,
          ...(target.startsWith('#') || target.startsWith('rgb') ? { color: target } : { href: target }),
        }));
        runs.push(...inner);
        i = end;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return runs;
}

/** Plain text without markup. */
export function plainText(src: string): string {
  return parseRich(src)
    .map((r) => r.text)
    .join('');
}

export interface ParagraphSpec {
  runs: TextRun[];
  indent: number;
  bullet?: string;
  bulletIndent?: number;
}

export interface LayoutOptions {
  font: FontSpec;
  /** Max line width; undefined = no wrapping. */
  maxWidth?: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  paragraphGap?: number;
  /** Keep spaces at the start of lines (code). */
  preserveSpaces?: boolean;
}

interface Piece {
  run: TextRun;
  text: string;
  width: number;
  space: boolean;
}

function fontFor(run: TextRun, base: FontSpec): FontSpec {
  return {
    ...base,
    weight: run.bold ? Math.max(700, base.weight) : base.weight,
    italic: run.italic || base.italic,
  };
}

function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && last.color === r.color && last.href === r.href) {
      last.text += r.text;
    } else out.push({ ...r });
  }
  return out;
}

/** Lay out paragraphs into lines with greedy word wrapping. */
export function layoutParagraphs(paras: ParagraphSpec[], opts: LayoutOptions, m: TextMeasurer): TextLayout {
  const { font, lineHeight } = opts;
  const lh = font.size * lineHeight;
  const ascent = m.ascent(font) * font.size;
  const lines: LayoutLine[] = [];
  let y = 0;
  let maxW = 0;
  paras.forEach((para, pi) => {
    if (pi > 0 && opts.paragraphGap) y += opts.paragraphGap;
    // split runs into words and spaces, honoring hard line breaks
    const hardLines: Piece[][] = [[]];
    for (const run of para.runs) {
      const parts = run.text.split('\n');
      parts.forEach((part, idx) => {
        if (idx > 0) hardLines.push([]);
        const cur = hardLines[hardLines.length - 1] as Piece[];
        for (const tok of part.split(/( +)/)) {
          if (!tok) continue;
          const space = /^ +$/.test(tok);
          cur.push({ run, text: tok, width: m.width(tok, fontFor(run, font)), space });
        }
      });
    }
    const avail = opts.maxWidth !== undefined ? Math.max(1, opts.maxWidth - para.indent) : Infinity;
    let firstLineOfPara = true;
    for (const pieces of hardLines) {
      let cur: Piece[] = [];
      let curW = 0;
      const emit = (): void => {
        while (cur.length && cur[cur.length - 1]?.space) {
          curW -= (cur.pop() as Piece).width;
        }
        const runs = mergeRuns(cur.map((p) => ({ ...p.run, text: p.text })));
        const line: LayoutLine = { runs, width: curW, baseline: y + (lh - font.size) / 2 + ascent, x: para.indent };
        if (firstLineOfPara && para.bullet !== undefined) {
          line.bullet = para.bullet;
          line.bulletX = para.bulletIndent ?? 0;
        }
        firstLineOfPara = false;
        lines.push(line);
        maxW = Math.max(maxW, curW + para.indent);
        y += lh;
        cur = [];
        curW = 0;
      };
      for (const p of pieces) {
        if (p.space && cur.length === 0 && !opts.preserveSpaces) continue;
        if (!p.space && curW + p.width > avail + 0.01 && cur.some((c) => !c.space)) {
          emit();
        }
        // break overlong words by characters
        if (!p.space && p.width > avail && cur.length === 0) {
          let chunk = '';
          for (const ch of p.text) {
            const w = m.width(chunk + ch, fontFor(p.run, font));
            if (w > avail && chunk) {
              cur.push({ ...p, text: chunk, width: m.width(chunk, fontFor(p.run, font)) });
              curW = cur[0]?.width ?? 0;
              emit();
              chunk = ch;
            } else chunk += ch;
          }
          if (chunk) {
            const w = m.width(chunk, fontFor(p.run, font));
            cur.push({ ...p, text: chunk, width: w });
            curW += w;
          }
          continue;
        }
        cur.push(p);
        curW += p.width;
      }
      emit();
    }
  });
  const width = opts.maxWidth !== undefined ? opts.maxWidth : maxW;
  for (const line of lines) {
    const free = width - line.x - line.width;
    if (opts.align === 'center') line.x += free / 2;
    else if (opts.align === 'right') line.x += free;
  }
  return { lines, width, height: y };
}
