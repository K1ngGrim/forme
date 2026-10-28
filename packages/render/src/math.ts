import type { MathRenderer } from '@forme/core';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/braket/BraketConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

/** TeX packages available in `math` (the rest of MathJax is left out to keep the bundle small). */
export const TEX_PACKAGES = ['base', 'ams', 'boldsymbol', 'braket', 'cancel', 'color', 'newcommand', 'textmacros'];

type Converter = (tex: string, display: boolean) => ReturnType<MathRenderer>;

let converter: Converter | null = null;

function init(): Converter {
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', { InputJax: new TeX({ packages: TEX_PACKAGES }), OutputJax: new SVG({ fontCache: 'none' }) });
  return (tex, display) => {
    const node = doc.convert(tex, { display });
    const svg = adaptor.innerHTML(node);
    const error = /data-mjx-error="([^"]*)"/.exec(svg)?.[1];
    const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
    const body = /^<svg[^>]*>([\s\S]*)<\/svg>$/.exec(svg)?.[1] ?? '';
    const w = vb ? Number(vb[3]) / 1000 : 0;
    const h = vb ? Number(vb[4]) / 1000 : 0;
    return { body, viewBox: vb ? `${vb[1]} ${vb[2]} ${vb[3]} ${vb[4]}` : '0 0 0 0', w, h, ...(error ? { error: unescapeAttr(error) } : {}) };
  };
}

function unescapeAttr(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Formula typesetting with MathJax (TeX input, SVG output). Pure JavaScript, no DOM needed. */
export function createMathRenderer(): MathRenderer {
  const cache = new Map<string, ReturnType<MathRenderer>>();
  return (tex, display) => {
    const key = `${display ? 'D' : 'I'}${tex}`;
    let r = cache.get(key);
    if (!r) {
      converter ??= init();
      try {
        r = converter(tex, display);
      } catch (e) {
        r = { body: '', viewBox: '0 0 0 0', w: 0, h: 0, error: (e as Error).message };
      }
      cache.set(key, r);
    }
    return r;
  };
}
