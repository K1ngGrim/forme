import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import type { Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HostMessage, PreviewSlide } from '../src/protocol.js';
import { BROWSER_HOOK_TIMEOUT, launchBrowser } from './browser.js';
import * as vscode from './mock-vscode.js';
import { openDoc, showEditor, state, typeText } from './mock-vscode.js';


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
  text @t "Text" x=600 y=300 w=500
}
`;

let dir = '';
let ext = '';
const deckPath = (): string => join(dir, 'deck.forme');
const until = async (cond: () => boolean, ms = 4000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timeout; deck:\n${state.docs[0]?.getText() ?? ''}\nmessages: ${state.messages.join(' | ')}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'forme-vscode-'));
  writeFileSync(join(dir, 'theme.forme'), THEME);
  writeFileSync(join(dir, 'deck.forme'), DECK);
  // a minimal extension folder: the webview script and its stylesheet
  ext = join(dir, 'ext');
  mkdirSync(join(ext, 'media'), { recursive: true });
  cpSync(resolve(__dirname, '../media/preview.css'), join(ext, 'media/preview.css'));
  buildSync({ entryPoints: [resolve(__dirname, '../media/preview.ts')], outfile: join(ext, 'dist/preview.js'), bundle: true, format: 'iife', logLevel: 'error' });
  const { activate } = await import('../src/extension.js');
  activate({ subscriptions: [], extensionUri: vscode.Uri.file(ext) } as never);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Source with a line added at the end of the last slide block. */
function inSlide(src: string, line: string): string {
  return src.replace(/\}\n*$/, `${line}}\n`);
}

describe('extension', () => {

  type P<T> = { [k: string]: (...a: unknown[]) => T };

  it('publishes diagnostics while typing (deck and theme)', async () => {
    const doc = openDoc(deckPath());
    showEditor(doc);
    await until(() => state.diagnostics.get(deckPath())?.length === 0);
    typeText(doc, inSlide(DECK, '  rect @x like=@nope\n'));
    await until(() => (state.diagnostics.get(deckPath())?.length ?? 0) > 0);
    expect(state.diagnostics.get(deckPath())?.[0]?.message).toContain('@nope');
    typeText(doc, DECK);
    await until(() => state.diagnostics.get(deckPath())?.length === 0);
    // errors in the theme show up in the theme file, also while it is only open (unsaved)
    const theme = openDoc(join(dir, 'theme.forme'));
    typeText(theme, `${THEME}style h2 size=64 color=$nope\n`);
    await until(() => (state.diagnostics.get(join(dir, 'theme.forme'))?.length ?? 0) > 0);
    expect(state.diagnostics.get(join(dir, 'theme.forme'))?.[0]?.range.start.line).toBe(6);
    typeText(theme, THEME);
    await until(() => state.diagnostics.get(join(dir, 'theme.forme'))?.length === 0);
  });

  it('outline, definition in the theme, completion, hover, rename', async () => {
    const doc = openDoc(deckPath());
    const symbols = (state.providers.symbols as P<{ name: string }[]>).provideDocumentSymbols?.(doc) ?? [];
    expect(symbols.map((s) => s.name)).toEqual(['Test', '@a']);

    const title = doc.positionAt(DECK.indexOf('@title') + 1);
    const defs = (await (state.providers.definition as P<Promise<{ uri: { fsPath: string }; range: vscode.Range }[]>>).provideDefinition?.(doc, title)) ?? [];
    expect(defs[0]?.uri.fsPath).toBe(join(dir, 'theme.forme'));
    expect(defs[0]?.range.start.line).toBe(4);

    const line = DECK.split('\n').length - 2;
    typeText(doc, inSlide(DECK, '  rect @n fi\n'));
    const items = (await (state.providers.completion as P<Promise<{ label: string }[]>>).provideCompletionItems?.(doc, new vscode.Position(line, 13))) ?? [];
    expect(items.map((i) => i.label)).toContain('fill=');
    typeText(doc, inSlide(DECK, '  rect @n fill=$\n'));
    const tokens = (await (state.providers.completion as P<Promise<{ label: string }[]>>).provideCompletionItems?.(doc, new vscode.Position(line, 17))) ?? [];
    expect(tokens.map((i) => i.label)).toContain('$primary');
    typeText(doc, DECK);
    await until(() => state.diagnostics.get(deckPath())?.length === 0);

    const hover = (await (state.providers.hover as P<Promise<{ contents: { value: string } } | null>>).provideHover?.(doc, doc.positionAt(DECK.indexOf('@box') + 1))) ?? null;
    expect(hover?.contents.value).toContain('x 100 · y 300 · w 400 · h 200');

    const we = (await (state.providers.rename as P<Promise<vscode.WorkspaceEdit>>).provideRenameEdits?.(doc, doc.positionAt(DECK.indexOf('@box') + 1), 'kasten')) as vscode.WorkspaceEdit;
    expect(we.edits.map((e) => e.text)).toEqual(['@kasten']);
  });

  it('preview: scene, gestures become text edits, selection follows both ways', async () => {
    const doc = openDoc(deckPath());
    const editor = state.editors[0] as vscode.MockEditor;
    await state.commands['forme.openPreviewToSide']?.();
    const panel = state.panels[0] as vscode.MockPanel;
    expect(panel.webview.html).toContain('preview.js');

    panel.received.fire({ type: 'ready' });
    await until(() => panel.posted.some((m) => (m as HostMessage).type === 'scene'));
    const scene = panel.posted.find((m) => (m as HostMessage).type === 'scene') as Extract<HostMessage, { type: 'scene' }>;
    expect(scene.slides.map((s) => s.id)).toEqual(['a']);
    expect(scene.slides[0]?.boxes.box).toEqual([100, 300, 400, 200]);
    expect(scene.slides[0]?.svg).toContain('data-id="box"');

    panel.received.fire({ type: 'move', slide: 'a', ids: ['box'], dx: 50, dy: -20 });
    await until(() => doc.getText().includes('rect @box x=150 y=280 w=400 h=200'));
    expect(doc.getText()).toBe(DECK.replace('x=100 y=300 w=400', 'x=150 y=280 w=400'));

    panel.received.fire({ type: 'resize', slide: 'a', id: 'box', box: { x: 150, y: 280, w: 300, h: 100 }, height: true });
    await until(() => doc.getText().includes('rect @box x=150 y=280 w=300 h=100'));

    // the slot comes from the layout: the override lands in the deck as a set line
    panel.received.fire({ type: 'move', slide: 'a', ids: ['title'], dx: 0, dy: 20 });
    await until(() => doc.getText().includes('set @title y=100'));

    state.inputBox = 'Neuer Text';
    panel.received.fire({ type: 'editText', slide: 'a', id: 't' });
    await until(() => doc.getText().includes('text @t "Neuer Text"'));

    panel.received.fire({ type: 'select', slide: 'a', ids: ['t'] });
    await until(() => editor.selection.start.line === doc.positionAt(doc.getText().indexOf('text @t')).line);
    expect(editor.decorations).toHaveLength(1);

    panel.posted.length = 0;
    editor.moveCursor(doc.getText().indexOf('rect @box') + 2);
    await until(() => panel.posted.some((m) => (m as HostMessage).type === 'select'));
    expect(panel.posted.find((m) => (m as HostMessage).type === 'select')).toMatchObject({ slide: 'a', ids: ['box'] });

    panel.received.fire({ type: 'delete', slide: 'a', ids: ['t'] });
    await until(() => !doc.getText().includes('text @t'));
  });

  it('preview: a slide with errors stays visible, marked stale', async () => {
    const doc = openDoc(deckPath());
    const panel = state.panels[0] as vscode.MockPanel;
    const good = doc.getText();
    panel.posted.length = 0;
    typeText(doc, inSlide(good, '  rect @y like=@nope\n'));
    await until(() => panel.posted.some((m) => (m as HostMessage).type === 'scene'));
    const slide = (panel.posted.find((m) => (m as HostMessage).type === 'scene') as Extract<HostMessage, { type: 'scene' }>).slides[0] as PreviewSlide;
    expect(slide.stale).toBe(true);
    expect(slide.boxes.y).toBeUndefined();
    state.messages.length = 0;
    panel.received.fire({ type: 'move', slide: 'a', ids: ['box'], dx: 5, dy: 5 });
    await until(() => state.messages.length > 0);
    expect(state.messages[0]).toContain('nicht editierbar');
    typeText(doc, good);
  });

  it('included files: diagnostics in their own file, live text of open editors', async () => {
    const { Decks } = await import('../src/decks.js');
    const decks = new Decks();
    mkdirSync(join(dir, 'kapitel'), { recursive: true });
    const inc = join(dir, 'kapitel', 'b.forme');
    writeFileSync(inc, 'slide @b {\n  rect @r like=@nope\n}\n');
    const main = join(dir, 'haupt.forme');
    writeFileSync(main, 'deck "Haupt"\nslide @a\ninclude "./kapitel/b.forme"\n');
    let loaded = await decks.load(main);
    expect(loaded.scene.slides.map((x) => x.id)).toEqual(['a', 'b']);
    expect(state.diagnostics.get(inc)?.[0]?.message).toContain('@nope');
    expect(state.diagnostics.get(inc)?.[0]?.range.start.line).toBe(1);
    expect(state.diagnostics.get(main)).toEqual([]);
    // editing the included file (unsaved) updates the including deck
    const doc = openDoc(inc);
    typeText(doc, 'slide @b {\n  rect @r\n}\nslide @c\n');
    expect(await decks.decksFor(doc as never)).toEqual([inc, main]);
    loaded = await decks.load(main);
    expect(loaded.scene.slides.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(state.diagnostics.get(inc)).toEqual([]);
    decks.dispose();
  });

  it('converts a file in the old indentation syntax (forme.migrate)', async () => {
    const path = join(dir, 'alt.forme');
    writeFileSync(path, 'deck "Alt"\n\nslide @a\n  rect @r // Kasten\n');
    const doc = openDoc(path);
    state.messages.length = 0;
    await state.commands['forme.migrate']?.(vscode.Uri.file(path));
    expect(doc.getText()).toBe('deck "Alt"\n\nslide @a {\n  rect @r // Kasten\n}\n');
    expect(state.messages).toContain('Auf Klammer-Blöcke umgestellt.');
    await state.commands['forme.migrate']?.(vscode.Uri.file(path));
    expect(state.messages).toContain('Die Datei verwendet bereits Klammer-Blöcke.');
  });
});

describe('webview in Chromium', () => {
  let browser: Browser | null = null;
  beforeAll(async () => {
    browser = await launchBrowser();
  }, BROWSER_HOOK_TIMEOUT);
  afterAll(async () => browser?.close(), BROWSER_HOOK_TIMEOUT);

  it('drag in the preview moves the object in the file', async (ctx) => {
    if (!browser) ctx.skip();
    const doc = openDoc(deckPath());
    const panel = state.panels[0] as vscode.MockPanel;
    const page = await (browser as Browser).newPage({ viewport: { width: 1000, height: 800 } });
    page.on('pageerror', (e) => {
      throw e;
    });
    await page.exposeFunction('__toHost', (m: unknown) => panel.received.fire(m));
    await page.addInitScript(() => {
      (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({
        postMessage: (m: unknown) => (window as unknown as { __toHost(m: unknown): void }).__toHost(m),
        getState: () => undefined,
        setState: () => undefined,
      });
    });
    panel.onPost = (m) => void page.evaluate((msg) => window.postMessage(msg, '*'), m as never).catch(() => undefined);
    const html = join(dir, 'preview.html');
    writeFileSync(html, panel.webview.html);
    await page.goto(`file://${html}`);
    const box = page.locator('.stage > svg:not(.overlay) [data-id="box"]').first();
    await box.waitFor();
    const before = doc.getText();
    const bb = (await box.boundingBox()) as { x: number; y: number; width: number; height: number };
    const scale = (await page.locator('.stage').first().boundingBox())!.width / 1920;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 100 * scale, bb.y + bb.height / 2, { steps: 5 });
    await page.mouse.up();
    await until(() => doc.getText() !== before);
    const x = Number(/rect @box x=(\d+)/.exec(doc.getText())?.[1]);
    const oldX = Number(/rect @box x=(\d+)/.exec(before)?.[1]);
    expect(Math.abs(x - oldX - 100)).toBeLessThanOrEqual(2);
    // selection outline and handles are drawn for the selected object
    await page.locator('svg.overlay .handle').first().waitFor();
    expect(await page.locator('svg.overlay .handle').count()).toBe(4);
    await page.close();
  });
});
