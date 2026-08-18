import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import {
    buildWheelDimensionIndex,
    createWheelDimensionKey,
    getVariableWayState,
    normalizeWheelDimensionPart,
    NARROW_WHEELS_CSV_URL,
    VARIABLE_WAY_STATES
} from '../../js/wheel-dimension-index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const tailleSource = await readFile(path.join(root, 'jantes-taille.html'), 'utf8');
const pneuSource = await readFile(path.join(root, 'jantes-pneu.html'), 'utf8');

test('la normalisation est numérique, exacte et sans rapprochement flou', () => {
    assert.equal(normalizeWheelDimensionPart('38'), '38');
    assert.equal(normalizeWheelDimensionPart('38.0'), '38');
    assert.equal(normalizeWheelDimensionPart(' 12,0 '), '12');
    assert.equal(createWheelDimensionKey('38.0', '12,0'), '38|12');
    assert.equal(normalizeWheelDimensionPart('12 pouces'), null);
    assert.equal(normalizeWheelDimensionPart(''), null);
});

test('le CSV Roues étroites produit un index diamètre et largeur', () => {
    const index = buildWheelDimensionIndex([
        'LARGEUR JANTE,DIAMETRE,NOM,PRIX',
        '12,38,DW12X38,1000',
        '"10,0",42,DW10X42,900',
        '',
        'invalide,,X,0'
    ].join('\n'));
    assert.deepEqual([...index], ['38|12', '42|10']);
});

test('un prix VV valide reste toujours prioritaire', () => {
    const dimensions = new Set(['38|12']);
    assert.equal(getVariableWayState({
        hasValidVariablePrice: true,
        diameter: '38',
        width: '12',
        narrowWheelDimensions: dimensions
    }), VARIABLE_WAY_STATES.PRICE);
});

test('une VV absente distingue Roues étroites et indisponibilité réelle', () => {
    const dimensions = new Set(['38|12']);
    assert.equal(getVariableWayState({
        hasValidVariablePrice: false,
        diameter: '38.0',
        width: '12,0',
        narrowWheelDimensions: dimensions
    }), VARIABLE_WAY_STATES.NARROW_WHEELS);
    assert.equal(getVariableWayState({
        hasValidVariablePrice: false,
        diameter: '42',
        width: '12',
        narrowWheelDimensions: dimensions
    }), VARIABLE_WAY_STATES.UNAVAILABLE);
});

test('les cartes d’une recherche pneu sont classées indépendamment', () => {
    const dimensions = new Set(['38|12']);
    const cards = [
        { prixVV: '950', diametre: '38', largeurJante: '10' },
        { prixVV: '', diametre: '38', largeurJante: '12' },
        { prixVV: '', diametre: '38', largeurJante: '14' }
    ];
    const states = cards.map((card) => getVariableWayState({
        hasValidVariablePrice: Boolean(card.prixVV && !Number.isNaN(Number.parseFloat(card.prixVV))),
        diameter: card.diametre,
        width: card.largeurJante,
        narrowWheelDimensions: dimensions
    }));
    assert.deepEqual(states, [
        VARIABLE_WAY_STATES.PRICE,
        VARIABLE_WAY_STATES.NARROW_WHEELS,
        VARIABLE_WAY_STATES.UNAVAILABLE
    ]);
});

test('les deux pages chargent une seule fois le catalogue Roues étroites après le garde', () => {
    for (const [file, source] of [['jantes-taille.html', tailleSource], ['jantes-pneu.html', pneuSource]]) {
        assert.equal(source.match(/fetch\(NARROW_WHEELS_CSV_URL\)/g)?.length, 1, `${file} doit charger une seule fois l’index`);
        assert.ok(source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED') < source.indexOf('fetch(NARROW_WHEELS_CSV_URL)'));
        assert.ok(source.includes("if (!response.ok) throw new Error('Catalogue Roues étroites indisponible');"));
        assert.ok(source.includes('.catch(() => new Set())'));
        assert.ok(source.includes("window.location.href = 'roues-etroites.html'"));
        assert.ok(source.includes('Voir Roues étroites'));
        assert.ok(source.includes('Non disponible'));
    }
    assert.match(NARROW_WHEELS_CSV_URL, /gid=21297594/);
});

test('le CTA Roues étroites ne dépend pas du switch Prix NET', () => {
    for (const source of [tailleSource, pneuSource]) {
        const fallbackStart = source.indexOf('results-catalog-fallback');
        const fallbackEnd = source.indexOf('`;', fallbackStart);
        const fallbackMarkup = source.slice(fallbackStart, fallbackEnd);
        assert.doesNotMatch(fallbackMarkup, /data-net-price|netPriceVisible|Prix NET|Prix BRUT/);
    }
});
