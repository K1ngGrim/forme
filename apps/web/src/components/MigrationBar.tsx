import type { JSX } from 'react';
import { needsMigration } from '@forme/core';
import { actions, useEditor } from '../store.js';

/** Hint for files in the old indentation syntax, with a button that converts them. */
export function MigrationBar(): JSX.Element | null {
  const deck = useEditor((s) => s.deck.doc);
  const theme = useEditor((s) => s.theme?.doc ?? null);
  const files = [needsMigration(deck) ? 'Das Deck' : '', theme && needsMigration(theme) ? 'das Theme' : ''].filter(Boolean);
  if (!files.length) return null;
  const who = files.join(' und ');
  return (
    <div className="migration-bar" data-testid="migration-bar">
      <span>
        {who.charAt(0).toUpperCase() + who.slice(1)} {files.length > 1 ? 'verwenden' : 'verwendet'} noch die alte Einrückungs-Syntax. Blöcke stehen jetzt in <code>{'{ }'}</code>.
      </span>
      <button type="button" className="tb-btn" data-testid="migrate" onClick={() => actions.migrateSyntax()}>
        Auf Klammer-Syntax umstellen
      </button>
    </div>
  );
}
