import type { Box, SceneNode, SlideScene } from '@forme/core';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

export function isLine(n: SceneNode): boolean {
  return n.kind === 'line' || n.kind === 'arrow';
}

/** Absolute endpoints of a line node. */
export function lineEnds(n: SceneNode): [number, number, number, number] {
  const x1 = num(n.props.x, 0);
  const y1 = num(n.props.y, 0);
  const x2 = num(n.props.x2, x1 + 200);
  const y2 = num(n.props.y2, y1);
  const ox = n.box.x - Math.min(x1, x2);
  const oy = n.box.y - Math.min(y1, y2);
  return [x1 + ox, y1 + oy, x2 + ox, y2 + oy];
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function hitNode(n: SceneNode, x: number, y: number, tol: number): boolean {
  if (n.props.hidden === true) return false;
  if (isLine(n)) {
    const [x1, y1, x2, y2] = lineEnds(n);
    return distToSegment(x, y, x1, y1, x2, y2) <= Math.max(tol, num(n.props['stroke.width'], 4) / 2 + tol / 2);
  }
  const b = n.box;
  return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
}

/** Topmost top-level object at a point (groups and components are selected as a unit). */
export function hitTest(slide: SlideScene, x: number, y: number, tol: number): SceneNode | null {
  for (let i = slide.nodes.length - 1; i >= 0; i--) {
    const n = slide.nodes[i] as SceneNode;
    if (n.kind === 'group' && !n.component) {
      if (n.children.some((c) => hitNode(c, x, y, tol))) return n;
      continue;
    }
    if (hitNode(n, x, y, tol)) return n;
  }
  return null;
}

export function union(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normBox(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function resizeBox(b: Box, h: Handle, dx: number, dy: number, keepAspect: boolean): Box {
  let { x, y, w, h: hh } = b;
  if (h.includes('w')) {
    x += dx;
    w -= dx;
  }
  if (h.includes('e')) w += dx;
  if (h.includes('n')) {
    y += dy;
    hh -= dy;
  }
  if (h.includes('s')) hh += dy;
  if (keepAspect && b.w > 0 && b.h > 0 && h.length === 2) {
    const ratio = b.w / b.h;
    if (Math.abs(w / ratio) > Math.abs(hh)) {
      const nh = w / ratio;
      if (h.includes('n')) y -= nh - hh;
      hh = nh;
    } else {
      const nw = hh * ratio;
      if (h.includes('w')) x -= nw - w;
      w = nw;
    }
  }
  if (w < 1) {
    if (h.includes('w')) x = b.x + b.w - 1;
    w = 1;
  }
  if (hh < 1) {
    if (h.includes('n')) y = b.y + b.h - 1;
    hh = 1;
  }
  return { x, y, w, h: hh };
}

export interface Guides {
  x: number[];
  y: number[];
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guides;
}

/** Snap a moving box to slide edges/centers and other objects. */
export function snapMove(box: Box, others: Box[], slideW: number, slideH: number, tol: number): SnapResult {
  const xs = [0, slideW / 2, slideW];
  const ys = [0, slideH / 2, slideH];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const pick = (edges: number[], cands: number[]): { d: number; at: number[] } => {
    let best = Infinity;
    let at: number[] = [];
    for (const e of edges) {
      for (const c of cands) {
        const d = c - e;
        if (Math.abs(d) <= tol && Math.abs(d) < Math.abs(best) - 0.01) {
          best = d;
          at = [c];
        } else if (Math.abs(d - best) < 0.01) at.push(c);
      }
    }
    return Number.isFinite(best) ? { d: best, at } : { d: 0, at: [] };
  };
  const sx = pick([box.x, box.x + box.w / 2, box.x + box.w], xs);
  const sy = pick([box.y, box.y + box.h / 2, box.y + box.h], ys);
  return { dx: sx.d, dy: sy.d, guides: { x: sx.at, y: sy.at } };
}

export function snapValue(v: number, cands: number[], tol: number): { v: number; guide: number | null } {
  let best: number | null = null;
  for (const c of cands) if (Math.abs(c - v) <= tol && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c;
  return best === null ? { v, guide: null } : { v: best, guide: best };
}

export function cornerRadius(n: SceneNode): number {
  return num(n.props['radius.tl'], 0);
}

export function supportsRadius(n: SceneNode): boolean {
  return n.kind === 'rect' || n.kind === 'image' || ((n.kind === 'text') && typeof n.props.fill === 'string' && n.props.fill !== 'none');
}
