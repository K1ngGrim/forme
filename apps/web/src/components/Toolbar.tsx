import type { ArrangeVerb } from '@forme/core';
import type { JSX, MouseEvent, ReactNode } from 'react';
import { folderAccessSupported } from '../platform/fs.js';
import { host, inVsCode } from '../platform/host.js';
import { actions, displaySlide, toast, useEditor } from '../store.js';
import type { Tool } from '../store.js';

const I = (d: string): JSX.Element => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  select: I('M5 3l14 8-6 2-3 6z'),
  rect: I('M4 6h16v12H4z'),
  ellipse: I('M12 6c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z'),
  line: I('M5 19L19 5'),
  arrow: I('M5 19L19 5M11 5h8v8'),
  text: I('M5 6V4h14v2M12 4v16M9 20h6'),
  image: I('M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01'),
  undo: I('M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3'),
  redo: I('M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3'),
  alignLeft: I('M4 3v18M8 7h10v4H8zM8 14h6v4H8z'),
  alignCenter: I('M12 3v18M6 7h12v4H6zM8 14h8v4H8z'),
  alignRight: I('M20 3v18M6 7h10v4H6zM10 14h6v4h-6z'),
  alignTop: I('M3 4h18M7 8h4v10H7zM14 8h4v6h-4z'),
  alignMiddle: I('M3 12h18M7 6h4v12H7zM14 8h4v8h-4z'),
  alignBottom: I('M3 20h18M7 6h4v10H7zM14 10h4v6h-4z'),
  distH: I('M4 4v16M20 4v16M9 8h6v8H9z'),
  distV: I('M4 4h16M4 20h16M8 9h8v6H8z'),
  stackV: I('M6 4h12v5H6zM6 11h12v5H6zM9 18h6'),
  number: I('M5 7h2v10M11 9a2 2 0 114 0c0 2-4 3-4 6h4M19 7v10'),
  front: I('M8 8h12v12H8zM4 4h10v3M4 4v10h3'),
  back: I('M4 4h12v12H4zM20 8v12H8v-3'),
  present: I('M4 5h16v11H4zM12 16v4M8 20h8M10 8l5 3-5 3z'),
  open: I('M3 7h6l2 2h10v10H3z'),
  save: I('M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6'),
  theme: I('M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.5 0-1.5-1.5-1.5-1.5-3s1-2 2.5-2H17a4 4 0 004-4c0-4-4-7.5-9-7.5zM7.5 11h.01M10 7h.01M15 7.5h.01'),
};

/** The docs are deployed next to the app (GitHub Pages: /forme/docs/); the dev server has no copy. */
const DOCS_URL = import.meta.env.DEV || inVsCode() ? 'https://k1nggrim.github.io/forme/docs/' : './docs/';

function Btn(props: { title: string; onClick: (e: MouseEvent) => void; active?: boolean; disabled?: boolean; children: ReactNode; testid?: string }): JSX.Element {
  return (
    <button
      type="button"
      className={`tb-btn${props.active ? ' active' : ''}`}
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      data-testid={props.testid}
    >
      {props.children}
    </button>
  );
}

export function Toolbar(): JSX.Element {
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const mode = useEditor((s) => s.mode);
  const canUndo = useEditor((s) => s.undoStack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const projectKind = useEditor((s) => s.project?.kind ?? null);
  const codeVisible = useEditor((s) => s.codeVisible);
  const exporting = useEditor((s) => s.exporting);
  const hasTheme = useEditor((s) => !!s.theme);

  const arrange = (verb: ArrangeVerb, modeName: string | undefined, min: number) => (e: MouseEvent) => {
    const d = displaySlide();
    if (!d) return;
    if (selection.length < min) {
      toast(min === 1 ? 'Bitte ein Objekt auswählen' : `Bitte mindestens ${min} Objekte auswählen`, 'error');
      return;
    }
    // Alt-click "bakes" the computed literals instead of appending the semantic op
    void actions.intent({ type: 'arrange', slide: d.slide.id, verb, ...(modeName ? { mode: modeName } : {}), ids: selection, bake: e.altKey });
  };

  const toolBtn = (t: Tool, title: string, icon: JSX.Element): JSX.Element => (
    <Btn title={title} active={tool === t} onClick={() => actions.setTool(t)} testid={`tool-${t}`}>
      {icon}
    </Btn>
  );

  const numberFigure = (): void => {
    const d = displaySlide();
    const id = selection[0];
    if (!d || !id) {
      toast('Bitte ein Objekt (z. B. ein Bild) auswählen', 'error');
      return;
    }
    const isTable = d.slide.byId.get(id)?.kind === 'table';
    void actions.intent({
      type: 'number',
      slide: d.slide.id,
      id,
      counter: isTable ? 'table' : 'figure',
      caption: isTable ? 'Tab. {table}: Beschreibung' : 'Abb. {figure}: Beschreibung',
    });
  };

  const z = (m: 'front' | 'back') => () => {
    const d = displaySlide();
    const id = selection[0];
    if (d && id) void actions.intent({ type: 'z', slide: d.slide.id, id, mode: m });
  };

  return (
    <div className="toolbar" data-testid="toolbar">
      {inVsCode() ? (
        <div className="tb-group">
          <Btn title="Speichern (Strg+S)" onClick={() => void actions.save()} testid="save">
            {ICONS.save}
          </Btn>
          <Btn title="Code-Ansicht im Editor ein-/ausblenden" active={codeVisible} onClick={() => actions.showCode(!codeVisible)} testid="toggle-code">
            <span className="tb-label">Code</span>
          </Btn>
          <Btn title="Datei im Texteditor von VS Code daneben öffnen" onClick={() => host?.post({ type: 'openText' })} testid="open-text">
            <span className="tb-label">Text daneben</span>
          </Btn>
        </div>
      ) : (
        <div className="tb-group">
          <Btn title="Projekte: neu, öffnen, importieren (Strg+O)" onClick={() => actions.showProjects(true)} testid="projects">
            {ICONS.open}
          </Btn>
          <Btn
            title={projectKind === 'folder' ? 'Speichern in den Ordner (Strg+S)' : 'Wird automatisch im Browser gespeichert (Strg+S)'}
            onClick={() => void actions.save()}
            testid="save"
          >
            {ICONS.save}
          </Btn>
          <select
            className="tb-export"
            value=""
            onChange={(e) => {
              if (e.target.value === 'zip') void actions.downloadZip();
              if (e.target.value === 'folder') void actions.saveToFolder();
            }}
            title="Projekt sichern"
            data-testid="file-menu"
          >
            <option value="">Datei …</option>
            <option value="zip">Als ZIP herunterladen</option>
            <option value="folder" disabled={!folderAccessSupported() || projectKind === 'folder'}>
              In Ordner auf dem Rechner speichern{folderAccessSupported() ? '' : ' (nur Chrome/Edge)'}
            </option>
          </select>
        </div>
      )}
      <div className="tb-group">
        <Btn title="Rückgängig (Strg+Z)" disabled={!canUndo} onClick={() => actions.undo()} testid="undo">{ICONS.undo}</Btn>
        <Btn title="Wiederholen (Strg+Umschalt+Z)" disabled={!canRedo} onClick={() => actions.redo()} testid="redo">{ICONS.redo}</Btn>
      </div>
      <div className="tb-group">
        {toolBtn('select', 'Auswahl (V)', ICONS.select)}
        {toolBtn('rect', 'Rechteck (R)', ICONS.rect)}
        {toolBtn('ellipse', 'Ellipse (O)', ICONS.ellipse)}
        {toolBtn('line', 'Linie (L)', ICONS.line)}
        {toolBtn('arrow', 'Pfeil (A)', ICONS.arrow)}
        {toolBtn('text', 'Text (T)', ICONS.text)}
        {toolBtn('image', 'Bild (I)', ICONS.image)}
      </div>
      <div className="tb-group" title="Alt-Klick: berechnete Werte direkt schreiben („backen“)">
        <Btn title="Links ausrichten (Alt: backen)" onClick={arrange('align', 'left', 1)} testid="align-left">{ICONS.alignLeft}</Btn>
        <Btn title="Horizontal zentrieren (Alt: backen)" onClick={arrange('align', 'center', 1)}>{ICONS.alignCenter}</Btn>
        <Btn title="Rechts ausrichten (Alt: backen)" onClick={arrange('align', 'right', 1)}>{ICONS.alignRight}</Btn>
        <Btn title="Oben ausrichten (Alt: backen)" onClick={arrange('align', 'top', 1)}>{ICONS.alignTop}</Btn>
        <Btn title="Vertikal zentrieren (Alt: backen)" onClick={arrange('align', 'middle', 1)}>{ICONS.alignMiddle}</Btn>
        <Btn title="Unten ausrichten (Alt: backen)" onClick={arrange('align', 'bottom', 1)}>{ICONS.alignBottom}</Btn>
        <Btn title="Horizontal verteilen (Alt: backen)" onClick={arrange('distribute', 'h', 3)}>{ICONS.distH}</Btn>
        <Btn title="Vertikal verteilen (Alt: backen)" onClick={arrange('distribute', 'v', 3)}>{ICONS.distV}</Btn>
        <Btn title="Vertikal stapeln (Alt: backen)" onClick={arrange('stack', 'v', 2)}>{ICONS.stackV}</Btn>
      </div>
      <div className="tb-group">
        <Btn title="Nummerieren (Abbildung/Tabelle)" onClick={numberFigure}>{ICONS.number}</Btn>
        <Btn title="Nach vorne" onClick={z('front')}>{ICONS.front}</Btn>
        <Btn title="Nach hinten" onClick={z('back')}>{ICONS.back}</Btn>
      </div>
      <div className="tb-spacer" />
      <div className="tb-group">
        <Btn title={hasTheme ? 'Theme-Bearbeitungsmodus' : 'Theme-Modus (benötigt eine Theme-Datei)'} active={mode === 'theme'} onClick={() => actions.setMode(mode === 'theme' ? 'deck' : 'theme')} testid="theme-mode">
          {ICONS.theme}
          <span className="tb-label">Theme</span>
        </Btn>
        <select
          className="tb-export"
          value=""
          disabled={!!exporting}
          onChange={(e) => {
            const v = e.target.value as 'pdf' | 'pptx' | 'odp';
            if (v) void actions.exportDeck(v);
          }}
          title="Exportieren"
          data-testid="export"
        >
          <option value="">{exporting ? `Exportiere ${exporting.toUpperCase()} …` : 'Exportieren …'}</option>
          <option value="pdf">{inVsCode() ? 'PDF' : 'PDF (Druckdialog)'}</option>
          <option value="pptx">PowerPoint (PPTX)</option>
          <option value="odp" disabled={!inVsCode()}>
            {inVsCode() ? 'OpenDocument (ODP, braucht LibreOffice)' : 'OpenDocument (ODP) – nur per CLI'}
          </option>
        </select>
        <Btn title="Präsentieren (F5)" onClick={() => actions.present(true)} testid="present">
          {ICONS.present}
          <span className="tb-label">Präsentieren</span>
        </Btn>
        <a className="tb-btn tb-help" href={DOCS_URL} target="_blank" rel="noopener" title="Dokumentation (neuer Tab)" data-testid="docs">
          ?
        </a>
      </div>
    </div>
  );
}
