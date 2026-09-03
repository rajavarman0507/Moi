// Moi Web App - Versioned Service Worker for PWA Installability
const CACHE_NAME = 'moi-v1.0.1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
];

// Install Event - Pre-cache Static App Shell
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Immediate takeover on deploy
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate Event - Evict Stale Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim()) // Claim clients immediately
  );
});

// Fetch Event - Network-first for dynamic & Firestore, Cache-first ONLY for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache Firestore, Firebase Realtime DB, or API calls
  if (
    url.origin.includes('firestore') ||
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis') ||
    url.pathname.startsWith('/api/')
  ) {
    return; // Pass through to network
  }

  // Cache-first ONLY for Next.js static chunks & assets
  if (url.pathname.startsWith('/_next/static/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.ico')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first for HTML pages with fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
