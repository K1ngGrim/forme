import { readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { applyEdits } from '@forme/core';
import type { Span } from '@forme/core';
import * as vscode from 'vscode';
import type { EditorToHost, FsOp, HostToEditor } from '../../web/src/platform/host-protocol.js';
import { textHash } from '../../web/src/platform/host-protocol.js';
import type { Decks } from './decks.js';
import { isForme, liveSource, toRange } from './decks.js';
import { isThemeSource } from './language.js';

export const EDITOR_VIEW_TYPE = 'forme.editor';

const ASSET_GLOB = '**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf}';
const LIST_LIMIT = 5000;

function nonce(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62));
  return s;
}

/** The project root of a deck: its workspace folder, or the deck's own folder. */
export function projectRoot(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? dirname(uri.fsPath);
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

/**
 * The full Forme editor (canvas, toolbar, slide list, inspector) as a VS Code editor for .forme
 * files. It is a text editor provider: the document stays a normal text document, so the text
 * editor, the preview and other extensions see every change, and saving works as usual.
 */
export class FormeEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly sessions = new Set<EditorSession>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly decks: Decks,
    private readonly exportDeck: (uri: vscode.Uri, kind: 'pdf' | 'pptx' | 'odp') => Promise<void>,
  ) {}

  /** The editor the user works in (for commands bound to keys). */
  active(): EditorSession | undefined {
    return [...this.sessions].find((s) => s.panel.active);
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const root = projectRoot(document.uri);
    let deckPath = document.uri.fsPath;
    let mode: 'deck' | 'theme' = 'deck';
    if (isThemeSource(document.getText())) {
      const deck = await this.decks.deckFor(document);
      if (!deck) {
        panel.webview.html = `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:24px">Zu diesem Theme wurde im Arbeitsbereich keine Präsentation gefunden. Der Forme-Editor öffnet Präsentationen (Dateien mit <code>deck</code> oder <code>slide</code>).</body>`;
        return;
      }
      deckPath = deck;
      mode = 'theme';
    }
    const session = new EditorSession(document, panel, root, deckPath, mode, this.extensionUri, this.exportDeck);
    this.sessions.add(session);
    panel.onDidDispose(() => {
      this.sessions.delete(session);
      session.dispose();
    });
  }
}

export class EditorSession implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** .forme files the editor has read (deck, theme): their changes are sent to it. */
  private readonly watched = new Set<string>();
  /** Texts produced by the editor's own edits: their change events are not echoed back. */
  private readonly expected = new Map<string, string[]>();
  /** Cursor position we set ourselves (`path:offset`), not a user action. */
  private ownSelection: string | null = null;
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
  });

  constructor(
    readonly document: vscode.TextDocument,
    readonly panel: vscode.WebviewPanel,
    readonly root: string,
    readonly deckPath: string,
    readonly mode: 'deck' | 'theme',
    private readonly extensionUri: vscode.Uri,
    private readonly exportDeck: (uri: vscode.Uri, kind: 'pdf' | 'pptx' | 'odp') => Promise<void>,
  ) {
    const editorDir = vscode.Uri.joinPath(extensionUri, 'dist', 'editor');
    panel.webview.options = { enableScripts: true, localResourceRoots: [editorDir, vscode.Uri.file(root)] };
    panel.webview.html = this.html(editorDir);
    this.watched.add(deckPath);
    const assets = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(root), ASSET_GLOB));
    const assetChanged = (uri: vscode.Uri): void => this.post({ type: 'asset', path: toPosix(relative(root, uri.fsPath)) });
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: EditorToHost) => void this.onMessage(m)),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e)),
      vscode.workspace.onWillSaveTextDocument((e) => {
        // saving the deck also saves the theme changed in theme mode
        if (e.document.uri.fsPath === this.deckPath) e.waitUntil(this.saveWatched(e.document.uri.fsPath));
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => this.onEditorSelection(e)),
      assets,
      assets.onDidChange(assetChanged),
      assets.onDidCreate(assetChanged),
      this.decoration,
    );
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
  }

  post(m: HostToEditor): void {
    void this.panel.webview.postMessage(m);
  }

  /** The built web app with a content security policy and its asset folder as base URL. */
  private html(editorDir: vscode.Uri): string {
    const w = this.panel.webview;
    const n = nonce();
    let html: string;
    try {
      html = readFileSync(join(editorDir.fsPath, 'index.html'), 'utf8');
    } catch {
      return '<!doctype html><meta charset="utf-8"><body>Forme-Editor nicht gebaut (pnpm --filter forme-vscode build).</body>';
    }
    const csp = [
      "default-src 'none'",
      `img-src ${w.cspSource} blob: data: https:`,
      `font-src ${w.cspSource} blob: data:`,
      `style-src ${w.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${n}' ${w.cspSource}`,
      `connect-src ${w.cspSource}`,
    ].join('; ');
    const base = `${w.asWebviewUri(editorDir).toString()}/`;
    return html
      .replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<base href="${base}">`)
      .replace(/<script /g, `<script nonce="${n}" `)
      .replace(/ crossorigin/g, '');
  }

  /** Absolute path of a project-relative path; null when it leaves the project. */
  private resolvePath(path: string | undefined): string | null {
    if (!path) return null;
    const abs = resolve(this.root, path);
    const rel = relative(this.root, abs);
    return rel.startsWith('..') || isAbsolute(rel) ? null : abs;
  }

  private async fsRequest(op: FsOp, path: string | undefined, text?: string, data?: Uint8Array): Promise<unknown> {
    if (op === 'list') return this.list();
    const abs = this.resolvePath(path);
    if (!abs) throw new Error(`Pfad außerhalb des Projekts: ${path ?? ''}`);
    const uri = vscode.Uri.file(abs);
    switch (op) {
      case 'readText': {
        if (abs.endsWith('.forme')) this.watched.add(abs);
        const live = liveSource(abs);
        if (live !== undefined) return live;
        try {
          return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        } catch {
          return null;
        }
      }
      case 'readBytes':
        try {
          return new Uint8Array(await vscode.workspace.fs.readFile(uri));
        } catch {
          return null;
        }
      case 'writeText':
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text ?? '', 'utf8'));
        return null;
      case 'writeBytes':
        await vscode.workspace.fs.writeFile(uri, data ?? new Uint8Array());
        return null;
      case 'modified':
        try {
          return (await vscode.workspace.fs.stat(uri)).mtime;
        } catch {
          return null;
        }
      default:
        return null;
    }
  }

  private async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= LIST_LIMIT) return;
      let entries: [string, vscode.FileType][] = [];
      try {
        entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
      } catch {
        return;
      }
      for (const [name, type] of entries) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = join(dir, name);
        if (type === vscode.FileType.Directory) await walk(p);
        else out.push(toPosix(relative(this.root, p)));
      }
    };
    await walk(this.root);
    return out;
  }

  private async onMessage(m: EditorToHost): Promise<void> {
    switch (m.type) {
      case 'ready':
        this.post({ type: 'init', deckPath: toPosix(relative(this.root, this.deckPath)), name: basename(this.root), mode: this.mode });
        return;
      case 'request':
        try {
          this.post({ type: 'response', id: m.id, ok: true, value: await this.fsRequest(m.op, m.path, m.text, m.data) });
        } catch (e) {
          this.post({ type: 'response', id: m.id, ok: false, error: (e as Error).message });
        }
        return;
      case 'edit':
        await this.applyEdit(m.path, m.hash, m.edits);
        return;
      case 'select':
        this.revealInText(m.path, m.reveal, m.spans);
        return;
      case 'export':
        await this.exportDeck(vscode.Uri.file(this.deckPath), m.kind);
        return;
      case 'openText':
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(this.deckPath)), { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
        return;
      case 'save':
        await this.saveWatched();
        return;
    }
  }

  /** Apply the editor's edit to the document, if it still has the text the edit was made for. */
  private async applyEdit(path: string, hash: string, edits: { from: number; to: number; insert: string }[]): Promise<void> {
    const abs = this.resolvePath(path);
    if (!abs) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
    const current = doc.getText();
    if (textHash(current) !== hash) {
      // the file changed in the meantime (typing in VS Code): the editor gets the current text
      this.post({ type: 'text', path, text: current });
      return;
    }
    const expected = applyEdits(current, edits).text;
    this.expected.set(abs, [...(this.expected.get(abs) ?? []), expected]);
    const we = new vscode.WorkspaceEdit();
    for (const e of edits) we.replace(doc.uri, new vscode.Range(doc.positionAt(e.from), doc.positionAt(e.to)), e.insert);
    const ok = await vscode.workspace.applyEdit(we);
    if (!ok) {
      this.expected.set(abs, (this.expected.get(abs) ?? []).filter((t) => t !== expected));
      this.post({ type: 'text', path, text: doc.getText() });
    }
  }

  private onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
    const abs = e.document.uri.fsPath;
    if (!this.watched.has(abs) || !e.contentChanges.length) return;
    const text = e.document.getText();
    const pending = this.expected.get(abs) ?? [];
    const i = pending.indexOf(text);
    if (i >= 0) {
      // our own edit coming back
      this.expected.set(abs, pending.slice(i + 1));
      return;
    }
    this.post({ type: 'text', path: toPosix(relative(this.root, abs)), text });
  }

  private async saveWatched(except?: string): Promise<boolean> {
    for (const doc of vscode.workspace.textDocuments) {
      if (this.watched.has(doc.uri.fsPath) && doc.uri.fsPath !== except && doc.isDirty) await doc.save();
    }
    return true;
  }

  /** Canvas selection -> select the creation op and highlight all ops of the object in a visible text editor. */
  private revealInText(path: string, reveal: Span | null, spans: Span[]): void {
    const abs = this.resolvePath(path);
    for (const ed of vscode.window.visibleTextEditors) if (isForme(ed.document)) ed.setDecorations(this.decoration, []);
    const editor = vscode.window.visibleTextEditors.find((ed) => ed.document.uri.fsPath === abs);
    if (!editor) return;
    const doc = editor.document;
    editor.setDecorations(
      this.decoration,
      spans.map((s) => toRange(doc, s)),
    );
    if (!reveal) return;
    const range = toRange(doc, reveal);
    this.ownSelection = `${doc.uri.fsPath}:${doc.offsetAt(range.start)}`;
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** Cursor in VS Code's text editor -> the editor selects the objects of that op. */
  private onEditorSelection(e: vscode.TextEditorSelectionChangeEvent): void {
    const doc = e.textEditor.document;
    const active = e.selections[0]?.active;
    if (!this.watched.has(doc.uri.fsPath) || !active) return;
    const offset = doc.offsetAt(active);
    const own = this.ownSelection;
    this.ownSelection = null;
    if (own === `${doc.uri.fsPath}:${offset}`) return;
    e.textEditor.setDecorations(this.decoration, []);
    this.post({ type: 'cursor', path: toPosix(relative(this.root, doc.uri.fsPath)), offset });
  }
}
