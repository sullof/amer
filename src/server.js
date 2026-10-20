import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { getWork, listWorks, readWorkEntry } from './works.js';
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

app.get('/', (req, res) => {
  sendHtml(res, 200, homePage());
});

app.get('/opere', wrap(async (req, res) => {
  const works = await listWorks();
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    works: works.map((work) => ({
      slug: work.slug,
      author: work.author || '',
    })),
  });
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
