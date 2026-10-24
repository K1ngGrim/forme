import type { Diagnostic, Span } from './diagnostics.js';
import { diag } from './diagnostics.js';
import type { Token } from './lexer.js';
import { lex, unescapeString } from './lexer.js';

export type Expr =
  | { k: 'num'; value: number; unit: '' | '%' | 'px'; span: Span }
  | { k: 'str'; raw: string; value: string; span: Span }
  | { k: 'color'; value: string; span: Span }
  | { k: 'dim'; w: number; h: number; span: Span }
  | { k: 'tok'; name: string; span: Span }
  | { k: 'id'; name: string; span: Span }
  | { k: 'name'; name: string; span: Span }
  | { k: 'member'; obj: Expr; prop: string; span: Span }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; l: Expr; r: Expr; span: Span }
  | { k: 'neg'; e: Expr; span: Span }
  | { k: 'call'; name: string; args: Expr[]; span: Span }
  | { k: 'paren'; e: Expr; span: Span }
  | { k: 'error'; span: Span };

/** Literal = a value that can be replaced verbatim by the edit engine. */
export function isLiteral(e: Expr): boolean {
  switch (e.k) {
    case 'num':
    case 'str':
    case 'color':
    case 'dim':
    case 'name':
      return e.k !== 'str' || !/\{[^}]*\}/.test(e.raw);
    case 'neg':
      return e.e.k === 'num';
    default:
      return false;
  }
}

class ExprParser {
  private pos = 0;
  constructor(
    private readonly toks: Token[],
    private readonly diags: Diagnostic[],
  ) {}

  private peek(): Token | undefined {
    while (this.pos < this.toks.length && this.toks[this.pos]?.kind === 'ws') this.pos++;
    return this.toks[this.pos];
  }

  private next(): Token | undefined {
    const t = this.peek();
    if (t) this.pos++;
    return t;
  }

  private isPunct(t: Token | undefined, p: string): boolean {
    return t !== undefined && t.kind === 'punct' && t.text === p;
  }

  parseAll(): Expr {
    const e = this.parseAdd();
    const rest = this.peek();
    if (rest) {
      const last = this.toks[this.toks.length - 1] as Token;
      this.diags.push(
        diag('error', `Unerwartetes Zeichen „${rest.text}“ im Ausdruck`, { start: rest.start, end: last.end }),
      );
      return { k: 'error', span: { start: e.span.start, end: last.end } };
    }
    return e;
  }

  private parseAdd(): Expr {
    let l = this.parseMul();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, '+') || this.isPunct(t, '-')) {
        this.next();
        const r = this.parseMul();
        l = { k: 'bin', op: t!.text as '+' | '-', l, r, span: { start: l.span.start, end: r.span.end } };
      } else return l;
    }
  }

  private parseMul(): Expr {
    let l = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, '*') || this.isPunct(t, '/')) {
        this.next();
        const r = this.parseUnary();
        l = { k: 'bin', op: t!.text as '*' | '/', l, r, span: { start: l.span.start, end: r.span.end } };
      } else return l;
    }
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (this.isPunct(t, '-')) {
      this.next();
      const e = this.parseUnary();
      return { k: 'neg', e, span: { start: t!.start, end: e.span.end } };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, '.')) {
        this.next();
        const p = this.next();
        if (!p || p.kind !== 'ident') {
          const s = p ?? t!;
          this.diags.push(diag('error', 'Eigenschaftsname nach „.“ erwartet', { start: t!.start, end: s.end }));
          return { k: 'error', span: { start: e.span.start, end: s.end } };
        }
        e = { k: 'member', obj: e, prop: p.text, span: { start: e.span.start, end: p.end } };
      } else return e;
    }
  }

  private parsePrimary(): Expr {
    const t = this.next();
    if (!t) {
      const last = this.toks[this.toks.length - 1];
      const at = last ? last.end : 0;
      this.diags.push(diag('error', 'Ausdruck erwartet', { start: at, end: at }));
      return { k: 'error', span: { start: at, end: at } };
    }
    const span = { start: t.start, end: t.end };
    switch (t.kind) {
      case 'number': {
        const m = /^([0-9.]+)(%|px)?$/.exec(t.text);
        const value = Number(m?.[1] ?? t.text);
        const unit = (m?.[2] ?? '') as '' | '%' | 'px';
        return { k: 'num', value, unit, span };
      }
      case 'dim': {
        const [w, h] = t.text.split('x').map(Number);
        return { k: 'dim', w: w ?? 0, h: h ?? 0, span };
      }
      case 'string':
        if (!t.text.endsWith('"') || t.text.length < 2) {
          this.diags.push(diag('error', 'Zeichenkette ohne schließendes Anführungszeichen', span));
        }
        return { k: 'str', raw: t.text, value: unescapeString(t.text), span };
      case 'color':
        return { k: 'color', value: t.text, span };
      case 'token':
        return { k: 'tok', name: t.text.slice(1), span };
      case 'id':
        return { k: 'id', name: t.text.slice(1), span };
      case 'ident': {
        const n = this.peek();
        if (this.isPunct(n, '(') && n!.start === t.end) {
          this.next();
          const args: Expr[] = [];
          if (!this.isPunct(this.peek(), ')')) {
            for (;;) {
              args.push(this.parseAdd());
              if (this.isPunct(this.peek(), ',')) this.next();
              else break;
            }
          }
          const close = this.next();
          if (!this.isPunct(close, ')')) {
            this.diags.push(diag('error', '„)“ erwartet', close ? { start: close.start, end: close.end } : span));
            return { k: 'error', span: { start: t.start, end: close?.end ?? t.end } };
          }
          return { k: 'call', name: t.text, args, span: { start: t.start, end: close!.end } };
        }
        return { k: 'name', name: t.text, span };
      }
      case 'punct':
        if (t.text === '(') {
          const e = this.parseAdd();
          const close = this.next();
          if (!this.isPunct(close, ')')) {
            this.diags.push(diag('error', '„)“ erwartet', close ? { start: close.start, end: close.end } : e.span));
            return { k: 'error', span: { start: t.start, end: close?.end ?? e.span.end } };
          }
          return { k: 'paren', e, span: { start: t.start, end: close!.end } };
        }
        break;
      default:
        break;
    }
    this.diags.push(diag('error', `Unerwartetes Zeichen „${t.text}“`, span));
    return { k: 'error', span };
  }
}

export function parseExprTokens(toks: Token[], diags: Diagnostic[]): Expr {
  return new ExprParser(toks, diags).parseAll();
}

/** Parse an expression from a source substring (used for string interpolation). */
export function parseExprAt(src: string, from: number, to: number, diags: Diagnostic[]): Expr {
  const toks = lex(src, from, to).filter((t) => t.kind !== 'newline');
  return parseExprTokens(toks, diags);
}

export interface InterpPart {
  text?: string;
  expr?: Expr;
}

/**
 * Split a string token (with quotes) located at `span` in `src` into literal text and
 * `{expr}` parts. Expression spans are absolute positions in `src`.
 */
export function parseInterpolation(src: string, span: Span, diags: Diagnostic[]): InterpPart[] {
  const raw = src.slice(span.start, span.end);
  const offset = span.start;
  const parts: InterpPart[] = [];
  const bodyEnd = raw.endsWith('"') && raw.length >= 2 ? raw.length - 1 : raw.length;
  let buf = '';
  let i = 1;
  while (i < bodyEnd) {
    const ch = raw[i] as string;
    if (ch === '\\' && i + 1 < bodyEnd) {
      const n = raw[i + 1] as string;
      buf += n === 'n' ? '\n' : n === 't' ? '\t' : n;
      i += 2;
      continue;
    }
    if (ch === '{') {
      const close = raw.indexOf('}', i + 1);
      if (close < 0 || close >= bodyEnd) {
        buf += ch;
        i++;
        continue;
      }
      if (buf) parts.push({ text: buf });
      buf = '';
      parts.push({ expr: parseExprAt(src, offset + i + 1, offset + close, diags) });
      i = close + 1;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf) parts.push({ text: buf });
  return parts;
}

export function exprText(src: string, e: Expr): string {
  return src.slice(e.span.start, e.span.end);
}
