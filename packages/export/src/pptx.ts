import type { DeckScene, ListItem, SceneNode, SlideScene, TextRun } from '@forme/core';
import { MONO_FAMILY, parseRich } from '@forme/core';
import { renderSlideSvg } from '@forme/render';
import PptxGenJS from 'pptxgenjs';

export interface ExportLogEntry {
  slide: string;
  id?: string;
  message: string;
}

export interface PptxOptions {
  /** Load an asset referenced in the deck (path as written) as bytes. */
  loadAsset: (path: string) => Promise<Uint8Array | null>;
  /** Rasterize an SVG snippet to PNG; used for effects PPTX cannot express. */
  rasterize?: (svg: string, width: number, height: number) => Promise<Uint8Array>;
}

export interface PptxResult {
  data: Uint8Array;
  log: ExportLogEntry[];
}

/** Base64 without Node's Buffer, so the exporter runs in the browser too. */
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const PX_PER_IN = 96;
const inch = (px: number): number => Math.round((px / PX_PER_IN) * 10000) / 10000;
const pt = (px: number): number => Math.round(px * 0.75 * 100) / 100;

function num(v: unknown, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function str(v: unknown, d: string): string {
  return typeof v === 'string' ? v : d;
}

interface Color {
  hex: string;
  transparency: number;
}

/** Convert #RGB/#RRGGBB/#RRGGBBAA/rgba() to PPTX hex + transparency (0..100). */
export function toColor(c: string | undefined): Color | null {
  if (!c || c === 'none' || c === 'transparent') return null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (m) {
    let h = m[1] as string;
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { hex: h.slice(0, 6).toUpperCase(), transparency: Math.round((1 - alpha) * 100) };
  }
  m = /^rgba?\(([^)]*)\)$/i.exec(c);
  if (m) {
    const parts = (m[1] as string).split(',').map((s) => Number(s.trim()));
    const hex = parts
      .slice(0, 3)
      .map((v) => Math.max(0, Math.min(255, Math.round(v || 0))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const a = parts.length > 3 && Number.isFinite(parts[3]) ? (parts[3] as number) : 1;
    return { hex, transparency: Math.round((1 - a) * 100) };
  }
  return null;
}

function fontOf(scene: DeckScene, node: SceneNode): { face: string; bold: boolean; italic: boolean; size: number } {
  const p = node.props;
  const name = str(p.font, '');
  const def = scene.theme.fonts.find((f) => f.name === name);
  const weight = typeof p.weight === 'number' ? p.weight : def ? def.weight : 400;
  return {
    // built-in monospace font of code blocks: Consolas exists wherever PowerPoint runs
    face: def ? def.family : name === MONO_FAMILY ? 'Consolas' : name || 'Inter',
    bold: weight >= 600,
    italic: p.italic === true || (p.italic === undefined && !!def?.italic),
    size: pt(num(p.size, 32)),
  };
}

type TextObj = PptxGenJS.TextProps;

function runsToText(runs: TextRun[], baseColor: string | undefined): TextObj[] {
  const out: TextObj[] = [];
  for (const r of runs) {
    const parts = r.text.split('\n');
    parts.forEach((part, i) => {
      const color = toColor(r.color ?? baseColor);
      const options: PptxGenJS.TextPropsOptions = {};
      if (r.bold) options.bold = true;
      if (r.italic) options.italic = true;
      if (color) options.color = color.hex;
      if (r.href) options.hyperlink = { url: r.href };
      if (i < parts.length - 1) options.breakLine = true;
      out.push({ text: part, options });
    });
  }
  return out;
}

function shadowOf(node: SceneNode): PptxGenJS.ShadowProps | undefined {
  const p = node.props;
  if (p['shadow.blur'] === undefined && p['shadow.y'] === undefined) return undefined;
  const dx = num(p['shadow.x'], 0);
  const dy = num(p['shadow.y'], 8);
  const c = toColor(str(p['shadow.color'], 'rgba(0,0,0,0.25)'));
  const angle = (Math.round((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360;
  return {
    type: 'outer',
    blur: pt(num(p['shadow.blur'], 24)),
    offset: pt(Math.hypot(dx, dy)),
    angle,
    color: c?.hex ?? '000000',
    opacity: c ? 1 - c.transparency / 100 : 0.25,
  };
}

function lineProps(node: SceneNode): PptxGenJS.ShapeLineProps | undefined {
  const c = toColor(str(node.props.stroke, ''));
  if (!c) return undefined;
  const lp: PptxGenJS.ShapeLineProps = { color: c.hex, width: pt(num(node.props['stroke.width'], 2)) };
  if (c.transparency) lp.transparency = c.transparency;
  if (num(node.props['stroke.dash'], 0) > 0) lp.dashType = 'dash';
  return lp;
}

function fillProps(node: SceneNode): PptxGenJS.ShapeFillProps | undefined {
  const c = toColor(str(node.props.fill, ''));
  if (!c) return undefined;
  const opacity = num(node.props.opacity, 1);
  const transparency = Math.round(100 - (100 - c.transparency) * opacity);
  return transparency ? { color: c.hex, transparency } : { color: c.hex };
}

/** Convert SVG path data to pptxgenjs custom geometry points (relative to the viewBox). */
export function pathToPoints(d: string, vb: { x: number; y: number }, sx: number, sy: number): PptxGenJS.ShapeProps['points'] | null {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const pts: NonNullable<PptxGenJS.ShapeProps['points']> = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx0 = 0;
  let sy0 = 0;
  const X = (v: number): number => inch((v - vb.x) * sx);
  const Y = (v: number): number => inch((v - vb.y) * sy);
  const next = (): number => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        pts.push({ close: true });
        cx = sx0;
        cy = sy0;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? cx : 0;
    const by = rel ? cy : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        cx = bx + next();
        cy = by + next();
        sx0 = cx;
        sy0 = cy;
        pts.push({ x: X(cx), y: Y(cy), moveTo: true });
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        cx = bx + next();
        cy = by + next();
        pts.push({ x: X(cx), y: Y(cy) });
        break;
      case 'H':
        cx = (rel ? cx : 0) + next();
        pts.push({ x: X(cx), y: Y(cy) });
        break;
      case 'V':
        cy = (rel ? cy : 0) + next();
        pts.push({ x: X(cx), y: Y(cy) });
        break;
      case 'C': {
        const x1 = bx + next();
        const y1 = by + next();
        const x2 = bx + next();
        const y2 = by + next();
        cx = bx + next();
        cy = by + next();
        pts.push({ x: X(cx), y: Y(cy), curve: { type: 'cubic', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2) } });
        break;
      }
      case 'Q': {
        const x1 = bx + next();
        const y1 = by + next();
        cx = bx + next();
        cy = by + next();
        pts.push({ x: X(cx), y: Y(cy), curve: { type: 'quadratic', x1: X(x1), y1: Y(y1) } });
        break;
      }
      default:
        return null; // S/T/A: not mapped, caller rasterizes
    }
    if (tokens.length && Number.isNaN(cx + cy)) return null;
  }
  return pts;
}

interface Target {
  addText: PptxGenJS.Slide['addText'];
  addShape: PptxGenJS.Slide['addShape'];
  addImage: PptxGenJS.Slide['addImage'];
  addTable: PptxGenJS.Slide['addTable'];
}

class Exporter {
  readonly pptx = new PptxGenJS();
  readonly log: ExportLogEntry[] = [];
  private readonly assets = new Map<string, string | null>();

  constructor(
    readonly scene: DeckScene,
    readonly opts: PptxOptions,
  ) {
    this.pptx.defineLayout({ name: 'FORME', width: inch(scene.width), height: inch(scene.height) });
    this.pptx.layout = 'FORME';
    this.pptx.title = scene.title;
  }

  async asset(path: string): Promise<string | null> {
    if (this.assets.has(path)) return this.assets.get(path) ?? null;
    const bytes = await this.opts.loadAsset(path);
    let data: string | null = null;
    if (bytes) {
      const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? 'png').toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : 'image/png';
      if (ext === 'svg' && this.opts.rasterize) {
        // PowerPoint needs a PNG fallback for SVG; rasterize at 2x for crisp output
        const svg = new TextDecoder().decode(bytes);
        const size = /width="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/.exec(svg);
        const w = size ? Number(size[1]) : 800;
        const h = size ? Number(size[2]) : 600;
        const png = await this.opts.rasterize(svg, w * 2, h * 2);
        data = `image/png;base64,${toBase64(png)}`;
      } else data = `${mime};base64,${toBase64(bytes)}`;
    }
    this.assets.set(path, data);
    return data;
  }

  textOptions(node: SceneNode): PptxGenJS.TextPropsOptions {
    const p = node.props;
    const b = node.box;
    const f = fontOf(this.scene, node);
    const color = toColor(str(p.color, '#111827'));
    const pad = num(p.pad, 0);
    const o: PptxGenJS.TextPropsOptions = {
      x: inch(b.x),
      y: inch(b.y),
      w: inch(b.w),
      h: inch(b.h),
      fontFace: f.face,
      fontSize: f.size,
      bold: f.bold,
      italic: f.italic,
      align: str(p.align, 'left') as PptxGenJS.HAlign,
      valign: str(p.valign, 'top') as PptxGenJS.VAlign,
      margin: pt(pad),
      fit: 'none',
      autoFit: false,
      wrap: true,
      lineSpacingMultiple: num(p.line, 1.25),
    };
    if (!('w' in node.prov) && node.kind === 'text') {
      // auto-width text: PowerPoint metrics differ, so never wrap and leave some slack
      o.wrap = false;
      const slack = b.w * 0.1;
      const anchor = str(p.anchor, 'left');
      o.w = inch(b.w + slack);
      if (anchor === 'right') o.x = inch(b.x - slack);
      else if (anchor === 'center') o.x = inch(b.x - slack / 2);
    }
    if (color) o.color = color.hex;
    const fill = fillProps(node);
    if (fill) o.fill = fill;
    const line = lineProps(node);
    if (line) o.line = line;
    const shadow = shadowOf(node);
    if (shadow) o.shadow = shadow;
    return o;
  }

  async rasterizeNode(target: Target, slide: SlideScene, node: SceneNode, reason: string): Promise<void> {
    if (!this.opts.rasterize) {
      this.log.push({ slide: slide.id, id: node.id, message: `${reason} – übersprungen (kein Rasterizer verfügbar)` });
      return;
    }
    const b = node.box;
    const mini: SlideScene = { ...slide, nodes: [node], background: { fill: 'none' } };
    const full = renderSlideSvg(this.scene, mini).replace(/<rect width="\d+" height="\d+" fill="none"\/>/, '');
    const svg = full.replace(/viewBox="[^"]*" width="\d+" height="\d+"/, `viewBox="${b.x} ${b.y} ${Math.max(1, b.w)} ${Math.max(1, b.h)}" width="${Math.max(1, b.w)}" height="${Math.max(1, b.h)}"`);
    const png = await this.opts.rasterize(svg, Math.ceil(Math.max(1, b.w) * 2), Math.ceil(Math.max(1, b.h) * 2));
    target.addImage({ data: `image/png;base64,${toBase64(png)}`, x: inch(b.x), y: inch(b.y), w: inch(Math.max(1, b.w)), h: inch(Math.max(1, b.h)) });
    this.log.push({ slide: slide.id, id: node.id, message: `${reason} – als Bild gerastert` });
  }

  async addNode(target: Target, slide: SlideScene, node: SceneNode): Promise<void> {
    if (node.props.hidden === true || node.placeholder) return;
    const p = node.props;
    const b = node.box;
    const pos = { x: inch(b.x), y: inch(b.y), w: inch(Math.max(0, b.w)), h: inch(Math.max(0, b.h)) };
    const shadow = shadowOf(node);
    switch (node.kind) {
      case 'rect':
      case 'ellipse': {
        const r = ['tl', 'tr', 'br', 'bl'].map((c) => num(p[`radius.${c}`], 0));
        const uniform = r.every((v) => v === r[0]);
        if (node.kind === 'rect' && !uniform) {
          await this.rasterizeNode(target, slide, node, 'Unterschiedliche Eckenradien');
          return;
        }
        const opts: PptxGenJS.ShapeProps = { ...pos };
        const fill = fillProps(node);
        if (fill) opts.fill = fill;
        const line = lineProps(node);
        if (line) opts.line = line;
        if (shadow) opts.shadow = shadow;
        let shape: PptxGenJS.ShapeType = node.kind === 'ellipse' ? this.pptx.ShapeType.ellipse : this.pptx.ShapeType.rect;
        if (node.kind === 'rect' && (r[0] as number) > 0) {
          shape = this.pptx.ShapeType.roundRect;
          opts.rectRadius = Math.min(1, (r[0] as number) / (Math.min(b.w, b.h) / 2));
        }
        target.addShape(shape, opts);
        return;
      }
      case 'line':
      case 'arrow': {
        const x1 = num(p.x, 0);
        const y1 = num(p.y, 0);
        const x2 = num(p.x2, x1 + 200);
        const y2 = num(p.y2, y1);
        const line = lineProps(node) ?? { color: '111827', width: 3 };
        const head = node.kind === 'arrow' ? str(p.head, 'end') : 'none';
        if (head === 'end' || head === 'both') line.endArrowType = 'triangle';
        if (head === 'start' || head === 'both') line.beginArrowType = 'triangle';
        target.addShape(this.pptx.ShapeType.line, { ...pos, line, flipH: x2 < x1, flipV: y2 < y1 });
        return;
      }
      case 'polygon':
      case 'path': {
        let points: PptxGenJS.ShapeProps['points'] | null = null;
        if (node.kind === 'polygon') {
          const pts = node.points ?? [];
          points = pts.map(([x, y], i) => (i === 0 ? { x: inch(x), y: inch(y), moveTo: true } : { x: inch(x), y: inch(y) }));
          points.push({ close: true });
        } else {
          const vb = node.viewBox ?? { x: 0, y: 0, w: 1, h: 1 };
          points = pathToPoints(str(p.d, ''), vb, vb.w ? b.w / vb.w : 1, vb.h ? b.h / vb.h : 1);
        }
        if (!points) {
          await this.rasterizeNode(target, slide, node, 'Pfad mit nicht abbildbaren Befehlen (S/T/A)');
          return;
        }
        const opts: PptxGenJS.ShapeProps = { ...pos, points };
        const fill = fillProps(node);
        if (fill) opts.fill = fill;
        const line = lineProps(node);
        if (line) opts.line = line;
        if (shadow) opts.shadow = shadow;
        target.addShape('custGeom' as PptxGenJS.ShapeType, opts);
        return;
      }
      case 'text': {
        const color = str(p.color, '#111827');
        const runs = runsToText(node.runs ?? parseRich(str(p.text, '')), color);
        target.addText(runs.length ? runs : '', this.textOptions(node));
        return;
      }
      case 'list': {
        const items: ListItem[] = node.items ?? [];
        const color = str(p.color, '#111827');
        const style = str(p.bullet, 'disc');
        const paras: TextObj[] = [];
        items.forEach((it) => {
          const runs = runsToText(parseRich(it.text), color);
          const first = runs[0];
          if (!first) return;
          const bullet: PptxGenJS.TextPropsOptions['bullet'] = style === 'none' ? false : style === 'number' ? { type: 'number' } : true;
          // paragraph properties must be present on every run of the paragraph
          for (const r of runs) r.options = { ...r.options, bullet, indentLevel: Math.max(0, it.level - 1), paraSpaceAfter: pt(num(p.size, 32) * 0.35) };
          const last = runs[runs.length - 1] as TextObj;
          last.options = { ...last.options, breakLine: true };
          paras.push(...runs);
        });
        target.addText(paras, this.textOptions(node));
        return;
      }
      case 'image': {
        const src = str(p.src, '');
        if (!src) return;
        const data = await this.asset(src);
        if (!data) {
          this.log.push({ slide: slide.id, id: node.id, message: `Bild „${src}“ nicht gefunden` });
          return;
        }
        const fit = str(p.fit, 'contain');
        const opts: PptxGenJS.ImageProps = { data, ...pos };
        if (fit !== 'fill') opts.sizing = { type: fit === 'cover' ? 'cover' : 'contain', w: pos.w, h: pos.h };
        if (num(p['radius.tl'], 0) > 0) this.log.push({ slide: slide.id, id: node.id, message: 'Bild-Eckenradius wird in PPTX nicht übernommen' });
        if (shadow) opts.shadow = shadow;
        target.addImage(opts);
        return;
      }
      case 'table': {
        const rows = node.rows ?? [];
        const t = node.table;
        if (!t) return;
        const f = fontOf(this.scene, node);
        const border = toColor(str(p.border, '#D1D5DB'));
        const headerFill = toColor(str(p['header.fill'], '#F3F4F6'));
        const headerColor = toColor(str(p['header.color'], str(p.color, '#111827')));
        const color = toColor(str(p.color, '#111827'));
        const stripe = toColor(str(p.stripe, ''));
        const header = p.header !== false;
        const data: PptxGenJS.TableRow[] = rows.map((row, ri) =>
          t.colWidths.map((_, ci) => {
            const isHeader = header && ri === 0;
            const cellOpts: PptxGenJS.TableCellProps = {
              fontFace: f.face,
              fontSize: f.size,
              bold: isHeader || f.bold,
              margin: pt(num(p.pad, 16)),
              valign: 'top',
            };
            const c = isHeader ? headerColor : color;
            if (c) cellOpts.color = c.hex;
            const bg = isHeader ? headerFill : stripe && ri % 2 === 0 ? stripe : null;
            if (bg) cellOpts.fill = { color: bg.hex };
            if (border) cellOpts.border = { type: 'solid', pt: 1.5, color: border.hex };
            return { text: runsToText(parseRich(row[ci] ?? ''), undefined), options: cellOpts };
          }),
        );
        target.addTable(data, { x: pos.x, y: pos.y, w: pos.w, colW: t.colWidths.map(inch), rowH: t.rowHeights.map(inch) });
        return;
      }
      case 'box':
      case 'group':
        if (node.layout || node.kind === 'box') {
          // box, row, column: background as a normal (editable) shape, then the children
          const fill = str(p.fill, '');
          const stroke = str(p.stroke, '');
          if ((fill && fill !== 'none') || (stroke && stroke !== 'none')) await this.addNode(target, slide, { ...node, kind: 'rect', children: [] });
          for (const c of node.children) await this.addNode(target, slide, c);
          return;
        }
        if (shadow || num(p.opacity, 1) < 1) this.log.push({ slide: slide.id, id: node.id, message: 'Gruppeneffekte (Schatten/Deckkraft) werden nicht übernommen' });
        for (const c of node.children) await this.addNode(target, slide, c);
        return;
    }
  }
}

function slotIsStatic(node: SceneNode): boolean {
  // slot geometry/style untouched by the slide -> it can map to the master placeholder
  return Object.entries(node.prov).every(([k, prov]) => prov.op.scope !== 'slide' || (prov.op.verb === 'fill' && (k === 'text' || k === 'src')));
}

function nodeSignature(n: SceneNode): string {
  return JSON.stringify([n.kind, n.props, n.box, n.items, n.rows]);
}

/** Export a deck to PPTX: theme layouts become slide masters, slots placeholders, notes speaker notes. */
export async function exportPptx(scene: DeckScene, opts: PptxOptions): Promise<PptxResult> {
  const ex = new Exporter(scene, opts);
  const { pptx } = ex;
  const slides = scene.slides.filter((s) => !s.hidden);

  // group slides by master+layout to build PPTX masters
  const groups = new Map<string, SlideScene[]>();
  for (const s of slides) {
    const key = `${s.master ?? '-'}/${s.layout ?? '-'}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const masterStatic = new Map<string, Set<string>>();
  const masterSlots = new Map<string, Set<string>>();
  for (const [key, group] of groups) {
    const first = group[0] as SlideScene;
    const objects: NonNullable<PptxGenJS.SlideMasterProps['objects']> = [];
    const statics = new Set<string>();
    const slots = new Set<string>();
    let slideNumber: PptxGenJS.SlideMasterProps['slideNumber'];
    // PowerPoint draws master content below everything on the slide. Only the bottom-most
    // run of objects that can live in the master may go there; once one object has to be
    // placed on the slide (ellipse, component, slot content, per-slide text ...), all objects
    // above it go on the slide too, so the z-order of the deck is kept.
    let inMaster = true;
    for (const node of first.nodes) {
      if (node.from !== 'master' && node.from !== 'layout') {
        inMaster = false;
        continue;
      }
      if (node.slot) {
        inMaster = false;
        if (!group.every((s) => { const n = s.byId.get(node.id); return n && slotIsStatic(n); })) continue;
        const b = node.box;
        const f = fontOf(scene, node);
        const c = toColor(str(node.props.color, '#111827'));
        const ph: PptxGenJS.PlaceholderProps = {
          name: node.id,
          type: node.kind === 'image' ? 'pic' : node.id === 'title' ? 'title' : 'body',
          x: inch(b.x),
          y: inch(b.y),
          // auto-width slots differ per slide: give the placeholder the full content width
          w: inch(!('w' in node.prov) && b.x < scene.width / 2 ? scene.width - 2 * b.x : b.w),
          h: inch(b.h),
          fontFace: f.face,
          fontSize: f.size,
          bold: f.bold,
          margin: 0,
          align: str(node.props.align, 'left') as PptxGenJS.HAlign,
          valign: 'top',
        };
        if (c) ph.color = c.hex;
        objects.push({ placeholder: { options: ph, text: str(node.props.placeholder, '') } });
        slots.add(node.id);
        continue;
      }
      if (group.every((s) => s.byId.get(node.id)?.props.hidden === true)) continue;
      const same = group.every((s) => {
        const n = s.byId.get(node.id);
        return n && nodeSignature(n) === nodeSignature(node) && !Object.values(n.prov).some((p) => p.op.scope === 'slide');
      });
      // page numbers become the PPTX slide number field
      if (inMaster && node.kind === 'text' && node.origin.file === 'theme' && /^\d+$/.test(str(node.props.text, '')) && group.every((s) => str(s.byId.get(node.id)?.props.text, '') === String(s.n))) {
        const f = fontOf(scene, node);
        const c = toColor(str(node.props.color, '#6B7280'));
        slideNumber = { x: inch(node.box.x), y: inch(node.box.y), w: inch(Math.max(node.box.w, 60)), h: inch(node.box.h), fontFace: f.face, fontSize: f.size, align: 'right' };
        if (c) slideNumber.color = c.hex;
        statics.add(node.id);
        continue;
      }
      if (!same || !inMaster) {
        inMaster = false;
        continue;
      }
      const b = node.box;
      if (node.kind === 'rect' && Object.values(node.props).length) {
        const fill = fillProps(node);
        const line = lineProps(node);
        const rp: PptxGenJS.ShapeProps = { x: inch(b.x), y: inch(b.y), w: inch(b.w), h: inch(b.h) };
        if (fill) rp.fill = fill;
        if (line) rp.line = line;
        objects.push({ rect: rp });
        statics.add(node.id);
      } else if (node.kind === 'text') {
        const runs = runsToText(node.runs ?? parseRich(str(node.props.text, '')), str(node.props.color, '#111827'));
        objects.push({ text: { text: runs.map((r) => r.text).join(''), options: ex.textOptions(node) } });
        statics.add(node.id);
      } else if (node.kind === 'image' && str(node.props.src, '')) {
        const data = await ex.asset(str(node.props.src, ''));
        if (data) {
          objects.push({ image: { data, x: inch(b.x), y: inch(b.y), w: inch(b.w), h: inch(b.h) } });
          statics.add(node.id);
        }
      }
      if (!statics.has(node.id)) inMaster = false;
    }
    const bg = toColor(first.background.fill);
    const masterProps: PptxGenJS.SlideMasterProps = { title: key, objects };
    if (bg && group.every((s) => s.background.fill === first.background.fill)) masterProps.background = { color: bg.hex };
    if (slideNumber) masterProps.slideNumber = slideNumber;
    pptx.defineSlideMaster(masterProps);
    masterStatic.set(key, statics);
    masterSlots.set(key, slots);
  }

  for (const s of slides) {
    const key = `${s.master ?? '-'}/${s.layout ?? '-'}`;
    const slide = pptx.addSlide({ masterName: key });
    const bg = toColor(s.background.fill);
    if (bg) slide.background = { color: bg.hex };
    if (s.background.image) {
      const data = await ex.asset(s.background.image);
      if (data) slide.background = { data };
    }
    const statics = masterStatic.get(key) ?? new Set();
    const slots = masterSlots.get(key) ?? new Set();
    for (const node of s.nodes) {
      if (statics.has(node.id)) continue;
      if (node.slot && slots.has(node.id)) {
        if (node.placeholder || node.props.hidden === true) continue;
        if (node.kind === 'image') {
          const data = await ex.asset(str(node.props.src, ''));
          if (data) slide.addImage({ data, placeholder: node.id, x: inch(node.box.x), y: inch(node.box.y), w: inch(node.box.w), h: inch(node.box.h) });
          continue;
        }
        const runs = runsToText(parseRich(str(node.props.text, '')), str(node.props.color, '#111827'));
        slide.addText(runs, { placeholder: node.id });
        continue;
      }
      await ex.addNode(slide, s, node);
    }
    if (s.notes) slide.addNotes(s.notes);
  }
  const out = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return { data: out, log: ex.log };
}
