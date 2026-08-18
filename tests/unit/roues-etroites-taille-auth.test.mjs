import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'roues-etroites-taille.html'), 'utf8');

test('seul AUTHORIZED permet la logique Roues étroites', () => {
    assert.ok(source.includes('context.state !== AUTHORIZATION_STATES.AUTHORIZED'));
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        if (state === AUTHORIZATION_STATES.AUTHORIZED) continue;
        assert.notEqual(state, AUTHORIZATION_STATES.AUTHORIZED);
    }
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('le garde précède remise et fetch CSV', () => {
    const positions = [
        'await requireAuthorizedUser({ client: supabaseClient })',
        'context.state !== AUTHORIZATION_STATES.AUTHORIZED',
        'context.profile.remise',
        'fetch(SHEET_CSV_URL)'
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

test('filtres et calculateur restent verrouillés avant autorisation', () => {
    assert.ok(source.includes('let pageAuthorized = false;'));
    assert.ok(source.includes('pageAuthorized = true;'));
    assert.ok(source.split('if (!pageAuthorized) return;').length - 1 >= 4);
});

test('le retour utilise toujours la destination explicite du menu Roues étroites', () => {
    assert.ok(source.includes("onclick=\"window.location.href = 'roues-etroites.html'\""));
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('source, parser, champs, filtres et tri restent présents', () => {
    const urls = source.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^']+output=csv/g) || [];
    assert.equal(urls.length, 1);
    assert.ok(source.includes('gid=21297594&single=true&output=csv'));
    for (const fragment of [
        'function parseCSV(text)', "const lines = text.split('\\n')", "let inQuotes = false",
        "char === ',' && !inQuotes", 'largeurJante: cols[0]', 'diametre:     cols[1]',
        'horsTout:     cols[2]', 'emboitement:  cols[3]', 'profil:       cols[4]',
        'nom:          cols[5]', 'prixVV:       cols[6]', 'deportMaxI:   cols[8]',
        'deportMinJ:   cols[9]', 'diametres.sort((a, b) => parseFloat(a) - parseFloat(b))',
        'item.diametre === chosenD', 'item.largeurJante === chosenL', 'item.profil === chosenP'
    ]) assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
});

test('prix et contrat calculateur restent inchangés', () => {
    for (const fragment of [
        "const baseVV = parseFloat(match.prixVV.replace(',', '.')) || 0;",
        'const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;',
        'finalVV.toFixed(2)',
        "sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))",
        "window.location.href = 'calcul-voie.html?source=roues-etroites-taille'"
    ]) assert.ok(source.includes(fragment), `contrat historique absent : ${fragment}`);
});

test('Roues Étroites Taille généralise le contrôle commun BRUT NET sans modifier la coercition', () => {
    assert.ok(source.includes("from './js/net-price-visibility.js'"));
    assert.equal(source.match(/id="net-price-toggle"/g)?.length, 1);
    assert.equal(source.match(/data-net-price \$\{netPriceVisible/g)?.length, 1);
    assert.ok(source.includes('netPriceVisible = isNetPriceVisible();'));
    assert.ok(source.includes('netPriceVisible = setNetPriceVisible(netPriceToggle.checked);'));
    assert.ok(source.includes("resultsContent.querySelectorAll('[data-net-price]')"));
    assert.ok(source.includes("const baseVV = parseFloat(match.prixVV.replace(',', '.')) || 0;"));
    assert.ok(source.includes('class="results-price-block"'));
    assert.ok(source.includes('class="results-price-block__net"'));
    assert.ok(source.includes('class="results-primary-action"'));
    assert.doesNotMatch(source, /localStorage|Remise appliquée|Réduction|Économie|Prix NET\s*\([^)]*%/i);
});

test('Roues Étroites Taille utilise le design commun et le footer légal', () => {
    for (const fragment of ['css/app-ermas.css', 'assets/brand/ermas-logo.png', 'assets/brand/favicon.ico', 'results-search-panel', 'results-section', 'class="app-footer"']) assert.ok(source.includes(fragment));
    assert.ok(source.includes('https://www.ermas.fr/mentions-legales'));
    assert.ok(source.includes('https://www.ermas.fr/politique-confidentialite'));
    assert.ok(source.includes('Recherche roues étroites par taille de jante'));
});
