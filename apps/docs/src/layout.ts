import { GROUPS, REPO_URL } from './site.js';

/** A page of the site: a Markdown section, a reference category or an operation. */
export interface SitePage {
  slug: string;
  title: string;
  group: string;
  kind: 'section' | 'category' | 'op';
  /** Category slug of an operation page. */
  parent?: string;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function rootOf(slug: string): string {
  return slug ? '../'.repeat(slug.split('/').length) : './';
}

export function hrefOf(from: string, to: string): string {
  return `${rootOf(from)}${to ? `${to}/` : ''}`;
}

export interface TocEntry {
  level: number;
  id: string;
  html: string;
}

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232563eb'/%3E%3Cpath d='M10 8h13v4h-9v4h8v4h-8v6h-4z' fill='white'/%3E%3C/svg%3E";

const LOGO = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#2563eb"/><path d="M10 8h13v4h-9v4h8v4h-8v6h-4z" fill="#fff"/></svg>`;

function link(from: SitePage, to: SitePage, label: string): string {
  return `<a href="${hrefOf(from.slug, to.slug)}"${to.slug === from.slug ? ' aria-current="page"' : ''}>${label}</a>`;
}

function sidebar(page: SitePage, pages: SitePage[]): string {
  return GROUPS.map((g) => {
    const items = pages
      .filter((p) => p.group === g && p.kind !== 'op')
      .map((p) => {
        const open = p.kind === 'category' && (p.slug === page.slug || p.slug === page.parent);
        const ops = open
          ? `<ul class="ops">${pages
              .filter((o) => o.parent === p.slug)
              .map((o) => `<li>${link(page, o, `<code>${esc(o.title)}</code>`)}</li>`)
              .join('')}</ul>`
          : '';
        return `<li${p.kind === 'category' ? ' class="category"' : ''}>${link(page, p, esc(p.title))}${ops}</li>`;
      })
      .join('');
    return `<section><h2>${esc(g)}</h2><ul>${items}</ul></section>`;
  }).join('');
}

function pager(page: SitePage, pages: SitePage[]): string {
  const i = pages.indexOf(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const title = (p: SitePage): string => (p.kind === 'op' ? `<code>${esc(p.title)}</code>` : esc(p.title));
  const nav = (p: SitePage | undefined, cls: string, label: string): string =>
    p ? `<a class="${cls}" href="${hrefOf(page.slug, p.slug)}"><span>${label}</span><strong>${title(p)}</strong></a>` : '<span></span>';
  return `<nav class="pager" aria-label="Weitere Seiten">${nav(prev, 'prev', 'Zurück')}${nav(next, 'next', 'Weiter')}</nav>`;
}

export interface PageParts {
  /** HTML below the title. */
  body: string;
  toc: TocEntry[];
  sourceUrl: string;
  /** Breadcrumb above the title. */
  crumb: string;
  /** Title rendered as code (operation pages). */
  codeTitle?: boolean;
}

export function pageHtml(page: SitePage, pages: SitePage[], parts: PageParts): string {
  const { body, toc, sourceUrl } = parts;
  const root = rootOf(page.slug);
  const tocHtml = toc.length
    ? `<aside class="toc" aria-label="Auf dieser Seite"><h2>Auf dieser Seite</h2><ul>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${t.html}</a></li>`).join('')}</ul></aside>`
    : '<aside class="toc"></aside>';
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.slug ? `${page.title} – Forme Dokumentation` : 'Forme Dokumentation')}</title>
<meta name="description" content="Forme: Präsentationen als Code und Canvas. ${esc(page.title)}">
<link rel="icon" href="${ICON}">
<link rel="stylesheet" href="${root}assets/style.css">
<script type="module" src="${root}assets/client.js"></script>
</head>
<body data-root="${root}">
<header class="topbar">
  <button class="menu" type="button" aria-label="Navigation" aria-expanded="false">☰</button>
  <a class="brand" href="${root}">${LOGO}<span>Forme</span><em>Docs</em></a>
  <button class="search-open" type="button"><span>Suchen …</span><kbd>Strg K</kbd></button>
  <nav class="toplinks"><a class="primary" href="${root}../">Editor öffnen</a><a href="${REPO_URL}">GitHub</a></nav>
</header>
<div class="layout">
  <nav class="sidebar" aria-label="Dokumentation">${sidebar(page, pages)}</nav>
  <main class="content">
    <p class="crumb">${parts.crumb}</p>
    <h1${parts.codeTitle ? ' class="code-title"' : ''}>${parts.codeTitle ? `<code>${esc(page.title)}</code>` : esc(page.title)}</h1>
    ${body}
    <p class="edit-source"><a href="${sourceUrl}">Diese Seite auf GitHub bearbeiten</a></p>
    ${pager(page, pages)}
  </main>
  ${tocHtml}
</div>
<div class="search-dialog" hidden>
  <div class="search-box" role="dialog" aria-modal="true" aria-label="Suche">
    <input type="search" placeholder="In der Dokumentation suchen" autocomplete="off" spellcheck="false">
    <ul class="search-results"></ul>
    <p class="search-hint"><kbd>↑</kbd><kbd>↓</kbd> wählen · <kbd>Enter</kbd> öffnen · <kbd>Esc</kbd> schließen</p>
  </div>
</div>
</body>
</html>
`;
}
