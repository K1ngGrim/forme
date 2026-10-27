// Live editor for examples: the code becomes editable and the preview is re-rendered with the
// real compiler (core + render) on every change. Loaded on demand.
import { highlightSource, parse } from '@forme/core';
import type { Document, ImageSize, TextMeasurer } from '@forme/core';
import { createFontMeasurer } from '@forme/render';
import { assetResolver, prepareExample, renderExample } from '../examples.js';

interface ExamplesData {
  themes: { guide: string };
  imageSizes: Record<string, ImageSize>;
  fonts: { file: string; weight: number; italic: boolean }[];
}

let shared: Promise<{ measurer: TextMeasurer; themes: { name: string; doc: Document | null }[]; imageSizes: Record<string, ImageSize> }> | null = null;

function load(root: string): NonNullable<typeof shared> {
  shared ??= (async () => {
    const data = (await (await fetch(`${root}assets/examples.json`)).json()) as ExamplesData;
    const fonts = await Promise.all(
      data.fonts.map(async (f) => ({ family: 'Inter', weight: f.weight, italic: f.italic, data: await (await fetch(`${root}assets/fonts/${f.file}`)).arrayBuffer() })),
    );
    return {
      measurer: createFontMeasurer(fonts),
      themes: [
        { name: 'standard', doc: null },
        { name: 'guide', doc: parse(data.themes.guide) },
      ],
      imageSizes: data.imageSizes,
    };
  })();
  return shared;
}

function highlighted(code: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return highlightSource(code)
    .map((s) => (s.cls ? `<span class="hl-${s.cls}">${esc(s.text)}</span>` : esc(s.text)))
    .join('');
}

let counter = 0;

export async function makeEditable(figure: HTMLElement, root: string): Promise<void> {
  const ctx = await load(root);
  const codeBox = figure.querySelector('.example-code') as HTMLElement;
  const pre = codeBox.querySelector('pre') as HTMLPreElement;
  const preview = figure.querySelector('.example-preview') as HTMLElement;
  const original = pre.textContent ?? '';
  const id = `live${counter++}`;

  const editor = document.createElement('div');
  editor.className = 'live-editor';
  const backdrop = document.createElement('pre');
  backdrop.className = 'code forme';
  backdrop.setAttribute('aria-hidden', 'true');
  const area = document.createElement('textarea');
  area.spellcheck = false;
  area.value = original;
  area.setAttribute('aria-label', 'Beispiel bearbeiten');
  editor.append(backdrop, area);
  const status = document.createElement('p');
  status.className = 'live-status';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'edit';
  reset.textContent = 'Zurücksetzen';
  codeBox.replaceChildren(editor, reset);
  figure.after(status);
  figure.classList.add('editing');

  const sync = (): void => {
    backdrop.innerHTML = `${highlighted(area.value)}\n`;
    area.style.height = '0';
    area.style.height = `${area.scrollHeight}px`;
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const render = (): void => {
    const ex = prepareExample(area.value);
    if (!ex) {
      status.textContent = 'Dieses Stück Code lässt sich nicht allein darstellen.';
      status.className = 'live-status error';
      return;
    }
    const res = renderExample(ex, { ...ctx, resolveAsset: assetResolver(root) }, `${id}-${Date.now().toString(36)}`);
    if (res.slides.length) {
      preview.innerHTML = res.slides.map((svg) => `<div class="slide">${svg}</div>`).join('');
      figure.classList.toggle('multi', res.slides.length > 1);
    }
    status.textContent = res.errors.length ? res.errors.join(' · ') : 'Live: Änderungen erscheinen sofort.';
    status.className = `live-status${res.errors.length ? ' error' : ''}`;
  };

  area.addEventListener('input', () => {
    sync();
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 120);
  });
  area.addEventListener('scroll', () => {
    backdrop.scrollLeft = area.scrollLeft;
  });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end');
      area.dispatchEvent(new Event('input'));
    }
  });
  reset.addEventListener('click', () => {
    area.value = original;
    area.dispatchEvent(new Event('input'));
  });
  sync();
  render();
  area.focus();
}
