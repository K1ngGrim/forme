/**
 * Messages between the editor (running in a VS Code webview) and the VS Code extension.
 * Paths are project-relative ("deck.forme", "themes/a.forme"); the extension resolves them
 * against the project root (the workspace folder of the deck). Types only, shared by both sides.
 */
import type { Span, TextEdit } from '@forme/core';

export type FsOp = 'readText' | 'readBytes' | 'writeText' | 'writeBytes' | 'list' | 'modified';

export type EditorToHost =
  | { type: 'ready' }
  | { type: 'request'; id: number; op: FsOp; path?: string; text?: string; data?: Uint8Array }
  /** Apply edits to a file. `hash` is the hash of the text the edits were computed for. */
  | { type: 'edit'; path: string; hash: string; edits: TextEdit[] }
  /** Canvas selection: highlight the ops in a visible text editor of that file. */
  | { type: 'select'; path: string; reveal: Span | null; spans: Span[] }
  | { type: 'export'; kind: 'pdf' | 'pptx' | 'odp' }
  | { type: 'openText' }
  | { type: 'save' };

export type HostToEditor =
  | { type: 'init'; deckPath: string; name: string; mode: 'deck' | 'theme' }
  | { type: 'response'; id: number; ok: true; value: unknown }
  | { type: 'response'; id: number; ok: false; error: string }
  /** A file's text changed outside the editor (typing in VS Code, undo there, other programs). */
  | { type: 'text'; path: string; text: string }
  /** The cursor moved in a VS Code text editor showing this file. */
  | { type: 'cursor'; path: string; offset: number }
  /** An image or font changed on disk. */
  | { type: 'asset'; path: string }
  /** Commands bound to VS Code keys while the Forme editor is active. */
  | { type: 'command'; command: 'undo' | 'redo' | 'commandLine' | 'themeMode' | 'present' | 'toggleCode' };

/** Short content hash, used to make sure edits apply to the text they were computed for. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(16)}`;
}

/** One edit that turns `before` into `after` (common prefix and suffix are kept). */
export function diffEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}
