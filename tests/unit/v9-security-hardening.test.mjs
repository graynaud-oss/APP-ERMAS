import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { escapeHtml } from '../../js/safe-dom.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

const pageNames = [
    'jantes-taille.html',
    'jantes-pneu.html',
    'roues-etroites-taille.html',
    'roues-etroites-pneu.html',
    'jumelages-jantes-taille.html',
    'jumelages-jantes-pneu.html',
    'calcul-hors-tout.html'
];

const pages = new Map(await Promise.all(pageNames.map(async (name) => [
    name,
    await readFile(path.join(root, name), 'utf8')
])));

test('les charges HTML externes sont neutralisées sans exécuter les payloads', () => {
    assert.equal(
        escapeHtml('<img src=x onerror=alert(1)>'),
        '&lt;img src=x onerror=alert(1)&gt;'
    );
    assert.equal(
        escapeHtml('<script>alert(1)</script>'),
        '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
    assert.equal(escapeHtml(`a&b"c'd`), 'a&amp;b&quot;c&#39;d');
});

test('chaque rendu CSV importe le mécanisme commun et protège les textes distants', () => {
    for (const [name, source] of pages) {
        assert.ok(source.includes("import { escapeHtml } from './js/safe-dom.js';"), `${name}: import sûr absent`);
    }

    for (const name of [
        'jantes-taille.html',
        'jantes-pneu.html',
        'roues-etroites-taille.html',
        'roues-etroites-pneu.html',
        'jumelages-jantes-taille.html'
    ]) {
        assert.match(pages.get(name), /escapeHtml\(match\.nom \|\| 'N\/A'\)/, `${name}: nom distant non protégé`);
    }

    assert.ok(pages.get('jumelages-jantes-pneu.html').includes('escapeHtml(nomComplet)'));
    assert.ok(pages.get('calcul-hors-tout.html').includes('escapeHtml(taille)'));
});

test('tous les fetch CSV principaux refusent les réponses HTTP non OK avant text', () => {
    const singleResponsePages = [
        'jantes-taille.html',
        'roues-etroites-taille.html',
        'jumelages-jantes-taille.html',
        'calcul-hors-tout.html'
    ];
    for (const name of singleResponsePages) {
        const source = pages.get(name);
        const checkPosition = source.search(/if \(!(?:response|res)\.ok\)/);
        const textPosition = source.search(/(?:response|res)\.text\(\)/);
        assert.ok(checkPosition >= 0 && checkPosition < textPosition, `${name}: contrôle HTTP trop tardif ou absent`);
    }

    for (const name of ['jantes-pneu.html', 'roues-etroites-pneu.html', 'jumelages-jantes-pneu.html']) {
        const source = pages.get(name);
        const checkPosition = source.search(/if \(!pneuRes\.ok \|\| !tarifsRes\.ok\)/);
        const textPosition = source.search(/pneuRes\.text\(\)/);
        assert.ok(checkPosition >= 0 && checkPosition < textPosition, `${name}: contrôle HTTP double absent`);
    }
});

test('Documents rend les données Storage par le DOM et sécurise le nouvel onglet', async () => {
    const source = await readFile(path.join(root, 'documents.html'), 'utf8');

    assert.ok(source.includes('errorPanel.textContent = `Erreur lors du chargement : ${error.message}`'));
    assert.ok(source.includes('title.textContent = cleanName'));
    assert.ok(source.includes('viewLink.href = fileUrl'));
    assert.ok(source.includes("viewLink.target = '_blank'"));
    assert.ok(source.includes("viewLink.rel = 'noopener noreferrer'"));
    assert.ok(source.includes('downloadLink.href = fileUrl'));
    assert.doesNotMatch(source, /<h4[^>]*>\$\{cleanName\}/);
    assert.doesNotMatch(source, /href="\$\{fileUrl\}"/);
});
