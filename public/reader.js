const themeOrder = ['light', 'sepia', 'night'];
const fontMin = 80;
const fontMax = 180;
const fontStep = 5;
const palette = {
  sepia: ['#f4ecd8', '#5b4636', '#8a4b08'],
  night: ['#1c1c1c', '#dedede', '#9ec1ff'],
};

const slug = document.body.dataset.slug;
const bookUrl = document.body.dataset.book;
const bookTitle = document.body.dataset.title || '';
const bookAuthor = document.body.dataset.author || '';

const viewer = document.getElementById('viewer');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const opener = document.getElementById('opener');
const tocView = document.getElementById('toc-view');
const searchView = document.getElementById('search-view');
const searchForm = document.getElementById('search-form');
const searchBox = document.getElementById('search-box');
const searchResults = document.getElementById('search-results');
const chapterEl = document.getElementById('chapter-title');
const titleSep = document.getElementById('title-sep');
const percentEl = document.getElementById('percent');
const scrub = document.getElementById('scrub');
const settings = document.getElementById('settings');
const settingsBackdrop = document.getElementById('settings-backdrop');
const settingsBtn = document.getElementById('settings-btn');
const fontLabel = document.getElementById('font-label');
const divider = document.getElementById('divider');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const loader = document.getElementById('loader');
const errorEl = document.getElementById('reader-error');
const fullscreenBtn = document.getElementById('fullscreen');

const cfiKey = `reader:${slug}:cfi`;
const locationsKey = `reader:${slug}:${document.body.dataset.revision || '0'}:locations`;
const shelfKey = 'reader:shelf';

function remember(percent) {
  if (!slug) return;
  let shelf = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(shelfKey) || '[]');
    if (Array.isArray(parsed)) shelf = parsed;
  } catch {
    shelf = [];
  }
  const previous = shelf.find((item) => item && item.slug === slug);
  const known = typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : previous?.percent;
  const next = {
    slug,
    title: bookTitle || previous?.title || slug,
    author: bookAuthor,
    percent: typeof known === 'number' ? known : null,
    updated: Date.now(),
  };
  const rest = shelf.filter((item) => item && item.slug !== slug);
  localStorage.setItem(shelfKey, JSON.stringify([next, ...rest].slice(0, 40)));
}

const faceOrder = ['book', 'serif', 'sans', 'dyslexic'];
const faceFamily = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", Palatino, serif',
  sans: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  dyslexic: '"OpenDyslexic", sans-serif',
};

const storedTheme = localStorage.getItem('reader:theme');
let theme = themeOrder.includes(storedTheme) && storedTheme !== 'light' ? storedTheme : 'light';
const storedFace = localStorage.getItem('reader:face');
let face = faceOrder.includes(storedFace) ? storedFace : 'book';
const storedFont = Number(localStorage.getItem('reader:font'));
let font = storedFont >= fontMin && storedFont <= fontMax
  ? Math.round(storedFont / fontStep) * fontStep
  : 100;
let flow = localStorage.getItem('reader:flow') === 'scrolled' ? 'scrolled' : 'paginated';
let toc = [];
let rtl = false;
let scrubbing = false;
let searchToken = 0;

document.body.dataset.theme = theme;

function strip(value) {
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function dyslexicFaces() {
  const file = (name) => `${location.origin}/fonts/${name}`;
  const rule = (name, weight, style) =>
    `@font-face { font-family: "OpenDyslexic"; src: url("${file(name)}") format("woff2"); font-weight: ${weight}; font-style: ${style}; font-display: swap; }`;
  return [
    rule('opendyslexic-latin-400-normal.woff2', 400, 'normal'),
    rule('opendyslexic-latin-700-normal.woff2', 700, 'normal'),
    rule('opendyslexic-latin-400-italic.woff2', 400, 'italic'),
    rule('opendyslexic-latin-700-italic.woff2', 700, 'italic'),
  ].join('\n');
}

function prefsCss() {
  const action = flow === 'paginated' ? 'none' : 'pan-y';
  const rules = [`html, body { touch-action: ${action} !important; overscroll-behavior: none; }`];
  if (font !== 100) rules.push(`html { font-size: ${font}% !important; }`);
  if (faceFamily[face]) {
    if (face === 'dyslexic') rules.push(dyslexicFaces());
    rules.push(`html, body, p, li, blockquote, h1, h2, h3, h4, h5, h6, a, td, th, figcaption, dd, dt { font-family: ${faceFamily[face]} !important; }`);
  }
  const colors = palette[theme];
  if (colors) {
    const [background, color, link] = colors;
    rules.push(`html, body { background: ${background} !important; color: ${color} !important; }
      p, li, blockquote, div, span, h1, h2, h3, h4, h5, h6 { color: inherit !important; background-color: transparent !important; }
      a { color: ${link} !important; }`);
  }
  return rules.join('\n') || '/* light */';
}

function chapterLabel(href) {
  const file = String(href || '').split('#')[0];
  const walk = (items) => {
    for (const item of items) {
      if (item.href && item.href.split('#')[0] === file) return strip(item.label || '');
      const nested = walk(item.subitems || []);
      if (nested) return nested;
    }
    return '';
  };
  return walk(toc);
}

function showPanel(name) {
  tocView.hidden = name !== 'toc';
  searchView.hidden = name !== 'search';
  document.getElementById('show-toc').setAttribute('aria-pressed', String(name === 'toc'));
  document.getElementById('show-search').setAttribute('aria-pressed', String(name === 'search'));
  if (name === 'search') searchBox.focus();
}

function openSidebar(open) {
  sidebar.classList.toggle('open', open);
  opener.setAttribute('aria-expanded', String(open));
  if (sidebarBackdrop) sidebarBackdrop.hidden = !open;
  if (open) requestAnimationFrame(scrollCurrentIntoView);
}

function scrollCurrentIntoView() {
  const link = tocView.querySelector('a[aria-current="true"]');
  if (!link || tocView.hidden) return;
  link.scrollIntoView({ block: 'center' });
}

function openSettings(open) {
  settings.hidden = !open;
  if (settingsBackdrop) settingsBackdrop.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
}

function setChrome(open) {
  const hide = !open;
  const wasReading = document.body.classList.contains('chrome-hidden');
  document.body.classList.toggle('chrome-hidden', hide);
  if (!hide) return;
  openSettings(false);
  if (!wasReading) resetScrubHistory();
}

let resetScrubHistory = () => {};

document.getElementById('chrome-top')?.addEventListener('click', () => setChrome(true));
document.getElementById('chrome-bottom')?.addEventListener('click', () => setChrome(true));
document.getElementById('chrome-dismiss')?.addEventListener('click', () => setChrome(false));

settingsBackdrop?.addEventListener('click', () => openSettings(false));

document.addEventListener('click', (event) => {
  if (settings.hidden) return;
  const target = event.target;
  if (target instanceof Node && (settings.contains(target) || settingsBtn.contains(target))) return;
  openSettings(false);
});

function syncChoices() {
  fontLabel.textContent = `${font}%`;
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
  document.querySelectorAll('[data-flow-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.flowChoice === flow));
  });
  document.querySelectorAll('[data-face-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.faceChoice === face));
  });
}

function paint(rendition) {
  const css = prefsCss();
  document.body.dataset.theme = theme;
  rendition.getContents().forEach((contents) => contents.addStylesheetCss(css, 'reader-prefs'));
  localStorage.setItem('reader:theme', theme);
  localStorage.setItem('reader:font', String(font));
  localStorage.setItem('reader:face', face);
  localStorage.setItem('reader:flow', flow);
  syncChoices();
}

function markCurrent(location, rendition) {
  const here = location?.start?.cfi || '';
  const file = String(location?.start?.href || '').split('#')[0];
  const contents = rendition?.getContents?.() || [];
  const sameFile = (href) => {
    const target = String(href || '').split('#')[0];
    if (!target || !file) return !target;
    return target === file || file.endsWith(`/${target}`) || target.endsWith(`/${file}`);
  };
  let best = null;
  for (const link of tocView.querySelectorAll('a')) {
    link.removeAttribute('aria-current');
    const href = link.dataset.href || '';
    if (!sameFile(href)) continue;
    const rawHash = href.split('#')[1] || '';
    let hash = rawHash;
    try { hash = decodeURIComponent(rawHash); } catch { hash = rawHash; }
    if (!hash) {
      if (!best) best = link;
      continue;
    }
    let nodeCfi = '';
    for (const content of contents) {
      const el = content.document?.getElementById(hash);
      if (!el) continue;
      try { nodeCfi = content.cfiFromNode(el); } catch { nodeCfi = ''; }
      break;
    }
    if (!nodeCfi || !here || !rendition?.epubcfi) continue;
    try {
      if (rendition.epubcfi.compare(nodeCfi, here) <= 0) best = link;
    } catch {
      /* un cfi illeggibile non sposta l'evidenza */
    }
  }
  if (best) best.setAttribute('aria-current', 'true');
}

function fillToc(items, list, rendition) {
  for (const item of items) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';
    link.dataset.href = item.href || '';
    link.textContent = strip(item.label || 'Senza titolo');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (item.href) rendition.display(item.href);
      openSidebar(false);
    });
    li.append(link);
    if (item.subitems?.length) {
      const nested = document.createElement('ul');
      nested.className = 'toc-children';
      fillToc(item.subitems, nested, rendition);
      li.append(nested);
    }
    list.append(li);
  }
}

function showError() {
  loader.hidden = true;
  errorEl.hidden = false;
  if (prevBtn) prevBtn.hidden = true;
  if (nextBtn) nextBtn.hidden = true;
  scrub.hidden = true;
}

function turn(rendition, direction) {
  setChrome(false);
  const button = direction < 0 ? prevBtn : nextBtn;
  if (button && !button.disabled) {
    button.classList.add('shown');
    const stamp = String(Date.now());
    button.dataset.flash = stamp;
    window.setTimeout(() => {
      if (button.dataset.flash === stamp) button.classList.remove('shown');
    }, 280);
  }
  if (rtl) direction *= -1;
  if (direction < 0) rendition.prev();
  else rendition.next();
}

function viewerSize() {
  const box = viewer.getBoundingClientRect();
  return {
    width: Math.max(0, Math.floor(box.width)),
    height: Math.max(0, Math.floor(box.height)),
  };
}

if (!window.ePub) {
  showError();
} else {
  const book = window.ePub(bookUrl);
  const size = viewerSize();
  const rendition = book.renderTo(viewer, {
    width: size.width || 800,
    height: size.height || 600,
    flow,
    spread: 'auto',
    minSpreadWidth: 800,
  });

  rendition.hooks.content.register((contents) => {
    contents.addStylesheetCss(prefsCss(), 'reader-prefs');
    const doc = contents.document;
    if (!doc) return;
    claimTouch(doc);
    if (doc.documentElement.dataset.swipe) return;
    doc.documentElement.dataset.swipe = '1';
    watchSwipe(doc);
  });

  book.ready.then(async () => {
    rtl = book.package?.metadata?.direction === 'rtl';
    const navigation = await book.loaded.navigation;
    toc = navigation.toc || [];
    const list = document.createElement('ul');
    if (toc.length) fillToc(toc, list, rendition);
    else {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = 'Questo libro non ha un indice.';
      tocView.replaceChildren(note);
    }
    if (toc.length) tocView.replaceChildren(list);
    syncChoices();

    const savedLocations = localStorage.getItem(locationsKey);
    if (savedLocations) {
      try {
        book.locations.load(savedLocations);
      } catch {
        localStorage.removeItem(locationsKey);
      }
    }
    if (!book.locations.length()) {
      book.locations.pause = 20;
      try {
        await book.locations.generate(1600);
        localStorage.setItem(locationsKey, book.locations.save());
      } catch {
        /* senza mappa la barra salta di capitolo */
      }
    }

    const saved = localStorage.getItem(cfiKey);
    try {
      await rendition.display(saved || undefined);
    } catch {
      await rendition.display();
    }
    loader.hidden = true;
    remember();
    requestAnimationFrame(() => {
      const box = viewerSize();
      if (box.width && box.height) rendition.resize(box.width, box.height);
    });
  }).catch(showError);

  rendition.on('layout', (props) => {
    divider.hidden = flow !== 'paginated' || !(props.divisor > 1);
  });

  rendition.on('relocated', (location) => {
    if (location.start?.cfi) {
      localStorage.setItem(cfiKey, location.start.cfi);
      settledCfi = location.start.cfi;
    }
    const ratio = location.start?.percentage;
    remember(typeof ratio === 'number' ? ratio * 100 : undefined);
    const chapter = chapterLabel(location.start?.href);
    const same = !chapter || chapter === bookTitle;
    chapterEl.textContent = same ? '' : chapter;
    titleSep.hidden = same;
    markCurrent(location, rendition);
    if (typeof ratio === 'number') {
      percentEl.textContent = `${Math.round(ratio * 100)}%`;
      if (!scrubbing && document.activeElement !== scrub) scrub.value = String(Math.round(ratio * 1000));
    } else {
      const page = location.start?.displayed?.page;
      const total = location.start?.displayed?.total;
      percentEl.textContent = page && total ? `${page}/${total}` : '';
    }
    if (!gesture) settledValue = scrub.value;
    if (prevBtn) prevBtn.disabled = Boolean(location.atStart);
    if (nextBtn) nextBtn.disabled = Boolean(location.atEnd);
  });

  prevBtn?.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      openSidebar(false);
      return;
    }
    turn(rendition, -1);
  });
  nextBtn?.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      openSidebar(false);
      return;
    }
    turn(rendition, 1);
  });

  rendition.on('click', (event) => {
    if (Date.now() - swipedAt < 500) return;
    if (sidebar.classList.contains('open')) {
      openSidebar(false);
      setChrome(false);
      return;
    }
    if (!settings.hidden) {
      openSettings(false);
      return;
    }
    if (!document.body.classList.contains('chrome-hidden')) {
      setChrome(false);
      return;
    }
    if (event.target?.closest?.('a, button, input, audio, video, svg')) return;
    const selected = event.view?.getSelection?.()?.toString();
    if (selected) return;
    const width = event.view?.innerWidth || viewer.clientWidth;
    if (event.clientX < width * 0.12) turn(rendition, -1);
    else if (event.clientX > width * 0.88) turn(rendition, 1);
  });

  let swipedAt = 0;

  function claimTouch(doc) {
    const action = flow === 'paginated' ? 'none' : 'pan-y';
    const frame = doc?.defaultView?.frameElement;
    if (frame) frame.style.touchAction = action;
    viewer.querySelectorAll('.epub-container').forEach((node) => {
      node.style.touchAction = action;
    });
  }

  function acceptSwipe(dx) {
    if (Math.abs(dx) < 28) return;
    if (Date.now() - swipedAt < 400) return;
    swipedAt = Date.now();
    if (sidebar.classList.contains('open')) {
      openSidebar(false);
      return;
    }
    turn(rendition, dx < 0 ? 1 : -1);
  }

  function trackSwipe(target, ignore) {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let tracking = false;

    const point = (event) => event.touches?.[0] || event.changedTouches?.[0];

    const finish = (event) => {
      if (!tracking) return;
      tracking = false;
      const touch = event?.changedTouches?.[0];
      if (touch) {
        lastX = touch.screenX;
        lastY = touch.screenY;
      }
      const dx = lastX - startX;
      const dy = lastY - startY;
      if (Math.abs(dx) < Math.abs(dy)) return;
      acceptSwipe(dx);
    };

    target.addEventListener('touchstart', (event) => {
      if (ignore?.(event)) return;
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      startX = lastX = touch.screenX;
      startY = lastY = touch.screenY;
      tracking = true;
    }, { passive: true, capture: true });

    target.addEventListener('touchmove', (event) => {
      if (!tracking) return;
      const touch = point(event);
      if (!touch) return;
      lastX = touch.screenX;
      lastY = touch.screenY;
      const dx = lastX - startX;
      const dy = lastY - startY;
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      if (event.cancelable) event.preventDefault();
    }, { passive: false, capture: true });

    target.addEventListener('touchend', finish, { passive: true, capture: true });
    target.addEventListener('touchcancel', finish, { passive: true, capture: true });
  }

  function watchSwipe(doc) {
    trackSwipe(doc);
  }

  trackSwipe(document.getElementById('main'), (event) => {
    const node = event.target;
    if (!(node instanceof Element)) return true;
    if (node.closest('iframe, #settings, #sidebar, #titlebar, #footer')) return true;
    return false;
  });

  let iframeSwipe = null;
  rendition.on('touchstart', (event) => {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch || event.touches?.length > 1) {
      iframeSwipe = null;
      return;
    }
    iframeSwipe = { x: touch.screenX, y: touch.screenY };
  });
  rendition.on('touchend', (event) => {
    const start = iframeSwipe;
    iframeSwipe = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const dx = touch.screenX - start.x;
    const dy = touch.screenY - start.y;
    if (Math.abs(dx) < Math.abs(dy)) return;
    acceptSwipe(dx);
  });

  const stepFont = (delta) => {
    font = Math.min(fontMax, Math.max(fontMin, font + delta));
    paint(rendition);
    const box = viewerSize();
    if (box.width && box.height) rendition.resize(box.width, box.height);
  };
  document.getElementById('font-down').addEventListener('click', () => stepFont(-fontStep));
  document.getElementById('font-up').addEventListener('click', () => stepFont(fontStep));
  document.querySelectorAll('[data-face-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      face = button.dataset.faceChoice;
      paint(rendition);
      const box = viewerSize();
      if (box.width && box.height) rendition.resize(box.width, box.height);
    });
  });
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      theme = button.dataset.themeChoice;
      paint(rendition);
    });
  });
  document.querySelectorAll('[data-flow-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      flow = button.dataset.flowChoice;
      divider.hidden = flow !== 'paginated';
      localStorage.setItem('reader:flow', flow);
      syncChoices();
      claimTouch();
      paint(rendition);
      rendition.flow(flow);
    });
  });

  opener.addEventListener('click', () => openSidebar(!sidebar.classList.contains('open')));
  document.getElementById('close-sidebar').addEventListener('click', () => openSidebar(false));
  sidebarBackdrop?.addEventListener('click', () => openSidebar(false));
  document.getElementById('main').addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || opener.contains(target)) return;
    if (target.closest('#titlebar, #footer, #settings, #settings-backdrop, .chrome-hit, .arrow')) return;
    if (sidebar.classList.contains('open')) openSidebar(false);
    if (!settings.hidden) return;
    setChrome(false);
  });
  document.getElementById('show-toc').addEventListener('click', () => showPanel('toc'));
  document.getElementById('show-search').addEventListener('click', () => showPanel('search'));
  settingsBtn.addEventListener('click', () => openSettings(settings.hidden));

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.getElementById('main').requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    const active = Boolean(document.fullscreenElement);
    fullscreenBtn.textContent = active ? '↙' : '⛶';
    fullscreenBtn.setAttribute('aria-label', active ? 'Esci dallo schermo intero' : 'Schermo intero');
  });

  function jumpToRatio(ratio) {
    const fraction = Math.min(1, Math.max(0, ratio));
    scrubbing = true;
    const release = () => { scrubbing = false; };
    window.setTimeout(release, 800);
    let pending;
    if (book.locations && book.locations.length() > 1) {
      const cfi = book.locations.cfiFromPercentage(fraction >= 1 ? 0.999999 : fraction);
      if (typeof cfi === 'string') pending = rendition.display(cfi);
    }
    if (!pending) {
      const items = (book.spine?.spineItems || []).filter((item) => item.linear);
      const section = items[Math.round(fraction * Math.max(0, items.length - 1))];
      if (section) pending = rendition.display(section.href);
    }
    if (pending && typeof pending.finally === 'function') pending.finally(release);
  }

  let jumpTimer = 0;
  let settledCfi = localStorage.getItem(cfiKey);
  let settledValue = scrub.value;
  let gesture = null;
  let movingHistory = false;
  const undoStack = [];
  const redoStack = [];
  const undoBtn = document.getElementById('scrub-undo');
  const redoBtn = document.getElementById('scrub-redo');

  function syncHistory() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  resetScrubHistory = () => {
    undoStack.length = 0;
    redoStack.length = 0;
    gesture = null;
    syncHistory();
  };

  function shiftHistory(from, to) {
    const target = from.pop();
    if (!target) return;
    if (settledCfi && settledCfi !== target) to.push(settledCfi);
    movingHistory = true;
    gesture = null;
    scrubbing = false;
    syncHistory();
    const done = rendition.display(target);
    const finish = () => { movingHistory = false; };
    if (done && typeof done.finally === 'function') done.finally(finish);
    else finish();
  }

  function beginGesture() {
    if (gesture || movingHistory) return;
    gesture = { cfi: settledCfi, value: settledValue ?? scrub.value };
  }

  function commitGesture() {
    if (movingHistory) {
      gesture = null;
      return;
    }
    if (!gesture) return;
    const { cfi, value } = gesture;
    gesture = null;
    if (!cfi || String(value) === scrub.value) return;
    undoStack.push(cfi);
    redoStack.length = 0;
    syncHistory();
  }

  scrub.addEventListener('pointerdown', beginGesture, true);
  scrub.addEventListener('mousedown', beginGesture, true);
  scrub.addEventListener('touchstart', beginGesture, true);
  scrub.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    beginGesture();
  });
  scrub.addEventListener('pointerup', commitGesture);
  scrub.addEventListener('keyup', commitGesture);
  const scheduleJump = () => {
    beginGesture();
    scrubbing = true;
    window.clearTimeout(jumpTimer);
    jumpTimer = window.setTimeout(() => jumpToRatio(Number(scrub.value) / 1000), 150);
  };
  scrub.addEventListener('input', scheduleJump);
  scrub.addEventListener('change', () => {
    window.clearTimeout(jumpTimer);
    commitGesture();
    jumpToRatio(Number(scrub.value) / 1000);
  });
  undoBtn?.addEventListener('click', () => shiftHistory(undoStack, redoStack));
  redoBtn?.addEventListener('click', () => shiftHistory(redoStack, undoStack));

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = searchBox.value.trim();
    searchResults.replaceChildren();
    if (query.length < 2) return;
    const token = ++searchToken;
    const status = document.createElement('li');
    status.textContent = 'Cerco…';
    searchResults.append(status);
    const found = [];
    const items = book.spine?.spineItems || [];
    for (const section of items) {
      if (token !== searchToken || found.length >= 40) break;
      const wasLoaded = Boolean(section.document);
      try {
        await section.load(book.load.bind(book));
        const matches = (section.search(query) || []).slice(0, 5);
        for (const match of matches) {
          if (found.length >= 40) break;
          found.push(match);
        }
      } catch {
        /* una sezione illeggibile non blocca le altre */
      } finally {
        const showing = rendition.location?.start?.index === section.index;
        if (!wasLoaded && !showing) {
          try { section.unload(); } catch { /* già scaricata */ }
        }
      }
    }
    if (token !== searchToken) return;
    searchResults.replaceChildren();
    if (!found.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Nessun risultato.';
      searchResults.append(empty);
      return;
    }
    for (const match of found) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = strip(match.excerpt || 'Apri');
      link.addEventListener('click', (click) => {
        click.preventDefault();
        rendition.display(match.cfi);
        openSidebar(false);
      });
      li.append(link);
      searchResults.append(li);
    }
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target?.closest?.('input, textarea');
    if (event.key === 'Escape') {
      openSidebar(false);
      openSettings(false);
      return;
    }
    if (typing) return;
    if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      document.getElementById('font-up').click();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === '-') {
      event.preventDefault();
      document.getElementById('font-down').click();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      turn(rendition, 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      turn(rendition, -1);
    }
  });

  let resizeTimer = 0;
  const resize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const box = viewerSize();
      if (box.width && box.height) rendition.resize(box.width, box.height);
    }, 80);
  };
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(viewer);
}
