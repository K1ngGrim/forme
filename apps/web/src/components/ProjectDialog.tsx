import { NEW_DECK_SOURCE } from '@forme/core';
import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { FolderFS, folderAccessSupported } from '../platform/fs.js';
import type { FileMap, OpenProject, ProjectInfo } from '../platform/projects.js';
import { createLocalProject, decksIn, deleteProject, listProjects, openProject, pickFolder, readUpload, registerFolder } from '../platform/projects.js';
import type { Template } from '../platform/templates.js';
import { TEMPLATES, templateFiles } from '../platform/templates.js';
import { actions, toast, useEditor } from '../store.js';

interface DeckChoice {
  title: string;
  decks: string[];
  pick: (deck: string) => Promise<void>;
}

function formatDate(t: number): string {
  return new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Start screen: templates, recent projects, folders on disk and imports. No accounts, no server. */
export function ProjectDialog(): JSX.Element | null {
  const open = useEditor((s) => s.projectsOpen);
  const current = useEditor((s) => s.project);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [choice, setChoice] = useState<DeckChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const zipInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const reload = async (): Promise<void> => setProjects(await listProjects());

  useEffect(() => {
    if (open) {
      setChoice(null);
      void reload();
    }
  }, [open]);

  useEffect(() => {
    // webkitdirectory is not part of React's typed attributes
    dirInput.current?.setAttribute('webkitdirectory', '');
  }, [open]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const start = async (project: OpenProject | null): Promise<void> => {
    if (project) await actions.openProject(project);
  };

  const fromTemplate = (t: Template): Promise<void> =>
    run(async () => {
      const name = window.prompt('Name der Präsentation', t.id === 'leer' ? 'Neue Präsentation' : t.name);
      if (name === null) return;
      const files = await templateFiles(t);
      await start(await createLocalProject(name.trim() || t.name, files, t.deck));
    });

  const chooseDeck = async (title: string, decks: string[], pick: (deck: string) => Promise<void>): Promise<void> => {
    if (decks.length === 1) await pick(decks[0] as string);
    else setChoice({ title, decks, pick: (d) => run(() => pick(d)) });
  };

  const openFolder = (): Promise<void> =>
    run(async () => {
      const picked = await pickFolder();
      if (!picked) return;
      if (!picked.decks.length) {
        if (!window.confirm(`Im Ordner „${picked.handle.name}“ gibt es keine Forme-Präsentation. Eine neue „deck.forme“ anlegen?`)) return;
        await new FolderFS(picked.handle).writeText('deck.forme', NEW_DECK_SOURCE);
        await start(await registerFolder(picked.handle, 'deck.forme'));
        return;
      }
      await chooseDeck(`Präsentation in „${picked.handle.name}“ wählen`, picked.decks, async (deck) => start(await registerFolder(picked.handle, deck)));
    });

  const importFiles = (list: FileList | null): Promise<void> =>
    run(async () => {
      const upload = await readUpload(Array.from(list ?? []));
      if (!upload) return;
      const decks = decksIn(upload.files);
      if (!decks.length) throw new Error('Keine Forme-Präsentation (.forme mit „deck“ oder „slide“) gefunden');
      const files: FileMap = upload.files;
      await chooseDeck(`Präsentation aus „${upload.name}“ wählen`, decks, async (deck) => start(await createLocalProject(upload.name, files, deck)));
    });

  const openRecent = (info: ProjectInfo): Promise<void> =>
    run(async () => {
      const project = await openProject(info);
      if (!project) throw new Error(`Kein Zugriff auf den Ordner „${info.name}“`);
      await start(project);
    });

  const remove = (info: ProjectInfo): Promise<void> =>
    run(async () => {
      const msg =
        info.kind === 'local'
          ? `„${info.name}“ endgültig aus diesem Browser löschen?`
          : `„${info.name}“ aus der Liste entfernen? Der Ordner auf dem Rechner bleibt unverändert.`;
      if (!window.confirm(msg)) return;
      await deleteProject(info);
      await reload();
    });

  return (
    <div className="dialog-backdrop" data-testid="project-dialog">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Projekte">
        <div className="dialog-head">
          <div>
            <h2>Forme</h2>
            <p>Präsentationen als Code und Canvas. Alles läuft im Browser, ohne Konto und ohne Server.</p>
          </div>
          {current && (
            <button type="button" className="dialog-close" title="Schließen" onClick={() => actions.showProjects(false)}>
              ×
            </button>
          )}
        </div>

        {choice ? (
          <section>
            <h3>{choice.title}</h3>
            <div className="deck-choice">
              {choice.decks.map((d) => (
                <button key={d} type="button" className="list-btn" onClick={() => void choice.pick(d)}>
                  {d}
                </button>
              ))}
            </div>
            <button type="button" className="link-btn" onClick={() => setChoice(null)}>
              Zurück
            </button>
          </section>
        ) : (
          <>
            <section>
              <h3>Neu aus Vorlage</h3>
              <div className="template-grid">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="template-card" disabled={busy} onClick={() => void fromTemplate(t)} data-testid={`template-${t.id}`}>
                    <strong>{t.name}</strong>
                    <span>{t.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3>Öffnen</h3>
              <div className="open-row">
                <button
                  type="button"
                  className="action-btn"
                  disabled={busy || !folderAccessSupported()}
                  onClick={() => void openFolder()}
                  title={folderAccessSupported() ? 'Dateien direkt auf dem Rechner bearbeiten' : 'Nur in Chrome, Edge und Opera verfügbar'}
                >
                  Ordner auf dem Rechner öffnen …
                </button>
                <button type="button" className="action-btn" disabled={busy} onClick={() => zipInput.current?.click()}>
                  ZIP importieren …
                </button>
                <button type="button" className="action-btn" disabled={busy} onClick={() => dirInput.current?.click()}>
                  Ordner importieren …
                </button>
                <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => void importFiles(e.target.files)} data-testid="import-zip" />
                <input ref={dirInput} type="file" multiple hidden onChange={(e) => void importFiles(e.target.files)} />
              </div>
              {!folderAccessSupported() && (
                <p className="hint">
                  Dieser Browser kann Ordner nicht direkt bearbeiten. Projekte werden im Browser gespeichert. Sichern per „Datei → Als ZIP
                  herunterladen“.
                </p>
              )}
            </section>

            <section>
              <h3>Zuletzt verwendet</h3>
              {projects.length === 0 ? (
                <p className="hint">Noch keine Projekte. Starte mit einer Vorlage.</p>
              ) : (
                <ul className="project-list">
                  {projects.map((p) => (
                    <li key={`${p.kind}-${p.id}`} className={current?.id === p.id ? 'current' : ''}>
                      <button type="button" className="project-open" disabled={busy} onClick={() => void openRecent(p)} data-testid={`project-${p.name}`}>
                        <strong>{p.name}</strong>
                        <span>
                          <span className={`badge badge-${p.kind}`}>{p.kind === 'local' ? 'Browser' : 'Ordner'}</span>
                          {p.deckPath} · {formatDate(p.updated)}
                        </span>
                      </button>
                      <button type="button" className="project-remove" title={p.kind === 'local' ? 'Löschen' : 'Aus der Liste entfernen'} disabled={busy} onClick={() => void remove(p)}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <p className="dialog-foot">
          Browser-Projekte werden automatisch in diesem Browser gespeichert (IndexedDB) und verlassen den Rechner nicht. Ordner-Projekte
          bearbeiten die Dateien direkt (Speichern mit Strg+S).
        </p>
      </div>
    </div>
  );
}
