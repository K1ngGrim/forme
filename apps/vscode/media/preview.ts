// Runs inside the VS Code webview. Draws the slides the host sends and turns gestures into
// messages; the host computes the text edits (the file stays the source of truth).
import type { HostMessage, PreviewSlide, ViewMessage } from '../src/protocol.js';

declare function acquireVsCodeApi(): { postMessage(m: ViewMessage): void; getState(): unknown; setState(s: unknown): void };

const vscode = acquireVsCodeApi();
const root = document.getElementById('slides') as HTMLElement;
const fontStyle = document.getElementById('fonts') as HTMLStyleElement;
const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
type Handle = (typeof HANDLES)[number];

let width = 1920;
let height = 1080;
let slides: PreviewSlide[] = [];
let selection: { slide: string | null; ids: string[] } = { slide: null, ids: [] };

const post = (m: ViewMessage): void => vscode.postMessage(m);

function slideOf(id: string): PreviewSlide | undefined {
  return slides.find((s) => s.id === id);
}

function render(): void {
  const scrollY = window.scrollY;
  root.textContent = '';
  for (const s of slides) {
    const fig = document.createElement('figure');
    fig.className = `slide${s.stale ? ' stale' : ''}${s.hidden ? ' hidden-slide' : ''}`;
    fig.dataset.slide = s.id;
    const cap = document.createElement('figcaption');
    cap.textContent = `${s.hidden ? '–' : s.n}  @${s.id}${s.stale ? '  · veraltet: Fehler im Code beheben' : ''}${s.hidden ? '  · ausgeblendet' : ''}`;
    const stage = document.createElement('div');
    stage.className = 'stage';
    stage.innerHTML = s.svg;
    const overlay = document.createElementNS(SVG_NS, 'svg');
    overlay.setAttribute('class', 'overlay');
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    stage.appendChild(overlay);
    fig.append(cap, stage);
    root.appendChild(fig);
  }
  window.scrollTo(0, scrollY);
  drawSelection();
}

function scaleOf(stage: Element): number {
  return stage.getBoundingClientRect().width / width;
}

function drawSelection(transient?: { dx: number; dy: number; box?: [number, number, number, number] }): void {
  for (const fig of root.querySelectorAll<HTMLElement>('figure.slide')) {
    const overlay = fig.querySelector('svg.overlay') as SVGSVGElement;
    overlay.textContent = '';
    fig.classList.toggle('active', fig.dataset.slide === selection.slide);
    if (fig.dataset.slide !== selection.slide) continue;
    const s = slideOf(selection.slide ?? '');
    if (!s) continue;
    const k = 1 / scaleOf(fig.querySelector('.stage') as Element);
    for (const id of selection.ids) {
      let b = s.boxes[id];
      if (!b) continue;
      if (transient?.box && selection.ids.length === 1) b = transient.box;
      else if (transient) b = [b[0] + transient.dx, b[1] + transient.dy, b[2], b[3]];
      const [x, y, w, h] = b;
      const r = document.createElementNS(SVG_NS, 'rect');
      Object.entries({ x, y, width: Math.max(w, 1), height: Math.max(h, 1), class: 'sel', 'stroke-width': 1.5 * k }).forEach(([a, v]) => r.setAttribute(a, String(v)));
      overlay.appendChild(r);
      if (selection.ids.length !== 1 || s.stale || s.locked.includes(id)) continue;
      for (const hd of HANDLES) {
        const size = 9 * k;
        const hx = hd.includes('w') ? x : x + w;
        const hy = hd.includes('n') ? y : y + h;
        const e = document.createElementNS(SVG_NS, 'rect');
        Object.entries({ x: hx - size / 2, y: hy - size / 2, width: size, height: size, class: `handle ${hd}`, 'data-handle': hd, 'stroke-width': k }).forEach(([a, v]) => e.setAttribute(a, String(v)));
        overlay.appendChild(e);
      }
    }
  }
}

function select(slide: string, ids: string[]): void {
  selection = { slide, ids };
  drawSelection();
  post({ type: 'select', slide, ids });
}

interface Drag {
  slide: PreviewSlide;
  stage: Element;
  startX: number;
  startY: number;
  ids: string[];
  handle: Handle | null;
  moved: boolean;
  dx: number;
  dy: number;
  box?: [number, number, number, number];
}
let drag: Drag | null = null;

function nodesOf(stage: Element, ids: string[]): SVGGElement[] {
  return ids.flatMap((id) => [...stage.querySelectorAll<SVGGElement>(`svg:not(.overlay) [data-id="${CSS.escape(id)}"]`)].slice(0, 1));
}

root.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const target = ev.target as Element;
  const fig = target.closest<HTMLElement>('figure.slide');
  if (!fig) return;
  const s = slideOf(fig.dataset.slide ?? '');
  if (!s) return;
  const stage = fig.querySelector('.stage') as Element;
  const handle = (target.getAttribute('data-handle') as Handle | null) ?? null;
  if (handle && selection.slide === s.id && selection.ids.length === 1) {
    drag = { slide: s, stage, startX: ev.clientX, startY: ev.clientY, ids: selection.ids, handle, moved: false, dx: 0, dy: 0 };
  } else {
    const hit = target.closest('[data-id]')?.getAttribute('data-id') ?? null;
    if (!hit) {
      select(s.id, []);
      return;
    }
    const ids = ev.shiftKey && selection.slide === s.id ? (selection.ids.includes(hit) ? selection.ids.filter((i) => i !== hit) : [...selection.ids, hit]) : selection.ids.includes(hit) && selection.slide === s.id ? selection.ids : [hit];
    select(s.id, ids);
    if (s.stale || ids.some((i) => s.locked.includes(i))) return;
    drag = { slide: s, stage, startX: ev.clientX, startY: ev.clientY, ids, handle: null, moved: false, dx: 0, dy: 0 };
  }
  (ev.target as Element).setPointerCapture?.(ev.pointerId);
  ev.preventDefault();
});

window.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const k = scaleOf(drag.stage);
  let dx = (ev.clientX - drag.startX) / k;
  let dy = (ev.clientY - drag.startY) / k;
  if (!drag.moved && Math.hypot(dx * k, dy * k) < 3) return;
  drag.moved = true;
  if (ev.shiftKey && !drag.handle) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  drag.dx = Math.round(dx);
  drag.dy = Math.round(dy);
  if (drag.handle) {
    const b = drag.slide.boxes[drag.ids[0] as string] as [number, number, number, number];
    let [x, y, w, h] = b;
    if (drag.handle.includes('w')) {
      x += drag.dx;
      w -= drag.dx;
    } else w += drag.dx;
    if (drag.handle.includes('n')) {
      y += drag.dy;
      h -= drag.dy;
    } else h += drag.dy;
    drag.box = [Math.min(x, x + w), Math.min(y, y + h), Math.max(1, Math.abs(w)), Math.max(1, Math.abs(h))];
    drawSelection({ dx: 0, dy: 0, box: drag.box });
  } else {
    for (const g of nodesOf(drag.stage, drag.ids)) g.setAttribute('transform', `translate(${drag.dx} ${drag.dy})`);
    drawSelection({ dx: drag.dx, dy: drag.dy });
  }
});

window.addEventListener('pointerup', () => {
  const d = drag;
  drag = null;
  if (!d || !d.moved) return;
  if (d.handle && d.box) {
    const [x, y, w, h] = d.box;
    post({ type: 'resize', slide: d.slide.id, id: d.ids[0] as string, box: { x, y, w, h }, height: true });
  } else if (d.dx || d.dy) post({ type: 'move', slide: d.slide.id, ids: d.ids, dx: d.dx, dy: d.dy });
  // the transient transform stays until the host sends the re-evaluated slide
});

root.addEventListener('dblclick', (ev) => {
  const fig = (ev.target as Element).closest<HTMLElement>('figure.slide');
  const id = (ev.target as Element).closest('[data-id]')?.getAttribute('data-id');
  const s = slideOf(fig?.dataset.slide ?? '');
  if (s && id && !s.stale) post({ type: 'editText', slide: s.id, id });
});

window.addEventListener('keydown', (ev) => {
  const s = slideOf(selection.slide ?? '');
  if (!s || !selection.ids.length || s.stale) return;
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    post({ type: 'delete', slide: s.id, ids: selection.ids });
    ev.preventDefault();
    return;
  }
  const step = ev.shiftKey ? 10 : 1;
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const m = delta[ev.key];
  if (!m || selection.ids.some((i) => s.locked.includes(i))) return;
  post({ type: 'move', slide: s.id, ids: selection.ids, dx: m[0], dy: m[1] });
  ev.preventDefault();
});

window.addEventListener('resize', () => drawSelection());

window.addEventListener('message', (ev: MessageEvent<HostMessage>) => {
  const m = ev.data;
  if (m.type === 'scene') {
    width = m.width;
    height = m.height;
    slides = m.slides;
    document.title = m.title;
    vscode.setState({ deckPath: m.key });
    if (fontStyle.textContent !== m.fontCss) fontStyle.textContent = m.fontCss;
    document.documentElement.style.setProperty('--ratio', `${width} / ${height}`);
    const s = slideOf(selection.slide ?? '');
    selection.ids = s ? selection.ids.filter((id) => id in s.boxes) : [];
    render();
  } else if (m.type === 'select') {
    selection = { slide: m.slide, ids: m.ids };
    drawSelection();
    if (m.reveal && m.slide) {
      const fig = root.querySelector<HTMLElement>(`figure.slide[data-slide="${CSS.escape(m.slide)}"]`);
      const r = fig?.getBoundingClientRect();
      if (fig && r && (r.bottom < 0 || r.top > window.innerHeight)) fig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (m.type === 'error') {
    const bar = document.getElementById('error') as HTMLElement;
    bar.textContent = m.message;
    bar.hidden = !m.message;
  }
});

post({ type: 'ready' });
