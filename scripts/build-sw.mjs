// Bundles the service worker (src/sw.web.ts) into an exported web build, with the precache list of
// that build's files (the PWA's vite-plugin-pwa `injectManifest`). Run after `expo export`:
//   node scripts/build-sw.mjs [dist]
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist');
// The PWA's globPatterns, plus .mjs (the map's worker, needed offline) and .ttf (fonts).
const PRECACHE = /\.(js|mjs|css|html|ico|png|svg|woff2|ttf)$/;
// The entry bundle outgrows the PWA's 3 MB limit; everything the app runs on must be cached.
const MAX_BYTES = 8 * 1024 * 1024;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const manifest = walk(dist)
  .map((file) => path.relative(dist, file).split(path.sep).join('/'))
  // The app's one page; the public pages (`privacy/index.html`, …) stay network-only.
  .filter((url) => PRECACHE.test(url) && url !== 'sw.js' && !url.startsWith('.well-known/'))
  .filter((url) => !url.endsWith('.html') || url === 'index.html')
  .filter((url) => {
    const size = fs.statSync(path.join(dist, url)).size;
    if (size <= MAX_BYTES) return true;
    console.warn(`build-sw: ${url} (${size} bytes) is too large to precache`);
    return false;
  })
  .sort()
  .map((url) => ({
    url: `/${url}`,
    revision: createHash('md5')
      .update(fs.readFileSync(path.join(dist, url)))
      .digest('hex'),
  }));

await build({
  entryPoints: [path.join(root, 'src/sw.web.ts')],
  outfile: path.join(dist, 'sw.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  alias: { '@': path.join(root, 'src') },
  define: {
    'self.__WB_MANIFEST': JSON.stringify(manifest),
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'warning',
});

console.log(`build-sw: sw.js with ${manifest.length} precached files`);
