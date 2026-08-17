import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages-jantes-pneu.html'), 'utf8');

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
        'fetch(URLS_PNEU[gammeType])',
        'fetch(URLS_TARIFS[gammeType])',
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
    assert.ok(source.split('if (!pageAuthorized) return;').length - 1 >= 4);
    assert.ok(source.includes('window.ouvrirCalculHorsTout = ouvrirCalculHorsTout;'));
});

test('les quatre sources CSV, gammes et chargement parallèle restent présents', () => {
    const urls = source.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^']+output=csv/g) || [];
    assert.equal(urls.length, 4);
    for (const gid of ['139891043', '1732806915', '1287684735']) {
        assert.ok(source.includes(`gid=${gid}&single=true&output=csv`));
    }
    assert.ok(source.includes("urlParams.get('type') || 'EVO'"));
    assert.match(source, /Promise\.all\(\[\s*fetch\(URLS_PNEU\[gammeType\]\),\s*fetch\(URLS_TARIFS\[gammeType\]\)\s*\]\)/);
});

test('parsers, colonnes, disponibilité et jointure restent inchangés', () => {
    for (const fragment of [
        'function parsePneuCSV(text)', 'function parseTarifsCSV(text)',
        'largeurPneu: cols[0]', 'rapport: cols[1]', 'diametrePneu: cols[2]',
        'largeurJante: cols[3]', 'prix: cols[6]', 'entretoises: cols[10]',
        'function filtrerPneusDisponibles()',
        'tarif.largeurJante.toLowerCase() === pneu.largeurJante.toLowerCase()',
        'tarif.diametre.toLowerCase() === pneu.diametrePneu.toLowerCase()',
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
    for (const fragment of [
        "sessionStorage.setItem('ermas_pneu_largeur'", "sessionStorage.setItem('ermas_pneu_rapport'",
        "sessionStorage.setItem('ermas_pneu_diametre'", "sessionStorage.getItem('ermas_pneu_largeur')",
        "sessionStorage.getItem('ermas_pneu_rapport')", "sessionStorage.getItem('ermas_pneu_diametre')",
        "sessionStorage.setItem('ermas_hors_tout_product', JSON.stringify(productData))",
        'JSON.parse(decodeURIComponent(payloadEncoded))', 'calcul-hors-tout.html?type=${gammeType}'
    ]) assert.ok(source.includes(fragment), `contrat de stockage absent : ${fragment}`);
});
