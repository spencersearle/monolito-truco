#!/usr/bin/env node
/* Copies just the runtime web assets into www/ — the folder Capacitor bundles
   into the native iOS/Android app. This keeps node_modules/, .git/, the native
   projects, tests, and docs OUT of the app payload, while the web app itself
   still runs straight from the repo root for GitHub Pages / the PWA. */

import { mkdir, rm, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

// The exact set of files the running game needs in the browser.
const ASSETS = [
  'index.html',
  'privacy.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'peerjs.min.js',
  'cards.js',
  'engine.js',
  'engine4.js',
  'ai.js',
  'ai4.js',
  'net.js',
  'sound.js',
  'haptics.js',
  'moderation.js',
  'nativeback.js',
  'ui.js',
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of ASSETS) {
  await copyFile(join(root, name), join(out, name));
}

console.log(`build-web: copied ${ASSETS.length} assets into www/`);
