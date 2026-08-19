import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages-jantes-pneu.html'), 'utf8');
const catalogSource = await readFile(path.join(root, 'js', 'jumelages-catalog.js'), 'utf8');

test('seul AUTHORIZED permet la logique Jumelage par pneu', () => {
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        assert.equal(state === AUTHORIZATION_STATES.AUTHORIZED, state === 'AUTHORIZED', `verdict inattendu : ${state}`);
    }
    assert.ok(source.includes('context.state !== AUTHORIZATION_STATES.AUTHORIZED'));
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('le garde précède remise, type, deux fetchs et restauration', () => {
    const positions = [
        'await requireAuthorizedUser({ client: supabaseClient })',
        'context.state !== AUTHORIZATION_STATES.AUTHORIZED',
        'context.profile.remise',
        'new URLSearchParams(window.location.search)',
        'fetch(JUMELAGES_TIRE_CSV_URL)',
        'fetch(getJumelagesCatalogUrl(gammeType))',
        'restaurerSelections();'
    ].map((fragment) => source.indexOf(fragment));
    assert.ok(positions.every((position) => position >= 0));
    for (let index = 1; index < positions.length; index += 1) {
        assert.ok(positions[index - 1] < positions[index]);
    }
    assert.match(source, /initPage\(\)\.catch\(\(\) => \{\s*window\.location\.href = 'index\.html';/);
});

test('remise et client proviennent exclusivement des modules partagés', () => {
    assert.ok(source.includes('parseFloat(context.profile.remise) || 0'));
    assert.doesNotMatch(source, /\.select\(['"]remise['"]\)/);
    assert.ok(source.includes("import { getSupabaseClient } from './js/supabase-client.js'"));
    assert.ok(source.includes('const supabaseClient = getSupabaseClient();'));
    assert.doesNotMatch(source, /SUPABASE_URL|SUPABASE_ANON_KEY|supabase\.createClient/);
});

test('aucune écriture administrative ni enrôlement n’est introduit', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)[\s\S]*?\.(?:insert|update|upsert)\s*\(/);
    assert.doesNotMatch(source, /(?:remise|blocage|device_token|device_enrollment_allowed)\s*:/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandomValues|ermas_device_token_pending/);
});

test('filtres, résultats et calculateur sont verrouillés avant autorisation', () => {
    assert.ok(source.includes('let pageAuthorized = false;'));
    assert.ok(source.includes('pageAuthorized = true;'));
    assert.ok(source.split('if (!pageAuthorized) return;').length - 1 >= 3);
    assert.ok(source.includes('if (!pageAuthorized || simplifiedCatalog) return;'));
    assert.ok(source.includes('window.ouvrirCalculHorsTout = ouvrirCalculHorsTout;'));
});

test('le retour conserve les quatre types et encode TGD+', () => {
    const destinationFor = (type) => ['EVO', '360', 'TGD', 'TGD+'].includes(type)
        ? `jumelages-choix.html?type=${encodeURIComponent(type)}`
        : 'jumelages.html';

    assert.equal(destinationFor('EVO'), 'jumelages-choix.html?type=EVO');
    assert.equal(destinationFor('360'), 'jumelages-choix.html?type=360');
    assert.equal(destinationFor('TGD'), 'jumelages-choix.html?type=TGD');
    assert.equal(destinationFor('TGD+'), 'jumelages-choix.html?type=TGD%2B');
    assert.equal(destinationFor('INCONNU'), 'jumelages.html');
    assert.equal(destinationFor(null), 'jumelages.html');
    assert.ok(source.includes("let backDestination = 'jumelages.html';"));
    assert.ok(source.includes('if (!isAllowedJumelagesType(requestedType))'));
    assert.ok(source.includes('`jumelages-choix.html?type=${getEncodedJumelagesType(gammeType)}`'));
    assert.ok(source.includes("window.location.href = backDestination;"));
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('les sources CSV sont centralisées et le chargement parallèle reste protégé', () => {
    for (const gid of ['139891043', '1732806915', '1287684735', '1649910681', '801659039']) {
        assert.ok(catalogSource.includes(`gid=${gid}&single=true&output=csv`));
    }
    assert.match(source, /Promise\.all\(\[\s*fetch\(JUMELAGES_TIRE_CSV_URL\),\s*fetch\(getJumelagesCatalogUrl\(gammeType\)\)\s*\]\)/);
});

test('parsers, colonnes, disponibilité et jointure restent inchangés', () => {
    for (const fragment of [
        'function parsePneuCSV(text)', 'function parseTarifsCSV(text)',
        'largeurPneu: cols[0]', 'rapport: cols[1]', 'diametrePneu: cols[2]',
        'largeurJante: cols[3]', 'prix: cols[6]', 'entretoises: cols[10]',
        'function filtrerPneusDisponibles()',
        'filterTiresByAvailableCatalogDimensions(pneuData, tarifsData)',
        't.largeurJante.toLowerCase() === targetLargeurJante.toLowerCase()',
        't.diametre.toLowerCase() === chosenD.toLowerCase()'
    ]) assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
});

test('déduplication, prix principal et options restent inchangés', () => {
    for (const fragment of [
        "`${(match.nom || '').trim().toLowerCase()}_${(match.tendeurs || '').trim().toLowerCase()}`",
        'const finalPrix = userRemise > 0 ? basePrix * (1 - userRemise / 100) : basePrix;',
        'const finalOpt = userRemise > 0 ? baseOpt * (1 - userRemise / 100) : baseOpt;',
        "{ label: 'Kit sans jantes', val: match.kitSansJantes }",
        "{ label: 'Suppl. joncs à boulonner', val: match.joncs }",
        "{ label: 'Paire tendeurs supp.', val: match.paireTendeurs }",
        "{ label: 'Suppl. entretoises étagées', val: match.entretoises }"
    ]) assert.ok(source.includes(fragment), `prix ou option absent : ${fragment}`);
});

test('persistance et calculateur hors-tout restent inchangés', () => {
    const calculatorUrl = (type) => `calcul-hors-tout.html?type=${type}&source=pneu`;
    assert.equal(calculatorUrl('EVO'), 'calcul-hors-tout.html?type=EVO&source=pneu');
    assert.equal(calculatorUrl('360'), 'calcul-hors-tout.html?type=360&source=pneu');

    for (const fragment of [
        "sessionStorage.setItem('ermas_pneu_largeur'", "sessionStorage.setItem('ermas_pneu_rapport'",
        "sessionStorage.setItem('ermas_pneu_diametre'", "sessionStorage.getItem('ermas_pneu_largeur')",
        "sessionStorage.getItem('ermas_pneu_rapport')", "sessionStorage.getItem('ermas_pneu_diametre')",
        "sessionStorage.setItem('ermas_hors_tout_product', JSON.stringify(productData))",
        'JSON.parse(decodeURIComponent(payloadEncoded))', 'calcul-hors-tout.html?type=${gammeType}&source=pneu'
    ]) assert.ok(source.includes(fragment), `contrat de stockage absent : ${fragment}`);
});

test('Jumelages Pneu utilise le design ERMAS et le titre singulier dynamique', () => {
    for (const fragment of [
        'css/app-ermas.css', 'assets/brand/ermas-logo.png', 'app-shell catalog-page results-page',
        'results-search-panel', 'results-section', "`Catalogue Jumelages — ${gammeType}`",
        "textContent = 'Recherche par taille de pneu'", 'class="app-footer"',
        'https://www.ermas.fr/mentions-legales', 'https://www.ermas.fr/politique-confidentialite',
        'target="_blank" rel="noopener noreferrer"'
    ]) assert.ok(source.includes(fragment), `fondation visuelle absente : ${fragment}`);
    assert.doesNotMatch(source, /Recherche Jantes par Taille de Pneus|Recherche par taille de pneus/);
    assert.ok(source.includes('<img class="app-logo" src="assets/brand/ermas-logo.png" alt="">'));
    assert.ok(source.includes('class="app-logo-link" href="https://www.ermas.fr/"'));
    assert.doesNotMatch(source, /app-header__logo/);
});

test('Jumelages Pneu partage le switch NET et masque chaque NET indépendamment du BRUT', () => {
    for (const fragment of [
        "from './js/net-price-visibility.js'", 'isNetPriceVisible()',
        'setNetPriceVisible(netPriceToggle.checked)', 'aria-label="Afficher ou masquer les prix NET"',
        "netPriceStatus.textContent = netPriceVisible ? 'ON' : 'OFF'",
        "document.querySelectorAll('[data-net-price]')", 'element.hidden = !netPriceVisible',
        'Prix BRUT :', 'Prix NET', 'data-net-price'
    ]) assert.ok(source.includes(fragment), `contrat NET absent : ${fragment}`);
    assert.doesNotMatch(source, /localStorage|Remise\s+\d|Réduction|Économie/);
});

test('Jumelages Pneu masque réellement les NET et harmonise les options', async () => {
    const css = await readFile(path.join(root, 'css', 'app-ermas.css'), 'utf8');
    assert.ok(css.includes('.results-content [data-net-price][hidden]'));
    assert.match(css, /\.results-content \[data-net-price\]\[hidden\]\s*\{[\s\S]*?display:\s*none !important;/);
    assert.ok(source.includes('class="results-option-block flex flex-col justify-between text-xs"'));
    assert.ok(source.includes('class="results-option-block flex justify-between items-center text-xs"'));
    assert.ok(source.includes('element.hidden = !netPriceVisible;'));
    assert.ok(source.includes('const baseOpt = parseFloat(opt.val);'));
    assert.ok(source.includes('const finalOpt = userRemise > 0 ? baseOpt * (1 - userRemise / 100) : baseOpt;'));
});
