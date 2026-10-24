/** Contract between the Electron main process and the renderer (exposed via preload). */

export type ExportKind = 'pdf' | 'pptx' | 'odp';

export interface ExportRequest {
  kind: ExportKind;
  /** Absolute deck path (null for unsaved decks). */
  deckPath: string | null;
  deckSource: string;
  /** Current (possibly unsaved) theme source, if the deck references a theme. */
  themeSource: string | null;
  suggestedName: string;
}

export interface ExportResponse {
  ok: boolean;
  path?: string;
  log?: string[];
  error?: string;
  cancelled?: boolean;
}

export interface OpenedFile {
  path: string;
  source: string;
}

export type MenuCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'export-pdf'
  | 'export-pptx'
  | 'export-odp'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  | 'present'
  | 'theme-mode'
  | 'new-slide'
  | 'delete-slide'
  | 'zoom-fit'
  | 'command-line';

export interface FormeApi {
  openDialog(): Promise<OpenedFile | null>;
  saveDialog(suggestedName: string): Promise<string | null>;
  readText(path: string): Promise<string | null>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeText(path: string, text: string): Promise<boolean>;
  /** Resolve `rel` against the directory of `fromFile` (or the home directory). */
  resolvePath(fromFile: string | null, rel: string): Promise<string>;
  /** Pick an image and return its path relative to the deck. */
  pickImage(deckPath: string | null): Promise<string | null>;
  watch(paths: string[]): void;
  onFileChanged(cb: (path: string, source: string) => void): () => void;
  exportDeck(req: ExportRequest): Promise<ExportResponse>;
  hasSoffice(): Promise<boolean>;
  onMenu(cb: (cmd: MenuCommand) => void): () => void;
  setTitle(title: string, dirty: boolean): void;
  confirm(message: string, detail?: string): Promise<boolean>;
  /** Path given on the command line (or by the E2E test). */
  initialFile(): Promise<OpenedFile | null>;
}

export const ASSET_SCHEME = 'forme-asset';

export function assetUrl(absPath: string): string {
  return `${ASSET_SCHEME}://local/${encodeURIComponent(absPath)}`;
}
