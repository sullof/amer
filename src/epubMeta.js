import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
});

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textContent(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (typeof node === 'object') {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith('@_'))
      .map(([, value]) => textContent(value))
      .join(' ');
  }
  return '';
}

function cleanText(value) {
  return textContent(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTitle(metadata) {
  const titles = asArray(metadata?.title).map((node) => ({
    text: cleanText(node),
    type: node && typeof node === 'object' ? node['@_title-type'] : '',
  })).filter((item) => item.text);
  return (titles.find((item) => item.type === 'main') ?? titles[0])?.text ?? '';
}

function pickAuthor(metadata) {
  return asArray(metadata?.creator).map(cleanText).filter(Boolean).join(', ');
}

function findCoverItem(metadata, manifest) {
  const items = asArray(manifest?.item);
  const byProperty = items.find((item) => String(item?.['@_properties'] ?? '')
    .split(/\s+/)
    .includes('cover-image'));
  if (byProperty) return byProperty;

  const coverMeta = asArray(metadata?.meta).find((meta) => meta?.['@_name'] === 'cover' && meta?.['@_content']);
  if (!coverMeta) return null;
  return items.find((item) => item?.['@_id'] === coverMeta['@_content']) ?? null;
}

function mediaTypeFor(item, href) {
  const declared = item?.['@_media-type'];
  if (declared) return declared;
  const ext = path.posix.extname(href).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  return 'image/jpeg';
}

export async function readEpubMeta(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const containerEntry = zip.file('META-INF/container.xml');
  if (!containerEntry) throw new Error('container.xml mancante');

  const container = parser.parse(await containerEntry.async('string'));
  const rootfile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootfile?.['@_full-path'];
  if (!opfPath) throw new Error('percorso OPF mancante');

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) throw new Error('OPF mancante');
  const opf = parser.parse(await opfEntry.async('string'));
  const metadata = opf?.package?.metadata ?? {};
  const manifest = opf?.package?.manifest ?? {};

  const meta = {
    title: pickTitle(metadata),
    author: pickAuthor(metadata),
    description: cleanText(metadata.description).slice(0, 280),
    cover: null,
  };

  const coverItem = findCoverItem(metadata, manifest);
  const href = coverItem?.['@_href'];
  if (!href) return meta;

  const opfDir = path.posix.dirname(opfPath);
  const coverPath = path.posix.normalize(path.posix.join(opfDir, decodeURIComponent(href.split('#')[0])));
  if (coverPath.startsWith('..')) return meta;

  const coverEntry = zip.file(coverPath);
  if (!coverEntry) return meta;
  const data = await coverEntry.async('nodebuffer');
  if (data.length > 8 * 1024 * 1024) return meta;

  meta.cover = { mediaType: mediaTypeFor(coverItem, coverPath), data };
  return meta;
}
