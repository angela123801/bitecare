const CACHE_NAME = 'bitecare-v2';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  // Health-education visuals, precached so the guides also work offline.
  '/edu-rabies.webp',
  '/edu-animal-bite-prevention.webp',
  '/edu-wound-care.webp',
  '/edu-vaccination.webp',
  '/edu-pet-ownership.webp',
  '/edu-seek-medical.webp',
  '/edu-children-safety.webp',
  '/step-put-safety-first.webp',
  '/step-wash-wound.webp',
  '/step-control-bleeding.webp',
  '/step-apply-antiseptic.webp',
  '/step-cover-wound.webp',
  '/step-go-to-center.webp',
  '/step-monitor.webp',
  '/step-report.webp',
  '/step-avoid-remedies.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Network-first so logged-in users always get fresh data and new app versions;
// the cache is only a fallback when the network is unavailable.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match('/'))
      )
  );
});
