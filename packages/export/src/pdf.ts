import type { DeckScene } from '@forme/core';
import { renderDeckHtml } from '@forme/render';

/** Turns a printable HTML document into PDF bytes (Electron printToPDF or headless Chromium). */
export type HtmlPrinter = (html: string, size: { width: number; height: number }) => Promise<Uint8Array>;

/** Export all visible slides to PDF. Uses the same SVG as the editor, so output matches pixel for pixel. */
export async function exportPdf(scene: DeckScene, print: HtmlPrinter, resolveAsset?: (p: string) => string): Promise<Uint8Array> {
  const html = renderDeckHtml(scene, resolveAsset ? { resolveAsset } : {});
  return print(html, { width: scene.width, height: scene.height });
}
