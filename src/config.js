import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

export const config = {
  root,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  worksDir: process.env.WORKS_DIR
    ? path.resolve(process.env.WORKS_DIR)
    : path.join(root, 'works'),
  siteUrl: (process.env.SITE_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/$/, ''),
  siteName: 'AMER',
  siteDescription: 'A Minimalistic Epub Reader',
  version,
};
