import type { ProjectFS } from './fs.js';
import { mimeOf } from './paths.js';

/**
 * Images and fonts of the project as blob: URLs. Rendering is synchronous, so URLs are
 * loaded on first use; when a batch is ready the listener triggers a re-render.
 */
const urls = new Map<string, string>();
const loading = new Map<string, Promise<void>>();
let owner: ProjectFS | null = null;
let listener: (() => void) | null = null;
let notifyScheduled = false;

export function onAssetsLoaded(cb: () => void): void {
  listener = cb;
}

export function resetAssets(fs: ProjectFS | null): void {
  for (const u of urls.values()) if (u) URL.revokeObjectURL(u);
  urls.clear();
  loading.clear();
  owner = fs;
}

export function invalidateAsset(path: string): void {
  const u = urls.get(path);
  if (u) URL.revokeObjectURL(u);
  urls.delete(path);
  loading.delete(path);
}

function load(path: string): Promise<void> {
  const existing = loading.get(path);
  if (existing) return existing;
  const fs = owner;
  const p = (async () => {
    const bytes = fs ? await fs.readBytes(path) : null;
    if (fs !== owner) return;
    urls.set(path, bytes ? URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeOf(path) })) : '');
    if (!notifyScheduled) {
      notifyScheduled = true;
      setTimeout(() => {
        notifyScheduled = false;
        listener?.();
      }, 0);
    }
  })();
  loading.set(path, p);
  return p;
}

/** URL of a project file, or '' while it is loading (or missing). */
export function assetUrl(path: string): string {
  const u = urls.get(path);
  if (u !== undefined) return u;
  void load(path);
  return '';
}

/** Load all given project files before an export. */
export async function prepareAssets(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => load(p)));
}
