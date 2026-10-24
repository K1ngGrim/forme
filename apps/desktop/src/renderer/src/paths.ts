/** Minimal path helpers for the renderer (no Node APIs available). */

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\');
}

export function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i > 0 ? p.slice(0, i) : p.startsWith('/') ? '/' : '.';
}

export function joinPath(base: string, rel: string): string {
  if (isAbsolutePath(rel)) return rel;
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  const parts = base.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join(sep) || sep;
}
