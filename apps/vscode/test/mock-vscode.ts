// A small in-memory stand-in for the `vscode` module: enough to activate the extension, call its
// providers, open the preview and apply workspace edits. Used with vi.mock('vscode').
import { readFileSync } from 'node:fs';

type Listener<T> = (e: T) => void;

export class EventEmitter<T> {
  private listeners: Listener<T>[] = [];
  event = (l: Listener<T>): { dispose(): void } => {
    this.listeners.push(l);
    return { dispose: () => (this.listeners = this.listeners.filter((x) => x !== l)) };
  };
  fire(e: T): void {
    for (const l of [...this.listeners]) l(e);
  }
  dispose(): void {
    this.listeners = [];
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(a: Position | number, b: Position | number, c?: number, d?: number) {
    if (typeof a === 'number') {
      this.start = new Position(a, b as number);
      this.end = new Position(c as number, d as number);
    } else {
      this.start = a;
      this.end = b as Position;
    }
  }
}
export class Selection extends Range {
  get active(): Position {
    return this.end;
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
  ) {}
  static file(p: string): Uri {
    return new Uri('file', p);
  }
  static joinPath(u: Uri, ...parts: string[]): Uri {
    return new Uri(u.scheme, [u.fsPath, ...parts].join('/'));
  }
  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class MockDocument {
  languageId = 'forme';
  version = 1;
  constructor(
    readonly uri: Uri,
    public text: string,
  ) {}
  getText(): string {
    return this.text;
  }
  offsetAt(p: Position): number {
    const lines = this.text.split('\n');
    let o = 0;
    for (let i = 0; i < p.line; i++) o += (lines[i] ?? '').length + 1;
    return o + p.character;
  }
  positionAt(o: number): Position {
    const before = this.text.slice(0, o);
    const line = before.split('\n').length - 1;
    return new Position(line, o - (before.lastIndexOf('\n') + 1));
  }
  lineAt(line: number): { text: string } {
    return { text: this.text.split('\n')[line] ?? '' };
  }
}

export class WorkspaceEdit {
  readonly edits: { uri: Uri; range: Range; text: string }[] = [];
  replace(uri: Uri, range: Range, text: string): void {
    this.edits.push({ uri, range, text });
  }
}

const enumOf = (...names: string[]): Record<string, number> => Object.fromEntries(names.map((n, i) => [n, i]));
export const DiagnosticSeverity = enumOf('Error', 'Warning', 'Information', 'Hint');
export const SymbolKind = enumOf('File', 'Module', 'Namespace', 'Package', 'Class', 'Method', 'Property', 'Field', 'Constructor', 'Enum', 'Interface', 'Function', 'Variable', 'Constant', 'String', 'Number', 'Boolean', 'Array', 'Object', 'Key', 'Null', 'EnumMember', 'Struct');
export const CompletionItemKind = enumOf('Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant');
export const ViewColumn = { Active: -1, Beside: -2 };
export const ProgressLocation = { Notification: 15 };
export const OverviewRulerLane = { Center: 2 };
export const TextEditorRevealType = { InCenterIfOutsideViewport: 2 };

export class Diagnostic {
  source?: string;
  constructor(
    readonly range: Range,
    readonly message: string,
    readonly severity: number,
  ) {}
}
export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    readonly name: string,
    readonly detail: string,
    readonly kind: number,
    readonly range: Range,
    readonly selectionRange: Range,
  ) {}
}
export class Location {
  constructor(
    readonly uri: Uri,
    readonly range: Range,
  ) {}
}
export class DocumentHighlight {
  constructor(readonly range: Range) {}
}
export class CompletionItem {
  range?: Range;
  detail?: string;
  insertText?: string;
  command?: unknown;
  constructor(
    readonly label: string,
    readonly kind: number,
  ) {}
}
export class Color {
  constructor(
    readonly red: number,
    readonly green: number,
    readonly blue: number,
    readonly alpha: number,
  ) {}
}
export class ColorInformation {
  constructor(
    readonly range: Range,
    readonly color: Color,
  ) {}
}
export class ColorPresentation {
  constructor(readonly label: string) {}
}
export class Hover {
  constructor(
    readonly contents: MarkdownString,
    readonly range?: Range,
  ) {}
}
export class MarkdownString {
  constructor(readonly value: string) {}
}
export class ThemeColor {
  constructor(readonly id: string) {}
}

// ---------------------------------------------------------------------------
// State the tests inspect

export const state = {
  docs: [] as MockDocument[],
  providers: {} as Record<string, unknown>,
  commands: {} as Record<string, (...args: unknown[]) => unknown>,
  diagnostics: new Map<string, Diagnostic[]>(),
  panels: [] as MockPanel[],
  messages: [] as string[],
  editors: [] as MockEditor[],
  inputBox: undefined as string | undefined,
  warningAnswer: undefined as string | undefined,
};

const onOpen = new EventEmitter<MockDocument>();
const onChange = new EventEmitter<{ document: MockDocument; contentChanges: unknown[] }>();
const onSelection = new EventEmitter<{ textEditor: MockEditor; selections: Selection[] }>();
const noopEvent = new EventEmitter<unknown>().event;

export class MockEditor {
  selection = new Selection(new Position(0, 0), new Position(0, 0));
  decorations: Range[] = [];
  constructor(readonly document: MockDocument) {}
  setDecorations(_t: unknown, ranges: Range[]): void {
    this.decorations = ranges;
  }
  revealRange(): void {}
  /** Simulate the user moving the cursor. */
  moveCursor(offset: number): void {
    const p = this.document.positionAt(offset);
    this.selection = new Selection(p, p);
    onSelection.fire({ textEditor: this, selections: [this.selection] });
  }
}

export class MockPanel {
  readonly received = new EventEmitter<unknown>();
  readonly disposed = new EventEmitter<void>();
  readonly posted: unknown[] = [];
  title: string;
  iconPath: unknown;
  webview = {
    options: {} as { localResourceRoots?: Uri[] },
    html: '',
    cspSource: 'file:',
    asWebviewUri: (u: Uri): Uri => u,
    onDidReceiveMessage: this.received.event,
    postMessage: async (m: unknown): Promise<boolean> => {
      this.posted.push(m);
      this.onPost?.(m);
      return true;
    },
  };
  onPost?: (m: unknown) => void;
  constructor(title: string) {
    this.title = title;
  }
  onDidDispose = this.disposed.event;
  reveal(): void {}
  dispose(): void {
    this.disposed.fire();
  }
}

export function openDoc(path: string, text?: string): MockDocument {
  let d = state.docs.find((x) => x.uri.fsPath === path);
  if (!d) {
    d = new MockDocument(Uri.file(path), text ?? readFileSync(path, 'utf8'));
    state.docs.push(d);
    onOpen.fire(d);
  }
  return d;
}

export function showEditor(doc: MockDocument): MockEditor {
  const e = new MockEditor(doc);
  state.editors.push(e);
  window.activeTextEditor = e;
  return e;
}

/** Simulate typing: replace the whole text and fire the change event. */
export function typeText(doc: MockDocument, text: string): void {
  doc.text = text;
  doc.version++;
  onChange.fire({ document: doc, contentChanges: [{}] });
}

const register =
  (name: string) =>
  (_selector: unknown, provider: unknown): { dispose(): void } => {
    state.providers[name] = provider;
    return { dispose() {} };
  };

export const languages = {
  createDiagnosticCollection: () => ({
    set: (uri: Uri, list: Diagnostic[]) => state.diagnostics.set(uri.fsPath, list),
    dispose() {},
  }),
  registerDocumentSymbolProvider: register('symbols'),
  registerDefinitionProvider: register('definition'),
  registerReferenceProvider: register('references'),
  registerDocumentHighlightProvider: register('highlight'),
  registerRenameProvider: register('rename'),
  registerColorProvider: register('color'),
  registerHoverProvider: register('hover'),
  registerCompletionItemProvider: register('completion'),
};

export const window = {
  activeTextEditor: undefined as MockEditor | undefined,
  get visibleTextEditors(): MockEditor[] {
    return state.editors;
  },
  createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
  createTextEditorDecorationType: () => ({ dispose() {} }),
  createWebviewPanel: (_type: string, title: string) => {
    const p = new MockPanel(title);
    state.panels.push(p);
    return p;
  },
  registerWebviewPanelSerializer: () => ({ dispose() {} }),
  showInformationMessage: async (m: string) => (state.messages.push(m), undefined),
  showWarningMessage: async (m: string) => (state.messages.push(m), state.warningAnswer),
  showErrorMessage: async (m: string) => (state.messages.push(m), undefined),
  showInputBox: async () => state.inputBox,
  onDidChangeTextEditorSelection: onSelection.event,
  onDidChangeActiveTextEditor: noopEvent,
};

export const workspace = {
  get textDocuments(): MockDocument[] {
    return state.docs;
  },
  workspaceFolders: undefined,
  onDidOpenTextDocument: onOpen.event,
  onDidChangeTextDocument: onChange.event,
  onDidSaveTextDocument: noopEvent,
  onDidCloseTextDocument: noopEvent,
  openTextDocument: async (uri: Uri) => openDoc(uri.fsPath),
  applyEdit: async (we: WorkspaceEdit) => {
    const byDoc = new Map<MockDocument, { from: number; to: number; text: string }[]>();
    for (const e of we.edits) {
      const doc = openDoc(e.uri.fsPath);
      const list = byDoc.get(doc) ?? [];
      list.push({ from: doc.offsetAt(e.range.start), to: doc.offsetAt(e.range.end), text: e.text });
      byDoc.set(doc, list);
    }
    for (const [doc, list] of byDoc) {
      let t = doc.text;
      for (const e of list.sort((a, b) => b.from - a.from)) t = t.slice(0, e.from) + e.text + t.slice(e.to);
      typeText(doc, t);
    }
    return true;
  },
  findFiles: async () => [],
  fs: { readFile: async (u: Uri) => readFileSync(u.fsPath) },
  getConfiguration: () => ({ get: () => undefined }),
  createFileSystemWatcher: () => ({ onDidChange: noopEvent, onDidCreate: noopEvent, dispose() {} }),
};

export const commands = {
  registerCommand: (name: string, fn: (...args: unknown[]) => unknown) => {
    state.commands[name] = fn;
    return { dispose() {} };
  },
};

export const env = { openExternal: async () => true };
