import type { Diagnostic, FileRole, Span } from './diagnostics.js';

export type NodeKind =
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'path'
  | 'text'
  | 'list'
  | 'image'
  | 'table'
  | 'group';

export type PropValue = number | string | boolean;
export type Props = Record<string, PropValue>;

export type Scope = 'slide' | 'layout' | 'master' | 'theme' | 'component' | 'default';

/** Where an op lives. */
export interface OpRef {
  file: FileRole;
  /** Span of the op line (verb .. last argument). */
  span: Span;
  /** Span of the whole block including children. */
  blockSpan: Span;
  line: number;
  verb: string;
  scope: Scope;
}

/** Provenance: which op last wrote a property and how. */
export interface Prov {
  op: OpRef;
  /** Span of the value expression, when the value came from an argument. */
  value?: Span;
  /** The value is a plain literal that may be replaced verbatim. */
  literal: boolean;
  /** Unit of a literal number, so a rewrite can keep it. */
  unit?: '' | '%' | 'px';
  /** Written by a semantic op (align, distribute, stack, grid, in=, number ...). */
  semantic: boolean;
  /** Copied from another object or a style (like=, style=). */
  inherited: boolean;
  /** The literal is a relative amount (move dx/dy): rewrite adds the delta. */
  relative?: boolean;
  /** Argument key that produced the value. */
  key?: string;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  color?: string;
  href?: string;
}

export interface LayoutLine {
  runs: TextRun[];
  /** Width of the line in px. */
  width: number;
  /** Baseline y relative to the content top. */
  baseline: number;
  /** x offset relative to content left (bullets/indent and alignment applied). */
  x: number;
  /** Optional bullet text drawn at bulletX. */
  bullet?: string;
  bulletX?: number;
}

export interface TextLayout {
  lines: LayoutLine[];
  width: number;
  height: number;
}

export interface TableCellLayout {
  box: Box;
  text: TextLayout;
  header: boolean;
}

export interface TableLayout {
  cells: TableCellLayout[][];
  colWidths: number[];
  rowHeights: number[];
}

export interface SceneNode {
  id: string;
  kind: NodeKind;
  props: Props;
  prov: Record<string, Prov>;
  /** The op that created the object. */
  origin: OpRef;
  /** All ops that touched this object, in order. */
  touchedBy: OpRef[];
  /** Absolute bounding box on the slide. */
  box: Box;
  children: SceneNode[];
  parentId: string | null;
  /** Slot defined in the layout. */
  slot: boolean;
  /** Empty slot (only drawn in the editor). */
  placeholder: boolean;
  from: Scope;
  text?: TextLayout;
  table?: TableLayout;
  /** Points for polygon (relative to box). */
  points?: [number, number][];
  /** Natural bounding box of a path's coordinates (for scaling). */
  viewBox?: Box;
  /** List items. */
  items?: ListItem[];
  /** Table cells (raw markup). */
  rows?: string[][];
  /** Component name for `use` instances. */
  component?: string;
}

export interface ListItem {
  text: string;
  level: number;
}

export interface Background {
  fill: string;
  image?: string;
  fit?: string;
  prov?: Prov;
}

export interface SlideScene {
  id: string;
  index: number;
  /** Visible slide number (hidden slides do not count). */
  n: number;
  hidden: boolean;
  layout: string | null;
  master: string | null;
  op: OpRef;
  background: Background;
  /** Top-level nodes in z-order (bottom first). */
  nodes: SceneNode[];
  byId: Map<string, SceneNode>;
  notes: string;
  section: string;
  regions: Record<string, Box>;
  /** `${file}:${line}` -> ids touched by the op on that line. */
  opTargets: Map<string, string[]>;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
}

export interface FontDef {
  name: string;
  family: string;
  weight: number;
  italic: boolean;
  file?: string;
}

export interface ThemeInfo {
  name: string;
  width: number;
  height: number;
  tokens: Record<string, PropValue>;
  styles: Record<string, Props>;
  fonts: FontDef[];
  layouts: string[];
  masters: string[];
  components: string[];
  regions: Record<string, string[]>;
  slots: Record<string, string[]>;
}

export interface DeckScene {
  title: string;
  width: number;
  height: number;
  slides: SlideScene[];
  theme: ThemeInfo;
  /** Theme file path as written in the deck, if any. */
  themePath: string | null;
  diagnostics: Diagnostic[];
}
