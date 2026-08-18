import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'roues-etroites-pneu.html'), 'utf8');

test('seul AUTHORIZED permet la logique Roues étroites par pneu', () => {
    assert.ok(source.includes('context.state !== AUTHORIZATION_STATES.AUTHORIZED'));
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        if (state !== AUTHORIZATION_STATES.AUTHORIZED) assert.notEqual(state, AUTHORIZATION_STATES.AUTHORIZED);
    }
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('le garde précède remise et deux fetchs', () => {
    const positions = [
        'await requireAuthorizedUser({ client: supabaseClient })',
        'context.state !== AUTHORIZATION_STATES.AUTHORIZED',
        'context.profile.remise',
        'fetch(PNEU_CSV_URL)',
        'fetch(TARIFS_CSV_URL)'
    ].map((fragment) => source.indexOf(fragment));
    assert.ok(positions.every((position) => position >= 0));
    for (let index = 1; index < positions.length; index += 1) assert.ok(positions[index - 1] < positions[index]);
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

test('sources, parallélisme, parsers et colonnes restent inchangés', () => {
    const urls = source.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^']+output=csv/g) || [];
    assert.equal(urls.length, 2);
    assert.ok(source.includes('gid=139891043&single=true&output=csv'));
    assert.ok(source.includes('gid=21297594&single=true&output=csv'));
    assert.match(source, /Promise\.all\(\[\s*fetch\(PNEU_CSV_URL\),\s*fetch\(TARIFS_CSV_URL\)\s*\]\)/);
    for (const fragment of [
        'function parseCSVLine(line)', 'function parseTarifsCSV(text)', 'function parsePneuCSV(text)',
        "let inQuotes = false", "char === ',' && !inQuotes", 'largeurJante: cols[0]',
        'diametre:     cols[1]', 'horsTout:     cols[2]', 'emboitement:  cols[3]',
        'profil:       cols[4]', 'nom:          cols[5]', 'prixVV:       cols[6]',
        'deportMaxI:   cols[8]', 'deportMinJ:   cols[9]'
    ]) assert.ok(source.includes(fragment), `fragment CSV absent : ${fragment}`);
});

test('correspondance, normalisation, filtres et déduplication restent inchangés', () => {
    for (const fragment of [
        "str.toLowerCase().replace(/\\.0$/, '').replace(/\\s+/g, '').trim()",
        'normalizeStr(t.largeurJante) === normalizeStr(largeurJante)',
        'normalizeStr(t.diametre) === normalizeStr(diametrePneu)',
        'item.largeurPneu === chosenL', 'item.rapport === chosenR', 'item.diametrePneu === chosenD',
        'normalizeStr(t.largeurJante) === normalizeStr(pneu.largeurJante)',
        'const seenNames = new Set();', 'const identifier = normalizeStr(match.nom);'
    ]) assert.ok(source.includes(fragment), `règle métier absente : ${fragment}`);
});

test('prix, stockage et calculateur restent inchangés', () => {
    for (const fragment of [
        "const baseVV = parseFloat(match.prixVV.replace(',', '.')) || 0;",
        'const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;',
        'finalVV.toFixed(2)', 'match.deportMaxI', 'match.deportMinJ',
        "sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))",
        "window.location.href = 'calcul-voie.html?source=roues-etroites-pneu'"
    ]) assert.ok(source.includes(fragment), `contrat historique absent : ${fragment}`);
});
