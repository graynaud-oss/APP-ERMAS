import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [home, repairsCatalog, repairsMenu, jumelages, narrowWheels, css] = await Promise.all([
    read('accueil.html'),
    read('js/repairs-catalog.js'),
    read('js/repairs-menu.js'),
    read('jumelages.html'),
    read('roues-etroites.html'),
    read('css/app-ermas.css')
]);

const assets = [
    'evo.png',
    'ar-eco.png',
    'peinture.png',
    'manipro-hero.png',
    'deplacement-voile-2.png',
    '360.png',
    'TGD.png',
    'tgd-plus.png',
    'av-eco.png',
    'av-premium.png',
    'ar-elite.png',
    'refection-centre-3.png',
    'renfort-2.png',
    'elargisseur-3.png',
    'deplacement-voile-3.png'
];

test('les quinze visuels produits existent dans le dépôt', async () => {
    await Promise.all(assets.map((asset) => access(path.join(root, 'assets', 'product-images', asset))));
});

test('les cinq visuels de l’accueil sont affectés aux bonnes cartes avec des alt explicites', () => {
    assert.match(home, /jantes\.html[\s\S]*?product-images\/peinture\.png" alt="Jantes"/);
    assert.match(home, /jumelages\.html[\s\S]*?product-images\/evo\.png" alt="Jumelages"/);
    assert.match(home, /roues-etroites\.html[\s\S]*?product-images\/ar-eco\.png" alt="Roues étroites"/);
    assert.match(home, /manipro\.html[\s\S]*?product-images\/manipro-hero\.png" alt="MANIPRO"/);
    assert.match(home, /reparations-modifications\.html[\s\S]*?product-images\/deplacement-voile-2\.png" alt="Réparations et modifications"/);
    assert.doesNotMatch(home, /assets\/home-icons\/(?:jantes|jumelages)\.png/);
});

test('les quatre familles Réparations utilisent exactement leurs nouveaux visuels', () => {
    for (const [id, asset, alt] of [
        ['centres-percage', 'refection-centre-3.png', 'Centres et perçage'],
        ['renforcement', 'renfort-2.png', 'Renforcement'],
        ['largeur', 'elargisseur-3.png', 'Modification de largeur'],
        ['deplacement', 'deplacement-voile-3.png', 'Déplacement de voile']
    ]) {
        assert.match(repairsCatalog, new RegExp(`id: '${id}'[^\\n]+image: 'assets/product-images/${asset.replace('.', '\\.')}'[^\\n]+imageAlt: '${alt}'`));
    }
    assert.match(repairsMenu, /visual\.src = image;/);
    assert.match(repairsMenu, /visual\.alt = imageAlt;/);
});

test('les quatre gammes Jumelages utilisent les visuels demandés', () => {
    const cardEvo = jumelages.match(/<button[^>]+type=EVO[^]*?<\/button>/)?.[0] ?? '';
    const card360 = jumelages.match(/<button[^>]+type=360[^]*?<\/button>/)?.[0] ?? '';
    const cardTgd = jumelages.match(/<button[^>]+type=TGD"[^]*?<\/button>/)?.[0] ?? '';
    const cardTgdPlus = jumelages.match(/<button[^>]+type=TGD%2B[^]*?<\/button>/)?.[0] ?? '';
    assert.match(cardEvo, /evo\.png" alt="Jumelage EVO"[^]*?<span class="app-choice-card__title">EVO<\/span>/);
    assert.match(card360, /360\.png" alt="Jumelage 360"[^]*?<span class="app-choice-card__title">360<\/span>/);
    assert.match(cardTgd, /TGD\.png" alt="TGD"[^]*?<span class="app-choice-card__title">TGD<\/span>/);
    assert.match(cardTgdPlus, /tgd-plus\.png" alt="Jumelage TGD\+"[^]*?<span class="app-choice-card__title">TGD\+<\/span>/);
    assert.doesNotMatch(jumelages, /tendeur-360-dessous\.png/);
});

test('les trois gammes Roues étroites utilisent les visuels demandés', () => {
    assert.match(narrowWheels, /catalog-info-card--eco[^]*?av-eco\.png" alt="Roue étroite gamme ECO"/);
    assert.match(narrowWheels, /catalog-info-card--pro[^]*?av-premium\.png" alt="Roue étroite gamme PRO"/);
    assert.match(narrowWheels, /catalog-info-card--elite[^]*?ar-elite\.png" alt="Roue étroite gamme ELITE"/);
});

test('les nouveaux visuels conservent leurs proportions par object-fit contain', () => {
    assert.match(css, /\.nav-card__icon--image img \{[^}]*object-fit:contain;/);
    assert.match(css, /\.nav-card__product-media \{[^}]*width:100%;[^}]*height:116px;/);
    assert.match(css, /@media \(min-width: 621px\) \{\s*\.home-primary-grid \.nav-card__icon--image \{[^}]*width:100%;[^}]*height:116px;/);
    assert.match(css, /\.app-choice-card__media img \{[^}]*object-fit: contain;/);
    assert.match(css, /\.catalog-info-card__media img \{[^}]*object-fit:contain;/);
    assert.doesNotMatch(css, /\.app-choice-card__media img \{[^}]*object-fit: cover;/);
});

test('le grand format commun de l’accueil reste limité au desktop', () => {
    const desktopRule = css.match(/@media \(min-width: 621px\) \{\s*\.home-primary-grid \.nav-card__icon--image \{[^}]+\}\s*\}/)?.[0] ?? '';
    assert.match(desktopRule, /height:116px/);
    assert.match(css, /\.nav-card__icon \{\s*width: 44px;\s*height: 44px;/);
});
