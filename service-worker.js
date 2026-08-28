const CACHE_NAME = 'ermas-static-v3';
const CACHE_PREFIX = 'ermas-static-';
const OFFLINE_FALLBACK = '/offline.html';
const PRECACHE_ASSETS = [
    '/manifest.webmanifest',
    OFFLINE_FALLBACK,
    '/assets/brand/ermas-logo.png',
    '/assets/brand/apple-touch-icon.png',
    '/assets/pwa/icon-192.png',
    '/assets/pwa/icon-512.png',
    '/assets/pwa/icon-512-maskable.png'
];

function isCacheableResponse(response) {
    return Boolean(response?.ok && (response.type === 'basic' || response.type === 'default'));
}

function isApplicationCodeRequest(request, url) {
    return request.destination === 'style'
        || request.destination === 'script'
        || url.pathname.endsWith('.html')
        || url.pathname.endsWith('.css')
        || url.pathname.endsWith('.js')
        || url.pathname.endsWith('.webmanifest');
}

function isStaticAssetRequest(request, url) {
    return request.destination === 'image'
        || request.destination === 'font'
        || /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(url.pathname);
}

async function networkFirstWithCache(request) {
    try {
        const response = await fetch(request);
        if (isCacheableResponse(response)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        if (cachedResponse) return cachedResponse;
        throw error;
    }
}

async function navigationNetworkFirst(request) {
    try {
        return await fetch(request);
    } catch {
        return caches.match(OFFLINE_FALLBACK);
    }
}

async function staticAssetCacheFirst(request) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) return cachedResponse;

    const response = await fetch(request);
    if (isCacheableResponse(response)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Google Sheets, Supabase, Auth, REST et RPC restent strictement réseau.
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(navigationNetworkFirst(request));
        return;
    }

    if (isApplicationCodeRequest(request, url)) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    if (isStaticAssetRequest(request, url)) {
        event.respondWith(staticAssetCacheFirst(request));
        return;
    }

    event.respondWith(fetch(request));
});
