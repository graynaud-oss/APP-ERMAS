const CACHE_NAME = 'ermas-static-v1';
const STATIC_ASSETS = [
    '/manifest.webmanifest',
    '/offline.html',
    '/css/app-ermas.css',
    '/assets/brand/ermas-logo.png',
    '/assets/brand/apple-touch-icon.png',
    '/assets/pwa/icon-192.png',
    '/assets/pwa/icon-512.png'
];
const STATIC_PATHS = new Set(STATIC_ASSETS);

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((name) => name.startsWith('ermas-static-') && name !== CACHE_NAME)
                .map((name) => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(request));
        return;
    }

    if (STATIC_PATHS.has(url.pathname)) {
        event.respondWith(
            caches.match(request, { ignoreSearch: true })
                .then((cached) => cached || fetch(request))
        );
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
        return;
    }

    event.respondWith(fetch(request));
});
