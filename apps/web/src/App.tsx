import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Canvas } from './components/Canvas.js';
import { CodeView } from './components/CodeView.js';
import { CommandLine } from './components/CommandLine.js';
import { Inspector } from './components/Inspector.js';
import { MigrationBar } from './components/MigrationBar.js';
import { Presenter } from './components/Presenter.js';
import { SlideList } from './components/SlideList.js';
import { StatusBar } from './components/StatusBar.js';
import { Toasts } from './components/Toasts.js';
import { Toolbar } from './components/Toolbar.js';
import type { SceneNode, SlideScene } from '@forme/core';
import { flowParent } from './canvas/geometry.js';
import { ProjectDialog } from './components/ProjectDialog.js';
import { inVsCode } from './platform/host.js';
import { actions, displaySlide, isDirty, useEditor } from './store.js';
import type { Tool } from './store.js';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', i: 'image' };

function flowParentOf(slide: SlideScene, id: string): SceneNode | null {
  const n = slide.byId.get(id);
  return n ? flowParent(slide, n) : null;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || !!t.closest('.cm-editor'));
}

function deleteSelection(): void {
  const d = displaySlide();
  const sel = useEditor.getState().selection;
  if (d && sel.length) void actions.intent({ type: 'delete', slide: d.slide.id, ids: sel });
}

export type MenuCommand =
  | 'projects'
  | 'save'
  | 'save-folder'
  | 'download-zip'
  | 'export-pdf'
  | 'export-pptx'
  | 'undo'
  | 'redo'
  | 'duplicate'
  | 'delete'
  | 'present'
  | 'theme-mode'
  | 'new-slide'
  | 'delete-slide'
  | 'zoom-fit'
  | 'command-line';

export function runMenu(cmd: MenuCommand): void {
  const d = displaySlide();
  const s = useEditor.getState();
  switch (cmd) {
    case 'projects':
      actions.showProjects(true);
      break;
    case 'save':
      void actions.save();
      break;
    case 'save-folder':
      void actions.saveToFolder();
      break;
    case 'download-zip':
      void actions.downloadZip();
      break;
    case 'export-pdf':
      void actions.exportDeck('pdf');
      break;
    case 'export-pptx':
      void actions.exportDeck('pptx');
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
  const codeVisible = useEditor((s) => s.codeVisible);
  const [split, setSplit] = useState(0.42);
  const dragging = useRef(false);

  useEffect(() => {
    void actions.init();
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      // In VS Code these keys belong to VS Code (save, undo, quick open …); the extension binds
      // them to Forme commands while this editor is active and sends them here.
      if (inVsCode() && ((mod && 'sopkzy'.includes(e.key.toLowerCase())) || (mod && e.shiftKey && e.key.toLowerCase() === 't') || e.key === 'F5')) return;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void actions.save();
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        actions.showProjects(true);
        return;
      }
      if (mod && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        void actions.exportDeck('pdf');
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        actions.focusCommandLine();
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        runMenu('theme-mode');
        return;
      }
      if (useEditor.getState().projectsOpen) return;
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
      } else if (e.key.startsWith('Arrow') && sel.length === 1 && d && flowParentOf(d.slide, sel[0] as string)) {
        // inside a row/column: arrow keys move the child one position
        e.preventDefault();
        const id = sel[0] as string;
        const flow = flowParentOf(d.slide, id) as SceneNode;
        const order = flow.children.filter((c) => c.props.hidden !== true).map((c) => c.id);
        const i = order.indexOf(id);
        const delta = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        if (i + delta >= 0 && i + delta < order.length) void actions.intent({ type: 'reorder', slide: d.slide.id, id, index: i + delta });
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
        e.preventDefault();
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
    // unsaved edits in a folder project (browser projects are saved automatically)
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const s = useEditor.getState();
      if ((s.project?.kind === 'folder' && isDirty(s)) || s.saving) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
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
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <MigrationBar />
      <div className="workspace">
        <SlideList />
        <div className="main-area">
          {codeVisible && (
            <>
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
            </>
          )}
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
      {!inVsCode() && <ProjectDialog />}
    </div>
  );
}
