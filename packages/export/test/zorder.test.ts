import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '@forme/core';
import { exportPptx } from '../src/index.js';
import { loadDeck } from '../src/node.js';

/** Fill colors in drawing order of one part of the PPTX. */
function fills(files: Record<string, Uint8Array>, part: string): string[] {
  const xml = strFromU8(files[part] as Uint8Array);
  return [...xml.matchAll(/<a:solidFill><a:srgbClr val="(\w+)"/g)].map((m) => m[1] as string);
}

async function pptxFiles(src: string, theme: string): Promise<Record<string, Uint8Array>> {
  const scene = evaluate(parse(src), { theme: parse(theme) });
  const res = await exportPptx(scene, { loadAsset: async () => null });
  return unzipSync(res.data);
}

describe('pptx z-order', () => {
  it('keeps master objects above shapes that cannot live in a PowerPoint master', async () => {
    const theme = [
      'theme "T"',
      'master default',
      '  rect @under x=0 y=0 w=100 h=100 fill=#111111', // bottom-most: may stay in the master
      '  ellipse @ring x=0 y=0 w=500 h=500 fill=#222222', // ellipses cannot be master objects
      '  rect @bar x=0 y=1000 w=1920 h=80 fill=#333333', // above the ellipse: must not go below it
      'layout content master=default',
      '  slot @title x=100 y=100',
    ].join('\n');
    const files = await pptxFiles('deck "x"\nslide @a layout=content\n  fill @title "Hallo"\n  rect @own fill=#444444\n', theme);
    const layout = Object.keys(files).filter((f) => /slideLayouts\/slideLayout\d+\.xml$/.test(f)).flatMap((f) => fills(files, f));
    expect(layout).toContain('111111');
    expect(layout).not.toContain('333333');
    const slide = fills(files, 'ppt/slides/slide1.xml');
    expect(slide.indexOf('222222')).toBeGreaterThanOrEqual(0);
    expect(slide.indexOf('222222')).toBeLessThan(slide.indexOf('333333'));
    expect(slide.indexOf('333333')).toBeLessThan(slide.indexOf('444444'));
  });

  it('draws the seminar footer above the radio towers', async () => {
    const loaded = await loadDeck(resolve(__dirname, '../../../examples/hka-seminar/deck.forme'));
    const res = await exportPptx(loaded.scene, {
      loadAsset: async (p) => {
        try {
          return new Uint8Array(await readFile(loaded.resolvePath(p)));
        } catch {
          return null;
        }
      },
    });
    const files = unzipSync(res.data);
    const slide = fills(files, 'ppt/slides/slide2.xml');
    const lastRing = Math.max(slide.lastIndexOf('F5F1F7'), slide.lastIndexOf('CDBCDB'), slide.lastIndexOf('575757'));
    expect(lastRing).toBeGreaterThan(0);
    expect(slide.indexOf('64378C')).toBeGreaterThan(lastRing);
    expect(slide.indexOf('CFCFCF')).toBeGreaterThan(lastRing);
  });
});
