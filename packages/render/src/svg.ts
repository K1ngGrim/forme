import type { Box, DeckScene, FontDef, LayoutLine, SceneNode, SlideScene, TextLayout, TextRun } from '@forme/core';
import { isMonospace, MONO_FAMILY } from '@forme/core';

export interface RenderOptions {
  /** Map a path as written in the file to a URL the renderer can load. */
  resolveAsset?: (path: string) => string;
  /** Editor mode: draw empty slots as placeholders and mark ids. */
  editor?: boolean;
  /** Emit @font-face rules for theme fonts that declare a file. */
  embedFonts?: boolean;
  /** Prefix for ids inside <defs> (needed when several slides share one document). */
  idPrefix?: string;
  /** Ids that should not be drawn (e.g. while being edited inline). */
  skip?: Set<string>;
}

export const FONT_FALLBACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function str(v: unknown, d: string): string {
  return typeof v === 'string' ? v : d;
}

/** Built-in monospace font of `code` blocks: fonts with 0.6 em glyphs first (like the measurer). */
export const MONO_FALLBACK = 'Menlo, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';

export function familyCss(family: string): string {
  if (family === MONO_FAMILY) return MONO_FALLBACK.replace(/"/g, '&quot;');
  if (isMonospace(family)) return `&quot;${esc(family)}&quot;, ${MONO_FALLBACK.replace(/"/g, '&quot;')}`;
  return `&quot;${esc(family)}&quot;, ${FONT_FALLBACK.replace(/"/g, '&quot;')}`;
}

class Defs {
  items: string[] = [];
  private count = 0;
  constructor(private readonly prefix: string) {}
  id(kind: string): string {
    return `${this.prefix}${kind}${++this.count}`;
  }
}

function paintAttrs(node: SceneNode): string {
  const p = node.props;
  const fill = str(p.fill, 'none');
  let out = ` fill="${esc(fill)}"`;
  const stroke = str(p.stroke, '');
  if (stroke && stroke !== 'none') {
    out += ` stroke="${esc(stroke)}" stroke-width="${n(num(p['stroke.width'], 2))}"`;
    const dash = num(p['stroke.dash'], 0);
    if (dash > 0) out += ` stroke-dasharray="${n(dash)} ${n(dash)}"`;
  }
  return out;
}

function radii(node: SceneNode, b: Box): [number, number, number, number] {
  const p = node.props;
  const max = Math.min(b.w, b.h) / 2;
  const r = (k: string): number => Math.max(0, Math.min(max, num(p[`radius.${k}`], 0)));
  return [r('tl'), r('tr'), r('br'), r('bl')];
}

/** Rounded rectangle path with individual corner radii. */
export function roundedRectPath(b: Box, [tl, tr, br, bl]: [number, number, number, number]): string {
  const { x, y, w, h } = b;
  return [
    `M${n(x + tl)} ${n(y)}`,
    `H${n(x + w - tr)}`,
    tr ? `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}` : '',
    `V${n(y + h - br)}`,
    br ? `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}` : '',
    `H${n(x + bl)}`,
    bl ? `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}` : '',
    `V${n(y + tl)}`,
    tl ? `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

function rectShape(node: SceneNode, b: Box, attrs: string): string {
  const r = radii(node, b);
  if (r.every((v) => v === r[0])) {
    const rx = r[0] ? ` rx="${n(r[0])}"` : '';
    return `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(Math.max(0, b.w))}" height="${n(Math.max(0, b.h))}"${rx}${attrs}/>`;
  }
  return `<path d="${roundedRectPath(b, r)}"${attrs}/>`;
}

function shadowFilter(node: SceneNode, defs: Defs): string {
  const p = node.props;
  if (p['shadow.blur'] === undefined && p['shadow.y'] === undefined && p['shadow.x'] === undefined) return '';
  const id = defs.id('sh');
  const color = str(p['shadow.color'], 'rgba(0,0,0,0.25)');
  defs.items.push(
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${n(num(p['shadow.x'], 0))}" dy="${n(num(p['shadow.y'], 8))}" stdDeviation="${n(num(p['shadow.blur'], 24) / 2)}" flood-color="${esc(color)}"/></filter>`,
  );
  return ` filter="url(#${id})"`;
}

function fontOf(scene: DeckScene, node: SceneNode): { family: string; weight: number; italic: boolean; size: number } {
  const p = node.props;
  const name = str(p.font, '');
  const def = scene.theme.fonts.find((f) => f.name === name);
  return {
    family: def ? def.family : name || 'Inter',
    weight: typeof p.weight === 'number' ? p.weight : def ? def.weight : 400,
    italic: p.italic === true || (p.italic === undefined && !!def?.italic),
    size: num(p.size, 32),
  };
}

function runSpan(run: TextRun, baseWeight: number, baseColor: string): string {
  let attrs = '';
  if (run.bold) attrs += ` font-weight="${Math.max(700, baseWeight)}"`;
  if (run.italic) attrs += ' font-style="italic"';
  if (run.color) attrs += ` fill="${esc(run.color)}"`;
  else if (run.href) attrs += ` fill="${esc(baseColor)}" text-decoration="underline"`;
  const span = `<tspan${attrs}>${esc(run.text)}</tspan>`;
  return run.href ? `<a href="${esc(run.href)}">${span}</a>` : span;
}

function textLines(layout: TextLayout, left: number, top: number, weight: number, color: string): string {
  return layout.lines
    .map((line: LayoutLine) => {
      const y = n(top + line.baseline);
      const bullet = line.bullet ? `<tspan x="${n(left + (line.bulletX ?? 0))}" y="${y}">${esc(line.bullet)}</tspan>` : '';
      const runs = line.runs.map((r) => runSpan(r, weight, color)).join('');
      return `${bullet}<tspan x="${n(left + line.x)}" y="${y}">${runs || ''}</tspan>`;
    })
    .join('');
}

function textNode(scene: DeckScene, node: SceneNode, defs: Defs, opts: RenderOptions): string {
  const b = node.box;
  const p = node.props;
  const layout = node.text;
  if (!layout) return '';
  let out = '';
  const fill = str(p.fill, '');
  if ((fill && fill !== 'none') || (str(p.stroke, '') && p.stroke !== 'none')) {
    out += rectShape(node, b, paintAttrs(node));
  }
  const pad = num(p.pad, 0);
  const f = fontOf(scene, node);
  const valign = str(p.valign, 'top');
  const free = b.h - 2 * pad - layout.height;
  const top = b.y + pad + (valign === 'middle' ? free / 2 : valign === 'bottom' ? free : 0);
  const color = node.placeholder ? '#9CA3AF' : str(p.color, '#111827');
  if (node.placeholder && !opts.editor) return '';
  if (node.placeholder) {
    out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="8 6"/>`;
  }
  out +=
    `<text xml:space="preserve" font-family="${familyCss(f.family)}" font-size="${n(f.size)}" font-weight="${f.weight}"` +
    `${f.italic ? ' font-style="italic"' : ''} fill="${esc(color)}">` +
    textLines(layout, b.x + pad, top, f.weight, color) +
    '</text>';
  void defs;
  return out;
}

function arrowHead(x1: number, y1: number, x2: number, y2: number, w: number, color: string): string {
  const len = Math.max(12, w * 4);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1 = ang + Math.PI - 0.45;
  const a2 = ang + Math.PI + 0.45;
  const p1 = [x2 + Math.cos(a1) * len, y2 + Math.sin(a1) * len];
  const p2 = [x2 + Math.cos(a2) * len, y2 + Math.sin(a2) * len];
  return `<polygon points="${n(x2)},${n(y2)} ${n(p1[0] as number)},${n(p1[1] as number)} ${n(p2[0] as number)},${n(p2[1] as number)}" fill="${esc(color)}"/>`;
}

/** Absolute endpoints of a line node. */
export function lineEnds(node: SceneNode): [number, number, number, number] {
  const p = node.props;
  const x1 = num(p.x, 0);
  const y1 = num(p.y, 0);
  const x2 = num(p.x2, x1 + 200);
  const y2 = num(p.y2, y1);
  const ox = node.box.x - Math.min(x1, x2);
  const oy = node.box.y - Math.min(y1, y2);
  return [x1 + ox, y1 + oy, x2 + ox, y2 + oy];
}

function lineNode(node: SceneNode): string {
  const p = node.props;
  const [x1, y1, x2, y2] = lineEnds(node);
  const color = str(p.stroke, '#111827');
  const w = num(p['stroke.width'], 4);
  const head = node.kind === 'arrow' ? str(p.head, 'end') : 'none';
  const dash = num(p['stroke.dash'], 0);
  const len = Math.max(12, w * 4) * 0.8;
  const shorten = (ax: number, ay: number, bx: number, by: number): [number, number] => {
    const d = Math.hypot(bx - ax, by - ay) || 1;
    return [bx - ((bx - ax) / d) * len, by - ((by - ay) / d) * len];
  };
  let [sx, sy, ex, ey] = [x1, y1, x2, y2];
  if (head === 'end' || head === 'both') [ex, ey] = shorten(x1, y1, x2, y2);
  if (head === 'start' || head === 'both') [sx, sy] = shorten(x2, y2, x1, y1);
  let out = `<line x1="${n(sx)}" y1="${n(sy)}" x2="${n(ex)}" y2="${n(ey)}" stroke="${esc(color)}" stroke-width="${n(w)}" stroke-linecap="round"${dash > 0 ? ` stroke-dasharray="${n(dash)} ${n(dash)}"` : ''}/>`;
  if (head === 'end' || head === 'both') out += arrowHead(x1, y1, x2, y2, w, color);
  if (head === 'start' || head === 'both') out += arrowHead(x2, y2, x1, y1, w, color);
  return out;
}

function imageNode(node: SceneNode, defs: Defs, opts: RenderOptions): string {
  const b = node.box;
  const p = node.props;
  const src = str(p.src, '');
  if (!src) {
    if (!opts.editor) return '';
    return (
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="#F3F4F6" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="8 6"/>` +
      `<text x="${n(b.x + b.w / 2)}" y="${n(b.y + b.h / 2)}" text-anchor="middle" font-family="${familyCss('Inter')}" font-size="24" fill="#9CA3AF">${esc(str(p.placeholder, 'Bild'))}</text>`
    );
  }
  const href = opts.resolveAsset ? opts.resolveAsset(src) : src;
  const fit = str(p.fit, 'contain');
  const par = fit === 'cover' ? 'xMidYMid slice' : fit === 'fill' ? 'none' : 'xMidYMid meet';
  const r = radii(node, b);
  let clip = '';
  if (r.some((v) => v > 0) || fit === 'cover') {
    const id = defs.id('clip');
    defs.items.push(`<clipPath id="${id}"><path d="${roundedRectPath(b, r)}"/></clipPath>`);
    clip = ` clip-path="url(#${id})"`;
  }
  let out = `<image href="${esc(href)}" x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" preserveAspectRatio="${par}"${clip}/>`;
  const stroke = str(p.stroke, '');
  if (stroke && stroke !== 'none') out += `<path d="${roundedRectPath(b, r)}" fill="none" stroke="${esc(stroke)}" stroke-width="${n(num(p['stroke.width'], 2))}"/>`;
  return out;
}

function tableNode(scene: DeckScene, node: SceneNode): string {
  const t = node.table;
  if (!t) return '';
  const b = node.box;
  const p = node.props;
  const f = fontOf(scene, node);
  const pad = num(p.pad, 16);
  const border = str(p.border, '#D1D5DB');
  const headerFill = str(p['header.fill'], '#F3F4F6');
  const headerColor = str(p['header.color'], str(p.color, '#111827'));
  const stripe = str(p.stripe, '');
  const fill = str(p.fill, '');
  let out = '';
  if (fill && fill !== 'none') out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${esc(fill)}"/>`;
  t.cells.forEach((row, ri) => {
    for (const c of row) {
      const cb = { x: b.x + c.box.x, y: b.y + c.box.y, w: c.box.w, h: c.box.h };
      const bg = c.header ? headerFill : stripe && ri % 2 === 0 ? stripe : '';
      if (bg) out += `<rect x="${n(cb.x)}" y="${n(cb.y)}" width="${n(cb.w)}" height="${n(cb.h)}" fill="${esc(bg)}"/>`;
      const color = c.header ? headerColor : str(p.color, '#111827');
      const weight = c.header ? Math.max(700, f.weight) : f.weight;
      out +=
        `<text xml:space="preserve" font-family="${familyCss(f.family)}" font-size="${n(f.size)}" font-weight="${weight}" fill="${esc(color)}">` +
        textLines(c.text, cb.x + pad, cb.y + pad, weight, color) +
        '</text>';
    }
  });
  // grid lines
  let y = b.y;
  out += `<g stroke="${esc(border)}" stroke-width="2" fill="none">`;
  out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"/>`;
  for (const h of t.rowHeights.slice(0, -1)) {
    y += h;
    out += `<line x1="${n(b.x)}" y1="${n(y)}" x2="${n(b.x + b.w)}" y2="${n(y)}"/>`;
  }
  let x = b.x;
  for (const w of t.colWidths.slice(0, -1)) {
    x += w;
    out += `<line x1="${n(x)}" y1="${n(b.y)}" x2="${n(x)}" y2="${n(b.y + b.h)}"/>`;
  }
  out += '</g>';
  return out;
}

function renderNode(scene: DeckScene, node: SceneNode, defs: Defs, opts: RenderOptions): string {
  if (node.props.hidden === true) return '';
  if (opts.skip?.has(node.id)) return '';
  const b = node.box;
  const p = node.props;
  let body = '';
  switch (node.kind) {
    case 'rect':
      body = rectShape(node, b, paintAttrs(node));
      break;
    case 'ellipse':
      body = `<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" rx="${n(Math.max(0, b.w / 2))}" ry="${n(Math.max(0, b.h / 2))}"${paintAttrs(node)}/>`;
      break;
    case 'line':
    case 'arrow':
      body = lineNode(node);
      break;
    case 'polygon': {
      const pts = (node.points ?? []).map(([x, y]) => `${n(b.x + x)},${n(b.y + y)}`).join(' ');
      body = `<polygon points="${pts}"${paintAttrs(node)}/>`;
      break;
    }
    case 'path': {
      const vb = node.viewBox ?? { x: 0, y: 0, w: 1, h: 1 };
      const sx = vb.w ? b.w / vb.w : 1;
      const sy = vb.h ? b.h / vb.h : 1;
      body = `<path d="${esc(str(p.d, ''))}" transform="translate(${n(b.x)} ${n(b.y)}) scale(${n(sx)} ${n(sy)}) translate(${n(-vb.x)} ${n(-vb.y)})"${paintAttrs(node)} vector-effect="non-scaling-stroke"/>`;
      break;
    }
    case 'text':
    case 'list':
      body = textNode(scene, node, defs, opts);
      break;
    case 'image':
      body = imageNode(node, defs, opts);
      break;
    case 'table':
      body = tableNode(scene, node);
      break;
    case 'box':
    case 'group':
      if (node.layout || node.kind === 'box') {
        // box, row, column: optional background, children stay individually selectable
        const fill = str(p.fill, '');
        const stroke = str(p.stroke, '');
        const bg = (fill && fill !== 'none') || (stroke && stroke !== 'none') ? `<g${shadowFilter(node, defs)}>${rectShape(node, b, paintAttrs(node))}</g>` : '';
        body = bg + node.children.map((c) => renderNode(scene, c, defs, opts)).join('');
        break;
      }
      body = node.children.map((c) => renderNode(scene, c, defs, { ...opts, editor: false })).join('');
      break;
  }
  if (!body) return '';
  const opacity = num(p.opacity, 1);
  const filter = node.layout || node.kind === 'box' ? '' : shadowFilter(node, defs);
  const idAttr = opts.editor ? ` data-id="${esc(node.id)}"` : '';
  return `<g${idAttr}${opacity < 1 ? ` opacity="${n(opacity)}"` : ''}${filter}>${body}</g>`;
}

export function fontFaceCss(fonts: FontDef[], resolveAsset?: (p: string) => string): string {
  return fonts
    .filter((f) => f.file)
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("${resolveAsset ? resolveAsset(f.file as string) : f.file}");font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'};}`,
    )
    .join('');
}

/** Render one slide to a standalone SVG string. Same output for editor, PDF and thumbnails. */
export function renderSlideSvg(scene: DeckScene, slide: SlideScene, opts: RenderOptions = {}): string {
  const W = scene.width;
  const H = scene.height;
  const defs = new Defs(opts.idPrefix ?? `${slide.id}-`);
  const bg = slide.background;
  let body = `<rect width="${W}" height="${H}" fill="${esc(bg.fill)}"/>`;
  if (bg.image) {
    const href = opts.resolveAsset ? opts.resolveAsset(bg.image) : bg.image;
    const par = bg.fit === 'contain' ? 'xMidYMid meet' : bg.fit === 'fill' ? 'none' : 'xMidYMid slice';
    body += `<image href="${esc(href)}" width="${W}" height="${H}" preserveAspectRatio="${par}"/>`;
  }
  body += slide.nodes.map((node) => renderNode(scene, node, defs, opts)).join('');
  const style = opts.embedFonts ? fontFaceCss(scene.theme.fonts, opts.resolveAsset) : '';
  const head = (style ? `<style>${style}</style>` : '') + defs.items.join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    (head ? `<defs>${head}</defs>` : '') +
    body +
    '</svg>'
  );
}

/** HTML document with one page per visible slide, sized for printToPDF. */
export function renderDeckHtml(scene: DeckScene, opts: RenderOptions = {}): string {
  const W = scene.width;
  const H = scene.height;
  const pages = scene.slides
    .filter((s) => !s.hidden)
    .map((s) => `<div class="page">${renderSlideSvg(scene, s, { ...opts, editor: false, embedFonts: false, idPrefix: `${s.id}-` })}</div>`)
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(scene.title)}</title>
<style>
@page { size: ${W}px ${H}px; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: ${W}px; height: ${H}px; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.page svg { display: block; }
${fontFaceCss(scene.theme.fonts, opts.resolveAsset)}
</style></head><body>
${pages}
</body></html>`;
}
