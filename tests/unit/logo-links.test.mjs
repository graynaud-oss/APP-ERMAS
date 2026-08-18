import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const headerLogoPages = [
    'index.html',
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
    'contact.html',
    'calcul-voie.html',
    'calcul-hors-tout.html',
    'documents.html'
];

const sources = new Map(await Promise.all(headerLogoPages.map(async (file) => [
    file,
    await readFile(path.join(root, file), 'utf8')
])));

test('tous les logos de header ouvrent le site officiel dans un nouvel onglet sécurisé', () => {
    for (const [file, source] of sources) {
        assert.equal(source.match(/class="app-logo-link"/g)?.length, 1, `${file} doit contenir un seul lien logo`);
        assert.match(source, /<a class="app-logo-link" href="https:\/\/www\.ermas\.fr\/" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le site ERMAS">/);
        assert.match(source, /<img[^>]+class="app-logo"[^>]+src="\.?(?:\/)?assets\/brand\/ermas-logo\.png"|<img[^>]+src="\.?(?:\/)?assets\/brand\/ermas-logo\.png"[^>]+class="app-logo"/);
        assert.match(source, /class="app-logo"[^>]+alt=""|alt=""[^>]+class="app-logo"/);
    }
});

test('les dix-sept pages avec header partagent le même lien de marque', () => {
    assert.equal(headerLogoPages.length, 17);
});
