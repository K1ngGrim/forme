import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DeckScene, Document, ImageSize, TextMeasurer } from '@forme/core';
import { collectImagePaths, evaluate, imageSize, parse, themePathOf } from '@forme/core';
import type { LoadedFont } from '@forme/render';
import { createFontMeasurer } from '@forme/render';

export interface LoadedDeck {
  deckPath: string;
  baseDir: string;
  deck: Document;
  theme: Document | null;
  themePath: string | null;
  scene: DeckScene;
  measurer: TextMeasurer;
  /** Resolve a path as written in the deck to an absolute file path. */
  resolvePath: (p: string) => string;
  /** Resolve a path as written in the deck to a file:// URL. */
  resolveUrl: (p: string) => string;
}

async function tryRead(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

/** Load a deck from disk: theme, fonts and image sizes included. */
export async function loadDeck(deckPath: string): Promise<LoadedDeck> {
  const abs = resolve(deckPath);
  const baseDir = dirname(abs);
  const source = await readFile(abs, 'utf8');
  const deck = parse(source);
  const rel = themePathOf(deck);
  const themeAbs = rel ? resolve(baseDir, rel) : null;
  const theme = themeAbs ? parse(await readFile(themeAbs, 'utf8')) : null;
  const themeDir = themeAbs ? dirname(themeAbs) : baseDir;
  const resolvePath = (p: string): string => (isAbsolute(p) ? p : resolve(baseDir, p));
  // first pass: discover fonts and images
  let scene = evaluate(deck, { theme });
  const fonts: LoadedFont[] = [];
  for (const f of scene.theme.fonts) {
    if (!f.file) continue;
    const data = await tryRead(resolve(themeDir, f.file));
    if (data) fonts.push({ family: f.family, weight: f.weight, italic: f.italic, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
  }
  const measurer = createFontMeasurer(fonts);
  const paths = new Set<string>();
  for (const s of scene.slides) collectImagePaths(s.nodes, paths);
  const imageSizes: Record<string, ImageSize> = {};
  for (const p of paths) {
    const bytes = await tryRead(resolvePath(p));
    const size = bytes ? imageSize(bytes) : null;
    if (size) imageSizes[p] = size;
  }
  scene = evaluate(deck, { theme, measurer, imageSizes });
  // theme font files are relative to the theme file
  const resolveUrl = (p: string): string => {
    if (/^(https?|data|file):/.test(p)) return p;
    const isFont = scene.theme.fonts.some((f) => f.file === p);
    return pathToFileURL(isFont ? resolve(themeDir, p) : resolvePath(p)).href;
  };
  return { deckPath: abs, baseDir, deck, theme, themePath: themeAbs, scene, measurer, resolvePath, resolveUrl };
}
