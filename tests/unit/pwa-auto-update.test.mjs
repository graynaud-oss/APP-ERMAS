import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { registerServiceWorker } from '../../js/pwa.js';

const root = new URL('../../', import.meta.url);
const workerSource = fs.readFileSync(new URL('service-worker.js', root), 'utf8');

function createResponse(body, { ok = true, type = 'basic' } = {}) {
    return {
        body,
        ok,
        type,
        clone() {
            return createResponse(body, { ok, type });
        }
    };
}

function createWorkerEnvironment({ cached = {}, fetchImplementation } = {}) {
    const listeners = {};
    const entries = new Map(Object.entries(cached));
    const deletedCaches = [];
    const cacheWrites = [];
    const cacheKey = (request) => typeof request === 'string' ? request : request.url;
    const cache = {
        async addAll() {},
        async put(request, response) {
            entries.set(cacheKey(request), response);
            cacheWrites.push(cacheKey(request));
        }
    };
    const caches = {
        async open() { return cache; },
        async match(request) { return entries.get(cacheKey(request)); },
        async keys() { return ['ermas-static-v1', 'ermas-static-v2', 'unrelated-cache']; },
        async delete(name) { deletedCaches.push(name); return true; }
    };
    const self = {
        location: { origin: 'https://plateforme-technique.ermas.fr' },
        clients: { async claim() {} },
        async skipWaiting() {},
        addEventListener(type, listener) { listeners[type] = listener; }
    };
    const fetchCalls = [];
    const context = {
        URL,
        caches,
        self,
        fetch: async (request) => {
            fetchCalls.push(cacheKey(request));
            if (fetchImplementation) return fetchImplementation(request);
            return createResponse('network');
        }
    };

    vm.runInNewContext(workerSource, context, { filename: 'service-worker.js' });

    async function dispatchFetch(request) {
        let responsePromise;
        listeners.fetch({
            request,
            respondWith(promise) { responsePromise = promise; }
        });
        return responsePromise;
    }

    return { cacheWrites, deletedCaches, dispatchFetch, entries, fetchCalls, listeners };
}

function request(path, { destination = '', mode = 'cors', method = 'GET' } = {}) {
    return {
        destination,
        method,
        mode,
        url: new URL(path, 'https://plateforme-technique.ermas.fr').href
    };
}

test('le code applicatif renvoie la version réseau B et remplace la version A en cache', async () => {
    const url = 'https://plateforme-technique.ermas.fr/css/app-ermas.css';
    const environment = createWorkerEnvironment({
        cached: { [url]: createResponse('version A') },
        fetchImplementation: async () => createResponse('version B')
    });

    const response = await environment.dispatchFetch(request('/css/app-ermas.css', { destination: 'style' }));

    assert.equal(response.body, 'version B');
    assert.equal(environment.entries.get(url).body, 'version B');
    assert.deepEqual(environment.fetchCalls, [url]);
    assert.deepEqual(environment.cacheWrites, [url]);
});

test('le JavaScript interne renvoie la version réseau même si une ancienne copie existe', async () => {
    const url = 'https://plateforme-technique.ermas.fr/js/home-navigation.js';
    const environment = createWorkerEnvironment({
        cached: { [url]: createResponse('javascript A') },
        fetchImplementation: async () => createResponse('javascript B')
    });

    const response = await environment.dispatchFetch(request('/js/home-navigation.js', { destination: 'script' }));
    assert.equal(response.body, 'javascript B');
    assert.equal(environment.entries.get(url).body, 'javascript B');
});

test('hors ligne, le code applicatif utilise la dernière version B mise en cache', async () => {
    const url = 'https://plateforme-technique.ermas.fr/js/pwa.js';
    const environment = createWorkerEnvironment({
        cached: { [url]: createResponse('version B') },
        fetchImplementation: async () => { throw new Error('offline'); }
    });

    const response = await environment.dispatchFetch(request('/js/pwa.js', { destination: 'script' }));
    assert.equal(response.body, 'version B');
});

test('les navigations sont réseau prioritaire avec offline.html comme seul fallback', async () => {
    const offlineUrl = 'https://plateforme-technique.ermas.fr/offline.html';
    const online = createWorkerEnvironment({ fetchImplementation: async () => createResponse('page B') });
    assert.equal((await online.dispatchFetch(request('/accueil.html', { mode: 'navigate' }))).body, 'page B');

    const offline = createWorkerEnvironment({
        cached: { '/offline.html': createResponse('hors ligne') },
        fetchImplementation: async () => { throw new Error('offline'); }
    });
    assert.equal((await offline.dispatchFetch(request('/accueil.html', { mode: 'navigate' }))).body, 'hors ligne');
    assert.equal(offline.entries.has(offlineUrl), false);
});

test('une page HTML en ligne ne peut pas être remplacée par une ancienne copie en cache', async () => {
    const url = 'https://plateforme-technique.ermas.fr/accueil.html';
    const environment = createWorkerEnvironment({
        cached: { [url]: createResponse('page A') },
        fetchImplementation: async () => createResponse('page B')
    });

    const response = await environment.dispatchFetch(request('/accueil.html', { mode: 'navigate' }));
    assert.equal(response.body, 'page B');
});

test('les requêtes externes Google Sheets ou Supabase restent strictement réseau', async () => {
    const environment = createWorkerEnvironment({ fetchImplementation: async () => createResponse('external') });
    const urls = [
        'https://docs.google.com/spreadsheets/d/example/export?format=csv',
        'https://example.supabase.co/rest/v1/profiles'
    ];

    for (const url of urls) {
        const response = await environment.dispatchFetch(request(url));
        assert.equal(response.body, 'external');
    }

    assert.deepEqual(environment.fetchCalls, urls);
    assert.deepEqual(environment.cacheWrites, []);
});

test('les images statiques conservent un cache-first limité', async () => {
    const url = 'https://plateforme-technique.ermas.fr/assets/brand/ermas-logo.png';
    const environment = createWorkerEnvironment({ cached: { [url]: createResponse('logo') } });

    const response = await environment.dispatchFetch(request('/assets/brand/ermas-logo.png', { destination: 'image' }));
    assert.equal(response.body, 'logo');
    assert.deepEqual(environment.fetchCalls, []);
});

test('l’activation supprime les anciens caches v1/v2 et réclame immédiatement les clients', async () => {
    const environment = createWorkerEnvironment();
    let activation;
    environment.listeners.activate({ waitUntil(promise) { activation = promise; } });
    await activation;
    assert.deepEqual(environment.deletedCaches, ['ermas-static-v1', 'ermas-static-v2']);
});

test('l’enregistrement ignore le cache HTTP du worker et contrôle une mise à jour au chargement', async () => {
    let registerArguments;
    let updateCalls = 0;
    const registration = { async update() { updateCalls += 1; } };
    const navigatorObject = {
        serviceWorker: {
            controller: {},
            addEventListener() {},
            async register(...args) { registerArguments = args; return registration; }
        }
    };

    assert.equal(await registerServiceWorker(navigatorObject, {}), registration);
    assert.deepEqual(registerArguments, ['/service-worker.js', { scope: '/', updateViaCache: 'none' }]);
    assert.equal(updateCalls, 1);
});

test('controllerchange recharge au plus une fois une application déjà contrôlée', async () => {
    let controllerChange;
    let reloadCalls = 0;
    const navigatorObject = {
        serviceWorker: {
            controller: {},
            addEventListener(type, listener) { if (type === 'controllerchange') controllerChange = listener; },
            async register() { return { async update() {} }; }
        }
    };

    await registerServiceWorker(navigatorObject, { reload() { reloadCalls += 1; } });
    controllerChange();
    controllerChange();
    assert.equal(reloadCalls, 1);
});

test('la première installation ne provoque pas de rechargement automatique', async () => {
    let controllerChange;
    let reloadCalls = 0;
    const navigatorObject = {
        serviceWorker: {
            controller: null,
            addEventListener(type, listener) { if (type === 'controllerchange') controllerChange = listener; },
            async register() { return { async update() {} }; }
        }
    };

    await registerServiceWorker(navigatorObject, { reload() { reloadCalls += 1; } });
    controllerChange();
    assert.equal(reloadCalls, 0);
});

test('un contrôle de mise à jour hors ligne ne bloque pas le worker déjà enregistré', async () => {
    const registration = { async update() { throw new Error('offline'); } };
    const navigatorObject = {
        serviceWorker: {
            controller: {},
            addEventListener() {},
            async register() { return registration; }
        }
    };

    assert.equal(await registerServiceWorker(navigatorObject, {}), registration);
});
