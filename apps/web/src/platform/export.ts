import type { DeckScene } from '@forme/core';
import { exportPptx } from '@forme/export';
import type { ExportLogEntry } from '@forme/export';
import { renderDeckHtml } from '@forme/render';

/** Rasterize an SVG string to PNG with a canvas (for effects PPTX cannot express). */
export async function rasterizeSvg(svg: string, width: number, height: number): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Rastern fehlgeschlagen');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PDF through the browser's print dialog ("Als PDF speichern"). The pages are the same
 * SVGs as in the editor, so the result matches it exactly and stays vector-based.
 */
export async function printPdf(scene: DeckScene, resolveAsset: (p: string) => string): Promise<void> {
  const html = renderDeckHtml(scene, { resolveAsset });
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.srcdoc = html;
    });
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) throw new Error('Druckansicht konnte nicht erstellt werden');
    await doc.fonts.ready;
    await Promise.all(
      Array.from(doc.querySelectorAll('image')).map(
        (el) =>
          new Promise<void>((res) => {
            const href = el.getAttribute('href') ?? '';
            if (!href) return res();
            const probe = new Image();
            probe.onload = probe.onerror = () => res();
            probe.src = href;
          }),
      ),
    );
    win.focus();
    win.print();
  } finally {
    // print() blocks until the dialog closes in Chrome/Firefox; Safari returns early
    setTimeout(() => frame.remove(), 1000);
  }
}

export async function buildPptx(scene: DeckScene, loadAsset: (p: string) => Promise<Uint8Array | null>): Promise<{ blob: Blob; log: ExportLogEntry[] }> {
  const res = await exportPptx(scene, { loadAsset, rasterize: rasterizeSvg });
  const blob = new Blob([res.data.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  return { blob, log: res.log };
}
