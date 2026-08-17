import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jantes-taille.html'), 'utf8');

function pageDecision(state) {
    return state === AUTHORIZATION_STATES.AUTHORIZED ? 'LOAD' : 'INDEX';
}

test('seul AUTHORIZED permet le chargement tarifaire', () => {
    assert.equal(pageDecision(AUTHORIZATION_STATES.AUTHORIZED), 'LOAD');

    for (const state of [
        AUTHORIZATION_STATES.NO_SESSION,
        AUTHORIZATION_STATES.ACCOUNT_BLOCKED,
        AUTHORIZATION_STATES.PROFILE_INCOMPLETE,
        AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING,
        AUTHORIZATION_STATES.DEVICE_MISMATCH,
        AUTHORIZATION_STATES.ENROLLMENT_PENDING_ADMIN,
        AUTHORIZATION_STATES.ENROLLMENT_ALLOWED,
        AUTHORIZATION_STATES.SESSION_ERROR,
        AUTHORIZATION_STATES.PROFILE_FETCH_ERROR,
        'UNKNOWN_STATE'
    ]) {
        assert.equal(pageDecision(state), 'INDEX', `l’état ${state} doit être refusé`);
    }
});

test('le garde complet précède la remise et le chargement CSV', () => {
    const guardPosition = source.indexOf('await requireAuthorizedUser({ client: supabaseClient })');
    const authorizedPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const remisePosition = source.indexOf('context.profile.remise');
    const fetchPosition = source.indexOf('fetch(SHEET_CSV_URL)');

    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizedPosition);
    assert.ok(authorizedPosition < remisePosition);
    assert.ok(remisePosition < fetchPosition);
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

test('le parser, les prix VF/VV et la navigation historique sont inchangés', () => {
    for (const fragment of [
        "text.split('\\n')",
        "lines[i].split(',').map(val => val.trim().replace(/^\"|\"$/g, ''))",
        'const finalVF = userRemise > 0 ? baseVF * (1 - userRemise / 100) : baseVF;',
        'const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;',
        "sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))",
        "window.location.href = 'calcul-voie.html'"
    ]) {
        assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
    }
});
