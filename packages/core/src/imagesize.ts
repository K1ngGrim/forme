import type { ImageSize } from './evaluator.js';

function be16(b: Uint8Array, i: number): number {
  return ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
}

function be32(b: Uint8Array, i: number): number {
  return (((b[i] ?? 0) << 24) >>> 0) + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0);
}

/** Read natural image dimensions from PNG, JPEG, GIF, WebP or SVG bytes. Pure. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: be32(b, 16), h: be32(b, 20) };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: (b[6] ?? 0) | ((b[7] ?? 0) << 8), h: (b[8] ?? 0) | ((b[9] ?? 0) << 8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1] ?? 0;
      const len = be16(b, i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: be16(b, i + 7), h: be16(b, i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) {
    // WebP VP8X / VP8 / VP8L
    const chunk = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
    if (chunk === 'VP8X') return { w: 1 + ((b[24] ?? 0) | ((b[25] ?? 0) << 8) | ((b[26] ?? 0) << 16)), h: 1 + ((b[27] ?? 0) | ((b[28] ?? 0) << 8) | ((b[29] ?? 0) << 16)) };
    if (chunk === 'VP8 ') return { w: be16(new Uint8Array([b[27] ?? 0, b[26] ?? 0]), 0) & 0x3fff, h: be16(new Uint8Array([b[29] ?? 0, b[28] ?? 0]), 0) & 0x3fff };
    if (chunk === 'VP8L') {
      const v = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
      return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // SVG: look at the first kilobytes as text
  let head = '';
  for (let i = 0; i < Math.min(b.length, 4096); i++) head += String.fromCharCode(b[i] ?? 0);
  const svg = /<svg\b[^>]*>/i.exec(head)?.[0];
  if (svg) {
    const w = /\bwidth="([\d.]+)(px)?"/.exec(svg);
    const h = /\bheight="([\d.]+)(px)?"/.exec(svg);
    if (w && h) return { w: Number(w[1]), h: Number(h[1]) };
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
  }
  return null;
}

/** Image paths referenced by a scene (for preloading sizes). */
export function collectImagePaths(nodes: { kind: string; props: Record<string, unknown>; children: unknown[] }[], out: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    if (n.kind === 'image' && typeof n.props.src === 'string' && n.props.src) out.add(n.props.src);
    collectImagePaths(n.children as typeof nodes, out);
  }
  return out;
}
