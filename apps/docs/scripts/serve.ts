// Local docs server: builds once, serves dist/ (default http://localhost:4174/) and rebuilds
// when the Markdown sources or the docs app change.
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocs } from './build.js';

const app = resolve(fileURLToPath(import.meta.url), '../..');
const out = join(app, 'dist');
const port = Number(process.env.PORT ?? 4174);
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

async function rebuild(): Promise<void> {
  const t = Date.now();
  try {
    const r = await buildDocs(out);
    console.log(`${r.pages} Seiten, ${r.rendered}/${r.examples} Beispiele gerendert (${Date.now() - t} ms)`);
  } catch (e) {
    console.error(`Build fehlgeschlagen: ${(e as Error).message}`);
  }
}

await rebuild();
let timer: ReturnType<typeof setTimeout> | null = null;
for (const dir of [join(app, '../../docs'), join(app, 'src'), join(app, 'src/client')]) {
  watch(dir, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 150);
  });
}

createServer((req, res) => {
  void (async () => {
    let path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] as string)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    const file = join(out, path);
    try {
      const s = await stat(file);
      const target = s.isDirectory() ? join(file, 'index.html') : file;
      res.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
      res.end(await readFile(target));
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Nicht gefunden');
    }
  })();
}).listen(port, () => console.log(`Dokumentation: http://localhost:${port}/`));
