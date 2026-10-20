import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { config } from './config.js';
import { readEpubMeta } from './epubMeta.js';

const metaCache = new Map();
const zipCache = new Map();
const ignoredNames = new Set();
const entryLimit = 32 * 1024 * 1024;
const mediaTypes = {
  xhtml: 'application/xhtml+xml',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  opf: 'application/oebps-package+xml',
  ncx: 'application/x-dtbncx+xml',
  xml: 'application/xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  smil: 'application/smil+xml',
  pls: 'application/pls+xml',
};

function isSafeSlug(slug) {
  return typeof slug === 'string'
    && slug.length > 0
    && slug.length <= 180
    && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug);
}

async function metaFor(filePath) {
  const stat = await fs.stat(filePath);
  const hit = metaCache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.meta;

  let meta;
  try {
    meta = await readEpubMeta(filePath);
  } catch (error) {
    console.warn(`EPUB non letto (${path.basename(filePath)}): ${error.message}`);
    meta = { title: '', author: '', description: '', cover: null };
  }

  const stored = { mtimeMs: stat.mtimeMs, size: stat.size, meta };
  metaCache.set(filePath, stored);
  return meta;
}

async function epubFiles() {
  let entries = [];
  try {
    entries = await fs.readdir(config.worksDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.epub')) continue;
    const slug = entry.name.slice(0, -'.epub'.length);
    if (!isSafeSlug(slug)) {
      if (!ignoredNames.has(entry.name)) {
        ignoredNames.add(entry.name);
        console.warn(`Nome EPUB ignorato: ${entry.name}`);
      }
      continue;
    }
    files.push({
      slug,
      filePath: path.resolve(config.worksDir, entry.name),
    });
  }
  return files;
}

export async function listWorks() {
  const files = await epubFiles();
  const works = [];
  for (const file of files) {
    const { slug, filePath } = file;
    const [meta, stat] = await Promise.all([metaFor(filePath), fs.stat(filePath)]);
    works.push({
      slug,
      filePath,
      revision: String(Math.round(stat.mtimeMs)),
      title: meta.title || slug.replaceAll('-', ' '),
      author: meta.author,
      description: meta.description,
      cover: meta.cover,
    });
  }

  works.sort((a, b) => a.title.localeCompare(b.title, 'it'));
  return works;
}

export async function getWork(slug) {
  if (!isSafeSlug(slug)) return null;
  const works = await listWorks();
  return works.find((work) => work.slug === slug) ?? null;
}

function safeZipPath(raw) {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const normalized = path.posix.normalize(String(decoded).replaceAll('\\', '/')).replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.split('/').includes('..')) return null;
  if (normalized.toLowerCase().endsWith('.epub')) return null;
  return normalized;
}

function mediaTypeForPath(filePath) {
  const ext = path.posix.extname(filePath).slice(1).toLowerCase();
  return mediaTypes[ext] || 'application/octet-stream';
}

async function zipFor(filePath) {
  const stat = await fs.stat(filePath);
  const hit = zipCache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.zip;
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  zipCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, zip });
  return zip;
}

export async function readWorkEntry(slug, rawPath) {
  if (!isSafeSlug(slug)) return null;
  const inner = safeZipPath(rawPath);
  if (!inner) return null;
  const filePath = path.resolve(config.worksDir, `${slug}.epub`);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  let zip;
  try {
    zip = await zipFor(filePath);
  } catch {
    return null;
  }
  const entry = zip.file(inner);
  if (!entry || entry.dir) return null;
  const data = await entry.async('nodebuffer');
  if (data.length > entryLimit) return null;
  return { mediaType: mediaTypeForPath(inner), data };
}
