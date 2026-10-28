import { dirname } from 'node:path';
import { computeEdit, rawText } from '@forme/core';
import type { EditResult, FileRole, Intent } from '@forme/core';
import type { LoadedDeck } from '@forme/export/node';
import * as vscode from 'vscode';
import type { Decks } from './decks.js';
import { isForme, toRange } from './decks.js';
import type { HostMessage, PreviewSlide, ViewMessage } from './protocol.js';
import { idsAt, sceneMessage } from './view.js';

export const PREVIEW_VIEW_TYPE = 'forme.preview';

function nonce(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 62));
  return s;
}

/** One live preview per deck. Gestures become intents, intents become text edits (one undo step each). */
export class Preview implements vscode.Disposable {
  private readonly lastGood = new Map<string, PreviewSlide>();
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  private selection: { slide: string | null; ids: string[] } = { slide: null, ids: [] };
  /** Cursor position we set ourselves (`path:offset`): its change event is not a user action. */
  private ownSelection: string | null = null;
  private readonly onDisposeEmitter = new vscode.EventEmitter<void>();
  readonly onDispose = this.onDisposeEmitter.event;

  constructor(
    readonly deckPath: string,
    readonly panel: vscode.WebviewPanel,
    private readonly decks: Decks,
    private readonly extensionUri: vscode.Uri,
    private readonly lastEditor: () => vscode.TextEditor | undefined,
  ) {
    panel.webview.options = { enableScripts: true, localResourceRoots: this.roots(decks.last(deckPath)) };
    panel.webview.html = this.html();
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'icon.svg');
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: ViewMessage) => void this.onMessage(m)),
      panel.onDidDispose(() => this.dispose()),
      decks.onLoad((loaded) => {
        if (loaded.deckPath === this.deckPath) this.send(loaded);
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => void this.onEditorSelection(e)),
    );
  }

  dispose(): void {
    for (const d of this.disposables.splice(0)) d.dispose();
    this.decorations.dispose();
    this.onDisposeEmitter.fire();
    this.onDisposeEmitter.dispose();
  }

  reveal(): void {
    this.panel.reveal(undefined, true);
  }

  private roots(loaded?: LoadedDeck): vscode.Uri[] {
    const dirs = new Set<string>([dirname(this.deckPath)]);
    if (loaded?.themePath) dirs.add(dirname(loaded.themePath));
    for (const f of vscode.workspace.workspaceFolders ?? []) dirs.add(f.uri.fsPath);
    return [vscode.Uri.joinPath(this.extensionUri, 'dist'), vscode.Uri.joinPath(this.extensionUri, 'media'), ...[...dirs].map((d) => vscode.Uri.file(d))];
  }

  private html(): string {
    const w = this.panel.webview;
    const n = nonce();
    const script = w.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview.js'));
    const css = w.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'preview.css'));
    const csp = [
      "default-src 'none'",
      `img-src ${w.cspSource} https: data: blob:`,
      `font-src ${w.cspSource} https: data:`,
      `style-src ${w.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${n}'`,
    ].join('; ');
    return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${css}"><style id="fonts"></style>
</head><body>
<div id="error" hidden></div>
<main id="slides"></main>
<script nonce="${n}" src="${script}"></script>
</body></html>`;
  }

  private post(m: HostMessage): void {
    if (this.ready) void this.panel.webview.postMessage(m);
  }

  private send(loaded: LoadedDeck): void {
    const before = JSON.stringify(this.panel.webview.options.localResourceRoots?.map((u) => u.fsPath));
    const roots = this.roots(loaded);
    if (JSON.stringify(roots.map((u) => u.fsPath)) !== before) this.panel.webview.options = { enableScripts: true, localResourceRoots: roots };
    this.panel.title = `Vorschau: ${loaded.scene.title || 'Forme'}`;
    const resolveAsset = (p: string): string => (/^(https?|data):/.test(p) ? p : this.panel.webview.asWebviewUri(vscode.Uri.file(loaded.resolveFile(p))).toString());
    this.post(sceneMessage(this.deckPath, loaded.scene, resolveAsset, this.lastGood));
  }

  private async onMessage(m: ViewMessage): Promise<void> {
    switch (m.type) {
      case 'ready': {
        this.ready = true;
        const loaded = this.decks.last(this.deckPath) ?? (await this.decks.load(this.deckPath).catch((e: unknown) => this.fail(e)));
        if (loaded) {
          this.send(loaded);
          this.post({ type: 'select', ...this.selection, reveal: true });
        }
        return;
      }
      case 'select':
        this.selection = { slide: m.slide, ids: m.ids };
        await this.revealInEditor(m.slide, m.ids);
        return;
      case 'move':
        await this.intent({ type: 'move', slide: m.slide, ids: m.ids, dx: m.dx, dy: m.dy });
        return;
      case 'resize':
        await this.intent({ type: 'resize', slide: m.slide, id: m.id, box: m.box, height: m.height });
        return;
      case 'delete':
        await this.intent({ type: 'delete', slide: m.slide, ids: m.ids });
        return;
      case 'editText':
        await this.editText(m.slide, m.id);
        return;
    }
  }

  private fail(e: unknown): undefined {
    this.post({ type: 'error', message: (e as Error).message });
    return undefined;
  }

  /** Theme mode when the last active editor shows the theme file (same rule as the web app). */
  private mode(loaded: LoadedDeck): 'deck' | 'theme' {
    const ed = this.lastEditor();
    return ed && loaded.themePath && ed.document.uri.fsPath === loaded.themePath ? 'theme' : 'deck';
  }

  private uriOf(loaded: LoadedDeck, file: FileRole): vscode.Uri | null {
    if (file === 'deck') return vscode.Uri.file(loaded.deckPath);
    return loaded.themePath ? vscode.Uri.file(loaded.themePath) : null;
  }

  /** Gesture -> intent -> minimal text edits on the current text (a fresh load, so offsets match). */
  async intent(intent: Intent): Promise<boolean> {
    const loaded = await this.decks.load(this.deckPath);
    const slide = 'slide' in intent ? loaded.scene.slides.find((s) => s.id === intent.slide) : undefined;
    if (slide?.hasErrors) {
      void vscode.window.showWarningMessage('Die Folie enthält Fehler und ist bis zur Korrektur nicht editierbar.');
      return false;
    }
    const ctx = { deck: loaded.deck, theme: loaded.theme, scene: loaded.scene, mode: this.mode(loaded) };
    let res: EditResult = computeEdit(ctx, intent);
    if (res.error && intent.type === 'delete' && res.warnings.length) {
      const ok = await vscode.window.showWarningMessage(`${res.error}`, { modal: true, detail: res.warnings.join('\n') }, 'Trotzdem löschen');
      if (ok !== 'Trotzdem löschen') return false;
      res = computeEdit(ctx, { ...intent, force: true });
    }
    if (res.error) {
      const inc = slide?.op.file === 'include' ? loaded.includes.find((i) => i.path === slide.op.path) : undefined;
      if (inc && this.mode(loaded) === 'deck') {
        // slides of included files are edited there: offer to open the file
        void vscode.window.showInformationMessage(res.error, 'Datei öffnen').then((a) => {
          if (a) void vscode.window.showTextDocument(vscode.Uri.file(inc.abs));
        });
      } else void vscode.window.showWarningMessage(res.error);
      return false;
    }
    if (!res.edits.length) return false;
    const uri = this.uriOf(loaded, res.file);
    if (!uri) return false;
    const doc = await vscode.workspace.openTextDocument(uri);
    const we = new vscode.WorkspaceEdit();
    for (const e of res.edits) we.replace(uri, new vscode.Range(doc.positionAt(e.from), doc.positionAt(e.to)), e.insert);
    const ok = await vscode.workspace.applyEdit(we);
    for (const w of res.warnings) void vscode.window.showWarningMessage(w);
    if (ok && res.select && 'slide' in intent) {
      this.selection = { slide: intent.slide, ids: res.select };
      this.post({ type: 'select', ...this.selection, reveal: false });
    }
    return ok;
  }

  private async editText(slideId: string, id: string): Promise<void> {
    const loaded = this.decks.last(this.deckPath);
    const node = loaded?.scene.slides.find((s) => s.id === slideId)?.byId.get(id);
    if (!loaded || !node) return;
    if (!['text', 'list', 'table'].includes(node.kind) && !node.slot) return;
    const value = await vscode.window.showInputBox({
      title: `Text von @${id}`,
      value: rawText(loaded.deck, loaded.theme, node),
      prompt: '**fett**, *kursiv*, [Link](url) und {slide.n} sind erlaubt. Zeilenumbruch: \\n',
    });
    if (value !== undefined) await this.intent({ type: 'text', slide: slideId, id, text: value });
  }

  private readonly decorations = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.selectionHighlightForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });

  /** Preview selection -> the object's ops in the code (creation op selected, all touching ops highlighted). */
  private async revealInEditor(slideId: string, ids: string[]): Promise<void> {
    const loaded = this.decks.last(this.deckPath);
    if (!loaded) return;
    const slide = loaded.scene.slides.find((s) => s.id === slideId);
    const nodes = ids.map((id) => slide?.byId.get(id)).filter((n) => !!n);
    const mode = this.mode(loaded);
    const want: FileRole = mode === 'theme' ? 'theme' : 'deck';
    const uri = this.uriOf(loaded, want);
    if (!uri) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === uri.fsPath);
    for (const e of vscode.window.visibleTextEditors) if (isForme(e.document)) e.setDecorations(this.decorations, []);
    if (!editor) return;
    const doc = editor.document;
    const spans = nodes.flatMap((n) => n.touchedBy.filter((o) => o.file === want).map((o) => o.span));
    editor.setDecorations(
      this.decorations,
      spans.map((s) => toRange(doc, s)),
    );
    const first = nodes[0]?.origin.file === want ? nodes[0].origin.span : (spans[0] ?? (want === 'deck' && slide ? slide.op.span : undefined));
    if (!first) return;
    const range = toRange(doc, first);
    this.ownSelection = `${doc.uri.fsPath}:${doc.offsetAt(range.start)}`;
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** Cursor in an op -> its objects selected in the preview. */
  private async onEditorSelection(e: vscode.TextEditorSelectionChangeEvent): Promise<void> {
    const own = this.ownSelection;
    this.ownSelection = null;
    const editorDoc = e.textEditor.document;
    const active = e.selections[0]?.active;
    if (!active || !isForme(editorDoc)) return;
    const offset = editorDoc.offsetAt(active);
    if (own === `${editorDoc.uri.fsPath}:${offset}`) return;
    let loaded = this.decks.last(this.deckPath);
    const path = editorDoc.uri.fsPath;
    if (!loaded || (path !== loaded.deckPath && path !== loaded.themePath)) return;
    const file: FileRole = path === loaded.deckPath ? 'deck' : 'theme';
    const current = (l: LoadedDeck): boolean => (file === 'deck' ? l.deck.source : l.theme?.source) === editorDoc.getText();
    // typed just before moving the cursor: the debounced reload has not run yet
    if (!current(loaded)) loaded = await this.decks.load(this.deckPath).catch(() => undefined);
    const doc = loaded && current(loaded) ? (file === 'deck' ? loaded.deck : loaded.theme) : null;
    if (!loaded || !doc) return;
    const hit = idsAt(loaded.scene, doc, file, offset);
    e.textEditor.setDecorations(this.decorations, []);
    if (!hit.slide && file === 'theme') return;
    this.selection = hit;
    this.post({ type: 'select', ...hit, reveal: true });
  }
}
