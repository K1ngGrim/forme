import type { JSX } from 'react';
import { useEditor } from '../store.js';

export function Toasts(): JSX.Element {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="toasts" data-testid="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
