import { basename, dirname, extname, join } from 'node:path';
import { completeLine, computeEdit, parse, TEMPLATES } from '@forme/core';
import type { CompletionItem as FormeCompletion, Document } from '@forme/core';
import { ChromiumSession, formatOf, loadDeck, writeOutput, writeTemplate } from '@forme/export/node';
import type { OutputFormat } from '@forme/export/node';
import * as vscode from 'vscode';
import { Decks, isForme, LANGUAGE_ID, liveSource, toRange } from './decks.js';
import type { OutlineSymbol } from './language.js';
import { colorsIn, definitionsOf, hoverText, idAt, isThemeSource, outline, referencesOf, toHex } from './language.js';
import { Preview, PREVIEW_VIEW_TYPE } from './preview.js';
import { idsAt } from './view.js';

const SELECTOR: vscode.DocumentSelector = { language: LANGUAGE_ID, scheme: 'file' };

const SYMBOL_KINDS: Record<OutlineSymbol['kind'], vscode.SymbolKind> = {
  deck: vscode.SymbolKind.File,
  slide: vscode.SymbolKind.Class,
  section: vscode.SymbolKind.Namespace,
  object: vscode.SymbolKind.Field,
  container: vscode.SymbolKind.Struct,
  layout: vscode.SymbolKind.Class,
  master: vscode.SymbolKind.Class,
  component: vscode.SymbolKind.Function,
  style: vscode.SymbolKind.Property,
  token: vscode.SymbolKind.Constant,
  color: vscode.SymbolKind.Constant,
  font: vscode.SymbolKind.Constant,
};

const COMPLETION_KINDS: Record<FormeCompletion['type'], vscode.CompletionItemKind> = {
  keyword: vscode.CompletionItemKind.Keyword,
  variable: vscode.CompletionItemKind.Variable,
  constant: vscode.CompletionItemKind.Constant,
  property: vscode.CompletionItemKind.Property,
  enum: vscode.CompletionItemKind.EnumMember,
  class: vscode.CompletionItemKind.Class,
};

const FORMATS: { format: OutputFormat; label: string; detail: string }[] = [
  { format: 'pdf', label: 'PDF', detail: 'wie der Druck aus der App (braucht Chrome, Edge oder Chromium)' },
  { format: 'pptx', label: 'PowerPoint (PPTX)', detail: 'in PowerPoint editierbar' },
  { format: 'html', label: 'HTML', detail: 'eine Seite pro Folie' },
  { format: 'svg', label: 'SVG', detail: 'eine Datei pro Folie' },
  { format: 'odp', label: 'OpenDocument (ODP)', detail: 'über LibreOffice (soffice muss installiert sein)' },
];

let lastFormeEditor: vscode.TextEditor | undefined;

function parsed(doc: vscode.TextDocument): Document {
  return parse(doc.getText());
}

function toSymbol(doc: vscode.TextDocument, s: OutlineSymbol): vscode.DocumentSymbol {
  const sym = new vscode.DocumentSymbol(s.name, s.detail, SYMBOL_KINDS[s.kind], toRange(doc, s.span), toRange(doc, s.selection));
  sym.children = s.children.map((c) => toSymbol(doc, c));
  return sym;
}

export function activate(context: vscode.ExtensionContext): void {
  const decks = new Decks();
  const output = vscode.window.createOutputChannel('Forme');
  const previews = new Map<string, Preview>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  lastFormeEditor = vscode.window.activeTextEditor && isForme(vscode.window.activeTextEditor.document) ? vscode.window.activeTextEditor : undefined;

  const schedule = (doc: vscode.TextDocument, delay = 150): void => {
    if (!isForme(doc)) return;
    const key = doc.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        void decks.refresh(doc);
      }, delay),
    );
  };

  const deckOfEditor = async (uri?: vscode.Uri): Promise<string | null> => {
    const doc = uri ? await vscode.workspace.openTextDocument(uri) : (vscode.window.activeTextEditor?.document ?? lastFormeEditor?.document);
    if (!doc || !isForme(doc)) {
      void vscode.window.showInformationMessage('Zuerst eine .forme-Datei öffnen.');
      return null;
    }
    const deck = await decks.deckFor(doc);
    if (!deck) void vscode.window.showInformationMessage('Zu diesem Theme wurde keine Präsentation im Arbeitsbereich gefunden.');
    return deck;
  };

  const track = (p: Preview): Preview => {
    previews.set(p.deckPath, p);
    p.onDispose(() => previews.delete(p.deckPath));
    return p;
  };

  const openPreview = async (uri: vscode.Uri | undefined, side: boolean): Promise<void> => {
    const deckPath = await deckOfEditor(uri);
    if (!deckPath) return;
    const existing = previews.get(deckPath);
    if (existing) {
      existing.reveal();
      return;
    }
    await decks.load(deckPath).catch(() => undefined);
    const panel = vscode.window.createWebviewPanel(PREVIEW_VIEW_TYPE, `Vorschau: ${basename(deckPath)}`, { viewColumn: side ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, preserveFocus: true }, { enableScripts: true });
    track(new Preview(deckPath, panel, decks, context.extensionUri, () => lastFormeEditor));
  };

  const exportDeck = async (uri: vscode.Uri | undefined, preset?: OutputFormat): Promise<void> => {
    const deckPath = await deckOfEditor(uri);
    if (!deckPath) return;
    const choice = preset ? FORMATS.find((f) => f.format === preset) : await vscode.window.showQuickPick(FORMATS, { title: 'Forme: Exportieren als …' });
    if (!choice) return;
    const base = join(dirname(deckPath), basename(deckPath, extname(deckPath)));
    let out: string;
    if (choice.format === 'svg') {
      const folder = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, defaultUri: vscode.Uri.file(dirname(deckPath)), openLabel: 'SVGs hier speichern' });
      if (!folder?.[0]) return;
      out = join(folder[0].fsPath, `${basename(base)}-{n}.svg`);
    } else {
      const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(`${base}.${choice.format}`), filters: { [choice.label]: [choice.format] } });
      if (!target) return;
      out = target.fsPath;
      if (!formatOf(out)) out += `.${choice.format}`;
    }
    const deckSource = liveSource(deckPath);
    const loaded = await loadDeck(deckPath, deckSource !== undefined ? { deckSource } : {});
    const errors = loaded.scene.diagnostics.filter((d) => d.severity === 'error').length;
    if (errors) {
      const go = await vscode.window.showWarningMessage(`Die Präsentation hat ${errors} Fehler.`, { modal: true }, 'Trotzdem exportieren');
      if (go !== 'Trotzdem exportieren') return;
    }
    const chromiumPath = vscode.workspace.getConfiguration('forme').get<string>('chromiumPath') || undefined;
    const chromium = new ChromiumSession(chromiumPath ? { executablePath: chromiumPath } : {});
    try {
      const res = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Forme: ${choice.label} wird erzeugt …` }, () => writeOutput(loaded, out, chromium));
      for (const l of res.log) output.appendLine(`Export ${l}`);
      if (res.log.length) output.appendLine('');
      const first = res.files[0];
      const msg = res.files.length > 1 ? `${res.files.length} Dateien geschrieben` : `Geschrieben: ${basename(first ?? out)}`;
      const action = await vscode.window.showInformationMessage(msg + (res.log.length ? ' (Hinweise im Ausgabefenster „Forme“)' : ''), ...(first ? ['Öffnen'] : []), ...(res.log.length ? ['Hinweise'] : []));
      if (action === 'Öffnen' && first) await vscode.env.openExternal(vscode.Uri.file(first));
      if (action === 'Hinweise') output.show(true);
    } catch (e) {
      void vscode.window.showErrorMessage(`Export fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      await chromium.close();
    }
  };

  const newProject = async (): Promise<void> => {
    const pick = await vscode.window.showQuickPick(
      TEMPLATES.map((t) => ({ label: t.name, description: t.description, template: t })),
      { title: 'Forme: Neue Präsentation aus Vorlage' },
    );
    if (!pick) return;
    const folder = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      openLabel: 'Hier anlegen',
      ...(vscode.workspace.workspaceFolders?.[0] ? { defaultUri: vscode.workspace.workspaceFolders[0].uri } : {}),
    });
    if (!folder?.[0]) return;
    const { written, skipped } = await writeTemplate(pick.template, vscode.Uri.joinPath(context.extensionUri, 'dist', 'templates').fsPath, folder[0].fsPath);
    if (skipped.length) void vscode.window.showWarningMessage(`${skipped.length} Datei(en) existierten schon und wurden nicht überschrieben: ${skipped.join(', ')}`);
    const deck = vscode.Uri.joinPath(folder[0], pick.template.deck);
    if (written.length || skipped.includes(pick.template.deck)) {
      await vscode.window.showTextDocument(deck);
      await openPreview(deck, true);
    }
  };

  context.subscriptions.push(
    decks,
    output,
    vscode.workspace.onDidOpenTextDocument((d) => schedule(d, 0)),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.contentChanges.length) schedule(e.document);
    }),
    vscode.workspace.onDidSaveTextDocument((d) => schedule(d, 0)),
    vscode.workspace.onDidCloseTextDocument((d) => {
      // closed files are read from disk again (unsaved changes are gone)
      if (isForme(d)) for (const p of previews.keys()) void decks.load(p).catch(() => undefined);
    }),
    vscode.window.onDidChangeActiveTextEditor((e) => {
      if (e && isForme(e.document)) lastFormeEditor = e;
    }),
    // fonts and images changed by other programs
    (() => {
      const w = vscode.workspace.createFileSystemWatcher('**/*.{woff,woff2,ttf,otf,png,jpg,jpeg,gif,webp,svg,forme}');
      const reload = (uri: vscode.Uri): void => {
        for (const p of previews.keys()) {
          const loaded = decks.last(p);
          if (loaded?.dependencies.includes(uri.fsPath)) void decks.load(p).catch(() => undefined);
        }
      };
      w.onDidChange(reload);
      w.onDidCreate(reload);
      return w;
    })(),

    vscode.commands.registerCommand('forme.openPreview', (uri?: vscode.Uri) => openPreview(uri, false)),
    vscode.commands.registerCommand('forme.openPreviewToSide', (uri?: vscode.Uri) => openPreview(uri, true)),
    vscode.commands.registerCommand('forme.export', (uri?: vscode.Uri) => exportDeck(uri)),
    vscode.commands.registerCommand('forme.exportPdf', (uri?: vscode.Uri) => exportDeck(uri, 'pdf')),
    vscode.commands.registerCommand('forme.exportPptx', (uri?: vscode.Uri) => exportDeck(uri, 'pptx')),
    vscode.commands.registerCommand('forme.newProject', newProject),

    vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
        const deckPath = (state as { deckPath?: string } | undefined)?.deckPath;
        if (!deckPath) {
          panel.dispose();
          return;
        }
        await decks.load(deckPath).catch(() => undefined);
        track(new Preview(deckPath, panel, decks, context.extensionUri, () => lastFormeEditor));
      },
    }),

    vscode.languages.registerDocumentSymbolProvider(SELECTOR, {
      provideDocumentSymbols: (doc) => outline(parsed(doc)).map((s) => toSymbol(doc, s)),
    }),

    vscode.languages.registerDefinitionProvider(SELECTOR, {
      async provideDefinition(doc, pos) {
        const d = parsed(doc);
        const hit = idAt(d, doc.offsetAt(pos));
        if (!hit) return null;
        const local = definitionsOf(d, hit.name, doc.offsetAt(pos));
        if (local.length) return local.map((s) => new vscode.Location(doc.uri, toRange(doc, s)));
        // slots, masters and components live in the theme
        const deckPath = isThemeSource(doc.getText()) ? null : doc.uri.fsPath;
        const themePath = deckPath ? (decks.last(deckPath) ?? (await decks.load(deckPath).catch(() => undefined)))?.themePath : null;
        if (!themePath) return null;
        const theme = await vscode.workspace.openTextDocument(vscode.Uri.file(themePath));
        return definitionsOf(parsed(theme), hit.name).map((s) => new vscode.Location(theme.uri, toRange(theme, s)));
      },
    }),

    vscode.languages.registerReferenceProvider(SELECTOR, {
      provideReferences(doc, pos) {
        const d = parsed(doc);
        const hit = idAt(d, doc.offsetAt(pos));
        return hit ? referencesOf(d, hit.name).map((s) => new vscode.Location(doc.uri, toRange(doc, s))) : null;
      },
    }),

    vscode.languages.registerDocumentHighlightProvider(SELECTOR, {
      provideDocumentHighlights(doc, pos) {
        const d = parsed(doc);
        const hit = idAt(d, doc.offsetAt(pos));
        return hit ? referencesOf(d, hit.name).map((s) => new vscode.DocumentHighlight(toRange(doc, s))) : null;
      },
    }),

    vscode.languages.registerRenameProvider(SELECTOR, {
      prepareRename(doc, pos) {
        const hit = idAt(parsed(doc), doc.offsetAt(pos));
        if (!hit) throw new Error('Nur IDs (@name) lassen sich umbenennen.');
        return { range: toRange(doc, { start: hit.span.start + 1, end: hit.span.end }), placeholder: hit.name };
      },
      async provideRenameEdits(doc, pos, newName) {
        const hit = idAt(parsed(doc), doc.offsetAt(pos));
        if (!hit) return null;
        const theme = isThemeSource(doc.getText());
        const deckPath = await decks.deckFor(doc);
        const loaded = deckPath ? await decks.load(deckPath) : null;
        if (!loaded) throw new Error('Keine Präsentation zu dieser Datei gefunden.');
        const res = computeEdit({ deck: loaded.deck, theme: loaded.theme, scene: loaded.scene, mode: theme ? 'theme' : 'deck' }, { type: 'rename', from: hit.name, to: newName.replace(/^@/, '') });
        if (res.error) throw new Error(res.error);
        const we = new vscode.WorkspaceEdit();
        for (const e of res.edits) we.replace(doc.uri, new vscode.Range(doc.positionAt(e.from), doc.positionAt(e.to)), e.insert);
        return we;
      },
    }),

    vscode.languages.registerColorProvider(SELECTOR, {
      provideDocumentColors: (doc) => colorsIn(parsed(doc)).map((c) => new vscode.ColorInformation(toRange(doc, c.span), new vscode.Color(...c.rgba))),
      provideColorPresentations: (color) => [new vscode.ColorPresentation(toHex([color.red, color.green, color.blue, color.alpha]))],
    }),

    vscode.languages.registerHoverProvider(SELECTOR, {
      async provideHover(doc, pos) {
        const d = parsed(doc);
        const offset = doc.offsetAt(pos);
        const hit = idAt(d, offset);
        if (!hit || isThemeSource(doc.getText())) return null;
        const loaded = decks.last(doc.uri.fsPath);
        if (!loaded || loaded.deck.source !== doc.getText()) return null;
        const at = idsAt(loaded.scene, loaded.deck, 'deck', offset);
        const slide = loaded.scene.slides.find((s) => s.id === at.slide);
        const node = slide?.byId.get(hit.name);
        if (!slide || !node) return null;
        return new vscode.Hover(new vscode.MarkdownString(hoverText(node, slide.id)), toRange(doc, hit.span));
      },
    }),

    vscode.languages.registerCompletionItemProvider(
      SELECTOR,
      {
        async provideCompletionItems(doc, pos) {
          const deckPath = await decks.deckFor(doc);
          const loaded = deckPath ? (decks.last(deckPath) ?? (await decks.load(deckPath).catch(() => undefined))) : undefined;
          if (!loaded) return null;
          const line = doc.lineAt(pos.line).text;
          const offset = doc.offsetAt(pos);
          const file = doc.uri.fsPath === loaded.themePath ? 'theme' : 'deck';
          const at = file === 'deck' ? idsAt(loaded.scene, loaded.deck, 'deck', Math.min(offset, loaded.deck.source.length)) : { slide: null };
          const slide = loaded.scene.slides.find((s) => s.id === at.slide) ?? null;
          const res = completeLine(line, pos.character, loaded.scene, slide);
          if (!res) return null;
          const range = new vscode.Range(pos.line, res.from, pos.line, pos.character);
          return res.items.map((it) => {
            const item = new vscode.CompletionItem(it.label, COMPLETION_KINDS[it.type]);
            item.range = range;
            if (it.detail) item.detail = it.detail;
            if (it.apply) item.insertText = it.apply;
            if (it.label.endsWith('=')) item.command = { title: '', command: 'editor.action.triggerSuggest' };
            return item;
          });
        },
      },
      '@',
      '$',
      '=',
      ' ',
    ),
  );

  for (const doc of vscode.workspace.textDocuments) schedule(doc, 0);
}

export function deactivate(): void {
  lastFormeEditor = undefined;
}
