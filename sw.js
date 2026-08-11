/* MONOLITO · Truco — service worker
   Makes the game installable and fully playable offline (vs the AI).
   Bump CACHE_VERSION whenever any cached asset changes so clients refresh. */

const CACHE_VERSION = 'monolito-v6';
const CACHE_NAME = `${CACHE_VERSION}`;

// App shell: everything needed to boot and play solo vs the AI, offline.
const CORE_ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './styles.css',
  './peerjs.min.js',
  './cards.js',
  './engine.js',
  './engine4.js',
  './ai.js',
  './ai4.js',
  './net.js',
  './sound.js',
  './haptics.js',
  './moderation.js',
  './nativeback.js',
  './share.js',
  './ui.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // HTML navigations: network-first so updates land, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  // Google Fonts (cross-origin): cache-first, runtime-populated.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Same-origin static assets: network-first so scripts/styles always match the
  // freshly fetched HTML after a deploy (a cache-first strategy here served the
  // previous version's JS/CSS against the new page). Offline falls back to cache.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match(request, { ignoreSearch: true }))
    );
  }
  // Everything else (e.g. PeerJS signaling): let the network handle it.
});
