// Service Worker for PWA - Offline Support & Caching
const CACHE_NAME = 'zitthenkne-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/checklist.css',
  '/quiz-preview.css',
  '/app.js',
  '/quiz.js',
  '/quiz-page.js',
  '/study-room.js',
  '/flashcard.js',
  '/auth.js',
  '/firebase-init.js',
  '/utils.js',
  '/assets/logo.png',
  '/assets/squirrel-pixel.png',
  '/assets/hero-image.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching app shell');
      return cache.addAll(urlsToCache).catch((err) => {
        console.log('Service Worker: Some resources failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if available
      if (response) {
        return response;
      }

      // Otherwise fetch from network
      return fetch(event.request)
        .then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          // Cache the new response for future use
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Return a fallback page if offline and no cache
          return caches.match('/index.html');
        });
    })
  );
});

// Background Sync (optional - for future use)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quizzes') {
    event.waitUntil(syncQuizzes());
  }
});

async function syncQuizzes() {
  try {
    // Sync quiz data when connection is restored
    console.log('Service Worker: Syncing quiz data');
  } catch (error) {
    console.log('Service Worker: Sync failed', error);
  }
}