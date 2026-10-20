(async () => {
  const shelfKey = 'reader:shelf';
  const safeSlug = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;
  const shelf = document.getElementById('shelf');

  function readShelf() {
    try {
      const parsed = JSON.parse(localStorage.getItem(shelfKey) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item && safeSlug.test(item.slug) && item.slug.length <= 180);
    } catch {
      return [];
    }
  }

  function forget(slug) {
    const prefix = `reader:${slug}:`;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
  }

  async function booksOnShelf() {
    const books = readShelf();
    if (!books.length) return books;
    let response;
    try {
      response = await fetch('/opere', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs: books.map((book) => book.slug) }),
      });
    } catch {
      return books;
    }
    if (!response.ok) return books;
    let body;
    try {
      body = await response.json();
    } catch {
      return books;
    }
    if (!body || !Array.isArray(body.works)) return books;
    const available = new Map();
    for (const work of body.works) {
      if (!work || !safeSlug.test(work.slug) || work.slug.length > 180) continue;
      available.set(work.slug, typeof work.author === 'string' ? work.author.trim() : '');
    }
    const kept = [];
    let changed = false;
    for (const book of books) {
      if (!available.has(book.slug)) {
        forget(book.slug);
        changed = true;
        continue;
      }
      const author = available.get(book.slug);
      if ((book.author || '') !== author) {
        book.author = author;
        changed = true;
      }
      kept.push(book);
    }
    if (changed) localStorage.setItem(shelfKey, JSON.stringify(kept));
    return kept;
  }

  const books = (await booksOnShelf()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  if (shelf && books.length) {
    const list = document.createElement('ol');
    for (const book of books) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/${encodeURIComponent(book.slug)}`;
      const text = document.createElement('span');
      text.className = 'shelf-text';
      const title = document.createElement('span');
      title.className = 'shelf-title';
      title.textContent = book.title || book.slug;
      text.append(title);
      if (book.author) {
        const author = document.createElement('span');
        author.className = 'shelf-author';
        author.textContent = book.author;
        text.append(author);
      }
      const percent = document.createElement('span');
      percent.className = 'shelf-percent';
      if (typeof book.percent === 'number') percent.textContent = `${book.percent}%`;
      link.append(text, percent);
      item.append(link);
      list.append(item);
    }
    shelf.append(list);
    shelf.hidden = false;
  }
})();
