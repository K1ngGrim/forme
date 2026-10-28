import type { Diagnostic, Span } from './diagnostics.js';
import { diag } from './diagnostics.js';
import type { Expr } from './expr.js';
import { parseExprTokens } from './expr.js';
import type { Token } from './lexer.js';
import { lex } from './lexer.js';

/**
 * One line. Lines are physical lines, except that a raw string (`"""…"""`) spanning several
 * lines stays in the line where it starts: that line holds all tokens up to the newline after
 * the string, and every further physical line it covers is a continuation line without tokens.
 */
export interface Line {
  /** Index in `Document.lines` = physical line number (0-based). */
  index: number;
  start: number;
  /** End of the line content (before the newline). */
  end: number;
  /** End including the newline token, if any. */
  fullEnd: number;
  tokens: Token[];
  indent: number;
  /** null for blank, comment-only, closing-brace and continuation lines. */
  op: OpNode | null;
  /** The op whose block this line closes with `}`. */
  closes?: OpNode;
  /** For continuation lines: the line that holds the tokens. */
  of?: Line;
}

export interface Arg {
  /** Dotted key text (e.g. "radius.tl"), undefined for positional arguments. */
  key?: string;
  keySpan?: Span;
  value: Expr;
  span: Span;
}

export interface OpNode {
  verb: string;
  verbSpan: Span;
  args: Arg[];
  children: OpNode[];
  parent: OpNode | null;
  line: Line;
  /** Leading whitespace of the op line (formatting only, no meaning). */
  indent: number;
  /** Span of the op content: verb and arguments (indent, `{` and comment excluded). */
  span: Span;
  /** The `{` opening the block, null for ops without block. */
  open: Span | null;
  /** The `}` closing the block and its line (the op line for `{}`), null if missing. */
  close: { brace: Span; line: Line } | null;
  /** End offset of the whole block (closing line or last descendant line, newline excluded). */
  blockEnd: number;
  /** Offset after the newline of the last line in the block. */
  blockFullEnd: number;
}

export interface Document {
  source: string;
  lines: Line[];
  ops: OpNode[];
  diagnostics: Diagnostic[];
}

/** Verbs whose block holds further ops; used to recognise the old indentation syntax. */
const BLOCK_VERBS = new Set(['slide', 'master', 'layout', 'component', 'group', 'row', 'column', 'box', 'list', 'table']);

function splitLines(tokens: Token[]): Token[][] {
  const out: Token[][] = [];
  let cur: Token[] = [];
  for (const t of tokens) {
    cur.push(t);
    if (t.kind === 'newline') {
      out.push(cur);
      cur = [];
    }
  }
  out.push(cur);
  return out;
}

function isPunct(t: Token | undefined, text: string): boolean {
  return !!t && t.kind === 'punct' && t.text === text;
}

/** Only whitespace, a comment and the newline follow from index i on. */
function onlyTrivia(toks: Token[], i: number): boolean {
  for (; i < toks.length; i++) {
    const k = (toks[i] as Token).kind;
    if (k !== 'ws' && k !== 'comment' && k !== 'newline') return false;
  }
  return true;
}

function parseLineOp(line: Line, toks: Token[], diags: Diagnostic[]): OpNode | null {
  let i = 0;
  while (i < toks.length && toks[i]?.kind === 'ws') i++;
  const first = toks[i];
  if (!first || first.kind === 'newline' || first.kind === 'comment') return null;
  if (first.kind !== 'ident') {
    const msg = isPunct(first, '{') ? '„{“ gehört ans Ende der Zeile mit der Operation' : `Operation erwartet, gefunden „${first.text}“`;
    diags.push(diag('error', msg, { start: first.start, end: line.end }));
    return null;
  }
  const verb = first;
  i++;
  // group argument token runs: separated by whitespace at paren depth 0
  const runs: Token[][] = [];
  let run: Token[] = [];
  let depth = 0;
  let contentEnd = verb.end;
  let open: Span | null = null;
  let closeBrace: Span | null = null;
  for (; i < toks.length; i++) {
    const t = toks[i] as Token;
    if (t.kind === 'newline' || t.kind === 'comment') break;
    if (t.kind === 'ws' && depth === 0) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    if (depth === 0 && isPunct(t, '{')) {
      open = { start: t.start, end: t.end };
      let j = i + 1;
      while (toks[j]?.kind === 'ws') j++;
      if (isPunct(toks[j], '}')) {
        closeBrace = { start: (toks[j] as Token).start, end: (toks[j] as Token).end };
        j++;
      }
      if (!onlyTrivia(toks, j)) {
        const rest = toks[j] as Token;
        diags.push(diag('error', 'Nach „{“ endet die Zeile – jede Operation steht in einer eigenen Zeile', { start: rest.start, end: line.end }));
      }
      break;
    }
    if (t.kind === 'punct' && t.text === '(') depth++;
    if (t.kind === 'punct' && t.text === ')') depth = Math.max(0, depth - 1);
    run.push(t);
    contentEnd = t.end;
  }
  if (run.length) runs.push(run);
  if (depth > 0) {
    diags.push(diag('error', 'Klammer nicht geschlossen', { start: verb.start, end: contentEnd }));
  }
  const args: Arg[] = [];
  for (const r of runs) {
    const span = { start: (r[0] as Token).start, end: (r[r.length - 1] as Token).end };
    // keyed?  ident (. ident)* =
    let j = 0;
    let key: string | undefined;
    if (r[0]?.kind === 'ident') {
      j = 1;
      let k = (r[0] as Token).text;
      while (r[j]?.kind === 'punct' && r[j]?.text === '.' && r[j + 1]?.kind === 'ident') {
        k += '.' + (r[j + 1] as Token).text;
        j += 2;
      }
      if (r[j]?.kind === 'punct' && r[j]?.text === '=') key = k;
      else j = 0;
    }
    if (key !== undefined) {
      const keySpan = { start: (r[0] as Token).start, end: (r[j - 1] as Token).end };
      const valueToks = r.slice(j + 1);
      if (!valueToks.length) {
        diags.push(diag('error', `Wert für „${key}“ fehlt`, span));
        args.push({ key, keySpan, value: { k: 'error', span: { start: span.end, end: span.end } }, span });
        continue;
      }
      args.push({ key, keySpan, value: parseExprTokens(valueToks, diags), span });
    } else {
      args.push({ value: parseExprTokens(r, diags), span });
    }
  }
  return {
    verb: verb.text,
    verbSpan: { start: verb.start, end: verb.end },
    args,
    children: [],
    parent: null,
    line,
    indent: line.indent,
    span: { start: verb.start, end: contentEnd },
    open,
    close: closeBrace ? { brace: closeBrace, line } : null,
    blockEnd: line.end,
    blockFullEnd: line.fullEnd,
  };
}

function extend(op: OpNode, end: number, fullEnd: number): void {
  for (let p: OpNode | null = op; p; p = p.parent) {
    p.blockEnd = end;
    p.blockFullEnd = fullEnd;
  }
}

/** Continuation lines for the physical lines inside multi-line strings of a line. */
function continuationLines(line: Line, out: Line[]): void {
  // pairs: offset of a line break inside a string, offset after it
  const breaks: number[] = [];
  for (const t of line.tokens) {
    if (t.kind !== 'string') continue;
    const re = /\r\n?|\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t.text))) breaks.push(t.start + m.index, t.start + m.index + m[0].length);
  }
  for (let k = 0; k < breaks.length; k += 2) {
    const last = k + 2 >= breaks.length;
    out.push({
      index: out.length,
      start: breaks[k + 1] as number,
      end: last ? line.end : (breaks[k + 2] as number),
      fullEnd: last ? line.fullEnd : (breaks[k + 3] as number),
      tokens: [],
      indent: 0,
      op: null,
      of: line,
    });
  }
}

/** Parse a Forme source into a lossless concrete syntax tree. Never throws. */
export function parse(source: string): Document {
  const diagnostics: Diagnostic[] = [];
  const tokens = lex(source);
  const rawLines = splitLines(tokens);
  const lines: Line[] = [];
  const ops: OpNode[] = [];
  /** Ops whose block is open. */
  const stack: OpNode[] = [];
  /** Previous op line (for the hint on the old indentation syntax). */
  let prev: OpNode | null = null;
  let pos = 0;
  for (const toks of rawLines) {
    const start = toks[0]?.start ?? pos;
    const last = toks[toks.length - 1];
    const fullEnd = last ? last.end : start;
    const end = last && last.kind === 'newline' ? last.start : fullEnd;
    pos = fullEnd;
    let indent = 0;
    const lead = toks[0];
    if (lead && lead.kind === 'ws') for (const ch of lead.text) indent += ch === '\t' ? 2 : 1;
    const line: Line = { index: lines.length, start, end, fullEnd, tokens: toks, indent, op: null };
    lines.push(line);
    continuationLines(line, lines);
    const firstTok = toks.find((t) => t.kind !== 'ws');
    if (isPunct(firstTok, '}')) {
      const owner = stack.pop();
      const brace = { start: (firstTok as Token).start, end: (firstTok as Token).end };
      if (!owner) diagnostics.push(diag('error', '„}“ ohne zugehörige „{“', brace));
      else {
        owner.close = { brace, line };
        line.closes = owner;
        extend(owner, end, fullEnd);
      }
      const after = toks.indexOf(firstTok as Token) + 1;
      if (!onlyTrivia(toks, after)) {
        const rest = toks.slice(after).find((t) => t.kind !== 'ws') as Token;
        diagnostics.push(diag('error', 'Nach „}“ endet die Zeile – jede Operation steht in einer eigenen Zeile', { start: rest.start, end }));
      }
      prev = null;
      continue;
    }
    const op = parseLineOp(line, toks, diagnostics);
    if (!op) continue;
    line.op = op;
    if (prev && !prev.open && indent > prev.indent && BLOCK_VERBS.has(prev.verb)) {
      diagnostics.push(
        diag('error', `Blöcke stehen in { }: „{“ am Ende von „${prev.verb}“ fehlt (alte Einrückungs-Syntax? „forme migrate“ stellt Dateien um)`, {
          start: prev.span.start,
          end: prev.span.end,
        }),
      );
    }
    prev = op;
    const parent = stack[stack.length - 1] ?? null;
    if (parent) {
      op.parent = parent;
      parent.children.push(op);
      extend(parent, op.blockEnd, op.blockFullEnd);
    } else ops.push(op);
    if (op.open && !op.close) stack.push(op);
  }
  for (const op of stack) {
    diagnostics.push(diag('error', `„}“ fehlt: Block von „${op.verb}“ wird nicht geschlossen`, op.open as Span));
  }
  return { source, lines, ops, diagnostics };
}

/** All ops in document order (depth-first). */
export function walkOps(ops: OpNode[], out: OpNode[] = []): OpNode[] {
  for (const op of ops) {
    out.push(op);
    walkOps(op.children, out);
  }
  return out;
}

export function argByKey(op: OpNode, key: string): Arg | undefined {
  for (let i = op.args.length - 1; i >= 0; i--) {
    const a = op.args[i] as Arg;
    if (a.key === key) return a;
  }
  return undefined;
}

export function positional(op: OpNode): Arg[] {
  return op.args.filter((a) => a.key === undefined);
}

/** Ids referenced as plain positional `@id` arguments (op targets). */
export function targetIds(op: OpNode): string[] {
  const out: string[] = [];
  for (const a of op.args) if (a.key === undefined && a.value.k === 'id') out.push(a.value.name);
  return out;
}

export function opAt(doc: Document, offset: number): OpNode | null {
  let found: OpNode | null = null;
  for (const line of doc.lines) {
    if (offset >= line.start && offset <= line.end) {
      found = line.op;
      break;
    }
  }
  return found;
}

/** The top-level ancestor of an op. */
export function rootOf(op: OpNode): OpNode {
  let o = op;
  while (o.parent) o = o.parent;
  return o;
}
