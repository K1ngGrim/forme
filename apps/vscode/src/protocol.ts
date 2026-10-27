/** Messages between the extension host and the preview webview. */

export interface PreviewSlide {
  id: string;
  n: number;
  hidden: boolean;
  /** The slide has errors: shows the last good state and cannot be edited. */
  stale: boolean;
  svg: string;
  /** Boxes of all objects (nested ones too): id -> [x, y, w, h] in slide units. */
  boxes: Record<string, [number, number, number, number]>;
  /** Objects whose position is controlled by a row/column container (drag reorders instead). */
  locked: string[];
}

export type HostMessage =
  | { type: 'scene'; key: string; title: string; width: number; height: number; fontCss: string; slides: PreviewSlide[] }
  | { type: 'select'; slide: string | null; ids: string[]; reveal: boolean }
  | { type: 'error'; message: string };

export type ViewMessage =
  | { type: 'ready' }
  | { type: 'select'; slide: string; ids: string[] }
  | { type: 'move'; slide: string; ids: string[]; dx: number; dy: number }
  | { type: 'resize'; slide: string; id: string; box: { x: number; y: number; w: number; h: number }; height: boolean }
  | { type: 'editText'; slide: string; id: string }
  | { type: 'delete'; slide: string; ids: string[] };
