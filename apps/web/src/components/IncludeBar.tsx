import type { JSX } from 'react';
import { actions, displaySlide, useEditor } from '../store.js';

/** Hints for `include`: the slide comes from another file, or this file was opened from a deck. */
export function IncludeBar(): JSX.Element | null {
  useEditor((s) => s.slideId);
  useEditor((s) => s.scene);
  const mode = useEditor((s) => s.mode);
  const from = useEditor((s) => s.includedFrom);
  const slide = displaySlide()?.slide;
  const rel = slide?.op.file === 'include' && mode === 'deck' ? slide.op.path : undefined;
  const back = from[from.length - 1];
  if (rel === undefined && !back) return null;
  return (
    <div className="include-bar" data-testid="include-bar">
      {rel !== undefined && (
        <>
          <span>
            Diese Folie stammt aus <code>{rel}</code> und wird dort bearbeitet.
          </span>
          <button type="button" className="tb-btn" data-testid="open-include" onClick={() => void actions.openIncluded(rel)}>
            Datei öffnen
          </button>
        </>
      )}
      {rel === undefined && back && (
        <>
          <span>
            Eingebunden in <code>{back}</code>.
          </span>
          <button type="button" className="tb-btn" data-testid="back-include" onClick={() => void actions.backToIncluding()}>
            Zurück
          </button>
        </>
      )}
    </div>
  );
}
