// Docs page behaviour: search (Ctrl+K or /), mobile navigation, table of contents and the
// live editor for examples (loaded on first use).

interface SearchEntry {
  url: string;
  page: string;
  heading: string;
  text: string;
  keys: string[];
}

const root = document.body.dataset.root ?? './';

// ---------------------------------------------------------------- navigation (mobile)
const menu = document.querySelector<HTMLButtonElement>('.menu');
menu?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  menu.setAttribute('aria-expanded', String(open));
});
document.querySelector('.sidebar [aria-current]')?.scrollIntoView({ block: 'center' });

// ---------------------------------------------------------------- table of contents
const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('.toc a')];
const targets = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter((e): e is HTMLElement => !!e);
if (targets.length) {
  const update = (): void => {
    let current = targets[0] as HTMLElement;
    for (const t of targets) if (t.getBoundingClientRect().top < 120) current = t;
    for (const a of tocLinks) a.classList.toggle('active', decodeURIComponent(a.hash.slice(1)) === current.id);
  };
  document.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------------------------------------------------------------- search
const dialog = document.querySelector<HTMLElement>('.search-dialog') as HTMLElement;
const input = dialog.querySelector('input') as HTMLInputElement;
const list = dialog.querySelector('.search-results') as HTMLUListElement;
let index: SearchEntry[] | null = null;
let active = 0;

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

function snippet(text: string, words: string[]): string {
  const n = norm(text);
  const at = Math.max(0, Math.min(...words.map((w) => n.indexOf(w)).filter((i) => i >= 0), text.length) - 40);
  const s = (at > 0 ? '… ' : '') + text.slice(at, at + 140) + (text.length > at + 140 ? ' …' : '');
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return words.reduce((acc, w) => acc.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark>$1</mark>'), esc);
}

function runSearch(): void {
  const words = norm(input.value).split(/\s+/).filter(Boolean);
  list.textContent = '';
  active = 0;
  if (!index || !words.length) return;
  const scored = index
    .map((e) => {
      const title = norm(`${e.page} ${e.heading}`);
      const body = norm(e.text);
      let score = 0;
      for (const w of words) {
        const hits = body.split(w).length - 1;
        if (e.keys.includes(w)) score += 25;
        if (title.includes(w)) score += norm(e.heading).startsWith(w) || norm(e.page).startsWith(w) ? 20 : 12;
        else if (!hits) return { e, score: 0 };
        // frequent mentions mean the section is about the word, a single mention is a cross reference
        score += Math.min(hits, 8) * 2 + (new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(body) ? 3 : 0);
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  if (!scored.length) {
    list.innerHTML = '<li class="empty">Keine Treffer</li>';
    return;
  }
  for (const [i, { e }] of scored.entries()) {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${root}${e.url}"><strong>${e.heading || e.page}</strong>${e.heading ? `<span class="where">${e.page}</span>` : ''}<span class="snippet">${snippet(e.text, words)}</span></a>`;
    if (i === 0) li.classList.add('active');
    list.appendChild(li);
  }
}

async function openSearch(): Promise<void> {
  dialog.hidden = false;
  input.focus();
  input.select();
  if (!index) {
    index = (await (await fetch(`${root}assets/search.json`)).json()) as SearchEntry[];
    runSearch();
  }
}

function closeSearch(): void {
  dialog.hidden = true;
}

document.querySelector('.search-open')?.addEventListener('click', () => void openSearch());
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) closeSearch();
});
input.addEventListener('input', runSearch);
input.addEventListener('keydown', (e) => {
  const items = [...list.querySelectorAll('li:not(.empty)')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[active]?.classList.remove('active');
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
    items[active]?.classList.add('active');
    items[active]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    const a = items[active]?.querySelector('a');
    if (a) {
      closeSearch();
      a.click();
    }
  }
});
document.addEventListener('keydown', (e) => {
  const typing = (e.target as HTMLElement).closest('input, textarea');
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
    e.preventDefault();
    void openSearch();
  } else if (e.key === 'Escape' && !dialog.hidden) closeSearch();
});

// ---------------------------------------------------------------- live examples
for (const btn of document.querySelectorAll<HTMLButtonElement>('.example .edit')) {
  btn.addEventListener('click', async () => {
    const figure = btn.closest('.example') as HTMLElement;
    btn.disabled = true;
    btn.textContent = 'Lädt …';
    const live = await import('./live.js');
    await live.makeEditable(figure, root);
  });
}
