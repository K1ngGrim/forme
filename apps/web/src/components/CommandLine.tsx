import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { completeLine } from '../complete.js';
import type { CompletionItem } from '../complete.js';
import { actions, displaySlide, useEditor } from '../store.js';

/** CAD-like command line: typed ops are appended to the current slide. */
export function CommandLine(): JSX.Element {
  const [text, setText] = useState('');
  const [items, setItems] = useState<CompletionItem[]>([]);
  const [from, setFrom] = useState(0);
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);
  const focus = useEditor((s) => s.commandFocus);
  const slideId = useEditor((s) => s.slideId);

  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);

  const refresh = (value: string, pos: number): void => {
    const s = useEditor.getState();
    const res = completeLine(value, pos, s.scene, displaySlide(s)?.slide ?? null);
    const word = res ? value.slice(res.from, pos) : '';
    const list = res ? res.items.filter((i) => i.label.toLowerCase().startsWith(word.toLowerCase()) && i.label !== word).slice(0, 12) : [];
    setItems(word || /[@$=]$/.test(value.slice(0, pos)) || /^\s*\w*$/.test(value.slice(0, pos)) ? list : []);
    setFrom(res?.from ?? 0);
    setActive(0);
  };

  const accept = (item: CompletionItem): void => {
    const pos = ref.current?.selectionStart ?? text.length;
    const insert = item.apply ?? item.label;
    const next = text.slice(0, from) + insert + (insert.endsWith('=') ? '' : ' ') + text.slice(pos);
    setText(next);
    setItems([]);
    requestAnimationFrame(() => {
      const p = from + insert.length + (insert.endsWith('=') ? 0 : 1);
      ref.current?.setSelectionRange(p, p);
      refresh(next, p);
    });
  };

  const run = async (): Promise<void> => {
    const cmd = text.trim();
    if (!cmd || !slideId) return;
    if (await actions.intent({ type: 'command', slide: slideId, text: cmd })) {
      setHistory((h) => [cmd, ...h.filter((x) => x !== cmd)].slice(0, 50));
      setText('');
      setItems([]);
      setHIndex(-1);
    }
  };

  return (
    <div className="command-line">
      <span className="cmd-prompt">›</span>
      <input
        ref={ref}
        value={text}
        placeholder={slideId ? `Operation an Folie @${slideId} anhängen, z. B. rect @box x=100 y=100 w=400 h=200 fill=$primary` : 'Keine Folie'}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          refresh(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onBlur={() => setTimeout(() => setItems([]), 150)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (items.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
            return;
          }
          if (items.length && (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey))) {
            e.preventDefault();
            accept(items[active] as CompletionItem);
            return;
          }
          if (e.key === 'Escape') {
            setItems([]);
            return;
          }
          if (e.key === 'Enter') {
            void run();
            return;
          }
          if (e.key === 'ArrowUp' && history.length) {
            e.preventDefault();
            const i = Math.min(history.length - 1, hIndex + 1);
            setHIndex(i);
            setText(history[i] as string);
          }
          if (e.key === 'ArrowDown' && hIndex >= 0) {
            e.preventDefault();
            const i = hIndex - 1;
            setHIndex(i);
            setText(i >= 0 ? (history[i] as string) : '');
          }
        }}
        data-testid="command-line"
      />
      {items.length > 0 && (
        <ul className="cmd-suggest">
          {items.map((it, i) => (
            <li
              key={it.label}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                accept(it);
              }}
            >
              <span className={`cmd-type cmd-${it.type}`}>{it.label}</span>
              {it.detail && <span className="cmd-detail">{it.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
