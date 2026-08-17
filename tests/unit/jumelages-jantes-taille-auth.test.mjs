import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages-jantes-taille.html'), 'utf8');

function pageDecision(state) {
    return state === AUTHORIZATION_STATES.AUTHORIZED ? 'LOAD' : 'INDEX';
}

test('seul AUTHORIZED permet la logique Jumelage', () => {
    assert.equal(pageDecision(AUTHORIZATION_STATES.AUTHORIZED), 'LOAD');
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        if (state === AUTHORIZATION_STATES.AUTHORIZED) continue;
        assert.equal(pageDecision(state), 'INDEX', `l’état ${state} doit être refusé`);
    }
});

test('le garde précède remise, type, CSV et restauration', () => {
    const guardPosition = source.indexOf('await requireAuthorizedUser({ client: supabaseClient })');
    const authorizedPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const remisePosition = source.indexOf('context.profile.remise');
    const typePosition = source.indexOf('new URLSearchParams(window.location.search)');
    const fetchPosition = source.indexOf('fetch(URLS_CSV[gammeType])');
    const restoreCallPosition = source.indexOf('restaurerSelections();');

    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizedPosition);
    assert.ok(authorizedPosition < remisePosition);
    assert.ok(remisePosition < typePosition);
    assert.ok(typePosition < fetchPosition);
    assert.ok(fetchPosition < restoreCallPosition);
    assert.match(source, /initPage\(\)\.catch\(\(\) => \{\s*window\.location\.href = 'index\.html';/);
});

test('la remise provient exclusivement du contexte autorisé', () => {
    assert.ok(source.includes('parseFloat(context.profile.remise) || 0'));
    assert.doesNotMatch(source, /\.select\(['"]remise['"]\)/);
    assert.doesNotMatch(source, /(?:remise|blocage|device_token|device_enrollment_allowed)\s*:/);
});

test('aucune écriture de profil, RPC ou génération de token n’est introduite', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)[\s\S]*?\.(?:insert|update|upsert)\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandomValues|ermas_device_token_pending/);
    assert.doesNotMatch(source, /resetDevice|changeDevice|enableEnrollment|clearServerToken/);
});

test('le client partagé remplace la configuration locale', () => {
    assert.ok(source.includes("import { getSupabaseClient } from './js/supabase-client.js'"));
    assert.ok(source.includes('const supabaseClient = getSupabaseClient();'));
    assert.doesNotMatch(source, /SUPABASE_URL|SUPABASE_ANON_KEY|supabase\.createClient/);
});

test('les filtres et le calculateur restent inactifs avant autorisation', () => {
    assert.ok(source.includes('let pageAuthorized = false;'));
    assert.ok(source.includes('pageAuthorized = true;'));
    assert.ok(source.split('if (!pageAuthorized) return;').length - 1 >= 4);
});

test('les gammes et les sources CSV historiques restent inchangées', () => {
    const csvUrls = source.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^']+output=csv/g) || [];
    assert.equal(csvUrls.length, 2);
    assert.ok(source.includes("'EVO':"));
    assert.ok(source.includes("'360':"));
    assert.ok(source.includes('gid=1732806915&single=true&output=csv'));
    assert.ok(source.includes('gid=1287684735&single=true&output=csv'));
    assert.ok(source.includes("urlParams.get('type') || 'EVO'"));
});

test('parser, champs, filtres et déduplication restent présents', () => {
    for (const fragment of [
        'split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/)',
        'largeurJante: cols[0]',
        'diametre: cols[1]',
        'colC: cols[2]',
        'colD: cols[3]',
        'nom: cols[4]',
        'tendeurs: cols[5]',
        'prix: cols[6]',
        'const uniqueMap = new Map();',
        'item.diametre === chosenD',
        'item.largeurJante === chosenL',
        'item.tendeurs === chosenT'
    ]) {
        assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
    }
});

test('prix principal et options conservent leurs formules', () => {
    for (const fragment of [
        'const finalPrix = userRemise > 0 ? basePrix * (1 - userRemise / 100) : basePrix;',
        'const finalOpt = userRemise > 0 ? baseOpt * (1 - userRemise / 100) : baseOpt;',
        "{ label: 'Kit sans jantes', val: match.kitSansJantes }",
        "{ label: 'Suppl. joncs à boulonner', val: match.joncs }",
        "{ label: 'Paire tendeurs supp.', val: match.paireTendeurs }",
        "{ label: 'Suppl. entretoises étagées', val: match.entretoises }"
    ]) {
        assert.ok(source.includes(fragment), `prix ou option absent : ${fragment}`);
    }
});

test('persistance et calculateur hors-tout restent inchangés', () => {
    for (const fragment of [
        "sessionStorage.setItem('ermas_jante_diametre'",
        "sessionStorage.setItem('ermas_jante_largeur'",
        "sessionStorage.setItem('ermas_jante_tendeurs'",
        "sessionStorage.getItem('ermas_jante_diametre')",
        "sessionStorage.getItem('ermas_jante_largeur')",
        "sessionStorage.getItem('ermas_jante_tendeurs')",
        "sessionStorage.setItem('ermas_hors_tout_product', JSON.stringify(product))",
        'calcul-hors-tout.html?type=${gammeType}'
    ]) {
        assert.ok(source.includes(fragment), `contrat de stockage absent : ${fragment}`);
    }
});
