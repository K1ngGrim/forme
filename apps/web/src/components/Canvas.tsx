import { rawText } from '@forme/core';
import type { Box, SceneNode } from '@forme/core';
import { renderSlideSvg } from '@forme/render';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import type { Guides, Handle } from '../canvas/geometry.js';
import { cornerRadius, dropIndex, flowParent, HANDLES, hitTest, intersects, isLine, lineEnds, normBox, num, resizeBox, snapMove, snapValue, supportsRadius, union } from '../canvas/geometry.js';
import { actions, displaySlide, resolveAsset, useEditor } from '../store.js';

type Drag =
  | { kind: 'pending'; start: [number, number]; id: string; additive: boolean }
  | { kind: 'move'; start: [number, number]; ids: string[]; box: Box; others: Box[] }
  | { kind: 'resize'; start: [number, number]; id: string; handle: Handle; box: Box; others: Box[] }
  | { kind: 'radius'; id: string; box: Box }
  | { kind: 'end'; id: string; which: 1 | 2; start: [number, number] }
  | { kind: 'marquee'; start: [number, number]; additive: boolean; base: string[] }
  | { kind: 'create'; start: [number, number] };

interface Preview {
  dx?: number;
  dy?: number;
  box?: Box;
  radius?: number;
  end?: [number, number];
  marquee?: Box;
  create?: Box | [number, number, number, number];
  guides?: Guides;
}

interface Editing {
  id: string;
  value: string;
  box: Box;
  size: number;
  family: string;
  line: number;
  weight: number;
}

const SNAP_PX = 6;

export function Canvas(): JSX.Element {
  const scene = useEditor((s) => s.scene);
  const slideId = useEditor((s) => s.slideId);
  const lastGood = useEditor((s) => s.lastGood);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const zoomFit = useEditor((s) => s.zoomFit);
  const mode = useEditor((s) => s.mode);
  const assetVersion = useEditor((s) => s.assetVersion);
  const display = useMemo(() => displaySlide(useEditor.getState()), [scene, slideId, lastGood]);
  const slide = display?.slide ?? null;
  const stale = !!display?.stale;

  const wrapRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);
  const [fit, setFit] = useState(0.4);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const drag = useRef<Drag | null>(null);
  const pendingEdit = useRef<string | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;

  const W = scene.width;
  const H = scene.height;
  const scale = fit * zoom;

  // fit slide into the available area
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      setFit(Math.max(0.05, Math.min((r.width - 48) / W, (r.height - 48) / H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

  useEffect(() => setZoom(1), [zoomFit]);

  const svg = useMemo(
    () =>
      slide
        ? renderSlideSvg(scene, slide, {
            editor: true,
            embedFonts: true,
            resolveAsset: (p) => resolveAsset(p),
            idPrefix: 'ed-',
            ...(editing ? { skip: new Set([editing.id]) } : {}),
          })
        : '',
    [scene, slide, editing?.id, assetVersion],
  );

  const toSlide = useCallback(
    (e: { clientX: number; clientY: number }): [number, number] => {
      const r = (overlayRef.current as SVGSVGElement).getBoundingClientRect();
      return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale];
    },
    [scale],
  );

  const node = (id: string): SceneNode | undefined => slide?.byId.get(id);
  const selectedNodes = selection.map((id) => node(id)).filter((n): n is SceneNode => !!n);
  const otherBoxes = (ids: string[]): Box[] => (slide ? slide.nodes.filter((n) => !ids.includes(n.id) && n.props.hidden !== true).map((n) => n.box) : []);

  // live preview of a move: translate the rendered groups directly
  useEffect(() => {
    const root = slideRef.current;
    if (!root) return;
    const ids = drag.current?.kind === 'move' ? drag.current.ids : [];
    root.querySelectorAll<SVGGElement>('g[data-id]').forEach((g) => {
      const id = g.getAttribute('data-id') ?? '';
      if (ids.includes(id) && (preview.dx || preview.dy)) g.setAttribute('transform', `translate(${preview.dx ?? 0} ${preview.dy ?? 0})`);
      else g.removeAttribute('transform');
    });
  }, [preview, svg]);

  // start inline editing for freshly created text objects
  useEffect(() => {
    const id = pendingEdit.current;
    if (id && slide?.byId.has(id)) {
      pendingEdit.current = null;
      startEdit(slide.byId.get(id) as SceneNode);
    }
  });

  const startEdit = (n: SceneNode): void => {
    if (stale) return;
    if (n.kind !== 'text' && n.kind !== 'list') return;
    const s = useEditor.getState();
    const fontName = typeof n.props.font === 'string' ? n.props.font : '';
    const def = scene.theme.fonts.find((f) => f.name === fontName);
    setEditing({
      id: n.id,
      value: n.placeholder ? '' : rawText(s.deck.doc, s.theme?.doc ?? null, n),
      box: n.box,
      size: num(n.props.size, 32),
      family: def ? def.family : fontName || 'Inter',
      line: num(n.props.line, 1.25),
      weight: typeof n.props.weight === 'number' ? n.props.weight : (def?.weight ?? 400),
    });
    actions.select([n.id]);
  };

  const commitEdit = async (value: string | null): Promise<void> => {
    // blur and Escape/Enter can both fire: only the first commit counts
    const ed = editingRef.current;
    editingRef.current = null;
    setEditing(null);
    if (!ed || value === null || !slide) return;
    const n = slide.byId.get(ed.id);
    const s = useEditor.getState();
    if (n && value === rawText(s.deck.doc, s.theme?.doc ?? null, n) && !n.placeholder) return;
    if (n?.placeholder && !value.trim()) return;
    await actions.intent({ type: 'text', slide: slide.id, id: ed.id, text: value });
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!slide || e.button !== 0) return;
    if (editing) {
      void commitEdit(editing.value);
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    overlayRef.current?.setPointerCapture(e.pointerId);
    const p = toSlide(e);
    const t = e.target as Element;
    if (stale) {
      const hit = hitTest(slide, p[0], p[1], 4 / scale);
      actions.select(hit ? [hit.id] : []);
      return;
    }
    const handle = t.getAttribute('data-handle') as Handle | null;
    const sel = selectedNodes[0];
    if (handle && sel) {
      drag.current = { kind: 'resize', start: p, id: sel.id, handle, box: sel.box, others: otherBoxes([sel.id]) };
      return;
    }
    if (t.hasAttribute('data-radius') && sel) {
      drag.current = { kind: 'radius', id: sel.id, box: sel.box };
      return;
    }
    const end = t.getAttribute('data-end');
    if (end && sel) {
      drag.current = { kind: 'end', id: sel.id, which: end === '1' ? 1 : 2, start: p };
      return;
    }
    if (tool === 'image') {
      void createImage(p);
      return;
    }
    if (tool !== 'select') {
      drag.current = { kind: 'create', start: p };
      return;
    }
    const hit = hitTest(slide, p[0], p[1], 4 / scale);
    if (hit) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (additive) {
        actions.select(selection.includes(hit.id) ? selection.filter((i) => i !== hit.id) : [...selection, hit.id]);
      } else if (!selection.includes(hit.id)) actions.select([hit.id]);
      drag.current = { kind: 'pending', start: p, id: hit.id, additive };
    } else {
      const additive = e.shiftKey;
      if (!additive) actions.select([]);
      drag.current = { kind: 'marquee', start: p, additive, base: additive ? selection : [] };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!slide) return;
    const p = toSlide(e);
    const d = drag.current;
    const tol = SNAP_PX / scale;
    if (!d) {
      const hit = tool === 'select' ? hitTest(slide, p[0], p[1], 4 / scale) : null;
      if ((hit?.id ?? null) !== hover) setHover(hit?.id ?? null);
      return;
    }
    switch (d.kind) {
      case 'pending': {
        if (Math.hypot(p[0] - d.start[0], p[1] - d.start[1]) * scale < 3) return;
        const ids = useEditor.getState().selection;
        const boxes = ids.map((id) => node(id)?.box).filter((b): b is Box => !!b);
        const box = union(boxes);
        if (!box) return;
        drag.current = { kind: 'move', start: d.start, ids, box, others: otherBoxes(ids) };
        onPointerMove(e);
        return;
      }
      case 'move': {
        let dx = p[0] - d.start[0];
        let dy = p[1] - d.start[1];
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides: Guides = { x: [], y: [] };
        if (!(e.ctrlKey || e.metaKey)) {
          const sn = snapMove({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, d.others, W, H, tol);
          dx += sn.dx;
          dy += sn.dy;
          guides = sn.guides;
        }
        setPreview({ dx: Math.round(dx), dy: Math.round(dy), guides });
        return;
      }
      case 'resize': {
        let box = resizeBox(d.box, d.handle, p[0] - d.start[0], p[1] - d.start[1], e.shiftKey);
        const guides: Guides = { x: [], y: [] };
        if (!(e.ctrlKey || e.metaKey)) {
          const xs = [0, W / 2, W, ...d.others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
          const ys = [0, H / 2, H, ...d.others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
          if (d.handle.includes('e')) {
            const s = snapValue(box.x + box.w, xs, tol);
            box = { ...box, w: s.v - box.x };
            if (s.guide !== null) guides.x.push(s.guide);
          }
          if (d.handle.includes('w')) {
            const s = snapValue(box.x, xs, tol);
            box = { ...box, x: s.v, w: box.w + box.x - s.v };
            if (s.guide !== null) guides.x.push(s.guide);
          }
          if (d.handle.includes('s')) {
            const s = snapValue(box.y + box.h, ys, tol);
            box = { ...box, h: s.v - box.y };
            if (s.guide !== null) guides.y.push(s.guide);
          }
          if (d.handle.includes('n')) {
            const s = snapValue(box.y, ys, tol);
            box = { ...box, y: s.v, h: box.h + box.y - s.v };
            if (s.guide !== null) guides.y.push(s.guide);
          }
        }
        setPreview({ box: roundBox(box), guides });
        return;
      }
      case 'radius': {
        const b = d.box;
        const r = Math.max(0, Math.min(Math.min(b.w, b.h) / 2, Math.min(p[0] - b.x, p[1] - b.y)));
        setPreview({ radius: Math.round(r) });
        return;
      }
      case 'end': {
        const n = node(d.id);
        if (!n) return;
        let q: [number, number] = [p[0], p[1]];
        if (e.shiftKey) {
          const [x1, y1, x2, y2] = lineEnds(n);
          const [ox, oy] = d.which === 1 ? [x2, y2] : [x1, y1];
          const ang = Math.round(Math.atan2(q[1] - oy, q[0] - ox) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(q[0] - ox, q[1] - oy);
          q = [ox + Math.cos(ang) * len, oy + Math.sin(ang) * len];
        }
        setPreview({ end: [Math.round(q[0]), Math.round(q[1])] });
        return;
      }
      case 'marquee': {
        const box = normBox(d.start[0], d.start[1], p[0], p[1]);
        setPreview({ marquee: box });
        const ids = slide.nodes.filter((n) => n.props.hidden !== true && intersects(n.box, box)).map((n) => n.id);
        actions.select([...new Set([...d.base, ...ids])]);
        return;
      }
      case 'create': {
        if (tool === 'line' || tool === 'arrow') {
          let x2 = p[0];
          let y2 = p[1];
          if (e.shiftKey) {
            const ang = Math.round(Math.atan2(y2 - d.start[1], x2 - d.start[0]) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(x2 - d.start[0], y2 - d.start[1]);
            x2 = d.start[0] + Math.cos(ang) * len;
            y2 = d.start[1] + Math.sin(ang) * len;
          }
          setPreview({ create: [d.start[0], d.start[1], x2, y2] });
        } else {
          let b = normBox(d.start[0], d.start[1], p[0], p[1]);
          if (e.shiftKey) b = { ...b, w: Math.max(b.w, b.h), h: Math.max(b.w, b.h) };
          setPreview({ create: b });
        }
        return;
      }
    }
  };

  const onPointerUp = async (): Promise<void> => {
    const d = drag.current;
    const pv = preview;
    drag.current = null;
    setPreview({});
    if (!d || !slide) return;
    switch (d.kind) {
      case 'move': {
        if (!pv.dx && !pv.dy) return;
        // inside a row/column the flow owns positions: dragging reorders the children
        const single = d.ids.length === 1 ? node(d.ids[0] as string) : undefined;
        const flow = single ? flowParent(slide, single) : null;
        if (single && flow) {
          const b = single.box;
          const index = dropIndex(flow, single, b.x + b.w / 2 + (pv.dx ?? 0), b.y + b.h / 2 + (pv.dy ?? 0));
          await actions.intent({ type: 'reorder', slide: slide.id, id: single.id, index });
          return;
        }
        await actions.intent({ type: 'move', slide: slide.id, ids: d.ids, dx: pv.dx ?? 0, dy: pv.dy ?? 0 });
        return;
      }
      case 'resize':
        if (pv.box) await actions.intent({ type: 'resize', slide: slide.id, id: d.id, box: pv.box, height: d.handle.includes('n') || d.handle.includes('s') });
        return;
      case 'radius':
        if (pv.radius !== undefined) await actions.intent({ type: 'setProps', slide: slide.id, id: d.id, props: { radius: pv.radius } });
        return;
      case 'end': {
        const n = node(d.id);
        if (!n || !pv.end) return;
        const [x1, y1, x2, y2] = lineEnds(n);
        const ox = num(n.props.x, 0) - x1;
        const oy = num(n.props.y, 0) - y1;
        const props: Record<string, number> =
          d.which === 1 ? { x: pv.end[0] + ox, y: pv.end[1] + oy } : { x2: pv.end[0] + (num(n.props.x2, x2) - x2), y2: pv.end[1] + (num(n.props.y2, y2) - y2) };
        await actions.intent({ type: 'setProps', slide: slide.id, id: d.id, props });
        return;
      }
      case 'create':
        await createShape(d.start, pv.create);
        return;
      default:
        return;
    }
  };

  const createShape = async (start: [number, number], shape: Preview['create']): Promise<void> => {
    if (!slide) return;
    const kind = tool;
    actions.setTool('select');
    if (kind === 'line' || kind === 'arrow') {
      const [x1, y1, x2, y2] = Array.isArray(shape) && Math.hypot(shape[2] - shape[0], shape[3] - shape[1]) > 4 ? shape : [start[0], start[1], start[0] + 300, start[1]];
      await actions.intent({ type: 'create', slide: slide.id, kind, props: { x: Math.round(x1), y: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) } });
      return;
    }
    const b = shape && !Array.isArray(shape) && shape.w > 4 && shape.h > 4 ? roundBox(shape) : null;
    if (kind === 'text') {
      const props: Record<string, number> = b ? { x: b.x, y: b.y, w: b.w } : { x: Math.round(start[0]), y: Math.round(start[1]) };
      const before = new Set(slide.byId.keys());
      if (await actions.intent({ type: 'create', slide: slide.id, kind: 'text', props, content: 'Text' })) {
        const created = useEditor.getState().selection.find((id) => !before.has(id));
        if (created) pendingEdit.current = created;
      }
      return;
    }
    const box = b ?? { x: Math.round(start[0]), y: Math.round(start[1]), w: 320, h: 200 };
    await actions.intent({ type: 'create', slide: slide.id, kind, props: { x: box.x, y: box.y, w: box.w, h: box.h } });
  };

  const createImage = async (p: [number, number]): Promise<void> => {
    if (!slide) return;
    actions.setTool('select');
    const path = await actions.addImage();
    if (!path) return;
    await actions.intent({ type: 'create', slide: slide.id, kind: 'image', props: { x: Math.round(p[0]), y: Math.round(p[1]), w: 480 }, content: path });
  };

  const onDoubleClick = async (e: React.MouseEvent<SVGSVGElement>): Promise<void> => {
    if (!slide || stale) return;
    const p = toSlide(e);
    const hit = hitTest(slide, p[0], p[1], 4 / scale);
    if (!hit) return;
    if (hit.kind === 'image' && hit.slot) {
      const path = await actions.addImage();
      if (path) await actions.intent({ type: 'text', slide: slide.id, id: hit.id, text: path });
      return;
    }
    startEdit(hit);
  };

  const onWheel = (e: React.WheelEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    setZoom((z) => Math.max(0.25, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
  };

  // ------------------------------------------------------------------ overlay
  const hs = 8 / scale;
  const sw = 1.5 / scale;
  const overlay: JSX.Element[] = [];
  if (slide) {
    const hoverNode = hover && !selection.includes(hover) ? node(hover) : undefined;
    if (hoverNode) overlay.push(<rect key="hover" className="ov-hover" x={hoverNode.box.x} y={hoverNode.box.y} width={hoverNode.box.w} height={hoverNode.box.h} strokeWidth={sw} />);
    for (const n of selectedNodes) {
      const b = preview.box && selectedNodes.length === 1 ? preview.box : n.box;
      const dx = preview.dx ?? 0;
      const dy = preview.dy ?? 0;
      if (isLine(n)) {
        let [x1, y1, x2, y2] = lineEnds(n);
        const d = drag.current;
        if (preview.end && d?.kind === 'end') {
          if (d.which === 1) [x1, y1] = preview.end;
          else [x2, y2] = preview.end;
        }
        overlay.push(<line key={`sel-${n.id}`} className="ov-sel" x1={x1 + dx} y1={y1 + dy} x2={x2 + dx} y2={y2 + dy} strokeWidth={sw} />);
        if (selectedNodes.length === 1 && !stale) {
          overlay.push(<circle key="e1" data-end="1" className="ov-handle" cx={x1 + dx} cy={y1 + dy} r={hs * 0.7} strokeWidth={sw} />);
          overlay.push(<circle key="e2" data-end="2" className="ov-handle" cx={x2 + dx} cy={y2 + dy} r={hs * 0.7} strokeWidth={sw} />);
        }
        continue;
      }
      overlay.push(<rect key={`sel-${n.id}`} className={stale ? 'ov-sel stale' : 'ov-sel'} x={b.x + dx} y={b.y + dy} width={b.w} height={b.h} strokeWidth={sw} />);
      if (selectedNodes.length === 1 && !stale && (n.kind !== 'group' || n.layout) && !drag.current?.kind.startsWith('move')) {
        const handles = n.kind === 'table' ? (['e', 'w'] as Handle[]) : HANDLES;
        for (const h of handles) {
          const hx = b.x + (h.includes('w') ? 0 : h.includes('e') ? b.w : b.w / 2);
          const hy = b.y + (h.includes('n') ? 0 : h.includes('s') ? b.h : b.h / 2);
          overlay.push(<rect key={`h-${h}`} data-handle={h} className={`ov-handle cursor-${h}`} x={hx - hs / 2} y={hy - hs / 2} width={hs} height={hs} strokeWidth={sw} />);
        }
        if (supportsRadius(n)) {
          const r = preview.radius ?? cornerRadius(n);
          const inset = Math.max(r, 14 / scale);
          const max = Math.min(b.w, b.h) / 2;
          const off = Math.min(inset, max);
          overlay.push(<circle key="radius" data-radius="1" className="ov-radius" cx={b.x + off} cy={b.y + off} r={hs * 0.55} strokeWidth={sw}><title>Ecken runden (Radius {Math.round(r)})</title></circle>);
          if (preview.radius !== undefined) overlay.push(<path key="radius-preview" className="ov-sel" d={radiusPath(b, preview.radius)} strokeWidth={sw} />);
        }
      }
    }
    // a selected child of a row/column: show its container
    const flow = selectedNodes.length === 1 ? flowParent(slide, selectedNodes[0] as SceneNode) : null;
    if (flow) overlay.push(<rect key="flow" className="ov-union" x={flow.box.x} y={flow.box.y} width={flow.box.w} height={flow.box.h} strokeWidth={sw} />);
    if (selectedNodes.length > 1) {
      const u = union(selectedNodes.map((n) => n.box));
      if (u) overlay.push(<rect key="union" className="ov-union" x={u.x + (preview.dx ?? 0)} y={u.y + (preview.dy ?? 0)} width={u.w} height={u.h} strokeWidth={sw} />);
    }
    if (preview.marquee) {
      const m = preview.marquee;
      overlay.push(<rect key="marquee" className="ov-marquee" x={m.x} y={m.y} width={m.w} height={m.h} strokeWidth={sw} />);
    }
    if (preview.create) {
      const c = preview.create;
      if (Array.isArray(c)) overlay.push(<line key="create" className="ov-create" x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} strokeWidth={sw * 2} />);
      else if (tool === 'ellipse') overlay.push(<ellipse key="create" className="ov-create" cx={c.x + c.w / 2} cy={c.y + c.h / 2} rx={c.w / 2} ry={c.h / 2} strokeWidth={sw} />);
      else overlay.push(<rect key="create" className="ov-create" x={c.x} y={c.y} width={c.w} height={c.h} strokeWidth={sw} />);
    }
    for (const gx of preview.guides?.x ?? []) overlay.push(<line key={`gx${gx}`} className="ov-guide" x1={gx} y1={0} x2={gx} y2={H} strokeWidth={sw} />);
    for (const gy of preview.guides?.y ?? []) overlay.push(<line key={`gy${gy}`} className="ov-guide" x1={0} y1={gy} x2={W} y2={gy} strokeWidth={sw} />);
    if (mode === 'theme') {
      for (const [name, r] of Object.entries(slide.regions)) {
        overlay.push(
          <g key={`reg-${name}`} className="ov-region">
            <rect x={r.x} y={r.y} width={r.w} height={r.h} strokeWidth={sw} />
            <text x={r.x + 6 / scale} y={r.y + 16 / scale} fontSize={12 / scale}>{name}</text>
          </g>,
        );
      }
    }
  }

  return (
    <div className={`canvas-wrap tool-${tool}`} ref={wrapRef} onWheel={onWheel} data-testid="canvas">
      {slide ? (
        <div className="canvas-stage" style={{ width: W * scale, height: H * scale }}>
          <div className="slide-svg" ref={slideRef} dangerouslySetInnerHTML={{ __html: svg }} />
          <svg
            ref={overlayRef}
            className="slide-overlay"
            viewBox={`0 0 ${W} ${H}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => void onPointerUp()}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={(e) => void onDoubleClick(e)}
            data-testid="overlay"
          >
            {overlay}
          </svg>
          {editing && (
            <InlineEditor
              editing={editing}
              scale={scale}
              onChange={(value) => setEditing({ ...editing, value })}
              onCommit={(v) => void commitEdit(v)}
            />
          )}
          {stale && <div className="stale-badge">Veraltet – Fehler im Code beheben, um die Folie wieder zu bearbeiten</div>}
        </div>
      ) : (
        <div className="empty">Keine Folien – „Neue Folie“ oder im Code „slide @id“ anlegen.</div>
      )}
    </div>
  );
}

function roundBox(b: Box): Box {
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
}

function radiusPath(b: Box, r: number): string {
  const rr = Math.min(r, b.w / 2, b.h / 2);
  return `M${b.x + rr} ${b.y} H${b.x + b.w - rr} A${rr} ${rr} 0 0 1 ${b.x + b.w} ${b.y + rr} V${b.y + b.h - rr} A${rr} ${rr} 0 0 1 ${b.x + b.w - rr} ${b.y + b.h} H${b.x + rr} A${rr} ${rr} 0 0 1 ${b.x} ${b.y + b.h - rr} V${b.y + rr} A${rr} ${rr} 0 0 1 ${b.x + rr} ${b.y} Z`;
}

function InlineEditor(props: { editing: Editing; scale: number; onChange: (v: string) => void; onCommit: (v: string | null) => void }): JSX.Element {
  const { editing, scale } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const b = editing.box;
  return (
    <textarea
      ref={ref}
      className="inline-editor"
      data-testid="inline-editor"
      value={editing.value}
      spellCheck={false}
      style={{
        left: b.x * scale,
        top: b.y * scale,
        width: Math.max(b.w, 200) * scale,
        minHeight: Math.max(b.h, editing.size * editing.line) * scale,
        fontSize: editing.size * scale,
        lineHeight: editing.line,
        fontFamily: `"${editing.family}", "Helvetica Neue", Helvetica, Arial, sans-serif`,
        fontWeight: editing.weight,
      }}
      onChange={(e) => props.onChange(e.target.value)}
      onBlur={() => props.onCommit(editing.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') props.onCommit(null);
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) props.onCommit(editing.value);
      }}
    />
  );
}
