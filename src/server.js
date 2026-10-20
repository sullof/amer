import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { getWork, findWorks, readWorkEntry } from './works.js';
import { homePage, messagePage, notFoundPage, readerPage } from './render.js';

const publicDir = path.join(config.root, 'public');
const vendorFiles = {
  'jszip.min.js': path.join(config.root, 'node_modules/jszip/dist/jszip.min.js'),
  'epub.min.js': path.join(config.root, 'node_modules/epubjs/dist/epub.min.js'),
};
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.static(publicDir, {
  index: false,
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}fonts${path.sep}`)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  },
}));

function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sendHtml(res, status, html) {
  res.status(status).type('html').send(html);
}

const shelfPasses = new Map();
const shelfAttempts = new Map();
const shelfPassTtl = 5 * 60 * 1000;
const shelfWindow = 15 * 60 * 1000;
const shelfAttemptLimit = 60;

function shelfCookie(token, maxAge) {
  return `amer-shelf=${token}; HttpOnly; SameSite=Strict; Path=/opere; Max-Age=${maxAge}`;
}

function readShelfCookie(req) {
  const header = req.get('cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === 'amer-shelf') return rest.join('=');
  }
  return '';
}

function issueShelfPass(res) {
  const now = Date.now();
  for (const [token, expires] of shelfPasses) {
    if (expires <= now) shelfPasses.delete(token);
  }
  const token = crypto.randomBytes(32).toString('hex');
  shelfPasses.set(token, now + shelfPassTtl);
  res.setHeader('Set-Cookie', shelfCookie(token, Math.floor(shelfPassTtl / 1000)));
}

function takeShelfPass(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expires = shelfPasses.get(token);
  if (expires === undefined) return false;
  shelfPasses.delete(token);
  return expires > Date.now();
}

function allowShelfCheck(ip) {
  const now = Date.now();
  if (shelfAttempts.size > 500) {
    for (const [key, times] of shelfAttempts) {
      if (!times.some((time) => now - time < shelfWindow)) shelfAttempts.delete(key);
    }
  }
  const hits = (shelfAttempts.get(ip) || []).filter((time) => now - time < shelfWindow);
  if (hits.length >= shelfAttemptLimit) {
    shelfAttempts.set(ip, hits);
    return false;
  }
  hits.push(now);
  shelfAttempts.set(ip, hits);
  return true;
}

app.get('/', (req, res) => {
  issueShelfPass(res);
  sendHtml(res, 200, homePage());
});

app.use(express.json({ limit: '16kb' }));

app.post('/opere', wrap(async (req, res) => {
  res.setHeader('Set-Cookie', shelfCookie('', 0));
  res.setHeader('Cache-Control', 'no-store');
  if (!allowShelfCheck(req.ip) || !takeShelfPass(readShelfCookie(req))) {
    res.status(403).end();
    return;
  }
  const slugs = req.body?.slugs;
  if (!Array.isArray(slugs)) {
    res.status(400).end();
    return;
  }
  const works = await findWorks(slugs);
  res.json({ works });
}));

/*
app.get('/opere/:slug/libro.epub', wrap(async (req, res, next) => {
  const work = await getWork(req.params.slug);
  if (!work) {
    sendHtml(res, 404, notFoundPage());
    return;
  }
  res.type('application/epub+zip');
  res.sendFile(work.filePath, (error) => {
    if (!error || error.code === 'ECONNABORTED' || error.code === 'ECONNRESET') return;
    next(error);
  });
}));
*/

app.get(/^\/lettura\/([^/]+)\/(.+)$/, wrap(async (req, res) => {
  let slug = req.params[0];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    res.status(404).end();
    return;
  }
  const entry = await readWorkEntry(slug, req.params[1]);
  if (!entry) {
    res.status(404).end();
    return;
  }
  res.status(200);
  res.setHeader('Content-Type', entry.mediaType);
  res.setHeader('Content-Length', entry.data.length);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(entry.data);
}));

/*
app.get('/opere/:slug/copertina', wrap(async (req, res) => {
  const work = await getWork(req.params.slug);
  if (!work?.cover) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', work.cover.mediaType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(work.cover.data);
}));
*/

app.get('/vendor/:file', (req, res, next) => {
  const filePath = vendorFiles[req.params.file];
  if (!filePath) {
    next();
    return;
  }
  res.sendFile(filePath, (error) => {
    if (!error || error.code === 'ECONNABORTED' || error.code === 'ECONNRESET') return;
    next(error);
  });
});

app.get('/:slug', wrap(async (req, res) => {
  const work = await getWork(req.params.slug);
  if (!work) {
    sendHtml(res, 404, notFoundPage());
    return;
  }
  sendHtml(res, 200, readerPage(work));
}));

app.use((req, res) => {
  sendHtml(res, 404, notFoundPage());
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error(error);
  sendHtml(res, 500, messagePage('Errore', 'Qualcosa è andato storto.'));
});

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  await fs.mkdir(config.worksDir, { recursive: true }).catch((error) => {
    console.error(`Cartella EPUB non disponibile (${config.worksDir}): ${error.message}`);
  });
  const server = app.listen(config.port, config.host, () => {
    console.log(`Lettore su ${config.siteUrl}`);
    console.log(`EPUB in ${config.worksDir}`);
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });

  const shutdown = () => {
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
