import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    filterPartsByGamme,
    findSelectedParts,
    getFieldOptions,
    getVariantFields,
    groupPartsByRepere,
    JUMELAGES_PARTS_CSV_URL,
    parsePartsCatalogCsv,
    PARTS_CATALOG_COLUMNS,
    PARTS_CATALOG_GAMMES,
    PARTS_DESKTOP_DIAGRAMS,
    PARTS_HOTSPOTS,
    PARTS_MOBILE_DIAGRAMS,
    rotateHotspotPositionCounterClockwise,
    transformHotspotPositionForDesktop,
    transformHotspotPositionForMobile
} from '../../js/jumelages-parts-catalog.js';

const root = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const pageModule = read('js/jumelages-parts-page.js');
const choicePage = read('jumelages-choix.html');
const evoPage = read('jumelages-pieces-evo.html');
const page360 = read('jumelages-pieces-360.html');

const header = PARTS_CATALOG_COLUMNS.join(',');
const fixture = `${header}\nEVO,a,PIECE,Écrou,,,,,,20\nEVO,f,PIECE,Crochet,,,430,,,89\nEVO,f,PIECE,Crochet,,,540,,,99\nEVO,g,PIECE,Œilleton Ø16,,,,,,27\nEVO,g,PIECE,Anneau type W,,,,,,27\nEVO,h,VIS,Vis + rondelle,,,50,16 x 150,,"3,75"\nEVO,h,VIS,Vis + rondelle,,,60,16 x 150,,"4,34"\nEVO,h,VIS,Vis + rondelle,,,50,18 x 150,,"4,94"\nEVO,i,ENTRETOISE,Entretoise cylindrique pleine,,24,250,,,230\nEVO,i,ENTRETOISE,Entretoise cylindrique pleine,,24,300,,,260\nEVO,i,ENTRETOISE,Entretoises étagées - toutes largeurs,,,,,"24-34\"\"",645\nEVO,i,SUPPLEMENT,Supplément entretoises,,,,,"24-28\"\"",41\nEVO,i,ENTRETOISE,Entretoise étagée pleine,,38/42,300,,,647\nEVO,l,PIECE,Jonc à souder,"24-30\"\"",,,,,"141,60"\nEVO,l,PIECE,Jonc à boulonner,"24-30\"\"",,,,,"224,41"\nEVO,,SERVICE,Perçage œilleton,,,,,,"13,30"\n360,a,PIECE,Écrou 360,,,,,,"2,36"\n360,f,PIECE,Crochet 360,,,430,,,89\n360,,SERVICE,Soudure anneau,,,,,,"14,30"`;

test('le parser CSV V12 gère guillemets, décimales, accents et cellules vides', () => {
    const rows = parsePartsCatalogCsv(fixture);
    assert.equal(rows.length, 19);
    assert.equal(rows[5].prixBrut, 3.75);
    assert.equal(rows[0].designation, 'Écrou');
    assert.equal(rows[15].repere, '');
});

test('une structure CSV différente est refusée', () => {
    assert.throws(() => parsePartsCatalogCsv('GAMME,REPERE\nEVO,a'), /Structure CSV/);
});

test('les pages filtrent strictement EVO et 360 sans mélange', () => {
    const rows = parsePartsCatalogCsv(fixture);
    const evo = filterPartsByGamme(rows, 'EVO');
    const threeSixty = filterPartsByGamme(rows, '360');
    assert.ok(evo.length > 0 && evo.every(row => row.gamme === 'EVO'));
    assert.ok(threeSixty.length > 0 && threeSixty.every(row => row.gamme === '360'));
    assert.deepEqual(filterPartsByGamme(rows, 'TGD'), []);
});

test('le regroupement conserve les multi-lignes et les éléments sans repère', () => {
    const groups = groupPartsByRepere(filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO'));
    assert.equal(groups.get('h').length, 3);
    assert.equal(groups.get('').length, 1);
});

test('F propose uniquement les longueurs de la gamme courante', () => {
    const rows = filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO').filter(row => row.repere === 'f');
    assert.deepEqual(getVariantFields('f', rows), [{ key: 'longueurMm', label: 'Longueur' }]);
    assert.deepEqual(getFieldOptions(rows, {}, 'longueurMm'), ['430', '540']);
});

test('G utilise un seul choix type ou diamètre', () => {
    const rows = filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO').filter(row => row.repere === 'g');
    assert.deepEqual(getVariantFields('g', rows), [{ key: 'designation', label: 'Type / diamètre' }]);
});

test('H cascade dimension puis longueurs compatibles sans combinaison inexistante', () => {
    const rows = filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO').filter(row => row.repere === 'h');
    const selections = { dimension: '18 x 150', longueurMm: '' };
    assert.deepEqual(getFieldOptions(rows, selections, 'longueurMm'), ['50']);
    const matches = findSelectedParts(rows, { dimension: '18 x 150', longueurMm: '50' }, getVariantFields('h', rows));
    assert.equal(matches.length, 1);
    assert.equal(matches[0].prixBrut, 4.94);
});

test('I adapte ses champs aux quatre familles réelles', () => {
    const rows = filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO').filter(row => row.repere === 'i');
    const type = designation => rows.find(row => row.designation === designation);
    for (const designation of ['Entretoise cylindrique pleine', 'Entretoises étagées - toutes largeurs', 'Supplément entretoises', 'Entretoise étagée pleine']) {
        const value = `${type(designation).categorie} — ${designation}`;
        const fields = getVariantFields('i', rows, { type: value });
        assert.equal(fields[0].key, 'type');
        assert.ok(fields.some(field => designation.includes('étagées -') || designation.includes('Supplément') ? field.key === 'plageDiametre' : field.key === 'longueurMm'));
    }
});

test('L cascade type de jonc puis plage de diamètre', () => {
    const rows = filterPartsByGamme(parsePartsCatalogCsv(fixture), 'EVO').filter(row => row.repere === 'l');
    assert.deepEqual(getVariantFields('l', rows).map(field => field.key), ['designation', 'variante']);
    assert.deepEqual(getFieldOptions(rows, { designation: 'Jonc à souder', variante: '' }, 'variante'), ['24-30"']);
});

test('les deux pages sont physiquement distinctes et leur gamme ne vient pas de l’URL', () => {
    assert.match(evoPage, /data-parts-catalog-gamme="EVO"/);
    assert.match(page360, /data-parts-catalog-gamme="360"/);
    assert.doesNotMatch(pageModule, /URLSearchParams|location\.search/);
    assert.doesNotMatch(evoPage, /jumelages-pieces-360/);
    assert.doesNotMatch(page360, /jumelages-pieces-evo/);
});

test('les retours sont explicites et aucun history.back n’est utilisé', () => {
    assert.match(evoPage, /jumelages-choix\.html\?type=EVO/);
    assert.match(page360, /jumelages-choix\.html\?type=360/);
    assert.doesNotMatch(evoPage + page360 + pageModule, /history\.back|window\.history|document\.referrer/);
});

test('le bouton pièces est limité à EVO et 360 dans le choix de gamme', () => {
    assert.match(choicePage, /gammeType === 'EVO' \|\| gammeType === '360'/);
    assert.match(choicePage, /jumelages-pieces-evo\.html/);
    assert.match(choicePage, /jumelages-pieces-360\.html/);
    assert.doesNotMatch(choicePage, /jumelages-pieces-tgd/i);
});

test('le CSV est chargé uniquement après AUTHORIZED avec contrôle response.ok', () => {
    const guard = pageModule.indexOf('requireAuthorizedUser');
    const authorized = pageModule.indexOf('AUTHORIZATION_STATES.AUTHORIZED');
    const fetchIndex = pageModule.indexOf('fetch(JUMELAGES_PARTS_CSV_URL)');
    assert.ok(guard >= 0 && authorized > guard && fetchIndex > authorized);
    assert.match(pageModule, /if \(!response\.ok\) throw new Error/);
    for (const status of [403, 404, 500, 502]) assert.equal(status >= 400, true);
});

test('les données externes sont rendues comme texte sans innerHTML', () => {
    assert.match(pageModule, /textContent = text/);
    assert.match(pageModule, /document\.createElement/);
    assert.match(pageModule, /replaceChildren/);
    assert.doesNotMatch(pageModule, /innerHTML|insertAdjacentHTML/);
    const hostile = `${header}\nEVO,g,PIECE,"<img src=x onerror=alert(1)>","<script>alert(1)</script>",,,"<b>x</b>","<svg onload=alert(1)>",10`;
    const row = parsePartsCatalogCsv(hostile)[0];
    assert.equal(row.designation, '<img src=x onerror=alert(1)>');
    assert.equal(row.variante, '<script>alert(1)</script>');
});

test('les hotspots sont indépendants, tactiles et accessibles', () => {
    assert.notDeepEqual(PARTS_HOTSPOTS.EVO, PARTS_HOTSPOTS['360']);
    assert.match(pageModule, /aria-label/);
    assert.match(read('css/app-ermas.css'), /\.parts-hotspot[\s\S]*width: 48px;[\s\S]*height: 48px;/);
});

test('V12.1 conserve le schéma comme unique accès aux pièces repérées', () => {
    const source = evoPage + page360 + pageModule;
    assert.doesNotMatch(source, /Toutes les pièces|Autres pièces & services|parts-list/);
    assert.match(evoPage, /id="parts-hotspots"/);
    assert.match(page360, /id="parts-hotspots"/);
    assert.match(pageModule, /renderHotspots\(gamme, groups, state\)/);
});

test('V12.1 utilise exactement le composant commun Prix NET', () => {
    for (const page of [evoPage, page360]) {
        assert.match(page, /class="net-price-control"/);
        assert.match(page, /class="net-price-toggle"/);
        assert.match(page, /class="net-price-toggle__input"/);
        assert.match(page, /class="net-price-toggle__track"/);
        assert.match(page, /class="net-price-toggle__state"/);
        assert.match(page, />Prix NET</);
        assert.doesNotMatch(page, /Afficher les prix NET|net-price-switch/);
    }
});

test('V12.2 place le grand schéma avant la fiche dans un flux vertical', () => {
    for (const page of [evoPage, page360]) {
        assert.ok(page.indexOf('class="parts-diagram-scroll"') < page.indexOf('id="parts-detail"'));
    }
    const css = read('css/app-ermas.css');
    assert.match(css, /\.parts-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.parts-diagram \{[^}]*width: 100%;[^}]*min-width: 0;/);
    assert.doesNotMatch(css, /\.parts-layout[^}]*2\.4fr/);
});

test('V12.2 supprime tout agrandissement externe du schéma', () => {
    const pages = evoPage + page360;
    assert.doesNotMatch(pages, /Agrandir le schéma|parts-enlarge-link/);
    assert.doesNotMatch(pages, /href="assets\/jumelages\/(?:evo|360)-pieces\.png"/);
    assert.doesNotMatch(read('css/app-ermas.css'), /\.parts-enlarge-link/);
});

test('V12.3 conserve les actifs desktop et sélectionne les actifs mobiles dédiés', () => {
    assert.match(evoPage, /<source media="\(max-width: 560px\)" srcset="assets\/jumelages\/evo-pieces-mobile\.png">/);
    assert.match(evoPage, /<img src="assets\/jumelages\/evo-pieces\.png"/);
    assert.match(page360, /<source media="\(max-width: 560px\)" srcset="assets\/jumelages\/360-pieces-mobile\.png">/);
    assert.match(page360, /<img src="assets\/jumelages\/360-pieces\.png"/);
});

test('la rotation anti-horaire normalisée transforme exactement coins, centre et limites', () => {
    assert.deepEqual(rotateHotspotPositionCounterClockwise([0, 0]), [0, 100]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise([100, 0]), [0, 0]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise([100, 100]), [100, 0]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise([0, 100]), [100, 100]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise([50, 50]), [50, 50]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise(PARTS_HOTSPOTS.EVO.a), [16, 58]);
    assert.deepEqual(rotateHotspotPositionCounterClockwise(PARTS_HOTSPOTS['360'].h), [17, 12]);
    assert.throws(() => rotateHotspotPositionCounterClockwise([-1, 50]), /invalides/);
});

test('toutes les coordonnées mobiles restent dans le référentiel normalisé', () => {
    for (const [gamme, mapping] of Object.entries(PARTS_HOTSPOTS)) {
        for (const [repere, coordinates] of Object.entries(mapping)) {
            const positions = Array.isArray(coordinates[0]) ? coordinates : [coordinates];
            for (const [positionIndex, position] of positions.entries()) {
                const mobile = transformHotspotPositionForMobile(gamme, repere, position, positionIndex);
                assert.ok(mobile.every(value => value >= 0 && value <= 100));
            }
        }
    }
});

test('V12.4 transforme rotation, crop et correction résiduelle dans un seul calcul', () => {
    assert.deepEqual(PARTS_MOBILE_DIAGRAMS.EVO.crop, { left: 30, top: 180, right: 620, bottom: 1835 });
    assert.deepEqual(PARTS_MOBILE_DIAGRAMS['360'].crop, { left: 30, top: 180, right: 470, bottom: 1810 });
    assert.deepEqual(transformHotspotPositionForMobile('EVO', 'a', PARTS_HOTSPOTS.EVO.a).map(value => Number(value.toFixed(3))), [12.678, 60.115]);
    assert.deepEqual(transformHotspotPositionForMobile('360', 'k', PARTS_HOTSPOTS['360'].k).map(value => Number(value.toFixed(3))), [91.727, 48.89]);
    assert.throws(() => transformHotspotPositionForMobile('TGD', 'a', [50, 50]), /Gamme/);
});

test('V12.4 documente des crops valides sans upscale ni déformation', () => {
    for (const diagram of Object.values(PARTS_MOBILE_DIAGRAMS)) {
        const rotatedWidth = diagram.sourceHeight;
        const rotatedHeight = diagram.sourceWidth;
        assert.ok(diagram.crop.left >= 0 && diagram.crop.top >= 0);
        assert.ok(diagram.crop.right <= rotatedWidth && diagram.crop.bottom <= rotatedHeight);
        assert.ok(diagram.crop.right > diagram.crop.left && diagram.crop.bottom > diagram.crop.top);
    }
});

test('V12.5 transforme exactement les hotspots dans les crops desktop distincts', () => {
    assert.deepEqual(PARTS_DESKTOP_DIAGRAMS.EVO.crop, { left: 185, top: 30, right: 1840, bottom: 620 });
    assert.deepEqual(PARTS_DESKTOP_DIAGRAMS['360'].crop, { left: 150, top: 30, right: 1780, bottom: 470 });
    assert.deepEqual(transformHotspotPositionForDesktop('EVO', 'a', PARTS_HOTSPOTS.EVO.a).map(value => Number(value.toFixed(3))), [39.825, 12.678]);
    assert.deepEqual(transformHotspotPositionForDesktop('360', 'k', PARTS_HOTSPOTS['360'].k).map(value => Number(value.toFixed(3))), [51.049, 91.727]);
    assert.throws(() => transformHotspotPositionForDesktop('TGD', 'a', [50, 50]), /Gamme/);
    for (const [gamme, mapping] of Object.entries(PARTS_HOTSPOTS)) {
        for (const [repere, coordinates] of Object.entries(mapping)) {
            const positions = Array.isArray(coordinates[0]) ? coordinates : [coordinates];
            positions.forEach((position, index) => {
                assert.ok(transformHotspotPositionForDesktop(gamme, repere, position, index).every(value => value >= 0 && value <= 100));
            });
        }
    }
});

test('V12.5 place instruction, schéma, Prix NET puis fiche dans cet ordre', () => {
    for (const page of [evoPage, page360]) {
        const instruction = page.indexOf('id="parts-status"');
        const diagram = page.indexOf('class="parts-diagram-scroll"');
        const netControl = page.indexOf('id="net-price-control"');
        const detail = page.indexOf('id="parts-detail"');
        assert.ok(instruction >= 0 && diagram > instruction && netControl > diagram && detail > netControl);
        assert.match(page, /class="parts-net-control-row"/);
    }
    assert.match(read('css/app-ermas.css'), /\.parts-diagram-scroll \{ overflow-x: visible;/);
});

test('les lettres mobiles restent droites dans des pastilles DOM indépendantes', () => {
    assert.match(pageModule, /parts-hotspot__label/);
    assert.match(pageModule, /transformHotspotPositionForMobile/);
    const css = read('css/app-ermas.css');
    assert.match(css, /\.parts-hotspot__label \{ position: relative; z-index: 1; display: inline; \}/);
    assert.doesNotMatch(css, /rotate\(90deg\)|rotate\(-90deg\)|transform:\s*rotate/);
});

test('la présentation mobile supprime réellement toute largeur et tout scroll horizontal forcés', () => {
    const css = read('css/app-ermas.css');
    assert.doesNotMatch(css, /min-width:\s*680px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.parts-diagram-scroll \{ overflow-x: visible; \}/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*left: var\(--parts-mobile-x\);[\s\S]*top: var\(--parts-mobile-y\);/);
});

test('les pages utilisent Auth, logout, prix NET et les deux éclatés locaux', () => {
    assert.match(pageModule, /requireAuthorizedUser/);
    assert.match(pageModule, /isNetPriceVisible|setNetPriceVisible/);
    assert.match(evoPage + page360, /data-global-logout/);
    assert.match(evoPage, /assets\/jumelages\/evo-pieces\.png/);
    assert.match(page360, /assets\/jumelages\/360-pieces\.png/);
    assert.equal(JUMELAGES_PARTS_CSV_URL.includes('gid=350997467'), true);
    assert.deepEqual(PARTS_CATALOG_GAMMES, ['EVO', '360']);
});

test('aucune commande, référence article, écriture Supabase ou calculateur n’est ajouté', () => {
    const source = evoPage + page360 + pageModule;
    assert.doesNotMatch(source, /panier|quantité|commander|calcul-hors-tout|\.from\(['"]profiles|\.rpc\(/i);
    assert.doesNotMatch(pageModule, /REFERENCE|REF PIECE|REFERENCE ARTICLE/);
});
