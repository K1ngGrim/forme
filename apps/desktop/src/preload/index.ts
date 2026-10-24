import { contextBridge, ipcRenderer } from 'electron';
import type { FormeApi, MenuCommand } from '../shared/api.js';

const api: FormeApi = {
  openDialog: () => ipcRenderer.invoke('openDialog'),
  saveDialog: (name) => ipcRenderer.invoke('saveDialog', name),
  readText: (path) => ipcRenderer.invoke('readText', path),
  readBytes: (path) => ipcRenderer.invoke('readBytes', path),
  writeText: (path, text) => ipcRenderer.invoke('writeText', path, text),
  resolvePath: (from, rel) => ipcRenderer.invoke('resolvePath', from, rel),
  pickImage: (deckPath) => ipcRenderer.invoke('pickImage', deckPath),
  watch: (paths) => ipcRenderer.send('watch', paths),
  onFileChanged: (cb) => {
    const h = (_e: unknown, path: string, source: string): void => cb(path, source);
    ipcRenderer.on('fileChanged', h);
    return () => ipcRenderer.off('fileChanged', h);
  },
  exportDeck: (req) => ipcRenderer.invoke('exportDeck', req),
  hasSoffice: () => ipcRenderer.invoke('hasSoffice'),
  onMenu: (cb) => {
    const h = (_e: unknown, cmd: MenuCommand): void => cb(cmd);
    ipcRenderer.on('menu', h);
    return () => ipcRenderer.off('menu', h);
  },
  setTitle: (title, dirty) => ipcRenderer.send('setTitle', title, dirty),
  confirm: (message, detail) => ipcRenderer.invoke('confirm', message, detail),
  initialFile: () => ipcRenderer.invoke('initialFile'),
};

contextBridge.exposeInMainWorld('forme', api);
