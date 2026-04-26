const CACHE_NAME = 'softsol-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/Chat',
  '/Profile',
  '/admin',
  '/admin-panel',
  '/admin-chat-detail',
  '/output.css',
  '/icon.png'
];

// Install: Cache UI shell and routes
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate: Clean up old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Fetch: Network first, fallback to cache for offline access
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});