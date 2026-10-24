import { watch, type FSWatcher } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import type { MenuItemConstructorOptions } from 'electron';
import { ASSET_SCHEME } from '../shared/api.js';
import type { ExportRequest, MenuCommand, OpenedFile } from '../shared/api.js';
import { exportDeck, hasSoffice } from './export.js';

const here = dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

let win: BrowserWindow | null = null;
const watchers = new Map<string, FSWatcher>();
const lastWritten = new Map<string, string>();

function initialPath(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && a.endsWith('.forme'));
  const env = process.env.FORME_OPEN;
  const p = env || args[0];
  return p ? resolve(p) : null;
}

function send(cmd: MenuCommand): void {
  win?.webContents.send('menu', cmd);
}

function buildMenu(): void {
  const item = (label: string, cmd: MenuCommand, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(cmd),
  });
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Datei',
      submenu: [
        item('Neu', 'new', 'CmdOrCtrl+N'),
        item('Öffnen …', 'open', 'CmdOrCtrl+O'),
        { type: 'separator' },
        item('Speichern', 'save', 'CmdOrCtrl+S'),
        item('Speichern unter …', 'saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        {
          label: 'Exportieren',
          submenu: [item('PDF …', 'export-pdf', 'CmdOrCtrl+E'), item('PowerPoint (PPTX) …', 'export-pptx'), item('OpenDocument (ODP) …', 'export-odp')],
        },
        { type: 'separator' },
        { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        // undo/redo are handled by the shared text-edit stack in the renderer
        item('Rückgängig', 'undo'),
        item('Wiederholen', 'redo'),
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { type: 'separator' },
        item('Duplizieren', 'duplicate'),
        item('Löschen', 'delete'),
        { type: 'separator' },
        item('Kommandozeile', 'command-line', 'CmdOrCtrl+K'),
      ],
    },
    {
      label: 'Folie',
      submenu: [item('Neue Folie', 'new-slide', 'CmdOrCtrl+Shift+N'), item('Folie löschen', 'delete-slide')],
    },
    {
      label: 'Ansicht',
      submenu: [
        item('Präsentieren', 'present', 'F5'),
        item('Theme-Bearbeitungsmodus', 'theme-mode', 'CmdOrCtrl+Shift+T'),
        item('Folie einpassen', 'zoom-fit', 'CmdOrCtrl+0'),
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

function registerIpc(): void {
  ipcMain.handle('openDialog', async (): Promise<OpenedFile | null> => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Forme', extensions: ['forme'] }], properties: ['openFile'] });
    const path = r.filePaths[0];
    if (r.canceled || !path) return null;
    const source = await readText(path);
    return source === null ? null : { path, source };
  });
  ipcMain.handle('saveDialog', async (_e, suggested: string) => {
    const r = await dialog.showSaveDialog(win!, { defaultPath: suggested, filters: [{ name: 'Forme', extensions: ['forme'] }] });
    return r.canceled ? null : (r.filePath ?? null);
  });
  ipcMain.handle('readText', (_e, path: string) => readText(path));
  ipcMain.handle('readBytes', async (_e, path: string) => {
    try {
      return new Uint8Array(await readFile(path));
    } catch {
      return null;
    }
  });
  ipcMain.handle('writeText', async (_e, path: string, text: string) => {
    try {
      lastWritten.set(path, text);
      await writeFile(path, text, 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('resolvePath', (_e, from: string | null, rel: string) => (isAbsolute(rel) ? rel : resolve(from ? dirname(from) : homedir(), rel)));
  ipcMain.handle('pickImage', async (_e, deckPath: string | null) => {
    const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }], properties: ['openFile'] });
    const p = r.filePaths[0];
    if (r.canceled || !p) return null;
    return deckPath ? relative(dirname(deckPath), p).split('\\').join('/').replace(/^(?!\.)/, './') : p;
  });
  ipcMain.on('watch', (_e, paths: string[]) => {
    for (const [p, w] of watchers) {
      if (!paths.includes(p)) {
        w.close();
        watchers.delete(p);
      }
    }
    for (const p of paths) {
      if (watchers.has(p)) continue;
      try {
        let timer: NodeJS.Timeout | null = null;
        const w = watch(p, () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(async () => {
            const text = await readText(p);
            if (text === null || text === lastWritten.get(p)) return;
            lastWritten.set(p, text);
            win?.webContents.send('fileChanged', p, text);
          }, 150);
        });
        watchers.set(p, w);
      } catch {
        // file may not exist yet
      }
    }
  });
  ipcMain.handle('exportDeck', (_e, req: ExportRequest) => exportDeck(win!, req));
  ipcMain.handle('hasSoffice', () => hasSoffice());
  ipcMain.on('setTitle', (_e, title: string, dirty: boolean) => {
    if (!win) return;
    win.setTitle(`${dirty ? '• ' : ''}${title} – Forme`);
    win.setDocumentEdited(dirty);
  });
  ipcMain.handle('confirm', async (_e, message: string, detail?: string) => {
    if (process.env.FORME_E2E) return true;
    const r = await dialog.showMessageBox(win!, { type: 'question', buttons: ['Abbrechen', 'OK'], defaultId: 1, cancelId: 0, message, ...(detail ? { detail } : {}) });
    return r.response === 1;
  });
  ipcMain.handle('initialFile', async (): Promise<OpenedFile | null> => {
    const p = initialPath();
    if (!p) return null;
    const source = await readText(p);
    return { path: p, source: source ?? '' };
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1000,
    minHeight: 640,
    title: 'Forme',
    show: false,
    backgroundColor: '#f5f5f4',
    webPreferences: {
      preload: resolve(here, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(resolve(here, '../renderer/index.html'));
}

void app.whenReady().then(() => {
  protocol.handle(ASSET_SCHEME, (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
    return net.fetch(new URL(`file://${path.startsWith('/') ? '' : '/'}${path}`).href);
  });
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
