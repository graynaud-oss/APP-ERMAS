import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
    filterTiresByAvailableCatalogDimensions,
    findCatalogProductsForTires,
    getEncodedJumelagesType,
    getJumelagesCatalogUrl,
    isAllowedJumelagesType,
    isTgdJumelagesType,
    JUMELAGES_TIRE_CSV_URL,
    parseTgdCatalogCsv
} from '../../js/jumelages-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const choiceSource = await readFile(path.join(root, 'jumelages-choix.html'), 'utf8');
const wheelSource = await readFile(path.join(root, 'jumelages-jantes-taille.html'), 'utf8');
const tireSource = await readFile(path.join(root, 'jumelages-jantes-pneu.html'), 'utf8');

test('l’allowlist accepte exactement EVO, 360, TGD et TGD+', () => {
    for (const type of ['EVO', '360', 'TGD', 'TGD+']) assert.equal(isAllowedJumelagesType(type), true);
    for (const type of ['ABC', 'TGD++', 'tgd', '', null, '../TGD']) assert.equal(isAllowedJumelagesType(type), false);
    assert.equal(isTgdJumelagesType('TGD'), true);
    assert.equal(isTgdJumelagesType('TGD+'), true);
    assert.equal(isTgdJumelagesType('EVO'), false);
});

test('TGD+ est encodé et décodé sans transformer + en espace', () => {
    assert.equal(getEncodedJumelagesType('TGD+'), 'TGD%2B');
    assert.equal(new URLSearchParams('type=TGD%2B').get('type'), 'TGD+');
    assert.equal(new URLSearchParams('type=TGD+').get('type'), 'TGD ');
});

test('le mapping CSV TGD et TGD+ est fermé et non inversé', () => {
    assert.match(getJumelagesCatalogUrl('TGD'), /gid=1649910681/);
    assert.match(getJumelagesCatalogUrl('TGD+'), /gid=801659039/);
    assert.match(JUMELAGES_TIRE_CSV_URL, /gid=139891043/);
    assert.equal(getJumelagesCatalogUrl('ABC'), null);
});

test('le parser TGD lit uniquement largeur, diamètre, nom et prix', () => {
    const rows = parseTgdCatalogCsv([
        'LARGEUR,DIAMETRE,NOM,PRIX',
        '18,38,"PRODUIT, A",5614',
        '20,42,PRODUIT B,6944',
        ''
    ].join('\n'));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
        largeurJante: '18', diametre: '38', nom: 'PRODUIT, A', prix: '5614',
        tendeurs: '', colC: '', colD: '', kitSansJantes: '', joncs: '', paireTendeurs: '', entretoises: ''
    });
});

test('l’intersection pneus/jantes est exacte, normalisée et indépendante par gamme', () => {
    const tires = [
        { largeurPneu: 'A', rapport: '80', diametrePneu: '38.0', largeurJante: '18,00' },
        { largeurPneu: 'B', rapport: '70', diametrePneu: '42', largeurJante: '20' },
        { largeurPneu: 'FUZZY', rapport: '', diametrePneu: '38A', largeurJante: '18' }
    ];
    const tgd = [{ diametre: '38', largeurJante: '18' }];
    const tgdPlus = [{ diametre: '42.0', largeurJante: '20,0' }];

    assert.deepEqual(filterTiresByAvailableCatalogDimensions(tires, tgd).map((row) => row.largeurPneu), ['A']);
    assert.deepEqual(filterTiresByAvailableCatalogDimensions(tires, tgdPlus).map((row) => row.largeurPneu), ['B']);
});

test('le filtrage cascade part uniquement des pneus ayant une jante disponible', () => {
    const filtered = filterTiresByAvailableCatalogDimensions([
        { largeurPneu: '18.4', rapport: '85', diametrePneu: '38', largeurJante: '18' },
        { largeurPneu: '20.8', rapport: '', diametrePneu: '42', largeurJante: '20' },
        { largeurPneu: '24.5', rapport: '70', diametrePneu: '46', largeurJante: '25' }
    ], [
        { diametre: '38', largeurJante: '18' },
        { diametre: '42', largeurJante: '20' }
    ]);

    assert.deepEqual([...new Set(filtered.map((row) => row.largeurPneu))], ['18.4', '20.8']);
    assert.deepEqual(filtered.filter((row) => row.largeurPneu === '18.4').map((row) => row.rapport), ['85']);
    assert.deepEqual(filtered.filter((row) => row.largeurPneu === '20.8').map((row) => row.diametrePneu), ['42']);
});

test('un pneu compatible avec plusieurs dimensions restitue tous les produits', () => {
    const tireRows = [
        { diametrePneu: '38', largeurJante: '18' },
        { diametrePneu: '38', largeurJante: '20' }
    ];
    const products = [
        { diametre: '38', largeurJante: '18', nom: 'TGD A', prix: '100' },
        { diametre: '38.0', largeurJante: '20,0', nom: 'TGD B', prix: '200' },
        { diametre: '42', largeurJante: '20', nom: 'HORS FILTRE', prix: '300' }
    ];
    assert.deepEqual(findCatalogProductsForTires(tireRows, products).map((row) => row.nom), ['TGD A', 'TGD B']);
});

test('les pages TGD réutilisent les parcours protégés sans option ni calculateur', () => {
    assert.ok(choiceSource.includes("isAllowedJumelagesType(requestedType)"));
    assert.ok(choiceSource.includes('getEncodedJumelagesType(gammeType)'));
    for (const source of [wheelSource, tireSource]) {
        assert.ok(source.includes('simplifiedCatalog = isTgdJumelagesType(gammeType)'));
        assert.ok(source.includes('if (!pageAuthorized || simplifiedCatalog) return;'));
        assert.ok(source.includes('if (!simplifiedCatalog) {'));
        assert.ok(source.includes('Prix BRUT'));
        assert.ok(source.includes('data-net-price'));
    }
    assert.ok(wheelSource.includes("tendeursField.classList.toggle('hidden', simplifiedCatalog)"));
    assert.ok(wheelSource.includes("wheelSearchPanel.classList.toggle('results-search-panel--two-columns', simplifiedCatalog)"));
});
