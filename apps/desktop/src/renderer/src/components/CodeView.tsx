import { setDiagnostics } from '@codemirror/lint';
import type { Diagnostic as CMDiagnostic } from '@codemirror/lint';
import { Annotation, EditorSelection, EditorState as CMState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { formeExtensions, setLineMarks } from '../cm/forme.js';
import type { LineMarks } from '../cm/forme.js';
import { actions, activeFile, diagnosticsFor, displaySlide, useEditor } from '../store.js';
import type { EditorState } from '../store.js';

/** Marks changes that come from the store, so they are not echoed back. */
const remote = Annotation.define<boolean>();

function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

function computeMarks(s: EditorState): { marks: LineMarks; reveal: number | null } {
  const role = s.mode === 'theme' && s.theme ? 'theme' : 'deck';
  const display = displaySlide(s);
  const slide = s.scene.slides.find((x) => x.id === s.slideId);
  const selected = new Set<number>();
  let reveal: number | null = null;
  if (slide) {
    for (const id of s.selection) {
      const node = slide.byId.get(id);
      if (!node) continue;
      for (const ref of node.touchedBy) if (ref.file === role) selected.add(ref.line);
      if (node.origin.file === role && reveal === null) reveal = node.origin.line;
    }
  }
  const overrides = new Set<number>();
  if (role === 'deck') {
    for (const sl of s.scene.slides) {
      for (const node of sl.byId.values()) {
        if (node.from === 'slide') continue;
        for (const ref of node.touchedBy) if (ref.file === 'deck' && (ref.verb === 'set' || ref.verb === 'hide' || ref.verb === 'move')) overrides.add(ref.line);
      }
    }
  }
  const stale: number[] = [];
  if (role === 'deck' && display?.stale && slide) {
    const file = s.deck;
    for (const line of file.doc.lines) if (line.start >= slide.op.blockSpan.start && line.start <= slide.op.blockSpan.end) stale.push(line.index);
  }
  return { marks: { selected: [...selected], overrides: [...overrides], stale }, reveal };
}

function toCM(s: EditorState, len: number): CMDiagnostic[] {
  const role = s.mode === 'theme' && s.theme ? 'theme' : 'deck';
  return diagnosticsFor(role, s).map((d) => ({
    from: Math.min(d.span.start, len),
    to: Math.min(Math.max(d.span.end, d.span.start), len),
    severity: d.severity === 'info' ? 'info' : d.severity,
    message: d.message,
  }));
}

export function CodeView(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const s0 = useEditor.getState();
    const view = new EditorView({
      parent: host.current as HTMLDivElement,
      state: CMState.create({
        doc: activeFile(s0).source,
        extensions: [
          formeExtensions(),
          EditorView.updateListener.of((u) => {
            const isRemote = u.transactions.some((t) => t.annotation(remote));
            if (isRemote) return;
            const s = useEditor.getState();
            const role = s.mode === 'theme' && s.theme ? 'theme' : 'deck';
            if (u.docChanged) actions.codeChanged(role, u.state.doc.toString());
            if ((u.selectionSet || u.docChanged) && u.view.hasFocus) actions.cursorMoved(role, u.state.selection.main.head);
          }),
        ],
      }),
    });
    viewRef.current = view;

    let prev = s0;
    const sync = (s: EditorState, force: boolean): void => {
      const file = activeFile(s);
      const cur = view.state.doc.toString();
      const fileChanged = s.mode !== prev.mode;
      if (force || s.revision !== prev.revision || fileChanged) {
        const change = minimalChange(cur, file.source);
        if (change) {
          const head = Math.min(view.state.selection.main.head, file.source.length);
          view.dispatch({
            changes: change,
            annotations: remote.of(true),
            ...(fileChanged ? { selection: EditorSelection.cursor(0) } : { selection: EditorSelection.cursor(Math.min(mapHead(head, change), file.source.length)) }),
          });
        }
      }
      if (force || s.scene !== prev.scene || s.selection !== prev.selection || fileChanged || s.slideId !== prev.slideId) {
        const { marks, reveal } = computeMarks(s);
        const effects = [setLineMarks.of(marks)];
        view.dispatch({ effects, annotations: remote.of(true) });
        view.dispatch(setDiagnostics(view.state, toCM(s, view.state.doc.length)));
        const selChanged = s.selection !== prev.selection || s.slideId !== prev.slideId;
        if (selChanged && s.selectionOrigin === 'canvas' && !view.hasFocus) {
          let line = reveal;
          if (line === null && s.slideId !== prev.slideId && s.mode === 'deck') {
            const slide = s.scene.slides.find((x) => x.id === s.slideId);
            if (slide) line = slide.op.line;
          }
          if (line !== null && line < view.state.doc.lines) {
            const pos = view.state.doc.line(line + 1).from;
            view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }), annotations: remote.of(true) });
          }
        }
      }
      prev = s;
    };
    sync(s0, true);
    const unsub = useEditor.subscribe((s) => sync(s, false));
    return () => {
      unsub();
      view.destroy();
    };
  }, []);

  return <div className="code-view" ref={host} data-testid="code-view" />;
}

function mapHead(head: number, change: { from: number; to: number; insert: string }): number {
  if (head <= change.from) return head;
  if (head >= change.to) return head + change.insert.length - (change.to - change.from);
  return change.from + change.insert.length;
}
