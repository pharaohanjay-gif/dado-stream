const CACHE_NAME = 'dado-stream-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/css/theme-orange.css',
  '/js/app.js',
  '/dado.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate and clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network first, fallback to cache strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls - always fetch from network
  if (event.request.url.includes('/api/')) return;
  
  // Skip admin panel - always fetch from network
  if (event.request.url.includes('/admin/')) return;
  
  // Skip external resources
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        
        // Cache successful responses
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Return a simple offline response for HTML pages
          if (event.request.headers.get('accept').includes('text/html')) {
            return new Response('<html><body><h1>Offline</h1><p>Tidak ada koneksi internet.</p></body></html>', {
              headers: { 'Content-Type': 'text/html' }
            });
          }
          // Return empty response for other resources
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Handle push notifications (future feature)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Ada konten baru!',
    icon: '/dado.png',
    badge: '/dado.png',
    vibrate: [100, 50, 100],
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification('DADO STREAM', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
