import { autocompletion } from '@codemirror/autocomplete';
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { lintGutter } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState as CMState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { classifyTokens, lex } from '@forme/core';
import type { Token } from '@forme/core';
import { completeLine } from '@forme/core';
import { actions, displaySlide, useEditor } from '../store.js';

class SwatchWidget extends WidgetType {
  constructor(readonly color: string) {
    super();
  }
  override eq(other: SwatchWidget): boolean {
    return other.color === this.color;
  }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-forme-swatch';
    el.style.background = this.color;
    return el;
  }
}

const mark = (cls: string): Decoration => Decoration.mark({ class: cls });
const MARKS: Record<string, Decoration> = {
  verb: mark('cm-forme-verb'),
  id: mark('cm-forme-id'),
  token: mark('cm-forme-token'),
  number: mark('cm-forme-number'),
  string: mark('cm-forme-string'),
  color: mark('cm-forme-color'),
  comment: mark('cm-forme-comment'),
  key: mark('cm-forme-key'),
  punct: mark('cm-forme-punct'),
  error: mark('cm-forme-error'),
  interp: mark('cm-forme-interp'),
};

function buildHighlights(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const toks = lex(line.text);
      for (const [t, kind] of classifyTokens(toks)) {
        const start = line.from + t.start;
        const end = line.from + t.end;
        if (kind === 'color') b.add(start, start, Decoration.widget({ widget: new SwatchWidget(t.text), side: -1 }));
        if (kind === 'string' && t.text.includes('{')) {
          // highlight {interpolations} inside strings
          let last = start;
          const re = /\{[^}]*\}/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(t.text))) {
            const s = start + m.index;
            if (s > last) b.add(last, s, MARKS.string as Decoration);
            b.add(s, s + m[0].length, MARKS.interp as Decoration);
            last = s + m[0].length;
          }
          if (last < end) b.add(last, end, MARKS.string as Decoration);
          continue;
        }
        b.add(start, end, MARKS[kind] as Decoration);
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildHighlights(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = buildHighlights(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

export interface LineMarks {
  selected: number[];
  overrides: number[];
  stale: number[];
}

export const setLineMarks = StateEffect.define<LineMarks>();

const selectedLine = Decoration.line({ class: 'cm-forme-selected' });
const overrideLine = Decoration.line({ class: 'cm-forme-override', attributes: { title: 'Überschreibung eines Master-/Layout-Objekts' } });
const staleLine = Decoration.line({ class: 'cm-forme-stale' });

export const lineMarks = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setLineMarks)) continue;
      const doc = tr.state.doc;
      const all: [number, Decoration][] = [];
      const add = (lines: number[], d: Decoration): void => {
        for (const l of lines) if (l >= 0 && l < doc.lines) all.push([doc.line(l + 1).from, d]);
      };
      add(e.value.stale, staleLine);
      add(e.value.overrides, overrideLine);
      add(e.value.selected, selectedLine);
      all.sort((a, b) => a[0] - b[0]);
      const b = new RangeSetBuilder<Decoration>();
      for (const [pos, d] of all) b.add(pos, pos, d);
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function completionSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const s = useEditor.getState();
  const res = completeLine(line.text, ctx.pos - line.from, s.scene, displaySlide(s)?.slide ?? null);
  if (!res) return null;
  if (res.from === ctx.pos - line.from && !ctx.explicit && !/[@$=]$/.test(line.text.slice(0, ctx.pos - line.from))) {
    // nothing typed yet: only show on explicit request (Ctrl+Space) or after @ $ =
    if (!/^\s*$/.test(line.text.slice(0, ctx.pos - line.from))) return null;
  }
  return {
    from: line.from + res.from,
    options: res.items.map((i) => ({ label: i.label, type: i.type, ...(i.detail ? { detail: i.detail } : {}), ...(i.apply ? { apply: i.apply } : {}) })),
    validFor: /^[@$]?[\w.À-ɏ]*=?$/,
  };
}

/** All extensions of the Forme code view. CodeMirror's own history is deliberately not used. */
export function formeExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    lintGutter(),
    search(),
    highlightSelectionMatches(),
    highlighter,
    lineMarks,
    indentUnit.of('  '),
    CMState.tabSize.of(2),
    autocompletion({ override: [completionSource], icons: false }),
    keymap.of([
      { key: 'Mod-z', run: () => (actions.undo(), true), preventDefault: true },
      { key: 'Mod-Shift-z', run: () => (actions.redo(), true), preventDefault: true },
      { key: 'Mod-y', run: () => (actions.redo(), true), preventDefault: true },
      { key: 'Mod-s', run: () => (void actions.save(), true), preventDefault: true },
      ...searchKeymap,
      ...defaultKeymap,
      indentWithTab,
    ]),
    EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { fontFamily: 'var(--mono)' } }),
  ];
}
