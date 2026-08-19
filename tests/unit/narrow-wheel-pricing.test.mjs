import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    calculateNarrowWheelNetPrice,
    getNarrowWheelPricesFromColumns,
    NARROW_WHEEL_PRICE_TIERS,
    parseNarrowWheelPrice,
    renderNarrowWheelPriceOffers
} from '../../js/narrow-wheel-pricing.js';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const menu = read('roues-etroites.html');
const taille = read('roues-etroites-taille.html');
const pneu = read('roues-etroites-pneu.html');
const css = read('css/app-ermas.css');

test('les colonnes G H I alimentent exclusivement ECO PRO ELITE', () => {
    const columns = ['W8', '42', '100', '50', 'P', 'Produit', '100,50', '120.75', '', '900', '100'];
    assert.deepEqual(getNarrowWheelPricesFromColumns(columns), {
        prixEco: '100,50', prixPro: '120.75', prixElite: ''
    });
});

test('les prix valides acceptent virgule, point et espaces', () => {
    assert.equal(parseNarrowWheelPrice('1 234,56'), 1234.56);
    assert.equal(parseNarrowWheelPrice(' 99.5 '), 99.5);
});

test('vide, invalide, nul ou négatif signifie indisponible', () => {
    for (const value of ['', ' ', null, undefined, 'abc', '0', '-10']) {
        assert.equal(parseNarrowWheelPrice(value), null);
    }
});

test('l’ordre absolu des gammes est ECO PRO ELITE', () => {
    assert.deepEqual(NARROW_WHEEL_PRICE_TIERS.map(tier => tier.label), ['ECO', 'PRO', 'ELITE']);
});

test('le rendu conserve toujours les trois cartes dans le bon ordre', () => {
    const html = renderNarrowWheelPriceOffers({ prixEco: '100', prixPro: '120', prixElite: '150' }, 0, false);
    assert.ok(html.indexOf('>ECO<') < html.indexOf('>PRO<'));
    assert.ok(html.indexOf('>PRO<') < html.indexOf('>ELITE<'));
    assert.equal(html.match(/class="results-tier-card"/g)?.length, 3);
});

test('chaque gamme vide reste visible avec Non disponible sans 0 euro', () => {
    for (const key of ['prixEco', 'prixPro', 'prixElite']) {
        const prices = { prixEco: '100', prixPro: '120', prixElite: '150', [key]: '' };
        const html = renderNarrowWheelPriceOffers(prices, 20, true);
        assert.match(html, /Non disponible/);
        assert.doesNotMatch(html, />0\.00 €</);
        assert.equal(html.match(/class="results-tier-card"/g)?.length, 3);
    }
});

test('NET OFF conserve les valeurs mais les masque avec hidden', () => {
    const html = renderNarrowWheelPriceOffers({ prixEco: '100', prixPro: '200', prixElite: '300' }, 10, false);
    assert.equal(html.match(/data-net-price hidden/g)?.length, 3);
    assert.match(html, /90\.00 €/);
    assert.match(html, /180\.00 €/);
    assert.match(html, /270\.00 €/);
});

test('NET ON calcule chaque gamme indépendamment', () => {
    assert.equal(calculateNarrowWheelNetPrice('100', 15), 85);
    assert.equal(calculateNarrowWheelNetPrice('200', 15), 170);
    assert.equal(calculateNarrowWheelNetPrice('', 15), null);
    const html = renderNarrowWheelPriceOffers({ prixEco: '100', prixPro: '200', prixElite: '' }, 15, true);
    assert.equal(html.match(/data-net-price /g)?.length, 2);
    assert.doesNotMatch(html, /data-net-price[^<]*Non disponible/);
});

test('un seul switch commun pilote toutes les offres sur chaque page', () => {
    for (const page of [taille, pneu]) {
        assert.equal(page.match(/id="net-price-toggle"/g)?.length, 1);
        for (const className of ['net-price-control', 'net-price-toggle', 'net-price-toggle__input', 'net-price-toggle__track', 'net-price-toggle__state']) {
            assert.match(page, new RegExp(`class="[^"]*${className}`));
        }
        assert.match(page, /renderNarrowWheelPriceOffers\(match, userRemise, netPriceVisible\)/);
    }
});

test('les deux recherches utilisent le même mapping tarifaire sans choix de gamme', () => {
    for (const page of [taille, pneu]) {
        assert.match(page, /getNarrowWheelPricesFromColumns\(cols\)/);
        assert.doesNotMatch(page, /select-gamme|filtre-gamme|chosenGamme/);
    }
});

test('l’accueil présente trois cartes descriptives et les notes techniques', () => {
    assert.equal(menu.match(/class="catalog-info-card"/g)?.length, 3);
    for (const text of ['Gamme ECO', 'Gamme PRO', 'Gamme ELITE', 'classe 10.9', '30&quot;']) assert.ok(menu.includes(text));
});

test('le responsive empile les offres et informations sans largeur forcée', () => {
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.results-tier-grid,[\s\S]*\.catalog-info-grid[\s\S]*grid-template-columns: 1fr;/);
    assert.doesNotMatch(css, /results-tier-grid[^{]*\{[^}]*min-width:\s*[1-9]/);
});

test('filtres, pneus sans rapport et contrat calculateur restent présents', () => {
    assert.match(taille, /item\.diametre === chosenD/);
    assert.match(taille, /item\.largeurJante === chosenL/);
    assert.match(pneu, /\(!selectedWidthHasRapports \|\| item\.rapport === chosenR\)/);
    for (const page of [taille, pneu]) {
        assert.match(page, /sessionStorage\.setItem\('ermas_calc_product'/);
        assert.match(page, /calcul-voie\.html\?source=roues-etroites-/);
    }
});
