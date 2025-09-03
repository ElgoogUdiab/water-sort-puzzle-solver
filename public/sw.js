// Simple, versioned service worker for offline support
const CACHE_VERSION = 'v1';
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // Skip waiting so new SW takes control on next load
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Basic runtime caching: network-first for navigations, cache-first for same-origin static files
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Handle navigations (SPA app shell)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache a copy of the latest index.html
          const resClone = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('/', resClone).catch(() => {}));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          // Fallback to cached app shell if available
          const cached = await cache.match('/');
          return cached || Response.error();
        })
    );
    return;
  }

  // For same-origin static assets: try cache first then network
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, resClone).catch(() => {}));
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

