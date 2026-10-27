import type { DeckScene, Document, FileRole, SceneNode } from '@forme/core';
import { fontFaceCss, renderSlideSvg } from '@forme/render';
import { blockAt } from './language.js';
import type { HostMessage, PreviewSlide } from './protocol.js';

function collect(nodes: SceneNode[], boxes: PreviewSlide['boxes'], locked: string[]): void {
  for (const n of nodes) {
    boxes[n.id] = [n.box.x, n.box.y, n.box.w, n.box.h];
    if (n.prov.x?.layout === 'parent' || n.prov.y?.layout === 'parent') locked.push(n.id);
    collect(n.children, boxes, locked);
  }
}

/**
 * Scene -> preview message. Slides with errors keep their last good rendering (`lastGood`,
 * updated in place) and are marked stale, like in the web editor.
 */
export function sceneMessage(key: string, scene: DeckScene, resolveAsset: (p: string) => string, lastGood: Map<string, PreviewSlide>): HostMessage {
  const slides: PreviewSlide[] = scene.slides.map((s) => {
    const prev = lastGood.get(s.id);
    if (s.hasErrors && prev) return { ...prev, n: s.n, hidden: s.hidden, stale: true };
    const boxes: PreviewSlide['boxes'] = {};
    const locked: string[] = [];
    collect(s.nodes, boxes, locked);
    const view: PreviewSlide = {
      id: s.id,
      n: s.n,
      hidden: s.hidden,
      stale: s.hasErrors,
      svg: renderSlideSvg(scene, s, { resolveAsset, editor: true, idPrefix: `${s.id}-` }),
      boxes,
      locked,
    };
    if (!s.hasErrors) lastGood.set(s.id, view);
    return view;
  });
  return { type: 'scene', key, title: scene.title, width: scene.width, height: scene.height, fontCss: fontFaceCss(scene.theme.fonts, resolveAsset), slides };
}

/** Objects touched by the op under the cursor (cursor -> selection in the preview). */
export function idsAt(scene: DeckScene, doc: Document, file: FileRole, offset: number): { slide: string | null; ids: string[] } {
  const line = doc.lines.find((l) => offset >= l.start && offset <= l.fullEnd)?.index ?? -1;
  for (const s of scene.slides) {
    const ids = s.opTargets.get(`${file}:${line}`);
    if (ids?.length) return { slide: s.id, ids };
  }
  if (file === 'deck') {
    const block = blockAt(doc, offset);
    const slide = block ? scene.slides.find((s) => s.op.line === block.line.index) : undefined;
    if (slide) return { slide: slide.id, ids: [] };
  }
  return { slide: null, ids: [] };
}
