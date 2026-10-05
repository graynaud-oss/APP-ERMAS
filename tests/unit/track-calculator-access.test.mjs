import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const [jantesTaille, jantesPneu, rouesTaille, rouesPneu] = await Promise.all([
    read('jantes-taille.html'),
    read('jantes-pneu.html'),
    read('roues-etroites-taille.html'),
    read('roues-etroites-pneu.html')
]);

function calculatorVisible({ fixedPrice, variablePrice }) {
    return Number.isFinite(Number.parseFloat(fixedPrice));
}

test('voie fixe uniquement : le calculateur est proposé', () => {
    assert.equal(calculatorVisible({ fixedPrice: '1000', variablePrice: '' }), true);
});

test('voie variable uniquement : le calculateur est absent', () => {
    assert.equal(calculatorVisible({ fixedPrice: '', variablePrice: '1200' }), false);
});

test('voie fixe et voie variable : le calculateur reste rattaché au seul bloc fixe', () => {
    assert.equal(calculatorVisible({ fixedPrice: '1000', variablePrice: '1200' }), true);

    for (const source of [jantesTaille, jantesPneu]) {
        const fixedBlock = source.indexOf('// VOIE FIXE');
        const calculatorButton = source.indexOf('Estimer la voie de travail', fixedBlock);
        const variableBlock = source.indexOf('// VOIE VARIABLE', fixedBlock);
        assert.ok(fixedBlock >= 0 && fixedBlock < calculatorButton);
        assert.ok(calculatorButton < variableBlock);
        assert.equal(source.match(/Estimer la voie de travail/g)?.length, 1);
        assert.ok(source.includes('if (hasValidFixedPrice)'));
    }
});

test('le critère métier réutilise prixVF et conserve les déports requis', () => {
    for (const source of [jantesTaille, jantesPneu]) {
        assert.ok(source.includes('const hasValidFixedPrice = Boolean(match.prixVF && !isNaN(parseFloat(match.prixVF)));'));
        assert.ok(source.includes('const hasValidI = match.deportMaxI && !isNaN(parseFloat(match.deportMaxI));'));
        assert.ok(source.includes('const hasValidJ = match.deportMinJ && !isNaN(parseFloat(match.deportMinJ));'));
        assert.match(source, /if \(hasValidI && hasValidJ\)[\s\S]*Estimer la voie de travail/);
    }
});

test('le lien, le stockage et le handler historiques restent inchangés côté voie fixe', () => {
    assert.ok(jantesTaille.includes("sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))"));
    assert.ok(jantesTaille.includes("window.location.href = 'calcul-voie.html?source=jantes-taille'"));
    assert.ok(jantesPneu.includes("sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))"));
    assert.ok(jantesPneu.includes("window.location.href = 'calcul-voie.html?source=jantes-pneu'"));
});

test('les offres Roues étroites, exclusivement variables, ne proposent plus le calculateur', () => {
    for (const source of [rouesTaille, rouesPneu]) {
        assert.match(source, /renderNarrowWheelPriceOffers\(match, userRemise, netPriceVisible\)/);
        assert.doesNotMatch(source, /Estimer la voie de travail/);
        assert.match(source, /sessionStorage\.setItem\('ermas_calc_product'/);
        assert.match(source, /calcul-voie\.html\?source=roues-etroites-/);
    }
});
