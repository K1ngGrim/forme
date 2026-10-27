import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { renderDeckHtml, renderSlideSvg } from '@forme/render';
import type { ChromiumSession } from './chromium.js';
import type { LoadedDeck } from './load.js';
import { pptxToOdp } from './odp.js';
import { exportPdf } from './pdf.js';
import { exportPptx } from './pptx.js';

export const OUTPUT_FORMATS = ['pdf', 'pptx', 'odp', 'html', 'svg'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export function formatOf(path: string): OutputFormat | null {
  const ext = extname(path).slice(1).toLowerCase();
  return (OUTPUT_FORMATS as readonly string[]).includes(ext) ? (ext as OutputFormat) : null;
}

export interface OutputOptions {
  /** Only this slide (SVG). Without it, SVG renders the first slide, or every slide if the path contains `{n}`. */
  slide?: string;
}

export interface OutputResult {
  /** Files written. */
  files: string[];
  /** Export notes (e.g. rasterized effects in PPTX). */
  log: string[];
}

/** Write a loaded deck to disk. The format follows the file extension. */
export async function writeOutput(loaded: LoadedDeck, out: string, chromium: ChromiumSession, opts: OutputOptions = {}): Promise<OutputResult> {
  const { scene } = loaded;
  const format = formatOf(out);
  if (!format) throw new Error(`Unbekanntes Ausgabeformat „${extname(out) || out}“ (möglich: ${OUTPUT_FORMATS.join(', ')})`);
  await mkdir(dirname(out), { recursive: true });
  const log: string[] = [];
  const files: string[] = [];
  const write = async (path: string, data: string | Uint8Array): Promise<void> => {
    await writeFile(path, data);
    files.push(path);
  };
  if (format === 'svg') {
    const visible = scene.slides.filter((s) => !s.hidden);
    let slides = visible.slice(0, 1);
    if (opts.slide) {
      const slide = scene.slides.find((s) => s.id === opts.slide);
      if (!slide) throw new Error(`Folie „@${opts.slide}“ nicht gefunden`);
      slides = [slide];
    } else if (out.includes('{n}')) slides = visible;
    if (!slides.length) throw new Error('Die Präsentation hat keine Folien');
    for (const slide of slides) {
      const path = out.replaceAll('{n}', String(slide.n).padStart(String(visible.length).length, '0'));
      await write(path, renderSlideSvg(scene, slide, { resolveAsset: loaded.resolveUrl, embedFonts: true }));
    }
  } else if (format === 'html') {
    await write(out, renderDeckHtml(scene, { resolveAsset: loaded.resolveUrl }));
  } else if (format === 'pdf') {
    await write(out, await exportPdf(scene, chromium.print, loaded.resolveUrl));
  } else {
    const res = await exportPptx(scene, {
      loadAsset: async (p) => {
        try {
          return new Uint8Array(await readFile(loaded.resolveFile(p)));
        } catch {
          return null;
        }
      },
      rasterize: chromium.rasterize,
    });
    for (const l of res.log) log.push(`[${l.slide}${l.id ? ` @${l.id}` : ''}] ${l.message}`);
    await write(out, format === 'odp' ? await pptxToOdp(res.data) : res.data);
  }
  return { files, log };
}
