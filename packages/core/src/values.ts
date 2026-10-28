import type { Diagnostic, FileRole } from './diagnostics.js';
import { diag } from './diagnostics.js';
import type { Expr } from './expr.js';
import { parseInterpolation } from './expr.js';
import type { Box, PropValue, SceneNode } from './scene.js';

export type Axis = 'x' | 'y' | null;

export interface EvalEnv {
  src: string;
  file: FileRole;
  diags: Diagnostic[];
  slideW: number;
  slideH: number;
  /** Visible slide number. */
  slideN: number;
  deckTotal: number;
  deckTitle: string;
  /** Number of `section` ops in the deck. */
  deckSections: number;
  section: string;
  sectionN: number;
  tokens: Record<string, PropValue>;
  counters: Record<string, number>;
  regions: Record<string, Box>;
  objects: Map<string, SceneNode> | null;
  /** Origin of the enclosing group/component: references inside containers are relative. */
  origin: { x: number; y: number };
  params: Record<string, PropValue> | null;
  /** Inner size of the enclosing box (null on an axis without fixed size); null outside boxes. */
  box?: { w: number | null; h: number | null } | null;
}

const X_KEYS = new Set(['x', 'w', 'x2', 'dx', 'left', 'right', 'cx', 'gap.x']);
const Y_KEYS = new Set(['y', 'h', 'y2', 'dy', 'top', 'bottom', 'cy', 'gap.y']);

export function axisOf(key: string | undefined): Axis {
  if (!key) return null;
  if (X_KEYS.has(key)) return 'x';
  if (Y_KEYS.has(key)) return 'y';
  return null;
}

export function boxMember(b: Box, prop: string, axis: Axis): number | undefined {
  switch (prop) {
    case 'x':
    case 'left':
      return b.x;
    case 'y':
    case 'top':
      return b.y;
    case 'w':
    case 'width':
      return b.w;
    case 'h':
    case 'height':
      return b.h;
    case 'right':
      return b.x + b.w;
    case 'bottom':
      return b.y + b.h;
    case 'cx':
      return b.x + b.w / 2;
    case 'cy':
    case 'middle':
      return b.y + b.h / 2;
    case 'center':
      return axis === 'y' ? b.y + b.h / 2 : b.x + b.w / 2;
    default:
      return undefined;
  }
}

function err(env: EvalEnv, msg: string, e: Expr): undefined {
  env.diags.push(diag('error', msg, e.span, env.file));
  return undefined;
}

/** Ids referenced anywhere inside an expression (for dependency checks and delete warnings). */
export function referencedIds(e: Expr, out: string[] = []): string[] {
  switch (e.k) {
    case 'id':
      out.push(e.name);
      break;
    case 'member':
      referencedIds(e.obj, out);
      break;
    case 'bin':
      referencedIds(e.l, out);
      referencedIds(e.r, out);
      break;
    case 'neg':
    case 'paren':
      referencedIds(e.e, out);
      break;
    case 'call':
      for (const a of e.args) referencedIds(a, out);
      break;
    default:
      break;
  }
  return out;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function callFn(env: EvalEnv, e: Extract<Expr, { k: 'call' }>, axis: Axis): PropValue | undefined {
  const args = e.args.map((a) => evalExpr(env, a, axis));
  const nums = args.map((a) => (typeof a === 'number' ? a : NaN));
  switch (e.name) {
    case 'rgba':
    case 'rgb': {
      if (nums.length < 3 || nums.slice(0, 3).some(Number.isNaN)) return err(env, `${e.name}() erwartet Zahlen`, e);
      const a = nums.length > 3 && !Number.isNaN(nums[3] as number) ? (nums[3] as number) : 1;
      return `rgba(${clampByte(nums[0] as number)},${clampByte(nums[1] as number)},${clampByte(nums[2] as number)},${Math.max(0, Math.min(1, a))})`;
    }
    case 'min':
    case 'max':
      if (!nums.length || nums.some(Number.isNaN)) return err(env, `${e.name}() erwartet Zahlen`, e);
      return e.name === 'min' ? Math.min(...nums) : Math.max(...nums);
    case 'round':
    case 'floor':
    case 'ceil':
    case 'abs':
      if (nums.length !== 1 || Number.isNaN(nums[0] as number)) return err(env, `${e.name}() erwartet eine Zahl`, e);
      return Math[e.name](nums[0] as number);
    default:
      return err(env, `Unbekannte Funktion „${e.name}“`, e);
  }
}

function lookupName(env: EvalEnv, path: string[], e: Expr, axis: Axis): PropValue | undefined {
  const [head, ...rest] = path;
  const prop = rest.join('.');
  switch (head) {
    case 'slide':
      if (prop === 'w' || prop === 'width') return env.slideW;
      if (prop === 'h' || prop === 'height') return env.slideH;
      if (prop === 'n') return env.slideN;
      if (prop === 'cx' || (prop === 'center' && axis !== 'y')) return env.slideW / 2;
      if (prop === 'cy' || prop === 'middle' || prop === 'center') return env.slideH / 2;
      return err(env, `Unbekannte Eigenschaft „slide.${prop}“`, e);
    case 'deck':
      if (prop === 'total') return env.deckTotal;
      if (prop === 'title') return env.deckTitle;
      if (prop === 'sections') return env.deckSections;
      return err(env, `Unbekannte Eigenschaft „deck.${prop}“`, e);
    case 'section':
      if (!prop) return env.section;
      if (prop === 'n') return env.sectionN;
      return err(env, `Unbekannte Eigenschaft „section.${prop}“`, e);
    case 'param':
      if (!env.params) return err(env, '„param“ ist nur in Komponenten verfügbar', e);
      if (prop in env.params) return env.params[prop];
      return err(env, `Unbekannter Parameter „${prop}“`, e);
    case 'box': {
      if (!env.box) return err(env, '„box“ ist nur innerhalb einer Box verfügbar', e);
      const w = env.box.w;
      const h = env.box.h;
      const need = (v: number | null, what: string): PropValue | undefined => (v === null ? err(env, `Die Box hat keine feste ${what}`, e) : v);
      if (prop === 'w' || prop === 'width') return need(w, 'Breite');
      if (prop === 'h' || prop === 'height') return need(h, 'Höhe');
      if (prop === 'cx' || (prop === 'center' && axis !== 'y')) return w === null ? need(w, 'Breite') : w / 2;
      if (prop === 'cy' || prop === 'middle' || prop === 'center') return h === null ? need(h, 'Höhe') : h / 2;
      return err(env, `Unbekannte Eigenschaft „box.${prop}“ (verfügbar: w, h, cx, cy)`, e);
    }
    case 'counter':
      if (prop in env.counters) return env.counters[prop];
      return err(env, `Unbekannter Zähler „${prop}“`, e);
    default:
      break;
  }
  if (head !== undefined && head in env.regions) {
    const r = env.regions[head] as Box;
    if (!prop) return err(env, `Region „${head}“ braucht eine Eigenschaft, z. B. ${head}.x`, e);
    const v = boxMember(r, prop, axis);
    return v ?? err(env, `Unbekannte Eigenschaft „${prop}“`, e);
  }
  if (head !== undefined && !prop && head in env.counters) return env.counters[head];
  if (!prop && head !== undefined) return head; // bare identifier = keyword
  return err(env, `Unbekannter Name „${path.join('.')}“`, e);
}

function namePath(e: Expr): string[] | null {
  if (e.k === 'name') return [e.name];
  if (e.k === 'member') {
    const p = namePath(e.obj);
    return p ? [...p, e.prop] : null;
  }
  return null;
}

/** Evaluate an expression. Errors are reported as diagnostics and yield undefined. */
export function evalExpr(env: EvalEnv, e: Expr, axis: Axis = null): PropValue | undefined {
  switch (e.k) {
    case 'num':
      if (e.unit === '%') {
        // inside a box with a fixed size, percentages refer to its inner area
        const inner = env.box ? (axis === 'x' ? env.box.w : env.box.h) : null;
        return (e.value / 100) * (inner ?? (axis === 'x' ? env.slideW : env.slideH));
      }
      return e.value;
    case 'str':
      return interpolate(env, e);
    case 'color':
      return e.value;
    case 'dim':
      return `${e.w}x${e.h}`;
    case 'tok': {
      if (e.name in env.tokens) return env.tokens[e.name];
      return err(env, `Unbekanntes Token „$${e.name}“`, e);
    }
    case 'id': {
      return err(env, `„@${e.name}“ ist ein Objekt, kein Wert – z. B. @${e.name}.x verwenden`, e);
    }
    case 'name':
      return lookupName(env, [e.name], e, axis);
    case 'member': {
      if (e.obj.k === 'id') {
        const node = env.objects?.get(e.obj.name);
        if (!node) {
          return err(
            env,
            `Unbekanntes Objekt „@${e.obj.name}“ (Objekte müssen vor ihrer Verwendung definiert sein)`,
            e.obj,
          );
        }
        const b = node.box;
        const v = boxMember({ x: b.x - env.origin.x, y: b.y - env.origin.y, w: b.w, h: b.h }, e.prop, axis);
        if (v !== undefined) return v;
        const p = node.props[e.prop];
        if (p !== undefined) return p;
        return err(env, `Unbekannte Eigenschaft „${e.prop}“ von @${e.obj.name}`, e);
      }
      const path = namePath(e);
      if (path) return lookupName(env, path, e, axis);
      return err(env, 'Ungültiger Zugriff', e);
    }
    case 'paren':
      return evalExpr(env, e.e, axis);
    case 'neg': {
      const v = evalExpr(env, e.e, axis);
      if (v === undefined) return undefined;
      if (typeof v !== 'number') return err(env, 'Zahl erwartet', e);
      return -v;
    }
    case 'bin': {
      const l = evalExpr(env, e.l, axis);
      // percentages in a multiplication/division operand are scalars of the axis too
      const r = evalExpr(env, e.r, axis);
      if (l === undefined || r === undefined) return undefined;
      if (e.op === '+' && (typeof l === 'string' || typeof r === 'string')) return String(l) + String(r);
      if (typeof l !== 'number' || typeof r !== 'number') return err(env, 'Rechnen nur mit Zahlen möglich', e);
      switch (e.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          if (r === 0) return err(env, 'Division durch 0', e);
          return l / r;
      }
      return undefined;
    }
    case 'call':
      return callFn(env, e, axis);
    case 'error':
      return undefined;
  }
}

function formatInterp(v: PropValue): string {
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  return String(v);
}

export function interpolate(env: EvalEnv, e: Extract<Expr, { k: 'str' }>): string {
  if (!e.raw.includes('{')) return e.value;
  const parts = parseInterpolation(env.src, e.span, env.diags);
  let out = '';
  for (const p of parts) {
    if (p.text !== undefined) out += p.text;
    else if (p.expr) {
      const v = evalExpr(env, p.expr);
      if (v !== undefined) out += formatInterp(v);
    }
  }
  return out;
}

/** Ids referenced inside string interpolations. */
export function interpolationIds(src: string, e: Expr, diags: Diagnostic[]): string[] {
  if (e.k !== 'str' || !e.raw.includes('{')) return [];
  const out: string[] = [];
  for (const p of parseInterpolation(src, e.span, diags)) if (p.expr) referencedIds(p.expr, out);
  return out;
}
