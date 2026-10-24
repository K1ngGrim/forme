import type { Diagnostic, Span } from './diagnostics.js';
import { diag } from './diagnostics.js';
import type { Expr } from './expr.js';
import { parseExprTokens } from './expr.js';
import type { Token } from './lexer.js';
import { lex } from './lexer.js';

/** One physical line. Its tokens include indentation, comment and the trailing newline. */
export interface Line {
  index: number;
  start: number;
  /** End of the line content (before the newline). */
  end: number;
  /** End including the newline token, if any. */
  fullEnd: number;
  tokens: Token[];
  indent: number;
  /** null for blank and comment-only lines. */
  op: OpNode | null;
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
  indent: number;
  /** Span of the op line content (indent excluded, comment excluded). */
  span: Span;
  /** End offset of the whole block (last descendant line, newline excluded). */
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

function parseLineOp(line: Line, toks: Token[], diags: Diagnostic[]): OpNode | null {
  let i = 0;
  while (i < toks.length && toks[i]?.kind === 'ws') i++;
  const first = toks[i];
  if (!first || first.kind === 'newline' || first.kind === 'comment') return null;
  if (first.kind !== 'ident') {
    diags.push(diag('error', `Operation erwartet, gefunden „${first.text}“`, { start: first.start, end: line.end }));
    return null;
  }
  const verb = first;
  i++;
  // group argument token runs: separated by whitespace at paren depth 0
  const runs: Token[][] = [];
  let run: Token[] = [];
  let depth = 0;
  let contentEnd = verb.end;
  for (; i < toks.length; i++) {
    const t = toks[i] as Token;
    if (t.kind === 'newline' || t.kind === 'comment') break;
    if (t.kind === 'ws' && depth === 0) {
      if (run.length) runs.push(run);
      run = [];
      continue;
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
    blockEnd: line.end,
    blockFullEnd: line.fullEnd,
  };
}

/** Parse a Forme source into a lossless concrete syntax tree. Never throws. */
export function parse(source: string): Document {
  const diagnostics: Diagnostic[] = [];
  const tokens = lex(source);
  const rawLines = splitLines(tokens);
  const lines: Line[] = [];
  const ops: OpNode[] = [];
  const stack: OpNode[] = [];
  let pos = 0;
  rawLines.forEach((toks, index) => {
    const start = toks[0]?.start ?? pos;
    const last = toks[toks.length - 1];
    const fullEnd = last ? last.end : start;
    const end = last && last.kind === 'newline' ? last.start : fullEnd;
    pos = fullEnd;
    let indent = 0;
    const lead = toks[0];
    if (lead && lead.kind === 'ws') {
      if (lead.text.includes('\t')) {
        diagnostics.push(diag('warning', 'Tabulator in Einrückung – bitte 2 Leerzeichen verwenden', lead));
      }
      for (const ch of lead.text) indent += ch === '\t' ? 2 : 1;
    }
    const line: Line = { index, start, end, fullEnd, tokens: toks, indent, op: null };
    lines.push(line);
    const op = parseLineOp(line, toks, diagnostics);
    if (!op) return;
    line.op = op;
    while (stack.length && (stack[stack.length - 1] as OpNode).indent >= indent) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    if (parent) {
      op.parent = parent;
      parent.children.push(op);
      for (let p: OpNode | null = parent; p; p = p.parent) {
        p.blockEnd = op.blockEnd;
        p.blockFullEnd = op.blockFullEnd;
      }
    } else {
      if (indent > 0) {
        diagnostics.push(diag('error', 'Unerwartete Einrückung', { start: line.start, end: op.span.end }));
      }
      ops.push(op);
    }
    if (indent % 2 !== 0) {
      diagnostics.push(diag('warning', 'Einrückung sollte ein Vielfaches von 2 Leerzeichen sein', { start: line.start, end: op.span.start }));
    }
    stack.push(op);
  });
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
