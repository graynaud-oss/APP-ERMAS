import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    PRODUCT_OPTION_FAMILIES,
    PRODUCT_OPTION_PRICES,
    calculateOptionNetPrice,
    formatOptionPrice,
    hasValidOptionDiscount,
    renderAvailableProductOptions
} from '../../js/product-options.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const resultPages = [
    'jantes-taille.html',
    'jantes-pneu.html',
    'roues-etroites-taille.html',
    'roues-etroites-pneu.html',
    'jumelages-jantes-taille.html',
    'jumelages-jantes-pneu.html'
];
const css = await readFile(path.join(root, 'css', 'app-ermas.css'), 'utf8');

test('les quatre tarifs BRUT sont centralisés avec les valeurs validées', () => {
    assert.deepEqual(PRODUCT_OPTION_PRICES, {
        HLE_15: 364,
        HLE_20: 457,
        TELEINFLATION: 83.5,
        RIM_STRIPE: 234
    });
});

test('une jante standard affiche HLE, télégonflage et liseret', () => {
    const html = renderAvailableProductOptions({ family: PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS, discount: 0, netPriceVisible: false });
    assert.match(html, /OPTIONS DISPONIBLES/);
    assert.match(html, /Centre renforcé HLE/);
    assert.match(html, /15 mm/);
    assert.match(html, /20 mm/);
    assert.match(html, /Pré-équipement télégonflage/);
    assert.match(html, /Peinture à liseret/);
    assert.equal((html.match(/data-product-options/g) || []).length, 1);
});

for (const family of [PRODUCT_OPTION_FAMILIES.NARROW_WHEELS, PRODUCT_OPTION_FAMILIES.DUAL_WHEELS]) {
    test(`${family} affiche les options communes sans HLE`, () => {
        const html = renderAvailableProductOptions({ family, discount: 0, netPriceVisible: false });
        assert.doesNotMatch(html, /HLE|15 mm|20 mm/);
        assert.match(html, /Pré-équipement télégonflage/);
        assert.match(html, /Peinture à liseret/);
    });
}

test('zéro résultat ne produit aucun bloc Options', () => {
    assert.equal(renderAvailableProductOptions({ family: PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS, discount: 10, netPriceVisible: true, hasResults: false }), '');
});

test('la remise 10 % produit les quatre montants NET attendus', () => {
    assert.equal(formatOptionPrice(calculateOptionNetPrice(364, 10)), '327.60 €');
    assert.equal(formatOptionPrice(calculateOptionNetPrice(457, 10)), '411.30 €');
    assert.equal(formatOptionPrice(calculateOptionNetPrice(83.5, 10)), '75.15 €');
    assert.equal(formatOptionPrice(calculateOptionNetPrice(234, 10)), '210.60 €');
});

test('le NET est disponible uniquement pour une remise numérique positive', () => {
    assert.equal(hasValidOptionDiscount(10), true);
    assert.equal(hasValidOptionDiscount('10'), true);
    for (const value of [0, null, undefined, '', 'invalide']) assert.equal(hasValidOptionDiscount(value), false);
});

test('OFF masque les prix NET et ON les révèle sans modifier les prix BRUT', () => {
    const off = renderAvailableProductOptions({ family: PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS, discount: 10, netPriceVisible: false });
    const on = renderAvailableProductOptions({ family: PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS, discount: 10, netPriceVisible: true });
    assert.match(off, /data-net-price hidden/);
    assert.match(on, /data-net-price >/);
    assert.match(off, /364\.00 €/);
    assert.match(on, /364\.00 €/);
});

test('le NET des options réutilise exactement les classes visuelles des résultats Jantes', () => {
    const html = renderAvailableProductOptions({ family: PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS, discount: 10, netPriceVisible: true });
    assert.match(html, /results-price-block__net/);
    assert.match(html, /text-\[10px\] uppercase tracking-wider text-red-400 font-semibold">Prix NET/);
    assert.match(html, /text-white font-bold text-sm">327\.60 €/);
});

test('aucune règle rouge spécifique ne recolore le NET des options', () => {
    assert.doesNotMatch(css, /\.product-options__price--net\s*\{[^}]*color:\s*var\(--ermas-red\)/s);
    assert.doesNotMatch(css, /\.product-options__price--net\s+strong\s*\{[^}]*color:\s*var\(--ermas-red\)/s);
});

test('chaque page de résultats appelle une seule fois le module commun après construction des résultats', async () => {
    for (const file of resultPages) {
        const source = await readFile(path.join(root, file), 'utf8');
        assert.equal((source.match(/renderAvailableProductOptions\s*\(\{/g) || []).length, 1, file);
        assert.match(source, /html \+= renderAvailableProductOptions[\s\S]*resultsContent\.innerHTML = html/, file);
    }
});

test('les montants ne sont pas recopiés dans les six pages de résultats', async () => {
    for (const file of resultPages) {
        const source = await readFile(path.join(root, file), 'utf8');
        assert.doesNotMatch(source, /HLE_15|HLE_20|TELEINFLATION|RIM_STRIPE/, file);
    }
});
