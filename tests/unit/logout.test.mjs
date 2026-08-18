import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { installGlobalLogout, logoutCurrentSession } from '../../js/logout.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const protectedPages = [
    'accueil.html',
    'jantes.html',
    'jantes-taille.html',
    'jantes-pneu.html',
    'roues-etroites.html',
    'roues-etroites-taille.html',
    'roues-etroites-pneu.html',
    'jumelages.html',
    'jumelages-choix.html',
    'jumelages-information.html',
    'jumelages-jantes-taille.html',
    'jumelages-jantes-pneu.html',
    'calcul-voie.html',
    'calcul-hors-tout.html',
    'documents.html',
    'contact.html'
];
const sources = new Map(await Promise.all(protectedPages.map(async (file) => [
    file,
    await readFile(path.join(root, file), 'utf8')
])));
const logoutSource = await readFile(path.join(root, 'js', 'logout.js'), 'utf8');
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');

test('les seize pages protégées exposent exactement un bouton de déconnexion global', () => {
    assert.equal(protectedPages.length, 16);
    for (const [file, source] of sources) {
        assert.equal(source.match(/data-global-logout/g)?.length, 1, `${file} doit contenir un bouton global`);
        assert.equal(source.match(/Se déconnecter/g)?.length, 1, `${file} doit afficher le libellé exact`);
        assert.ok(source.includes('src="./js/logout.js"'), `${file} doit charger le helper commun`);
    }
});

test('index conserve exclusivement ses actions Auth historiques', () => {
    assert.doesNotMatch(indexSource, /data-global-logout|src="\.\/js\/logout\.js"/);
    assert.ok(indexSource.includes('async function logoutUser()'));
});

test('la déconnexion appelle signOut puis redirige vers index', async () => {
    const calls = [];
    await logoutCurrentSession({
        client: { auth: { signOut: async () => { calls.push('signOut'); } } },
        redirect: (destination) => calls.push(destination)
    });
    assert.deepEqual(calls, ['signOut', 'index.html']);
});

test('le bouton installé utilise le même contrat partagé', async () => {
    let listener;
    const button = {
        disabled: false,
        addEventListener: (type, callback) => {
            assert.equal(type, 'click');
            listener = callback;
        }
    };
    const calls = [];
    const installed = installGlobalLogout({
        client: { auth: { signOut: async () => { calls.push('signOut'); } } },
        root: { querySelector: (selector) => selector === '[data-global-logout]' ? button : null },
        redirect: (destination) => calls.push(destination)
    });

    assert.equal(installed, button);
    await listener();
    assert.equal(button.disabled, true);
    assert.deepEqual(calls, ['signOut', 'index.html']);
});

test('le helper ne touche ni appareil, ni profil, ni enrôlement', () => {
    assert.ok(logoutSource.includes("import { getSupabaseClient } from './supabase-client.js';"));
    assert.ok(logoutSource.includes('client.auth.signOut()'));
    assert.ok(logoutSource.includes("redirect('index.html')"));
    assert.doesNotMatch(logoutSource, /localStorage|sessionStorage|removeItem|device_token|device_enrollment|\.rpc\s*\(|profiles|remise|blocage/);
});
