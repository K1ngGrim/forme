import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { api } from './api.js';
import { Canvas } from './components/Canvas.js';
import { CodeView } from './components/CodeView.js';
import { CommandLine } from './components/CommandLine.js';
import { Inspector } from './components/Inspector.js';
import { Presenter } from './components/Presenter.js';
import { SlideList } from './components/SlideList.js';
import { StatusBar } from './components/StatusBar.js';
import { Toasts } from './components/Toasts.js';
import { Toolbar } from './components/Toolbar.js';
import type { MenuCommand } from '../../shared/api.js';
import { actions, displaySlide, useEditor } from './store.js';
import type { Tool } from './store.js';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', i: 'image' };

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
}

function deleteSelection(): void {
  const d = displaySlide();
  const sel = useEditor.getState().selection;
  if (d && sel.length) void actions.intent({ type: 'delete', slide: d.slide.id, ids: sel });
}

function runMenu(cmd: MenuCommand): void {
  const d = displaySlide();
  const s = useEditor.getState();
  switch (cmd) {
    case 'new':
      void actions.newDeck();
      break;
    case 'open':
      void actions.open();
      break;
    case 'save':
      void actions.save();
      break;
    case 'saveAs':
      void actions.save(true);
      break;
    case 'export-pdf':
      void actions.exportDeck('pdf');
      break;
    case 'export-pptx':
      void actions.exportDeck('pptx');
      break;
    case 'export-odp':
      void actions.exportDeck('odp');
      break;
    case 'undo':
      actions.undo();
      break;
    case 'redo':
      actions.redo();
      break;
    case 'duplicate':
      if (d && s.selection.length) void actions.intent({ type: 'duplicate', slide: d.slide.id, ids: s.selection });
      break;
    case 'delete':
      deleteSelection();
      break;
    case 'present':
      actions.present(true);
      break;
    case 'theme-mode':
      actions.setMode(s.mode === 'theme' ? 'deck' : 'theme');
      break;
    case 'new-slide':
      void actions.intent({ type: 'addSlide', ...(s.slideId ? { after: s.slideId } : {}) });
      break;
    case 'delete-slide':
      if (s.slideId) void actions.intent({ type: 'deleteSlide', slide: s.slideId });
      break;
    case 'zoom-fit':
      actions.zoomToFit();
      break;
    case 'command-line':
      actions.focusCommandLine();
      break;
  }
}

export function App(): JSX.Element {
  const presenting = useEditor((s) => s.presenting);
  const [split, setSplit] = useState(0.42);
  const dragging = useRef(false);

  useEffect(() => {
    void actions.init();
    const offMenu = api.onMenu(runMenu);
    const offFile = api.onFileChanged((p, src) => actions.fileChanged(p, src));
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void actions.save(e.shiftKey);
        return;
      }
      if (useEditor.getState().presenting || isTyping(e)) return;
      const d = displaySlide();
      const sel = useEditor.getState().selection;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (d && sel.length) void actions.intent({ type: 'duplicate', slide: d.slide.id, ids: sel });
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (d) actions.select(d.slide.nodes.filter((n) => n.props.hidden !== true).map((n) => n.id));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key.startsWith('Arrow') && sel.length && d) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        void actions.intent({ type: 'move', slide: d.slide.id, ids: sel, dx, dy }, 'nudge');
      } else if (e.key === 'Escape') {
        actions.select([]);
        actions.setTool('select');
      } else if (e.key === 'F5') {
        actions.present(true);
      } else if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) {
        actions.setTool(TOOL_KEYS[e.key.toLowerCase()] as Tool);
      } else if (e.key === 'PageDown' || e.key === 'PageUp') {
        const slides = useEditor.getState().scene.slides;
        const i = slides.findIndex((x) => x.id === useEditor.getState().slideId);
        const next = slides[i + (e.key === 'PageDown' ? 1 : -1)];
        if (next) actions.setSlide(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return;
      const main = document.querySelector('.main-area');
      if (!main) return;
      const r = main.getBoundingClientRect();
      setSplit(Math.max(0.2, Math.min(0.75, (e.clientX - r.left) / r.width)));
    };
    const onUp = (): void => {
      dragging.current = false;
      document.body.classList.remove('resizing');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      offMenu();
      offFile();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <SlideList />
        <div className="main-area">
          <div className="code-pane" style={{ width: `${split * 100}%` }}>
            <CodeView />
          </div>
          <div
            className="splitter"
            onMouseDown={() => {
              dragging.current = true;
              document.body.classList.add('resizing');
            }}
          />
          <div className="canvas-pane">
            <Canvas />
          </div>
        </div>
        <Inspector />
      </div>
      <CommandLine />
      <StatusBar />
      <Toasts />
      {presenting && <Presenter />}
    </div>
  );
}
