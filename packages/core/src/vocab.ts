/** Language vocabulary shared by evaluator, autocomplete and docs. */

export const CREATE_VERBS = [
  'rect',
  'ellipse',
  'line',
  'arrow',
  'polygon',
  'path',
  'text',
  'list',
  'image',
  'table',
  'group',
  'use',
] as const;

export const MODIFY_VERBS = ['set', 'move', 'resize', 'round', 'style', 'stroke', 'shadow', 'opacity', 'hide', 'show', 'z'] as const;
export const ARRANGE_VERBS = ['align', 'distribute', 'stack', 'grid'] as const;
export const SLIDE_VERBS = ['fill', 'notes', 'background', 'number'] as const;
export const DECK_VERBS = ['deck', 'theme', 'slide', 'section', 'counter'] as const;
export const THEME_VERBS = ['theme', 'size', 'token', 'color', 'font', 'style', 'master', 'layout', 'component', 'counter'] as const;
export const LAYOUT_VERBS = ['slot', 'region', 'background', 'hide'] as const;

export const ALL_VERBS: string[] = Array.from(
  new Set<string>([
    ...CREATE_VERBS,
    ...MODIFY_VERBS,
    ...ARRANGE_VERBS,
    ...SLIDE_VERBS,
    ...DECK_VERBS,
    ...THEME_VERBS,
    ...LAYOUT_VERBS,
    'item',
    'row',
  ]),
);

const BOX = ['x', 'y', 'w', 'h'];
const PAINT = ['fill', 'stroke', 'stroke.width', 'stroke.dash', 'opacity', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.color', 'hidden'];
const RADIUS = ['radius', 'radius.tl', 'radius.tr', 'radius.br', 'radius.bl'];
const META = ['like', 'style', 'in'];
const TEXT = ['font', 'size', 'weight', 'italic', 'color', 'line', 'align', 'valign', 'anchor', 'pad', 'text'];

export const KEYS_BY_VERB: Record<string, string[]> = {
  rect: [...BOX, ...PAINT, ...RADIUS, ...META],
  ellipse: [...BOX, ...PAINT, ...META],
  line: ['x', 'y', 'x2', 'y2', 'stroke', 'stroke.width', 'stroke.dash', 'opacity', 'hidden', ...META],
  arrow: ['x', 'y', 'x2', 'y2', 'stroke', 'stroke.width', 'stroke.dash', 'opacity', 'hidden', 'head', ...META],
  polygon: [...BOX, ...PAINT, 'points', ...META],
  path: [...BOX, ...PAINT, 'd', ...META],
  text: [...BOX, ...PAINT, ...RADIUS, ...TEXT, ...META],
  list: [...BOX, ...PAINT, ...TEXT, 'bullet', ...META],
  image: [...BOX, 'opacity', 'hidden', 'src', 'fit', ...RADIUS, 'stroke', 'stroke.width', 'shadow.x', 'shadow.y', 'shadow.blur', 'shadow.color', ...META],
  table: ['x', 'y', 'w', 'font', 'size', 'color', 'pad', 'line', 'header', 'header.fill', 'header.color', 'border', 'stripe', 'cols', 'fill', 'opacity', 'hidden', ...META],
  group: ['x', 'y', 'opacity', 'hidden'],
  use: ['x', 'y', 'w', 'h', 'opacity', 'hidden'],
  slot: [...BOX, ...PAINT, ...RADIUS, ...TEXT, 'kind', 'placeholder', 'src', 'fit', 'bullet', ...META],
  set: [...BOX, ...PAINT, ...RADIUS, ...TEXT, 'x2', 'y2', 'head', 'src', 'fit', 'points', 'd', 'bullet', 'kind', 'placeholder', 'header', 'header.fill', 'header.color', 'border', 'stripe', 'cols'],
  move: ['dx', 'dy'],
  resize: ['w', 'h'],
  round: ['tl', 'tr', 'br', 'bl'],
  stroke: ['color', 'width', 'dash'],
  shadow: ['x', 'y', 'blur', 'color'],
  align: ['to'],
  distribute: ['within', 'gap'],
  stack: ['gap', 'align', 'x', 'y'],
  grid: ['cols', 'gap', 'within', 'x', 'y', 'w', 'rowh'],
  number: ['caption', 'pos', 'gap', 'style'],
  background: ['fill', 'image', 'fit'],
  slide: ['layout', 'master', 'hidden'],
  layout: ['master'],
  font: ['weight', 'italic', 'file'],
  style: ['font', 'size', 'weight', 'italic', 'color', 'line', 'align', 'valign', 'pad', 'fill', 'stroke', 'stroke.width', 'radius', 'base'],
  region: BOX,
  counter: ['start'],
  component: ['w', 'h'],
  item: ['level'],
};

export const NUMERIC_KEYS = new Set([
  'x',
  'y',
  'w',
  'h',
  'x2',
  'y2',
  'size',
  'weight',
  'line',
  'pad',
  'opacity',
  'radius.tl',
  'radius.tr',
  'radius.br',
  'radius.bl',
  'stroke.width',
  'stroke.dash',
  'shadow.x',
  'shadow.y',
  'shadow.blur',
  'level',
]);

export const COLOR_KEYS = new Set(['fill', 'color', 'stroke', 'shadow.color', 'border', 'header.fill', 'header.color', 'stripe']);
export const BOOL_KEYS = new Set(['italic', 'hidden', 'header']);

export const ENUM_VALUES: Record<string, string[]> = {
  align: ['left', 'center', 'right'],
  valign: ['top', 'middle', 'bottom'],
  anchor: ['left', 'center', 'right'],
  fit: ['contain', 'cover', 'fill'],
  head: ['end', 'start', 'both', 'none'],
  bullet: ['disc', 'dash', 'number', 'none'],
  kind: ['text', 'image'],
  pos: ['below', 'above'],
};

export const ALIGN_MODES = ['left', 'center', 'right', 'top', 'middle', 'bottom'];
export const DIRECTIONS = ['h', 'v'];
export const Z_MODES = ['front', 'back', 'forward', 'backward'];
