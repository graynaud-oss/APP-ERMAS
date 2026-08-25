import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { applyManiproNetVisibility } from '../../js/manipro-price-visibility.js';
const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const accueil = read('accueil.html');
const page = read('manipro.html');
const css = read('css/app-ermas.css');

test('MANIPRO est accessible depuis l’accueil avec son GIF local', () => {
    assert.match(accueil, /data-protected-route="manipro\.html"/);
    assert.match(accueil, /assets\/manipro\/manipro\.gif/);
    assert.match(page, /assets\/manipro\/manipro\.gif/);
    assert.doesNotMatch(page, /src="assets\/manipro\/[^\"]+\.(png|jpg|webp)"/);
});

test('MANIPRO utilise le garde partagé et reste fermé avant autorisation', () => {
    assert.match(page, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/);
    assert.match(page, /getSupabaseClient\(\)/);
    assert.match(page, /requireAuthorizedUser/);
    assert.match(page, /AUTHORIZATION_STATES\.AUTHORIZED/);
    assert.match(page, /location\.href='index\.html'/);
    assert.match(page, /class="hidden app-shell/);
    assert.ok(page.indexOf('context.state!==AUTHORIZATION_STATES.AUTHORIZED') < page.indexOf("view.classList.remove('hidden')"));
});

test('tarifs, option et lien officiel sont exacts', () => {
    assert.match(page, /3 619,00 €/);
    assert.match(page, /395,00 €/);
    assert.match(page, /https:\/\/www\.ermas\.fr\/produits\/manipro/);
    assert.match(page, /target="_blank" rel="noopener noreferrer"/);
});

test('le switch Prix NET commun pilote les deux montants', () => {
    for (const cls of ['net-price-control','net-price-toggle','net-price-toggle__input','net-price-toggle__track','net-price-toggle__state']) assert.match(page, new RegExp(cls));
    assert.equal(page.match(/<div data-net-price/g)?.length, 2);
    assert.match(page, /isNetPriceVisible/);
    assert.match(page, /setNetPriceVisible/);
    assert.match(page, /3619/);
    assert.match(page, /395/);
});

test('Prix NET suit réellement OFF puis ON puis OFF pour les deux montants', () => {
    const elements = Array.from({ length: 2 }, () => ({
        hidden: false,
        classes: new Set(),
        classList: { toggle(name, enabled) { enabled ? this.owner.classes.add(name) : this.owner.classes.delete(name); }, owner: null }
    }));
    elements.forEach((element) => { element.classList.owner = element; });
    applyManiproNetVisibility(elements, false);
    assert.ok(elements.every((element) => element.hidden && element.classes.has('hidden')));
    applyManiproNetVisibility(elements, true);
    assert.ok(elements.every((element) => !element.hidden && !element.classes.has('hidden')));
    applyManiproNetVisibility(elements, false);
    assert.ok(elements.every((element) => element.hidden && element.classes.has('hidden')));
});

test('retours, accueil, charte et responsive sont présents', () => {
    assert.match(page, /window\.location\.href='accueil\.html'/);
    assert.match(page, /window\.location\.href='index\.html'/);
    assert.match(page, /app-footer/);
    assert.match(css, /manipro-layout/);
    assert.match(css, /@media \(max-width: 620px\)[\s\S]*manipro-layout/);
});

test('navigation et accueil utilisent les structures compactes communes', () => {
    const homeNavigation = read('js/home-navigation.js');
    assert.match(homeNavigation, /actions\.className = 'app-page-actions'/);
    assert.match(homeNavigation, /child\.classList\.contains\('app-back-button'\)/);
    assert.match(homeNavigation, /link\.href = 'index\.html'/);
    assert.match(css, /\.home-primary-grid\s*\{\s*grid-template-columns: repeat\(4,/);
    assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.home-primary-grid\s*\{\s*grid-template-columns: repeat\(2,/);
    assert.doesNotMatch(css, /(?:^|[;{])\s*height:\s*100vh/m);
});

test('les gammes utilisent les couleurs validées', () => {
    assert.match(css, /#E53935/);
    assert.match(css, /#1677C8/);
    assert.match(css, /#F1B43C/);
    assert.match(css, /rgba\(229,57,53,.12\)/);
    assert.match(css, /rgba\(22,119,200,.13\)/);
    assert.match(css, /rgba\(241,180,60,.14\)/);
});
