import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportPdf, exportPptx, findSoffice, loadDeck, pptxToOdp } from '@forme/export';
import type { HtmlPrinter } from '@forme/export';
import { BrowserWindow, dialog } from 'electron';
import type { ExportRequest, ExportResponse } from '../shared/api.js';

const FILTERS = {
  pdf: { name: 'PDF', extensions: ['pdf'] },
  pptx: { name: 'PowerPoint', extensions: ['pptx'] },
  odp: { name: 'OpenDocument Präsentation', extensions: ['odp'] },
};

/** printToPDF in an offscreen window: the same Chromium that renders the editor. */
const printToPdf: HtmlPrinter = async (html, size) => {
  const dir = await mkdtemp(join(tmpdir(), 'forme-print-'));
  const w = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { offscreen: true, sandbox: true } });
  try {
    const file = join(dir, 'deck.html');
    await writeFile(file, html, 'utf8');
    await w.loadURL(pathToFileURL(file).href);
    await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const pdf = await w.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' },
      pageSize: { width: size.width / 96, height: size.height / 96 },
    });
    return new Uint8Array(pdf);
  } finally {
    w.destroy();
    await rm(dir, { recursive: true, force: true });
  }
};

async function rasterize(svg: string, width: number, height: number): Promise<Uint8Array> {
  const w = new BrowserWindow({ show: false, width: Math.ceil(width), height: Math.ceil(height), transparent: true, webPreferences: { offscreen: true, sandbox: true } });
  try {
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px" `)}</body></html>`;
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height) });
    return new Uint8Array(img.toPNG());
  } finally {
    w.destroy();
  }
}

export async function hasSoffice(): Promise<boolean> {
  return (await findSoffice()) !== null;
}

export async function exportDeck(win: BrowserWindow, req: ExportRequest): Promise<ExportResponse> {
  if (req.kind === 'odp' && !(await hasSoffice())) {
    return { ok: false, error: 'LibreOffice ist nicht installiert. Für den ODP-Export bitte LibreOffice installieren.' };
  }
  const target = process.env.FORME_EXPORT_PATH
    ? `${process.env.FORME_EXPORT_PATH}.${req.kind}`
    : (
        await dialog.showSaveDialog(win, {
          defaultPath: join(req.deckPath ? join(req.deckPath, '..') : homedir(), `${req.suggestedName}.${req.kind}`),
          filters: [FILTERS[req.kind]],
        })
      ).filePath;
  if (!target) return { ok: false, cancelled: true };
  try {
    const deckPath = req.deckPath ?? join(homedir(), 'unbenannt.forme');
    const loaded = await loadDeck(deckPath, { deckSource: req.deckSource, themeSource: req.themeSource });
    const log: string[] = loaded.scene.diagnostics.filter((d) => d.severity === 'error').map((d) => `Fehler: ${d.message}`);
    if (req.kind === 'pdf') {
      await writeFile(target, await exportPdf(loaded.scene, printToPdf, loaded.resolveUrl));
    } else {
      const res = await exportPptx(loaded.scene, {
        loadAsset: async (p) => {
          try {
            return new Uint8Array(await readFile(loaded.resolvePath(p)));
          } catch {
            return null;
          }
        },
        rasterize,
      });
      log.push(...res.log.map((l) => `[${l.slide}${l.id ? ` @${l.id}` : ''}] ${l.message}`));
      await writeFile(target, req.kind === 'odp' ? await pptxToOdp(res.data) : res.data);
    }
    return { ok: true, path: target, log };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
