import { renderSlideSvg } from '@forme/render';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { actions, resolveAsset, useEditor } from '../store.js';

/** Fullscreen presentation mode. Hidden slides are skipped. */
export function Presenter(): JSX.Element {
  const scene = useEditor((s) => s.scene);
  useEditor((s) => s.assetVersion);
  const startId = useEditor.getState().slideId;
  const slides = useMemo(() => scene.slides.filter((s) => !s.hidden), [scene]);
  const [index, setIndex] = useState(() => Math.max(0, slides.findIndex((s) => s.id === startId)));
  const ref = useRef<HTMLDivElement>(null);
  const slide = slides[Math.min(index, slides.length - 1)];

  useEffect(() => {
    void ref.current?.requestFullscreen?.().catch(() => undefined);
    const onKey = (e: KeyboardEvent): void => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) setIndex((i) => Math.min(slides.length - 1, i + 1));
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(slides.length - 1);
      else if (e.key === 'Escape') actions.present(false);
      else return;
      e.preventDefault();
    };
    const onFs = (): void => {
      if (!document.fullscreenElement) actions.present(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [slides.length]);

  useEffect(() => {
    if (slide) actions.setSlide(slide.id);
  }, [slide?.id]);

  const svg = slide ? renderSlideSvg(scene, slide, { resolveAsset: (p) => resolveAsset(p), embedFonts: true, idPrefix: 'pr-' }) : '';
  return (
    <div className="presenter" ref={ref} onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))} data-testid="presenter">
      <div className="presenter-slide" style={{ aspectRatio: `${scene.width} / ${scene.height}` }} dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="presenter-info">
        {index + 1} / {slides.length}
      </div>
    </div>
  );
}
