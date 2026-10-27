import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { NEW_DECK_SOURCE, pathInTemplate } from '@forme/core';
import type { Template } from '@forme/core';

async function walk(dir: string, root: string, out: string[]): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, root, out);
    else out.push(relative(root, p).split('\\').join('/'));
  }
  return out;
}

/**
 * Copy a template into a folder. `root` is the folder with the example files (the repository's
 * `examples/` or a bundled copy). Existing files are never overwritten.
 */
export async function writeTemplate(t: Template, root: string | null, target: string): Promise<{ written: string[]; skipped: string[] }> {
  const files = new Map<string, string>();
  if (t.dir !== null) {
    if (!root || !existsSync(root)) throw new Error('Vorlagen nicht gefunden');
    for (const rel of await walk(root, root, [])) {
      const p = pathInTemplate(t, rel);
      if (p) files.set(p, join(root, rel));
    }
  }
  const written: string[] = [];
  const skipped: string[] = [];
  const put = async (rel: string, data: string | Uint8Array): Promise<void> => {
    const path = join(target, rel);
    if (existsSync(path)) {
      skipped.push(rel);
      return;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    written.push(rel);
  };
  if (t.dir === null) await put(t.deck, NEW_DECK_SOURCE);
  for (const [rel, src] of [...files].sort(([a], [b]) => a.localeCompare(b))) await put(rel, await readFile(src));
  return { written, skipped };
}
