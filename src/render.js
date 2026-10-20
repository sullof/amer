import { config } from './config.js';
import { esc } from './html.js';

const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%23f4efe4' width='32' height='32'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-family='Palatino,serif' font-size='16' fill='%231c1915'%3EE%3C/text%3E%3C/svg%3E";

function layout({ title, description, path, body, lang = 'it' }) {
  const pageTitle = title ? `${title} — ${config.siteName}` : config.siteName;
  const summary = description || config.siteDescription;
  const canonical = `${config.siteUrl}${path}`;
  return `<!DOCTYPE html>
<html lang="${esc(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(summary)}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" href="${favicon}">
  <meta property="og:title" content="${esc(title || config.siteName)}">
  <meta property="og:description" content="${esc(summary)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonical)}">
  <link rel="stylesheet" href="/site.css">
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

function mast(heading = false) {
  const name = heading
    ? `<h1 class="name"><a href="/">${esc(config.siteName)}</a></h1>`
    : `<a class="name" href="/">${esc(config.siteName)}</a>`;
  return `<header class="mast">${name}</header>`;
}

export function homePage() {
  return layout({
    path: '/',
    lang: 'en',
    description: config.siteDescription,
    body: `<h1>${esc(config.siteName)} <span class="version">v${esc(config.version)}</span></h1>
      <p class="lede">${esc(config.siteDescription)}</p>
      <section id="shelf" hidden></section>
      <p class="copy">© 2026 Francesco Sullo</p>
      <script src="/home.js"></script>`,
  });
}

export function readerPage(work) {
  const canonical = `${config.siteUrl}/${encodeURIComponent(work.slug)}`;
  const tabTitle = work.author ? `${work.title} – ${work.author}` : work.title;
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(tabTitle)}</title>
  <meta name="description" content="${esc(work.description || work.title)}">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="icon" href="${favicon}">
  <link rel="stylesheet" href="/reader.css">
</head>
<body class="chrome-hidden" data-theme="light" data-slug="${esc(work.slug)}" data-revision="${esc(work.revision)}" data-book="/lettura/${encodeURIComponent(work.slug)}/" data-title="${esc(work.title)}" data-author="${esc(work.author)}">
  <button type="button" id="sidebar-backdrop" hidden aria-label="Chiudi il menu"></button>
  <aside id="sidebar">
    <div id="panels">
      <button type="button" id="close-sidebar" aria-label="Chiudi il menu">‹</button>
      <button type="button" id="show-toc" aria-pressed="true">Indice</button>
      <button type="button" id="show-search">Cerca</button>
    </div>
    <div id="toc-view" class="side-view"></div>
    <div id="search-view" class="side-view" hidden>
      <form id="search-form">
        <input id="search-box" type="search" placeholder="Cerca nel libro" autocomplete="off">
      </form>
      <ul id="search-results"></ul>
    </div>
  </aside>
  <div id="main">
    <button type="button" id="chrome-top" class="chrome-hit" aria-label="Mostra i comandi"></button>
    <button type="button" id="chrome-bottom" class="chrome-hit" aria-label="Mostra i comandi"></button>
    <button type="button" id="chrome-dismiss" aria-label="Nascondi i comandi"></button>
    <header id="titlebar">
      <button type="button" id="opener" aria-expanded="false" aria-controls="sidebar" aria-label="Menu">☰</button>
      <p id="metainfo">
        <span id="book-title">${esc(work.title)}</span><span id="title-sep" hidden> – </span><span id="chapter-title"></span>
      </p>
      <div id="title-controls">
        <button type="button" id="settings-btn" aria-expanded="false" aria-controls="settings" aria-label="Impostazioni">Aa</button>
        <button type="button" id="fullscreen" aria-label="Schermo intero">⛶</button>
        <a id="close" href="/" aria-label="Chiudi">×</a>
      </div>
    </header>
    <button type="button" id="settings-backdrop" hidden tabindex="-1" aria-label="Chiudi le impostazioni"></button>
    <div id="settings" hidden>
      <fieldset>
        <legend>Corpo</legend>
        <button type="button" id="font-down" aria-label="Riduci il corpo">A−</button>
        <span id="font-label">100%</span>
        <button type="button" id="font-up" aria-label="Aumenta il corpo">A+</button>
      </fieldset>
      <fieldset>
        <legend>Carattere</legend>
        <div id="faces">
          <button type="button" data-face-choice="book" aria-pressed="true">Del libro</button>
          <button type="button" data-face-choice="serif">Georgia</button>
          <button type="button" data-face-choice="sans">Arial</button>
          <button type="button" data-face-choice="dyslexic">OpenDyslexic</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Tema</legend>
        <div id="themes">
          <button type="button" data-theme-choice="light" aria-pressed="true" aria-label="Chiaro"></button>
          <button type="button" data-theme-choice="sepia" aria-label="Seppia"></button>
          <button type="button" data-theme-choice="green" aria-label="Verde"></button>
          <button type="button" data-theme-choice="night" aria-label="Notte"></button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Lettura</legend>
        <button type="button" data-flow-choice="paginated" aria-pressed="true">Pagine</button>
        <button type="button" data-flow-choice="scrolled">Scorri</button>
      </fieldset>
    </div>
    <div id="divider" hidden></div>
    <button type="button" id="prev" class="arrow" aria-label="Pagina precedente">‹</button>
    <div id="viewer"></div>
    <button type="button" id="next" class="arrow" aria-label="Pagina successiva">›</button>
    <p id="loader">Apro il libro…</p>
    <p id="reader-error" hidden>Questo libro non si apre.</p>
    <footer id="footer">
      <p id="percent"></p>
      <div id="scrub-row">
        <button type="button" id="scrub-undo" disabled aria-label="Annulla lo spostamento">↶</button>
        <input id="scrub" type="range" min="0" max="1000" value="0" aria-label="Posizione nel libro">
        <button type="button" id="scrub-redo" disabled aria-label="Ripeti lo spostamento">↷</button>
      </div>
    </footer>
  </div>
  <script src="/vendor/jszip.min.js"></script>
  <script src="/vendor/epub.min.js"></script>
  <script src="/reader.js"></script>
</body>
</html>`;
}

export function notFoundPage() {
  return layout({
    title: 'Non trovato',
    path: '/',
    body: `${mast()}
      <h1>Questo EPUB non c’è.</h1>
      <p class="lede"><a href="/">Torna al lettore</a></p>`,
  });
}

export function messagePage(title, text) {
  return layout({
    title,
    path: '/',
    body: `${mast()}
      <h1>${esc(title)}</h1>
      <p class="lede">${esc(text)}</p>`,
  });
}
