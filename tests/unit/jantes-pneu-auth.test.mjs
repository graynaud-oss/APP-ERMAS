import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jantes-pneu.html'), 'utf8');

function pageDecision(state) {
    return state === AUTHORIZATION_STATES.AUTHORIZED ? 'LOAD' : 'INDEX';
}

test('seul AUTHORIZED permet le chargement des deux catalogues', () => {
    assert.equal(pageDecision(AUTHORIZATION_STATES.AUTHORIZED), 'LOAD');

    for (const state of [
        AUTHORIZATION_STATES.NO_SESSION,
        AUTHORIZATION_STATES.SESSION_ERROR,
        AUTHORIZATION_STATES.PROFILE_NOT_FOUND,
        AUTHORIZATION_STATES.PROFILE_INCOMPLETE,
        AUTHORIZATION_STATES.PROFILE_FETCH_ERROR,
        AUTHORIZATION_STATES.ACCOUNT_BLOCKED,
        AUTHORIZATION_STATES.SERVER_TOKEN_MISSING,
        AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING,
        AUTHORIZATION_STATES.DEVICE_MISMATCH,
        AUTHORIZATION_STATES.ENROLLMENT_PENDING_ADMIN,
        AUTHORIZATION_STATES.ENROLLMENT_ALLOWED,
        AUTHORIZATION_STATES.INCONSISTENT_DEVICE_STATE,
        'UNKNOWN_STATE'
    ]) {
        assert.equal(pageDecision(state), 'INDEX', `l’état ${state} doit être refusé`);
    }
});

test('le garde complet précède la remise et les deux fetch CSV', () => {
    const guardPosition = source.indexOf('await requireAuthorizedUser({ client: supabaseClient })');
    const authorizedPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const remisePosition = source.indexOf('context.profile.remise');
    const pneuFetchPosition = source.indexOf('fetch(PNEU_CSV_URL)');
    const tarifsFetchPosition = source.indexOf('fetch(TARIFS_CSV_URL)');

    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizedPosition);
    assert.ok(authorizedPosition < remisePosition);
    assert.ok(remisePosition < pneuFetchPosition);
    assert.ok(remisePosition < tarifsFetchPosition);
    assert.match(source, /try\s*\{[\s\S]*await requireAuthorizedUser[\s\S]*\}\s*catch\s*\(error\)/);
    assert.ok(source.includes("window.location.href = 'index.html'"));
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

test('le retour utilise toujours la destination explicite du menu Jantes', () => {
    assert.ok(source.includes("onclick=\"window.location.href = 'jantes.html'\""));
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('les deux sources et leur chargement parallèle restent inchangés', () => {
    const csvUrls = source.match(/https:\/\/docs\.google\.com\/spreadsheets\/[^']+output=csv/g) || [];
    assert.equal(csvUrls.length, 2);
    assert.ok(source.includes('gid=139891043&single=true&output=csv'));
    assert.ok(source.includes('gid=1966421754&single=true&output=csv'));
    assert.match(source, /Promise\.all\(\[\s*fetch\(PNEU_CSV_URL\),\s*fetch\(TARIFS_CSV_URL\)\s*\]\)/);
});

test('les parsers, champs, filtres, jointure et déduplication restent présents', () => {
    for (const fragment of [
        'function parsePneuCSV(text)',
        'function parseTarifsCSV(text)',
        'largeurPneu: cols[0]',
        'rapport: cols[1]',
        'diametrePneu: cols[2]',
        'largeurJante: cols[3]',
        'prixVF: cols[6]',
        'prixVV: cols[7]',
        'deportMaxI: cols[8]',
        'deportMinJ: cols[9]',
        'new Set(matchingPneus.map(item => item.largeurJante))',
        't.largeurJante.toLowerCase() === targetLargeurJante.toLowerCase()',
        't.diametre.toLowerCase() === chosenD.toLowerCase()'
    ]) {
        assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
    }
});

test('les prix VF/VV et le contrat calculateur restent inchangés', () => {
    for (const fragment of [
        'const finalVF = userRemise > 0 ? baseVF * (1 - userRemise / 100) : baseVF;',
        'const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;',
        "sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))",
        "window.location.href = 'calcul-voie.html'"
    ]) {
        assert.ok(source.includes(fragment), `contrat historique absent : ${fragment}`);
    }
});
