import type { DeckScene } from '@forme/core';
import { deckPageSize, renderDeckHtml } from '@forme/render';

/** Turns a printable HTML document into PDF bytes (Electron printToPDF or headless Chromium). */
export type HtmlPrinter = (html: string, size: { width: number; height: number }) => Promise<Uint8Array>;

/**
 * Export all visible slides to PDF. Uses the same SVG as the editor, so output matches pixel for
 * pixel. With `notes`, every page holds the slide and its speaker notes side by side (pympress).
 */
export async function exportPdf(scene: DeckScene, print: HtmlPrinter, resolveAsset?: (p: string) => string, opts: { notes?: boolean } = {}): Promise<Uint8Array> {
  const o = { ...(resolveAsset ? { resolveAsset } : {}), ...(opts.notes ? { notes: true } : {}) };
  return print(renderDeckHtml(scene, o), deckPageSize(scene, o));
}
