import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [home, repairsCatalog, repairsMenu, jumelages, css] = await Promise.all([
    read('accueil.html'),
    read('js/repairs-catalog.js'),
    read('js/repairs-menu.js'),
    read('jumelages.html'),
    read('css/app-ermas.css')
]);

const assets = [
    'ar-elite.png',
    'manipro-hero.png',
    'dv2.png',
    'refection-centre-3.png',
    'renfort-3.png',
    'elargisseur-3.png',
    'dv3.png',
    'tgd.png',
    'tendeur-360-dessous.png'
];

test('les neuf visuels produits existent dans le dépôt', async () => {
    await Promise.all(assets.map((asset) => access(path.join(root, 'assets', 'product-images', asset))));
});

test('les trois visuels de l’accueil sont affectés aux bonnes cartes avec des alt explicites', () => {
    assert.match(home, /roues-etroites\.html[\s\S]*?product-images\/ar-elite\.png" alt="Roues étroites"/);
    assert.match(home, /manipro\.html[\s\S]*?product-images\/manipro-hero\.png" alt="MANIPRO"/);
    assert.match(home, /reparations-modifications\.html[\s\S]*?product-images\/dv2\.png" alt="Réparations et modifications"/);
});

test('les quatre familles Réparations utilisent exactement leurs nouveaux visuels', () => {
    for (const [id, asset, alt] of [
        ['centres-percage', 'refection-centre-3.png', 'Centres et perçage'],
        ['renforcement', 'renfort-3.png', 'Renforcement'],
        ['largeur', 'elargisseur-3.png', 'Modification de largeur'],
        ['deplacement', 'dv3.png', 'Déplacement de voile']
    ]) {
        assert.match(repairsCatalog, new RegExp(`id: '${id}'[^\\n]+image: 'assets/product-images/${asset.replace('.', '\\.')}'[^\\n]+imageAlt: '${alt}'`));
    }
    assert.match(repairsMenu, /visual\.src = image;/);
    assert.match(repairsMenu, /visual\.alt = imageAlt;/);
});

test('TGD et 360 utilisent les visuels demandés sans référence croisée', () => {
    const card360 = jumelages.match(/<button[^>]+type=360[^]*?<\/button>/)?.[0] ?? '';
    const cardTgd = jumelages.match(/<button[^>]+type=TGD"[^]*?<\/button>/)?.[0] ?? '';
    assert.match(card360, /tendeur-360-dessous\.png" alt="Tendeur 360"[^]*?<span class="app-choice-card__title">360<\/span>/);
    assert.match(cardTgd, /tgd\.png" alt="TGD"[^]*?<span class="app-choice-card__title">TGD<\/span>/);
    assert.doesNotMatch(card360, /product-images\/tgd\.png/);
    assert.doesNotMatch(cardTgd, /tendeur-360-dessous\.png/);
});

test('les nouveaux visuels conservent leurs proportions par object-fit contain', () => {
    assert.match(css, /\.nav-card__icon--image img \{[^}]*object-fit:contain;/);
    assert.match(css, /\.nav-card__product-media \{[^}]*width:100%;[^}]*height:116px;/);
    assert.match(css, /\.app-choice-card__media img \{[^}]*object-fit: contain;/);
    assert.doesNotMatch(css, /\.app-choice-card__media img \{[^}]*object-fit: cover;/);
});
