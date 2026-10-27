import type { ProjectFS } from './fs.js';
import type { EditorToHost, FsOp, HostToEditor } from './host-protocol.js';

/**
 * The editor inside VS Code: the extension hosts it in a webview (custom editor for .forme).
 * Files come from the extension, every change goes back to it as a text edit, so VS Code's
 * text editor and the canvas always show the same file.
 */
interface VsCodeApi {
  postMessage(m: EditorToHost): void;
  getState(): unknown;
  setState(s: unknown): void;
}

declare global {
  // provided by VS Code inside webviews
  // eslint-disable-next-line no-var
  var acquireVsCodeApi: (() => VsCodeApi) | undefined;
}

export class HostBridge {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private readonly listeners: ((m: HostToEditor) => void)[] = [];

  constructor(private readonly api: VsCodeApi) {
    window.addEventListener('message', (ev: MessageEvent<HostToEditor>) => {
      const m = ev.data;
      if (!m || typeof m !== 'object' || !('type' in m)) return;
      if (m.type === 'response') {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.ok) p.resolve(m.value);
        else p.reject(new Error(m.error));
        return;
      }
      for (const l of this.listeners) l(m);
    });
  }

  post(m: EditorToHost): void {
    this.api.postMessage(m);
  }

  on(listener: (m: HostToEditor) => void): void {
    this.listeners.push(listener);
  }

  request<T>(op: FsOp, args: { path?: string; text?: string; data?: Uint8Array } = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.post({ type: 'request', id, op, ...args });
    });
  }
}

/** The bridge when running inside VS Code, otherwise null (normal browser app). */
export const host: HostBridge | null = typeof globalThis.acquireVsCodeApi === 'function' ? new HostBridge(globalThis.acquireVsCodeApi()) : null;

export function inVsCode(): boolean {
  return host !== null;
}

/** Project files through the extension (open editors' unsaved text included). */
export class HostFS implements ProjectFS {
  readonly kind = 'host';
  constructor(private readonly bridge: HostBridge) {}

  readText(path: string): Promise<string | null> {
    return this.bridge.request<string | null>('readText', { path });
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const v = await this.bridge.request<Uint8Array | ArrayBuffer | number[] | null>('readBytes', { path });
    if (!v) return null;
    return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v);
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.bridge.request('writeText', { path, text });
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.bridge.request('writeBytes', { path, data });
  }

  list(): Promise<string[]> {
    return this.bridge.request<string[]>('list');
  }

  modified(path: string): Promise<number | null> {
    return this.bridge.request<number | null>('modified', { path });
  }
}
