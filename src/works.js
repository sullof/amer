import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { readEpubMeta } from './epubMeta.js';

const metaCache = new Map();
const ignoredNames = new Set();

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
