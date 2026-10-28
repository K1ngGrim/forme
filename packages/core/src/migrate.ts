import type { TextEdit } from './edit.js';
import { applyEdits } from './edit.js';
import type { Document, OpNode } from './parser.js';
import { parse } from './parser.js';

/**
 * Conversion from the old indentation syntax (blocks by indentation) to blocks in braces.
 * Only braces are inserted; comments, blank lines and formatting stay as they are.
 */

/** True when the source uses the old syntax: indented ops below an op, and no braces at all. */
export function needsMigration(src: string | Document): boolean {
  const doc = typeof src === 'string' ? parse(src) : src;
  if (doc.lines.some((l) => l.op?.open || l.closes)) return false;
  return blocksByIndent(doc).some((b) => b.children > 0);
}

interface Block {
  op: OpNode;
  depth: number;
  children: number;
  /** Last op line of the block. */
  last: OpNode;
}

function blocksByIndent(doc: Document): Block[] {
  const out: Block[] = [];
  const stack: Block[] = [];
  for (const line of doc.lines) {
    const op = line.op;
    if (!op) continue;
    while (stack.length && (stack[stack.length - 1] as Block).op.indent >= op.indent) stack.pop();
    for (const b of stack) b.last = op;
    const parent = stack[stack.length - 1];
    if (parent) parent.children++;
    const block: Block = { op, depth: stack.length, children: 0, last: op };
    out.push(block);
    stack.push(block);
  }
  return out;
}

/** Text edits that turn an old-syntax source into the brace syntax ([] if nothing to do). */
export function migrationEdits(src: string): TextEdit[] {
  const doc = parse(src);
  if (!needsMigration(doc)) return [];
  const nl = src.includes('\r\n') ? '\r\n' : '\n';
  const edits: (TextEdit & { order: number })[] = [];
  for (const b of blocksByIndent(doc)) {
    if (!b.children) continue;
    edits.push({ from: b.op.span.end, to: b.op.span.end, insert: ' {', order: 0 });
    const at = b.last.line.end;
    // inner blocks close first
    edits.push({ from: at, to: at, insert: `${nl}${' '.repeat(b.op.indent)}}`, order: 1000 - b.depth });
  }
  edits.sort((a, b) => a.from - b.from || a.order - b.order);
  return edits.map(({ from, to, insert }) => ({ from, to, insert }));
}

/** The source in brace syntax (unchanged if it already is). */
export function migrate(src: string): string {
  const edits = migrationEdits(src);
  return edits.length ? applyEdits(src, edits).text : src;
}
