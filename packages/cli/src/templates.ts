import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW_DECK_SOURCE, pathInTemplate, TEMPLATES } from '@forme/core';
import type { Template } from '@forme/core';

/** Folder with the example files: next to the bundled CLI (`templates/`), or the repository's `examples/`. */
export function templateRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.FORME_TEMPLATES, join(here, 'templates'), resolve(here, '../../../examples')];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

async function walk(dir: string, root: string, out: string[]): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, root, out);
    else out.push(relative(root, p).split('\\').join('/'));
  }
  return out;
}

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Copy a template into a folder. Existing files are never overwritten. */
export async function writeTemplate(t: Template, target: string): Promise<{ written: string[]; skipped: string[] }> {
  const files = new Map<string, string>();
  const root = templateRoot();
  if (t.dir !== null) {
    if (!root) throw new Error('Vorlagen nicht gefunden (FORME_TEMPLATES setzen)');
    for (const rel of await walk(root, root, [])) {
      const p = pathInTemplate(t, rel);
      if (p) files.set(p, join(root, rel));
    }
  }
  const written: string[] = [];
  const skipped: string[] = [];
  const put = async (rel: string, data: string | Buffer): Promise<void> => {
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
