import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Decks } from '../src/decks.js';
import { FormeEditorProvider } from '../src/editor.js';
import { BROWSER_HOOK_TIMEOUT, launchBrowser } from './browser.js';
import * as vscode from './mock-vscode.js';
import { openDoc, saveDocument, showEditor, state, typeText } from './mock-vscode.js';

// The full Forme editor inside VS Code: the real web app (built with Vite) runs in Chromium as
// the webview, the real extension code runs here against the in-memory VS Code API.

const THEME = `theme "T"
color primary #112233
style h1 size=64 color=$primary
layout content {
  slot @title style=h1 x=100 y=80 w=1600
}
`;
const DECK = `deck "Test"
theme "./theme.forme"

slide @a layout=content {
  fill @title "Hallo"
  rect @box x=100 y=300 w=400 h=200 fill=$primary
  text @t "Text" x=900 y=300 w=500
}
`;

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.svg': 'image/svg+xml' };

let dir = '';
let server: Server;
let browser: Browser | null = null;
let page: Page;
let doc: vscode.MockDocument;
let textEditor: vscode.MockEditor;
let provider: FormeEditorProvider;
const exported: string[] = [];

async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`timeout: ${what}\n--- deck ---\n${doc?.getText()}`);
    await new Promise((r) => setTimeout(r, 30));
  }
}

/** Typed arrays as plain arrays for page.evaluate (the real webview transfers them natively). */
function plain(m: unknown): unknown {
  return JSON.parse(JSON.stringify(m, (_k, v: unknown) => (v instanceof Uint8Array ? Array.from(v) : v)));
}

async function center(id: string): Promise<{ x: number; y: number }> {
  const b = await page.locator(`.slide-svg g[data-id="${id}"]`).first().boundingBox();
  if (!b) throw new Error(`no object ${id}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(id: string, dx: number, dy: number): Promise<void> {
  const c = await center(id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 6 });
  await page.mouse.up();
}

beforeAll(async () => {
  browser = await launchBrowser();
  if (!browser) return;
  dir = mkdtempSync(join(tmpdir(), 'forme-editor-'));
  writeFileSync(join(dir, 'theme.forme'), THEME);
  writeFileSync(join(dir, 'deck.forme'), DECK);
  // build the web app exactly as the extension ships it
  const web = resolve(__dirname, '../../web');
  const vite = join(dirname(createRequire(join(web, 'package.json')).resolve('vite/package.json')), 'bin/vite.js');
  execFileSync(process.execPath, [vite, 'build', '--outDir', join(dir, 'ext/dist/editor'), '--emptyOutDir', '--logLevel', 'error'], { cwd: web });

  server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] as string);
    try {
      const data = readFileSync(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  state.webviewBase = `http://localhost:${port}`;

  provider = new FormeEditorProvider(vscode.Uri.file(join(dir, 'ext')) as never, new Decks(), async (_uri, kind) => {
    exported.push(kind);
  });
  doc = openDoc(join(dir, 'deck.forme'));
  textEditor = showEditor(doc);
  const panel = new vscode.MockPanel('Forme');
  await provider.resolveCustomTextEditor(doc as never, panel as never);

  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.error('webview error:', e.message));
  await page.exposeFunction('__toHost', (m: unknown) => panel.received.fire(m));
  await page.addInitScript(() => {
    const w = window as unknown as { acquireVsCodeApi: unknown; __toHost(m: unknown): void };
    w.acquireVsCodeApi = () => ({ postMessage: (m: unknown) => w.__toHost(m), getState: () => undefined, setState: () => undefined });
  });
  panel.onPost = (m) => void page.evaluate((msg) => window.postMessage(msg, '*'), plain(m) as never).catch(() => undefined);
  // the webview document is served from the same origin as its resources
  writeFileSync(join(dir, 'editor.html'), panel.webview.html);
  await page.goto(`${state.webviewBase}${join(dir, 'editor.html')}`);
  await page.waitForSelector('.slide-svg g[data-id="box"]', { timeout: 30_000 });
}, BROWSER_HOOK_TIMEOUT);

afterAll(async () => {
  await browser?.close();
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
}, BROWSER_HOOK_TIMEOUT);

describe('Forme editor in VS Code', () => {
  it('opens the deck with its theme, without project dialog, code view hidden', async (ctx) => {
    if (!browser) ctx.skip();
    expect(await page.locator('[data-testid="project-dialog"]').count()).toBe(0);
    expect(await page.locator('.code-pane').count()).toBe(0);
    // the theme was read through the extension: the rect is filled with $primary
    expect(await page.locator('.slide-svg g[data-id="box"]').innerHTML()).toContain('#112233');
  });

  it('a drag on the canvas becomes a minimal edit of the VS Code document', async (ctx) => {
    if (!browser) ctx.skip();
    await drag('box', 80, 0);
    await until(() => !doc.getText().includes('rect @box x=100 '), 'drag written');
    const x = Number(/rect @box x=(\d+) y=300 w=400 h=200 fill=\$primary/.exec(doc.getText())?.[1]);
    expect(x).toBeGreaterThan(150);
    // only the number changed
    expect(doc.getText()).toBe(DECK.replace('rect @box x=100 ', `rect @box x=${x} `));
  });

  it('typing in VS Code shows up on the canvas; Ctrl+Z (forme.editor.undo) reverts it', async (ctx) => {
    if (!browser) ctx.skip();
    const before = doc.getText();
    typeText(doc, before.replace('fill=$primary', 'fill=#FF0000'));
    await until(async () => (await page.locator('.slide-svg g[data-id="box"]').innerHTML()).includes('#FF0000'), 'canvas follows the text');
    provider.active()?.post({ type: 'command', command: 'undo' });
    await until(() => doc.getText() === before, 'undo reaches the document');
    await until(async () => (await page.locator('.slide-svg g[data-id="box"]').innerHTML()).includes('#112233'), 'canvas after undo');
  });

  it('selection follows both ways between canvas and text editor', async (ctx) => {
    if (!browser) ctx.skip();
    const c = await center('t');
    await page.mouse.click(c.x, c.y);
    const line = doc.positionAt(doc.getText().indexOf('text @t')).line;
    await until(() => textEditor.selection.start.line === line, 'cursor jumps to the op');
    expect(textEditor.decorations.length).toBeGreaterThan(0);
    textEditor.moveCursor(doc.getText().indexOf('rect @box') + 3);
    await until(async () => (await page.locator('[data-testid="insp-id"]').inputValue().catch(() => '')) === 'box', 'canvas selects the object under the cursor');
  });

  it('theme mode edits the theme document, saving the deck saves both', async (ctx) => {
    if (!browser) ctx.skip();
    provider.active()?.post({ type: 'command', command: 'themeMode' });
    await page.waitForSelector('[data-testid="theme-mode"].active');
    await drag('title', 0, 30);
    const theme = openDoc(join(dir, 'theme.forme'));
    await until(() => !theme.getText().includes('slot @title style=h1 x=100 y=80 '), 'theme edited');
    expect(doc.getText()).not.toContain('set @title');
    provider.active()?.post({ type: 'command', command: 'themeMode' });
    await saveDocument(doc);
    expect(readFileSync(join(dir, 'theme.forme'), 'utf8')).toBe(theme.getText());
    expect(readFileSync(join(dir, 'deck.forme'), 'utf8')).toBe(doc.getText());
  });

  it('exports through the extension', async (ctx) => {
    if (!browser) ctx.skip();
    await page.locator('[data-testid="export"]').selectOption('pptx');
    await until(() => exported.includes('pptx'), 'export requested');
  });

  it('refuses files outside the project', async (ctx) => {
    if (!browser) ctx.skip();
    const res = await page.evaluate(
      () =>
        new Promise((resolve) => {
          window.addEventListener('message', (e: MessageEvent<{ type: string; id: number; ok: boolean }>) => {
            if (e.data.type === 'response' && e.data.id === 99999) resolve(e.data.ok);
          });
          (window as unknown as { __toHost(m: unknown): void }).__toHost({ type: 'request', id: 99999, op: 'readText', path: '../../etc/passwd' });
        }),
    );
    expect(res).toBe(false);
  });
});
