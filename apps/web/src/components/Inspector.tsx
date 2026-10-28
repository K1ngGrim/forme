import type { Prov, SceneNode, WriteValue } from '@forme/core';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { actions, displaySlide, useEditor } from '../store.js';

interface Field {
  key: string;
  label: string;
  type: 'number' | 'color' | 'text';
}

const GEOMETRY: Field[] = [
  { key: 'x', label: 'X', type: 'number' },
  { key: 'y', label: 'Y', type: 'number' },
  { key: 'w', label: 'B', type: 'number' },
  { key: 'h', label: 'H', type: 'number' },
];

function fieldsFor(n: SceneNode): Field[] {
  const f: Field[] = [];
  if (n.kind === 'line' || n.kind === 'arrow') {
    f.push({ key: 'x', label: 'X1', type: 'number' }, { key: 'y', label: 'Y1', type: 'number' }, { key: 'x2', label: 'X2', type: 'number' }, { key: 'y2', label: 'Y2', type: 'number' });
    f.push({ key: 'stroke', label: 'Linie', type: 'color' }, { key: 'stroke.width', label: 'Stärke', type: 'number' });
    return f;
  }
  if (n.kind === 'group') return [GEOMETRY[0] as Field, GEOMETRY[1] as Field, { key: 'opacity', label: 'Deckkraft', type: 'number' }];
  f.push(...GEOMETRY);
  if (n.kind === 'text' || n.kind === 'list' || n.kind === 'table') {
    f.push({ key: 'size', label: 'Größe', type: 'number' }, { key: 'color', label: 'Textfarbe', type: 'color' });
  }
  if (n.kind !== 'image' && n.kind !== 'table') f.push({ key: 'fill', label: 'Füllung', type: 'color' });
  f.push({ key: 'stroke', label: 'Kontur', type: 'color' }, { key: 'stroke.width', label: 'Stärke', type: 'number' });
  if (n.kind === 'rect' || n.kind === 'image' || n.kind === 'text' || n.kind === 'box') f.push({ key: 'radius.tl', label: 'Radius', type: 'number' });
  if (n.kind === 'box') f.push({ key: 'pad', label: 'Innenabstand', type: 'number' });
  f.push({ key: 'opacity', label: 'Deckkraft', type: 'number' });
  return f;
}

/** Short provenance label: where the value comes from. */
function provLabel(p: Prov | undefined, node: SceneNode, slideBlock: { start: number; end: number }): { tag: string; title: string; cls: string } {
  if (!p) return { tag: '·', title: 'Standardwert', cls: 'prov-default' };
  const inSlide = p.op.file === 'deck' && p.op.span.start > slideBlock.start && p.op.span.end <= slideBlock.end;
  if (p.op.verb === 'set' && inSlide && node.origin.file === 'theme') return { tag: 'Ü', title: `Überschreibung (Zeile ${p.op.line + 1})`, cls: 'prov-override' };
  if (p.semantic) return { tag: 'S', title: `berechnet von „${p.op.verb}“ (Zeile ${p.op.line + 1})`, cls: 'prov-semantic' };
  if (p.inherited) return { tag: 'V', title: `vererbt über ${p.key ?? p.op.verb} (${p.op.file === 'theme' ? 'Theme' : 'Deck'}, Zeile ${p.op.line + 1})`, cls: 'prov-inherited' };
  if (!inSlide) return { tag: 'T', title: `aus ${p.op.scope === 'master' ? 'Master' : p.op.scope === 'layout' ? 'Layout' : 'Theme'} (Zeile ${p.op.line + 1})`, cls: 'prov-theme' };
  if (!p.literal) return { tag: 'ƒ', title: `Ausdruck (Zeile ${p.op.line + 1})`, cls: 'prov-expr' };
  return { tag: 'L', title: `Literal (Zeile ${p.op.line + 1})`, cls: 'prov-literal' };
}

function parseInput(type: Field['type'], v: string): WriteValue | null {
  const t = v.trim();
  if (!t) return null;
  if (type === 'number') {
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : { raw: t.includes(' ') ? `(${t})` : t };
  }
  if (type === 'color') {
    if (t.startsWith('#') || t.startsWith('rgb') || t === 'none') return { color: t };
    if (t.startsWith('$')) return { raw: t };
    return null;
  }
  return t;
}

function display(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  if (typeof v === 'string') return v;
  return '';
}

function FieldRow(props: { field: Field; node: SceneNode; slideId: string; block: { start: number; end: number } }): JSX.Element {
  const { field, node } = props;
  const value = display(node.props[field.key]);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const prov = provLabel(node.prov[field.key], node, props.block);
  const commit = (): void => {
    if (text === value) return;
    const v = parseInput(field.type, text);
    if (v === null) {
      setText(value);
      return;
    }
    const key = field.key === 'radius.tl' ? 'radius' : field.key;
    void actions.intent({ type: 'setProps', slide: props.slideId, id: node.id, props: { [key]: v } });
  };
  return (
    <label className="insp-row">
      <span className="insp-label">{field.label}</span>
      {field.type === 'color' && <span className="insp-swatch" style={{ background: /^(#|rgb)/.test(value) ? value : 'transparent' }} />}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setText(value);
          e.stopPropagation();
        }}
        data-testid={`insp-${field.key}`}
      />
      <span className={`insp-prov ${prov.cls}`} title={prov.title}>
        {prov.tag}
      </span>
    </label>
  );
}

export function Inspector(): JSX.Element {
  const scene = useEditor((s) => s.scene);
  const selection = useEditor((s) => s.selection);
  useEditor((s) => s.slideId);
  const d = displaySlide();
  const node = d && selection.length === 1 ? d.slide.byId.get(selection[0] as string) : undefined;
  const [rename, setRename] = useState('');
  useEffect(() => setRename(node?.id ?? ''), [node?.id]);

  if (!d) return <div className="inspector" />;
  if (!node) {
    const s = d.slide;
    return (
      <div className="inspector" data-testid="inspector">
        <h3>Folie @{s.id}</h3>
        <div className="insp-info">
          <div>Layout: {s.layout ?? '–'}</div>
          <div>Master: {s.master ?? '–'}</div>
          {s.section && <div>Abschnitt: {s.section}</div>}
          <div>Objekte: {s.nodes.length}</div>
        </div>
        {selection.length > 1 && <div className="insp-info">{selection.length} Objekte ausgewählt</div>}
        <h4>Notizen</h4>
        <div className="insp-notes">{s.notes || <em>keine</em>}</div>
        <h4>Legende</h4>
        <div className="insp-legend">
          <span className="insp-prov prov-literal">L</span> Literal auf der Folie
          <br />
          <span className="insp-prov prov-expr">ƒ</span> Ausdruck
          <br />
          <span className="insp-prov prov-semantic">S</span> berechnet (align, distribute …)
          <br />
          <span className="insp-prov prov-theme">T</span> aus Master/Layout/Theme
          <br />
          <span className="insp-prov prov-inherited">V</span> vererbt (like=, style=)
          <br />
          <span className="insp-prov prov-override">Ü</span> Überschreibung
        </div>
        <div className="insp-hint">Größe der Folie: {scene.width}×{scene.height}</div>
      </div>
    );
  }
  const block = d.slide.op.blockSpan;
  const doRename = (): void => {
    const to = rename.replace(/^@/, '').trim();
    if (!to || to === node.id) return;
    void actions.intent({ type: 'rename', from: node.id, to });
  };
  return (
    <div className="inspector" data-testid="inspector">
      <h3>
        <span className="insp-kind">{node.component ? `Komponente ${node.component}` : node.slot ? 'Slot' : node.kind}</span>
      </h3>
      <label className="insp-row">
        <span className="insp-label">ID</span>
        <input
          value={rename}
          onChange={(e) => setRename(e.target.value)}
          onBlur={doRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
          disabled={node.origin.file === 'theme'}
          data-testid="insp-id"
        />
      </label>
      {fieldsFor(node).map((f) => (
        <FieldRow key={f.key} field={f} node={node} slideId={d.slide.id} block={block} />
      ))}
      <div className="insp-origin">
        Definiert in {node.origin.file === 'theme' ? `Theme (${node.origin.scope})` : 'Deck'}, Zeile {node.origin.line + 1}
      </div>
    </div>
  );
}
