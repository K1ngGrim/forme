import { NEW_DECK_SOURCE, pathInTemplate } from '@forme/core';
import type { Template } from '@forme/core';

export { TEMPLATES } from '@forme/core';
export type { Template } from '@forme/core';

/** Templates shipped with the app: the folders under /examples, bundled at build time. */

const texts = import.meta.glob<string>(['../../../../examples/**/*.forme'], { query: '?raw', import: 'default', eager: true });
const binaries = import.meta.glob<string>(['../../../../examples/**/*.{woff,woff2,ttf,otf,png,jpg,jpeg,svg,gif,webp}', '!**/__golden__/**'], {
  query: '?url',
  import: 'default',
  eager: true,
});

const PREFIX = '../../../../examples/';

/** All files of a template, ready to be written into a new project. */
export async function templateFiles(t: Template): Promise<Record<string, string | Uint8Array>> {
  if (t.dir === null) return { [t.deck]: NEW_DECK_SOURCE };
  const out: Record<string, string | Uint8Array> = {};
  for (const [key, text] of Object.entries(texts)) {
    const p = pathInTemplate(t, key.slice(PREFIX.length));
    if (p) out[p] = text;
  }
  await Promise.all(
    Object.entries(binaries).map(async ([key, url]) => {
      const p = pathInTemplate(t, key.slice(PREFIX.length));
      if (!p) return;
      const res = await fetch(url);
      out[p] = new Uint8Array(await res.arrayBuffer());
    }),
  );
  return out;
}
