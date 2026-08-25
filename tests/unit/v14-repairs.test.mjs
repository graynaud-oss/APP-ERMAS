import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import {
    REPAIR_FAMILIES,
    REPAIRS_CSV_URL,
    REPAIR_SERVICE_IDS,
    REPAIR_SERVICES,
    calculateRepairNetPrice,
    findRepairPrice,
    getAvailableRepairOptions,
    getRepairFamily,
    getRepairService,
    getRepairServicesByFamily,
    loadRepairsCatalog,
    parseRepairsCatalogCsv
} from '../../js/repairs-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [home, menu, familyPage, page, jantes, catalog, menuModule, familyModule, pageModule, css, homeNavigation] = await Promise.all([
    read('accueil.html'), read('reparations-modifications.html'), read('reparations-famille.html'), read('reparations-prestation.html'), read('jantes.html'),
    read('js/repairs-catalog.js'), read('js/repairs-menu.js'), read('js/repairs-family.js'), read('js/repairs-page.js'), read('css/app-ermas.css'), read('js/home-navigation.js')
]);

const headers = ['FAMILLE','PRESTATION','VARIANTE','TRANCHE_DIAMETRE','EPAISSEUR','LARGEUR_MODIFICATION','TYPE_PERCAGE','NOMBRE_TROUS','PRIX'];
const expectedCounts = { 'refection-centre-voile-nu':14, 'refection-centre-voile-soude':14, percage:8, 'renfort-jante':20, 'semelle-fond-jante':5, 'elargissement-jante':20, 'retrecissement-jante':5, 'deplacement-voile':5 };
const familyLabel = (familyId) => REPAIR_FAMILIES.find(({ id }) => id === familyId).label;
const quoteCsv = (value) => /[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);

function buildCatalogCsv(priceForIndex = (index) => 1000 + index) {
    const rows = [];
    for (const service of REPAIR_SERVICES) {
        const first = service.selectors[0].options;
        const second = service.selectors[1]?.options ?? [null];
        for (const firstOption of first) for (const secondOption of second) {
            if (service.id.startsWith('refection-centre-') && firstOption.value === 'd200' && !['12','15'].includes(secondOption.value)) continue;
            const labels = Object.fromEntries(service.selectors.map((selector, index) => [selector.key, index === 0 ? firstOption.label : secondOption.label]));
            const drillingValue = service.id === 'percage' ? secondOption.value : '';
            rows.push([
                familyLabel(service.family), service.label,
                labels.support ?? labels.reinforcement ?? '', labels.diameter ?? '', labels.thickness ?? '', labels.width ?? '', labels.drilling ?? '',
                /^\d+$/.test(drillingValue) ? drillingValue : '', priceForIndex(rows.length)
            ]);
        }
    }
    return [headers, ...rows].map((row) => row.map(quoteCsv).join(',')).join('\r\n');
}

const fixtureCsv = buildCatalogCsv();
await loadRepairsCatalog({ fetchImpl: async () => ({ ok: true, text: async () => fixtureCsv }) });

test('l’allowlist contient exactement les huit prestations prévues', () => {
    assert.deepEqual(REPAIR_SERVICE_IDS, Object.keys(expectedCounts));
    assert.equal(getRepairService('inconnue'), null);
});

test('les prestations sont regroupées dans quatre familles fermées', () => {
    assert.equal(REPAIR_FAMILIES.length, 4);
    assert.deepEqual(REPAIR_FAMILIES.map(({ id }) => id), ['centres-percage', 'renforcement', 'largeur', 'deplacement']);
    assert.deepEqual(REPAIR_FAMILIES.map(({ id }) => getRepairServicesByFamily(id).length), [3,2,2,1]);
    assert.equal(getRepairFamily('inconnue'), null);
});

test('le CSV validé contient exactement les 91 combinaisons des huit prestations', () => {
    assert.equal(parseRepairsCatalogCsv(fixtureCsv).length, 91);
    assert.deepEqual(Object.fromEntries(REPAIR_SERVICES.map((service) => [service.id, parseRepairsCatalogCsv(fixtureCsv).filter(({ serviceId }) => serviceId === service.id).length])), expectedCounts);
});

test('aucune référence pièce ni supplément exclu n’est exposé', () => {
    assert.doesNotMatch(catalog, /RDC\d|RJF|RJP|PVN|PVJ|ERJ|DVES/i);
    assert.doesNotMatch(catalog, /sablage|peinture|moins-value|moins value|réfection seule|supplément/i);
});

test('réfection de centre de voile nu respecte les combinaisons publiées', () => {
    assert.equal(findRepairPrice('refection-centre-voile-nu', { diameter:'d200', thickness:'12' }), 1000);
    assert.equal(findRepairPrice('refection-centre-voile-nu', { diameter:'d280-335', thickness:'20-special' }), 1013);
    assert.deepEqual(getAvailableRepairOptions('refection-centre-voile-nu', 'thickness', { diameter:'d200' }).map(({ value }) => value), ['12','15']);
});

test('réfection sur jante à voile soudé respecte les combinaisons publiées', () => {
    assert.equal(findRepairPrice('refection-centre-voile-soude', { diameter:'d200', thickness:'15' }), 1015);
    assert.equal(findRepairPrice('refection-centre-voile-soude', { diameter:'d280-335', thickness:'20-special' }), 1027);
});

test('perçage voile nu reprend les quatre tarifs exacts', () => {
    assert.deepEqual(['unit','8','10','12'].map((drilling) => findRepairPrice('percage', { support:'voile-nu', drilling })), [1028,1029,1030,1031]);
});

test('perçage voile soudé reprend les quatre tarifs exacts', () => {
    assert.deepEqual(['unit','8','10','12'].map((drilling) => findRepairPrice('percage', { support:'voile-soude', drilling })), [1032,1033,1034,1035]);
});

test('renfort reprend les quatre variantes et cinq diamètres', () => {
    const service = getRepairService('renfort-jante');
    assert.deepEqual(service.selectors.map(({ options }) => options.length), [4,5]);
    assert.equal(findRepairPrice('renfort-jante', { reinforcement:'flat-welded', diameter:'50-54' }), 1055);
});

test('semelle reprend les cinq tranches tarifaires', () => {
    assert.equal(findRepairPrice('semelle-fond-jante', { diameter:'34-38' }), 1058);
});

test('élargissement reprend quatre largeurs et cinq diamètres', () => {
    const service = getRepairService('elargissement-jante');
    assert.deepEqual(service.selectors.map(({ options }) => options.length), [4,5]);
    assert.equal(findRepairPrice('elargissement-jante', { width:'7-10', diameter:'50-54' }), 1080);
});

test('rétrécissement reprend les cinq tranches tarifaires', () => {
    assert.equal(findRepairPrice('retrecissement-jante', { diameter:'25-32' }), 1082);
});

test('déplacement de voile reprend les cinq tranches tarifaires', () => {
    assert.equal(findRepairPrice('deplacement-voile', { diameter:'40-48' }), 1089);
});

test('les combinaisons absentes, incomplètes ou arbitraires sont refusées', () => {
    assert.equal(findRepairPrice('refection-centre-voile-nu', { diameter:'d200', thickness:'20-special' }), null);
    assert.equal(findRepairPrice('elargissement-jante', { width:'99', diameter:'up24' }), null);
    assert.equal(findRepairPrice('percage', { support:'voile-nu' }), null);
});

test('le calcul NET réutilise la formule et l’arrondi d’affichage actuels', () => {
    assert.equal(calculateRepairNetPrice(454, 0), 454);
    assert.equal(calculateRepairNetPrice(454, 50), 227);
    assert.equal(calculateRepairNetPrice(10.40, 10).toFixed(2), '9.36');
});

test('la fiche utilise le switch Prix NET partagé OFF et ON', () => {
    for (const marker of ['net-price-control','net-price-toggle','net-price-toggle__input','net-price-toggle__track','net-price-toggle__state']) assert.ok(page.includes(marker));
    assert.ok(pageModule.includes("from './net-price-visibility.js'"));
    assert.ok(pageModule.includes("state.netVisible = setNetPriceVisible(toggle.checked)"));
    assert.ok(pageModule.includes("state.remise > 0 && state.netVisible"));
});

test('la nouvelle carte d’accueil utilise une route protégée explicite', () => {
    assert.match(home, /data-protected-route="reparations-modifications\.html"[\s\S]*RÉPARATIONS &amp; MODIFICATIONS/);
});

test('les trois pages sont masquées et gardées avant affichage', () => {
    for (const source of [menu,familyPage,page]) {
        assert.match(source, /class="hidden app-shell/);
        assert.ok(source.includes("from './js/auth-guard.js'"));
        assert.ok(source.indexOf('requireAuthorizedUser') < source.indexOf("classList.remove('hidden')"));
        assert.match(source, /context\.state\s*!==\s*AUTHORIZATION_STATES\.AUTHORIZED/);
    }
});

test('les types et familles URL passent par les allowlists', () => {
    assert.ok(familyPage.includes('const family=getRepairFamily(requested)'));
    assert.ok(familyPage.includes("window.location.href='reparations-modifications.html'"));
    assert.ok(page.includes('if (!getRepairService(type))'));
    assert.doesNotMatch(menuModule + familyModule + pageModule, /location\.href\s*=\s*[^;]*(?:searchParams|get\()/);
});

test('le rendu dynamique utilise createElement et textContent sans HTML arbitraire', () => {
    assert.ok(menuModule.includes('document.createElement'));
    assert.ok(familyModule.includes('document.createElement'));
    assert.ok(pageModule.includes('document.createElement'));
    assert.ok(menuModule.includes('textContent'));
    assert.ok(familyModule.includes('textContent'));
    assert.ok(pageModule.includes('textContent'));
    assert.doesNotMatch(menuModule + familyModule + pageModule, /innerHTML|insertAdjacentHTML|outerHTML/);
});

test('le lien Documents reste en bas des pages principale et famille', () => {
    assert.ok(menu.indexOf('documents.html') > menu.indexOf('repair-family-grid'));
    assert.match(menu, /data-protected-route="documents\.html" class="app-resource-link"/);
    assert.ok(familyPage.indexOf('documents.html') > familyPage.indexOf('repair-family-services'));
    assert.match(familyPage, /data-protected-route="documents\.html" class="app-resource-link"/);
});

test('les sept visuels extraits sont secondaires, fluides et sans interaction', () => {
    assert.equal(REPAIR_SERVICES.filter(({ image }) => image).length, 7);
    assert.ok(REPAIR_SERVICES.filter(({ image }) => image).every(({ image }) => image.endsWith('.png')));
    assert.doesNotMatch(catalog, /assets\/reparations\/[^'"\s]+\.jpg/i);
    assert.match(css, /\.repair-service-image\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?height:\s*auto;/);
    assert.doesNotMatch(menu + familyPage + page + menuModule + familyModule + pageModule, /hotspot|carousel|min-width:\s*[5-9]\d{2}px/i);
});

test('la grille accueil et la fiche conservent des breakpoints tablette et mobile', () => {
    assert.match(css, /\.home-primary-grid\s*\{\s*grid-template-columns:\s*repeat\(3,/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.repair-service-layout\s*\{\s*grid-template-columns:\s*1fr/);
    assert.match(css, /@media \(max-width: 430px\)[\s\S]*?\.repair-service-image/);
});

test('V14 n’ajoute ni Supabase métier ni stockage distinct', () => {
    assert.doesNotMatch(catalog + menuModule + familyModule + pageModule, /supabase|\.from\(|\.rpc\(|localStorage/i);
    assert.equal(page.match(/getSupabaseClient/g)?.length, 2);
});

test('la source tarifaire est exclusivement le CSV Google Sheets publié', () => {
    assert.equal(REPAIRS_CSV_URL, 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=846887838&single=true&output=csv');
    assert.ok(catalog.includes("fetchImpl(REPAIRS_CSV_URL, { cache: 'no-store' })"));
    assert.ok(page.includes('await loadRepairsCatalog()'));
    assert.doesNotMatch(catalog, /\[270,\s*294|\[454,\s*516|\[577,\s*612/);
});

test('le parser robuste refuse structure, prix et combinaisons invalides', () => {
    assert.throws(() => parseRepairsCatalogCsv(fixtureCsv.replace('FAMILLE', 'FAMILLE_INVALIDE')), /Structure CSV invalide/);
    assert.throws(() => parseRepairsCatalogCsv(fixtureCsv.replace(',1000\r\n', ',0\r\n')), /Prix invalide/);
    assert.throws(() => parseRepairsCatalogCsv(fixtureCsv.replace(',1000\r\n', ',abc\r\n')), /Prix invalide/);
    const lines = fixtureCsv.split('\r\n');
    assert.throws(() => parseRepairsCatalogCsv([...lines.slice(0, -2), lines[1], ''].join('\r\n')), /exactement 91 tarifs|manquantes ou dupliquées/);
});

test('le chargement contrôle HTTP et reste fermé sans ancien tarif', async () => {
    await assert.rejects(loadRepairsCatalog({ fetchImpl: async () => ({ ok: false, text: async () => fixtureCsv }) }), /indisponible/);
    assert.equal(findRepairPrice('refection-centre-voile-nu', { diameter:'d200', thickness:'12' }), null);
    assert.ok(pageModule.includes('Tarifs temporairement indisponibles.'));
});

test('chaque nouveau chargement remplace le tarif précédent sans cache permanent', async () => {
    const selection = { diameter:'d200', thickness:'12' };
    await loadRepairsCatalog({ fetchImpl: async () => ({ ok: true, text: async () => buildCatalogCsv(() => 250) }) });
    assert.equal(findRepairPrice('refection-centre-voile-nu', selection), 250);
    await loadRepairsCatalog({ fetchImpl: async () => ({ ok: true, text: async () => buildCatalogCsv(() => 275) }) });
    assert.equal(findRepairPrice('refection-centre-voile-nu', selection), 275);
});

test('la page principale contient uniquement les quatre familles et aucune prestation', () => {
    assert.ok(menu.includes('id="repair-family-grid"'));
    assert.doesNotMatch(menu, /repair-services-section|repair-services-grid|reparations-prestation\.html/);
    assert.match(menuModule, /reparations-famille\.html\?family=/);
    assert.doesNotMatch(menuModule, /getRepairServicesByFamily/);
});

test('chaque famille ouvre une URL dédiée contrôlée', () => {
    for (const family of REPAIR_FAMILIES.filter(({ id }) => id !== 'deplacement')) assert.ok(menuModule.includes('reparations-famille.html?family='));
    assert.equal(REPAIR_FAMILIES.length, 4);
});

test('Déplacement de voile ouvre directement sa prestation sans page famille intermédiaire', () => {
    assert.ok(menuModule.includes("family.id === 'deplacement'"));
    assert.ok(menuModule.includes("'reparations-prestation.html?type=deplacement-voile'"));
    assert.doesNotMatch(menuModule, /family\.id\s*===\s*['"]deplacement['"][\s\S]{0,160}reparations-famille\.html\?family=deplacement/);
});

test('la page famille rend uniquement les prestations de la famille', () => {
    assert.ok(familyModule.includes('getRepairServicesByFamily(family.id)'));
    assert.deepEqual(REPAIR_FAMILIES.map(({ id }) => getRepairServicesByFamily(id).length), [3,2,2,1]);
    assert.match(familyModule, /reparations-prestation\.html\?type=/);
});

test('le Retour prestation pointe vers sa famille contrôlée', () => {
    assert.ok(pageModule.includes('reparations-famille.html?family=${encodeURIComponent(service.family)}'));
    assert.ok(pageModule.includes("service.id === 'deplacement-voile'"));
    assert.ok(pageModule.includes("? 'reparations-modifications.html'"));
    assert.ok(familyPage.includes('data-protected-route="reparations-modifications.html"'));
});

test('le message tarifaire est absent en fonctionnement normal et visible uniquement en erreur', () => {
    assert.match(page, /id="repair-service-status" class="app-notice hidden" role="status" hidden/);
    assert.ok(pageModule.includes("status.classList.add('hidden')"));
    assert.ok(pageModule.includes("status.classList.remove('hidden')"));
    assert.ok(pageModule.indexOf("status.textContent = 'Tarifs temporairement indisponibles.'") < pageModule.indexOf("status.classList.remove('hidden')"));
});

test('un seul Accueil est produit par le mécanisme global sur chaque page', () => {
    for (const source of [menu,familyPage,page]) {
        assert.equal(source.match(/src="\.\/js\/home-navigation\.js"/g)?.length, 1);
        assert.doesNotMatch(source, />Accueil<\/button>/);
    }
    assert.equal(homeNavigation.match(/textContent = 'Accueil'/g)?.length, 1);
    assert.ok(homeNavigation.includes("link.dataset.homeLink = 'true'"));
});

test('le perçage reste sans illustration et sans espace média forcé', () => {
    assert.equal(getRepairService('percage').image, undefined);
    assert.ok(pageModule.includes('media.hidden = true'));
    assert.match(css, /\.repair-service-media\[hidden\][\s\S]*?display:\s*none/);
});

test('l’information Transport est présente uniquement sur la page d’entrée', () => {
    assert.match(menu, /class="app-notice"[\s\S]*?<strong>Transport des jantes<\/strong>/);
    assert.ok(menu.includes('ERMAS peut organiser le transport de vos jantes pour leur prise en charge et leur retour après intervention.'));
    assert.ok(menu.includes("afin d'obtenir un chiffrage adapté."));
    assert.ok(menu.includes("Vous pouvez également organiser vous-même l'expédition et le retour de vos jantes."));
    assert.match(menu, /<a href="contact\.html">contactez-nous<\/a>/);
    assert.doesNotMatch(familyPage, /Transport des jantes|organiser le transport de vos jantes/);
    assert.doesNotMatch(page, /Transport des jantes|organiser le transport de vos jantes/);
});

test('l’encadré Transport réutilise exactement le pattern compact Jantes', () => {
    const noticeIconPath = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
    const transportNotice = menu.match(/<div class="app-notice">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
    assert.ok(jantes.includes('class="app-notice"'));
    assert.ok(menu.includes('class="app-notice"'));
    assert.ok(jantes.includes(noticeIconPath));
    assert.ok(menu.includes(noticeIconPath));
    assert.match(css, /\.app-notice\s*\{[\s\S]*?padding:\s*15px 16px;[\s\S]*?border-radius:\s*4px;[\s\S]*?font-size:\s*0\.75rem;/);
    assert.doesNotMatch(menu + css, /repair-transport-info|repair-transport-info__icon/);
    assert.doesNotMatch(transportNotice, /<img|assets\/[^'"\s]+/);
});
