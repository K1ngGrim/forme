import type { JSX } from 'react';
import { diagnosticsFor, displaySlide, useEditor } from '../store.js';

export function StatusBar(): JSX.Element {
  const scene = useEditor((s) => s.scene);
  const mode = useEditor((s) => s.mode);
  const deckPath = useEditor((s) => s.deck.path);
  const themePath = useEditor((s) => s.theme?.path ?? null);
  const themeError = useEditor((s) => s.themeError);
  useEditor((s) => s.slideId);
  const deckDiags = diagnosticsFor('deck');
  const themeDiags = diagnosticsFor('theme');
  const errors = [...deckDiags, ...themeDiags].filter((d) => d.severity === 'error').length;
  const warnings = [...deckDiags, ...themeDiags].filter((d) => d.severity === 'warning').length;
  const d = displaySlide();
  const visible = scene.slides.filter((s) => !s.hidden).length;
  return (
    <div className="status-bar" data-testid="status-bar">
      <span className={errors ? 'st-errors' : 'st-ok'} title={[...deckDiags, ...themeDiags].map((x) => x.message).join('\n')}>
        {errors ? `${errors} Fehler` : 'Keine Fehler'}
        {warnings ? `, ${warnings} Warnungen` : ''}
      </span>
      <span>{mode === 'theme' ? 'Theme-Bearbeitungsmodus' : 'Deck'}</span>
      <span>
        Folie {d ? (d.slide.hidden ? '–' : d.slide.n) : 0} / {visible}
        {d?.stale ? ' (veraltet)' : ''}
      </span>
      <span className="st-path" title={themePath ?? ''}>
        {deckPath ?? 'Ungespeichert'}
        {themePath ? ` · Theme: ${themePath.split(/[\\/]/).pop()}` : themeError ? ' · Theme fehlt' : ' · Standard-Theme'}
      </span>
    </div>
  );
}
