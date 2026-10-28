import type { Token } from './lexer.js';
import { lex } from './lexer.js';

/** Highlight classes for Forme source, shared by the web editor, the docs and other tools. */
export type HighlightClass = 'verb' | 'id' | 'token' | 'number' | 'string' | 'color' | 'comment' | 'key' | 'punct' | 'error';

const CLASSES = new Set<string>(['verb', 'id', 'token', 'number', 'string', 'color', 'comment', 'key', 'punct', 'error']);

/** Classify the tokens of one line: verb, keys, values. Uses the real core lexer. */
export function classifyTokens(tokens: Token[]): [Token, HighlightClass][] {
  const out: [Token, HighlightClass][] = [];
  let seenVerb = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (t.kind === 'ws' || t.kind === 'newline') continue;
    if (t.kind === 'ident' && !seenVerb) {
      seenVerb = true;
      out.push([t, 'verb']);
      continue;
    }
    seenVerb = true;
    if (t.kind === 'ident') {
      // key = ident (.ident)* '='
      let j = i + 1;
      while (tokens[j]?.kind === 'punct' && tokens[j]?.text === '.' && tokens[j + 1]?.kind === 'ident') j += 2;
      if (tokens[j]?.kind === 'punct' && tokens[j]?.text === '=' && (i === 0 || tokens[i - 1]?.kind === 'ws')) {
        for (let k = i; k < j; k++) out.push([tokens[k] as Token, 'key']);
        i = j - 1;
        continue;
      }
      continue;
    }
    if (t.kind === 'dim') out.push([t, 'number']);
    else if (CLASSES.has(t.kind)) out.push([t, t.kind as HighlightClass]);
  }
  return out;
}

/** Split a source text into highlighted segments (class null = plain text). Covers the whole text. */
export function highlightSource(src: string): { text: string; cls: HighlightClass | null }[] {
  const tokens = lex(src);
  const marks = new Map<Token, HighlightClass>(classifySource(tokens));
  return tokens.map((t) => ({ text: t.text, cls: marks.get(t) ?? null }));
}

/** Classify all tokens of a source, line by line (a multi-line string belongs to the line it starts in). */
export function classifySource(tokens: Token[]): [Token, HighlightClass][] {
  const out: [Token, HighlightClass][] = [];
  let line: Token[] = [];
  for (const t of tokens) {
    if (t.kind === 'newline') {
      out.push(...classifyTokens(line));
      line = [];
    } else line.push(t);
  }
  out.push(...classifyTokens(line));
  return out;
}
