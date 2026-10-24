#!/usr/bin/env -S npx tsx
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { renderDeckHtml, renderSlideSvg } from '@forme/render';
import { ChromiumSession } from './chromium.js';
import { loadDeck } from './load.js';
import { pptxToOdp } from './odp.js';
import { exportPdf } from './pdf.js';
import { exportPptx } from './pptx.js';

const USAGE = `Forme CLI

  forme render <deck.forme> --out <datei.pdf|.pptx|.odp|.html|.svg> [--slide <id>]
  forme check <deck.forme>

Bei .svg wird nur eine Folie gerendert (Standard: die erste).`;

function lineCol(src: string, offset: number): string {
  const before = src.slice(0, offset);
  const line = before.split('\n').length;
  return `${line}:${offset - before.lastIndexOf('\n')}`;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, file, ...rest] = argv;
  if (!cmd || !file || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return cmd ? 0 : 1;
  }
  const opt = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  // pnpm runs scripts from the workspace root; resolve paths against the caller's directory
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const loaded = await loadDeck(resolve(cwd, file));
  const { scene } = loaded;
  const deckSrc = loaded.deck.source;
  const themeSrc = loaded.themePath ? await readFile(loaded.themePath, 'utf8') : '';
  let errors = 0;
  for (const d of scene.diagnostics) {
    const src = d.file === 'theme' ? themeSrc : deckSrc;
    const where = d.file === 'theme' ? loaded.themePath ?? 'theme' : loaded.deckPath;
    if (d.severity === 'error') errors++;
    console.error(`${where}:${lineCol(src, d.span.start)} ${d.severity === 'error' ? 'Fehler' : 'Warnung'}: ${d.message}`);
  }
  if (cmd === 'check') {
    console.log(`${scene.slides.length} Folien, ${errors} Fehler`);
    return errors ? 1 : 0;
  }
  if (cmd !== 'render') {
    console.error(USAGE);
    return 1;
  }
  const outArg = opt('--out');
  if (!outArg) {
    console.error('--out fehlt');
    return 1;
  }
  const out = resolve(cwd, outArg);
  const ext = extname(out).toLowerCase();
  const chromium = new ChromiumSession();
  try {
    if (ext === '.svg') {
      const id = opt('--slide');
      const slide = id ? scene.slides.find((s) => s.id === id) : scene.slides[0];
      if (!slide) throw new Error(`Folie „${id ?? ''}“ nicht gefunden`);
      await writeFile(out, renderSlideSvg(scene, slide, { resolveAsset: loaded.resolveUrl, embedFonts: true }));
    } else if (ext === '.html') {
      await writeFile(out, renderDeckHtml(scene, { resolveAsset: loaded.resolveUrl }));
    } else if (ext === '.pdf') {
      await writeFile(out, await exportPdf(scene, chromium.print, loaded.resolveUrl));
    } else if (ext === '.pptx' || ext === '.odp') {
      const res = await exportPptx(scene, {
        loadAsset: async (p) => {
          try {
            return new Uint8Array(await readFile(loaded.resolvePath(p)));
          } catch {
            return null;
          }
        },
        rasterize: chromium.rasterize,
      });
      for (const l of res.log) console.error(`Export [${l.slide}${l.id ? ` @${l.id}` : ''}]: ${l.message}`);
      await writeFile(out, ext === '.odp' ? await pptxToOdp(res.data) : res.data);
    } else {
      throw new Error(`Unbekanntes Ausgabeformat „${ext}“`);
    }
    console.log(`Geschrieben: ${resolve(out)}`);
  } finally {
    await chromium.close();
  }
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  },
);
