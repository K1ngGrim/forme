import { readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DeckScene, Document, EvalCache, ImageSize, TextMeasurer } from '@forme/core';
import { collectImagePaths, createEvalCache, evaluate, imageSize, parse, themePathOf } from '@forme/core';
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
  /** Like resolvePath, but theme font files resolve against the theme folder. */
  resolveFile: (p: string) => string;
  /** Every file the scene was built from (deck, theme, fonts, images), for watching. */
  dependencies: string[];
  /** Resolve a path as written in the deck to a file:// URL. */
  resolveUrl: (p: string) => string;
}

/** Keeps fonts, image sizes and slide evaluations between loads (watch mode, editors). */
export interface LoadCache {
  files: Map<string, { mtime: number; data: Uint8Array | null }>;
  measurers: Map<string, TextMeasurer>;
  evalCache: EvalCache;
}

export function createLoadCache(): LoadCache {
  return { files: new Map(), measurers: new Map(), evalCache: createEvalCache() };
}

async function tryRead(path: string, cache?: LoadCache): Promise<Uint8Array | null> {
  try {
    if (!cache) return new Uint8Array(await readFile(path));
    const mtime = (await stat(path)).mtimeMs;
    const hit = cache.files.get(path);
    if (hit && hit.mtime === mtime) return hit.data;
    const data = new Uint8Array(await readFile(path));
    cache.files.set(path, { mtime, data });
    return data;
  } catch {
    return null;
  }
}

export interface LoadOverrides {
  /** In-memory deck source (e.g. unsaved editor state). */
  deckSource?: string;
  /** In-memory theme source. */
  themeSource?: string | null;
  /** Reuse fonts, image sizes and slide evaluations from earlier loads. */
  cache?: LoadCache;
}

/** Load a deck from disk: theme, fonts and image sizes included. */
export async function loadDeck(deckPath: string, over: LoadOverrides = {}): Promise<LoadedDeck> {
  const abs = resolve(deckPath);
  const baseDir = dirname(abs);
  const source = over.deckSource ?? (await readFile(abs, 'utf8'));
  const deck = parse(source);
  const rel = themePathOf(deck);
  const themeAbs = rel ? resolve(baseDir, rel) : null;
  const themeSrc = themeAbs ? (over.themeSource ?? (await readFile(themeAbs, 'utf8'))) : null;
  const theme = themeSrc !== null ? parse(themeSrc) : null;
  const themeDir = themeAbs ? dirname(themeAbs) : baseDir;
  const resolvePath = (p: string): string => (isAbsolute(p) ? p : resolve(baseDir, p));
  const cache = over.cache;
  const evaluateWith = (extra: { measurer?: TextMeasurer; imageSizes?: Record<string, ImageSize> }): DeckScene =>
    evaluate(deck, { theme, ...extra, ...(cache ? { cache: cache.evalCache } : {}) });
  // first pass: discover fonts and images
  let scene = evaluate(deck, { theme });
  const dependencies = [abs, ...(themeAbs ? [themeAbs] : [])];
  const fonts: LoadedFont[] = [];
  const fontKey: string[] = [];
  for (const f of scene.theme.fonts) {
    if (!f.file) continue;
    const path = resolve(themeDir, f.file);
    dependencies.push(path);
    const data = await tryRead(path, cache);
    if (!data) continue;
    fonts.push({ family: f.family, weight: f.weight, italic: f.italic, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
    fontKey.push(`${f.family}|${f.weight}|${f.italic}|${path}|${cache?.files.get(path)?.mtime ?? ''}`);
  }
  let measurer = cache?.measurers.get(fontKey.join('\n'));
  if (!measurer) {
    measurer = createFontMeasurer(fonts);
    if (cache) {
      cache.measurers.clear();
      cache.measurers.set(fontKey.join('\n'), measurer);
    }
  }
  const paths = new Set<string>();
  for (const s of scene.slides) collectImagePaths(s.nodes, paths);
  for (const s of scene.slides) if (s.background.image && !/^(https?|data):/.test(s.background.image)) dependencies.push(resolvePath(s.background.image));
  const imageSizes: Record<string, ImageSize> = {};
  for (const p of paths) {
    if (/^(https?|data):/.test(p)) continue;
    dependencies.push(resolvePath(p));
    const bytes = await tryRead(resolvePath(p), cache);
    const size = bytes ? imageSize(bytes) : null;
    if (size) imageSizes[p] = size;
  }
  scene = evaluateWith({ measurer, imageSizes });
  // theme font files are relative to the theme file
  const resolveFile = (p: string): string => {
    const isFont = scene.theme.fonts.some((f) => f.file === p);
    return isFont && !isAbsolute(p) ? resolve(themeDir, p) : resolvePath(p);
  };
  const resolveUrl = (p: string): string => (/^(https?|data|file):/.test(p) ? p : pathToFileURL(resolveFile(p)).href);
  return { deckPath: abs, baseDir, deck, theme, themePath: themeAbs, scene, measurer, resolvePath, resolveFile, resolveUrl, dependencies };
}
