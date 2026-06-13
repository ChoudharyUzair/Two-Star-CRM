/* Two Star Essentials — Service Worker
 * Strategy:
 *   - Navigations & static assets: network-first, fall back to cache (so the
 *     app shell opens even when the internet is down).
 *   - API GET requests: network-first, fall back to last cached response when
 *     offline (read-only data stays visible). Writes (POST/PUT/DELETE) always
 *     go straight to the network and are never cached.
 *   - When the network comes back, the next request hits the network again and
 *     the cache is refreshed automatically (so data re-syncs from the cloud).
 */
const CACHE_VERSION = 'two-star-essentials-v3';
const APP_SHELL = [
  '/',
  '/static/app.js',
  '/static/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(APP_SHELL).catch(() => { /* ignore individual failures */ })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isApiGet(request) {
  return request.method === 'GET' && new URL(request.url).pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests; everything else (writes, CDN, cross
  // origin) goes straight to the network untouched.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  // Never cache auth endpoints — always hit the network.
  if (url.pathname.startsWith('/api/auth/')) return;

  // Navigation requests (the app shell / HTML pages): network-first.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }

  // API GET: network-first with cache fallback.
  if (isApiGet(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const shell = await cache.match(fallbackPath);
      if (shell) return shell;
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Aap offline hain. Net aate hi data sync ho jayega.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in background so the cached copy stays up to date.
    fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    return cached || Response.error();
  }
}

// Allow the page to tell a waiting SW to activate immediately.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
