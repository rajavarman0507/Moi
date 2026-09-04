// Moi Web App - Versioned Service Worker for PWA Installability
const CACHE_NAME = 'moi-v1.0.3';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Install Event - Skip waiting immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate Event - Evict all stale old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network-First for ALL requests to guarantee live updates
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache Firestore, Firebase Realtime DB, or API calls
  if (
    url.origin.includes('firestore') ||
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Network-First strategy for application routes & Next.js static assets
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
