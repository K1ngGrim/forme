import type { SlideScene } from '@forme/core';
import { renderSlideSvg } from '@forme/render';
import { memo, useState } from 'react';
import type { JSX } from 'react';
import { actions, resolveAsset, useEditor } from '../store.js';

/** Rendered thumbnails per slide object: unchanged slides are reused by the evaluator. */
const thumbCache = new WeakMap<SlideScene, string>();

function thumbSvg(scene: Parameters<typeof renderSlideSvg>[0], slide: SlideScene): string {
  let svg = thumbCache.get(slide);
  if (svg === undefined) {
    svg = renderSlideSvg(scene, slide, { resolveAsset: (p) => resolveAsset(p), idPrefix: `th-${slide.id}-` });
    thumbCache.set(slide, svg);
  }
  return svg;
}

const Thumb = memo(function Thumb(props: { slide: SlideScene; svg: string }): JSX.Element {
  return <div className="thumb-svg" dangerouslySetInnerHTML={{ __html: props.svg }} />;
});

export function SlideList(): JSX.Element {
  const scene = useEditor((s) => s.scene);
  const lastGood = useEditor((s) => s.lastGood);
  const slideId = useEditor((s) => s.slideId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const layouts = scene.theme.layouts;

  const addSlide = (layout?: string): void => {
    void actions.intent({ type: 'addSlide', ...(slideId ? { after: slideId } : {}), ...(layout ? { layout } : {}) });
  };

  return (
    <div className="slide-list" data-testid="slide-list">
      <div className="slide-list-head">
        <span>Folien</span>
        <select
          className="add-slide"
          value=""
          onChange={(e) => addSlide(e.target.value || undefined)}
          title="Neue Folie mit Layout"
          data-testid="add-slide"
        >
          <option value="">+ Neue Folie</option>
          {layouts.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="slide-list-items">
        {scene.slides.map((s, i) => {
          const shown = s.hasErrors && lastGood[s.id] ? (lastGood[s.id] as SlideScene) : s;
          const svg = thumbSvg(scene, shown);
          return (
            <div
              key={s.id}
              className={`slide-item${s.id === slideId ? ' current' : ''}${s.hidden ? ' hidden-slide' : ''}${s.hasErrors ? ' has-errors' : ''}${dropIndex === i ? ' drop-before' : ''}`}
              onClick={() => actions.setSlide(s.id)}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDropIndex(i);
              }}
              onDragLeave={() => setDropIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropIndex(null);
                if (dragId && dragId !== s.id) void actions.intent({ type: 'moveSlide', slide: dragId, to: i });
                setDragId(null);
              }}
              data-testid={`slide-${s.id}`}
            >
              <div className="slide-num">{s.hidden ? '–' : s.n}</div>
              <div className="thumb">
                <Thumb slide={shown} svg={svg} />
                {s.hasErrors && <span className="thumb-badge" title="Fehler auf dieser Folie">!</span>}
              </div>
              <div className="slide-meta">
                <span className="slide-id">@{s.id}</span>
                {s.section && <span className="slide-section">{s.section}</span>}
              </div>
              <button
                type="button"
                className="slide-delete"
                title="Folie löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  void actions.intent({ type: 'deleteSlide', slide: s.id });
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
