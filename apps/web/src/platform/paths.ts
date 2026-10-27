/** Project-relative POSIX paths ("deck.forme", "themes/a.forme"). The project root is the boundary. */

/** Normalize a path inside the project; null if it leaves the project root. */
export function normalizePath(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Resolve a path as written in a file (relative to that file) to a project path. */
export function resolveFrom(fromFile: string, rel: string): string | null {
  if (/^[a-z]+:/i.test(rel)) return null;
  if (rel.startsWith('/')) return normalizePath(rel);
  const dir = dirOf(fromFile);
  return normalizePath(dir ? `${dir}/${rel}` : rel);
}

/** Path of `target` as written in `fromFile` (e.g. "./img/a.png"). */
export function relativeTo(fromFile: string, target: string): string {
  const from = dirOf(fromFile).split('/').filter(Boolean);
  const to = target.split('/').filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  const up = from.length - i;
  const rest = to.slice(i).join('/');
  return up ? `${'../'.repeat(up)}${rest}` : `./${rest}`;
}

export function mimeOf(path: string): string {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase();
  const map: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    forme: 'text/plain;charset=utf-8',
  };
  return map[ext] ?? 'application/octet-stream';
}
