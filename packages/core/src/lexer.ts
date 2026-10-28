export type TokenKind =
  | 'ws'
  | 'newline'
  | 'comment'
  | 'ident'
  | 'id'
  | 'token'
  | 'number'
  | 'dim'
  | 'string'
  | 'color'
  | 'punct'
  | 'error';

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

const PUNCT = new Set(['=', '(', ')', ',', '.', '+', '-', '*', '/', ':', '{', '}']);

export function isIdentStart(c: string): boolean {
  return /[A-Za-z_À-ɏ]/.test(c);
}

export function isIdentChar(c: string): boolean {
  return /[A-Za-z0-9_À-ɏ]/.test(c);
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

function isHex(c: string | undefined): boolean {
  return c !== undefined && /[0-9a-fA-F]/.test(c);
}

/**
 * Lossless lexer: the concatenation of all token texts equals the input slice.
 * Unknown characters become 'error' tokens instead of being dropped.
 */
export function lex(src: string, from = 0, to = src.length): Token[] {
  const tokens: Token[] = [];
  let i = from;
  const push = (kind: TokenKind, end: number): void => {
    tokens.push({ kind, text: src.slice(i, end), start: i, end });
    i = end;
  };
  while (i < to) {
    const c = src[i] as string;
    if (c === '\n') {
      push('newline', i + 1);
      continue;
    }
    if (c === '\r') {
      push('newline', src[i + 1] === '\n' && i + 1 < to ? i + 2 : i + 1);
      continue;
    }
    if (c === ' ' || c === '\t') {
      let j = i + 1;
      while (j < to && (src[j] === ' ' || src[j] === '\t')) j++;
      push('ws', j);
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let j = i + 2;
      while (j < to && src[j] !== '\n' && src[j] !== '\r') j++;
      push('comment', j);
      continue;
    }
    if (c === '"' && src.startsWith('"""', i)) {
      // raw multi-line string: everything up to the next """
      const close = src.indexOf('"""', i + 3);
      push('string', close >= 0 && close + 3 <= to ? close + 3 : to);
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < to && src[j] !== '"' && src[j] !== '\n' && src[j] !== '\r') {
        if (src[j] === '\\' && j + 1 < to && src[j + 1] !== '\n') j += 2;
        else j++;
      }
      if (j < to && src[j] === '"') j++;
      push('string', Math.min(j, to));
      continue;
    }
    if (c === '#') {
      let j = i + 1;
      while (j < to && isHex(src[j])) j++;
      const n = j - i - 1;
      if ((n === 3 || n === 4 || n === 6 || n === 8) && !(j < to && isIdentChar(src[j] as string))) {
        push('color', j);
      } else {
        while (j < to && isIdentChar(src[j] as string)) j++;
        push('error', Math.max(j, i + 1));
      }
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i;
      while (j < to && isDigit(src[j])) j++;
      // size literal like 1920x1080
      if (j > i && src[j] === 'x' && isDigit(src[j + 1]) && c !== '.') {
        let k = j + 1;
        while (k < to && isDigit(src[k])) k++;
        push('dim', k);
        continue;
      }
      if (src[j] === '.' && isDigit(src[j + 1])) {
        j++;
        while (j < to && isDigit(src[j])) j++;
      }
      if (src[j] === '%') j++;
      else if (src[j] === 'p' && src[j + 1] === 'x' && !(j + 2 < to && isIdentChar(src[j + 2] as string))) j += 2;
      push('number', j);
      continue;
    }
    if (c === '@' || c === '$') {
      let j = i + 1;
      if (j < to && isIdentStart(src[j] as string)) {
        while (j < to && isIdentChar(src[j] as string)) j++;
        if (c === '$') {
          // tokens may be dotted: $space.l
          while (j < to && src[j] === '.' && j + 1 < to && isIdentChar(src[j + 1] as string)) {
            j++;
            while (j < to && isIdentChar(src[j] as string)) j++;
          }
        }
        push(c === '@' ? 'id' : 'token', j);
      } else {
        push('error', i + 1);
      }
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < to && isIdentChar(src[j] as string)) j++;
      push('ident', j);
      continue;
    }
    if (PUNCT.has(c)) {
      push('punct', i + 1);
      continue;
    }
    // keep surrogate pairs together
    const cp = src.codePointAt(i) ?? 0;
    push('error', i + (cp > 0xffff ? 2 : 1));
  }
  return tokens;
}

export function isTrivia(t: Token): boolean {
  return t.kind === 'ws' || t.kind === 'newline' || t.kind === 'comment';
}

/** `"""…"""`: raw string that may span several lines. */
export function isRawString(text: string): boolean {
  return text.startsWith('"""');
}

/** A string token without its closing quotes. */
export function isUnterminated(text: string): boolean {
  if (isRawString(text)) return text.length < 6 || !text.endsWith('"""');
  if (text.length < 2 || !text.endsWith('"')) return true;
  let bs = 0;
  for (let i = text.length - 2; i > 0 && text[i] === '\\'; i--) bs++;
  return bs % 2 === 1;
}

/**
 * Content of a raw string: a line break right after the opening quotes and the whitespace-only
 * line before the closing quotes are dropped, the common indentation of all lines is removed.
 */
export function rawStringValue(text: string): string {
  let body = text.slice(3, text.length >= 6 && text.endsWith('"""') ? -3 : undefined).replace(/\r\n?/g, '\n');
  if (/^[ \t]*\n/.test(body)) body = body.slice(body.indexOf('\n') + 1);
  body = body.replace(/\n[ \t]*$/, '');
  const lines = body.split('\n');
  const lead = (l: string): number => (/^[ \t]*/.exec(l) as RegExpExecArray)[0].length;
  let common = Infinity;
  for (const l of lines) if (l.trim()) common = Math.min(common, lead(l));
  if (!Number.isFinite(common) || common === 0) return body;
  return lines.map((l) => l.slice(Math.min(common, lead(l)))).join('\n');
}

/** Decode the body of a string token (without quotes). */
export function unescapeString(text: string): string {
  if (isRawString(text)) return rawStringValue(text);
  const body = text.endsWith('"') && text.length >= 2 ? text.slice(1, -1) : text.slice(1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch === '\\' && i + 1 < body.length) {
      const n = body[++i] as string;
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
    } else out += ch;
  }
  return out;
}

export function escapeString(value: string): string {
  return (
    '"' +
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') +
    '"'
  );
}
