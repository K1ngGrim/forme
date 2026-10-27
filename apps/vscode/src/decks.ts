import { dirname, resolve } from 'node:path';
import { parse, themePathOf } from '@forme/core';
import type { Diagnostic as FormeDiagnostic, Document, Span } from '@forme/core';
import type { LoadCache, LoadedDeck } from '@forme/export/node';
import { createLoadCache, loadDeck } from '@forme/export/node';
import * as vscode from 'vscode';
import { isThemeSource } from './language.js';

export const LANGUAGE_ID = 'forme';

export function isForme(doc: vscode.TextDocument): boolean {
  return doc.languageId === LANGUAGE_ID && doc.uri.scheme === 'file';
}

export function toRange(doc: vscode.TextDocument | { positionAt(o: number): vscode.Position }, span: Span): vscode.Range {
  return new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end));
}

function openDocument(path: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === path);
}

/** Source of a file: the open editor's text (also unsaved), otherwise undefined (read from disk). */
export function liveSource(path: string): string | undefined {
  return openDocument(path)?.getText();
}

/**
 * Decks and themes in the workspace. A deck is loaded with the text of open editors, so the
 * preview and diagnostics follow every keystroke, not only saves.
 */
export class Decks implements vscode.Disposable {
  private readonly caches = new Map<string, LoadCache>();
  /** theme path -> deck paths that use it */
  private readonly themeUsers = new Map<string, Set<string>>();
  private readonly loaded = new Map<string, LoadedDeck>();
  readonly diagnostics = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);
  private readonly onLoadEmitter = new vscode.EventEmitter<LoadedDeck>();
  /** Fires after a deck was (re)loaded. */
  readonly onLoad = this.onLoadEmitter.event;

  dispose(): void {
    this.diagnostics.dispose();
    this.onLoadEmitter.dispose();
  }

  last(deckPath: string): LoadedDeck | undefined {
    return this.loaded.get(deckPath);
  }

  async load(deckPath: string): Promise<LoadedDeck> {
    let cache = this.caches.get(deckPath);
    if (!cache) this.caches.set(deckPath, (cache = createLoadCache()));
    const deckSource = liveSource(deckPath);
    const themeRel = themePathOf(parse(deckSource ?? ''));
    const themeAbs = deckSource !== undefined && themeRel ? resolve(dirname(deckPath), themeRel) : null;
    const themeSource = themeAbs ? liveSource(themeAbs) : undefined;
    const loaded = await loadDeck(deckPath, {
      cache,
      ...(deckSource !== undefined ? { deckSource } : {}),
      ...(themeSource !== undefined ? { themeSource } : {}),
    });
    for (const users of this.themeUsers.values()) users.delete(deckPath);
    if (loaded.themePath) {
      const users = this.themeUsers.get(loaded.themePath) ?? new Set();
      users.add(deckPath);
      this.themeUsers.set(loaded.themePath, users);
    }
    this.loaded.set(deckPath, loaded);
    this.publish(loaded);
    this.onLoadEmitter.fire(loaded);
    return loaded;
  }

  /** Decks affected by a document: the deck itself, or every known deck using a theme. */
  async decksFor(doc: vscode.TextDocument): Promise<string[]> {
    const path = doc.uri.fsPath;
    if (!isThemeSource(doc.getText())) return [path];
    const known = this.themeUsers.get(path);
    if (known?.size) return [...known];
    // not seen yet: look for decks in the workspace that reference this theme
    const found: string[] = [];
    for (const uri of await vscode.workspace.findFiles('**/*.forme', '**/node_modules/**', 500)) {
      if (uri.fsPath === path) continue;
      const src = liveSource(uri.fsPath) ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      if (isThemeSource(src)) continue;
      const rel = themePathOf(parse(src));
      if (rel && resolve(dirname(uri.fsPath), rel) === path) found.push(uri.fsPath);
    }
    if (found.length) this.themeUsers.set(path, new Set(found));
    return found;
  }

  /** The deck a document belongs to (for preview and export). */
  async deckFor(doc: vscode.TextDocument): Promise<string | null> {
    return (await this.decksFor(doc))[0] ?? null;
  }

  /** Re-check a changed document: its decks, or a lone theme file on its own. */
  async refresh(doc: vscode.TextDocument): Promise<void> {
    const decks = await this.decksFor(doc);
    if (!decks.length) {
      // a theme nobody uses yet: syntax errors only
      const parsed = parse(doc.getText());
      this.diagnostics.set(doc.uri, parsed.diagnostics.map((d) => toVsDiagnostic(d, doc)));
      return;
    }
    await Promise.all(decks.map((d) => this.load(d).catch((e: unknown) => this.loadFailed(d, e))));
  }

  private loadFailed(deckPath: string, e: unknown): void {
    const doc = openDocument(deckPath);
    const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), `Forme: ${(e as Error).message}`, vscode.DiagnosticSeverity.Error);
    this.diagnostics.set(doc?.uri ?? vscode.Uri.file(deckPath), [d]);
  }

  private publish(loaded: LoadedDeck): void {
    const deckUri = vscode.Uri.file(loaded.deckPath);
    const deckDoc = openDocument(loaded.deckPath) ?? positions(loaded.deck);
    const themeDoc = loaded.themePath ? (openDocument(loaded.themePath) ?? (loaded.theme ? positions(loaded.theme) : null)) : null;
    const forDeck: vscode.Diagnostic[] = [];
    const forTheme: vscode.Diagnostic[] = [];
    for (const d of loaded.scene.diagnostics) {
      if (d.file === 'theme') {
        if (themeDoc) forTheme.push(toVsDiagnostic(d, themeDoc));
      } else forDeck.push(toVsDiagnostic(d, deckDoc));
    }
    this.diagnostics.set(deckUri, forDeck);
    if (loaded.themePath) this.diagnostics.set(vscode.Uri.file(loaded.themePath), dedupe(forTheme));
  }
}

/** Position lookup for files that are not open in an editor. */
function positions(doc: Document): { positionAt(o: number): vscode.Position } {
  const starts = doc.lines.map((l) => l.start);
  return {
    positionAt(o: number): vscode.Position {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((starts[mid] as number) <= o) lo = mid;
        else hi = mid - 1;
      }
      return new vscode.Position(lo, o - (starts[lo] ?? 0));
    },
  };
}

function dedupe(list: vscode.Diagnostic[]): vscode.Diagnostic[] {
  const seen = new Set<string>();
  return list.filter((d) => {
    const key = `${d.range.start.line}:${d.range.start.character}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toVsDiagnostic(d: FormeDiagnostic, doc: { positionAt(o: number): vscode.Position }): vscode.Diagnostic {
  const severity = d.severity === 'error' ? vscode.DiagnosticSeverity.Error : d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
  const out = new vscode.Diagnostic(toRange(doc, d.span), d.message, severity);
  out.source = 'forme';
  return out;
}
