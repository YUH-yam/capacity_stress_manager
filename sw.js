const CACHE_NAME = 'capacity-stress-manager-v8';
const APP_SHELL = [
  './',
  './index.html',
  './assets/css/00-foundation.css',
  './assets/css/01-stress.css',
  './assets/css/02-tasks-settings.css',
  './assets/css/03-wbs.css',
  './assets/css/04-sync.css',
  './assets/css/05-responsive.css',
  './assets/css/06-print-utilities.css',
  './assets/css/07-ios-first.css',
  './assets/js/00-sync.js',
  './assets/js/01-data-catalogs.js',
  './assets/js/02-state-storage.js',
  './assets/js/03-dashboard.js',
  './assets/js/04-tasks.js',
  './assets/js/05-drag-drop.js',
  './assets/js/06-wbs.js',
  './assets/js/07-stress.js',
  './assets/js/08-export.js',
  './assets/js/09-bootstrap.js',
  './assets/icons/icon.svg',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(APP_SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  event.respondWith(
    (isSameOrigin
      ? fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
      : caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        });
      })
    )
  );
});
