import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from '@forme/core';
import type { Template } from '@forme/core';

/** Folder with the example files: next to the bundled CLI (`templates/`), or the repository's `examples/`. */
export function templateRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.FORME_TEMPLATES, join(here, 'templates'), resolve(here, '../../../examples')];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
