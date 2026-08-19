import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';
import { getEncodedJumelagesType, isAllowedJumelagesType } from '../../js/jumelages-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages-choix.html'), 'utf8');

function pilotDecision(state) {
    return state === AUTHORIZATION_STATES.AUTHORIZED ? 'CONTINUE' : 'INDEX';
}

test('le garde complet précède toute lecture du type et toute logique métier', () => {
    const guardPosition = source.indexOf('await requireAuthorizedUser({ client: supabaseClient })');
    const authorizationPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const parameterPosition = source.indexOf('new URLSearchParams(window.location.search)');
    const renderingPosition = source.indexOf("document.getElementById('page-title').textContent");

    assert.ok(guardPosition >= 0, 'garde complet absent');
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < parameterPosition);
    assert.ok(parameterPosition < renderingPosition);
});

test('seul AUTHORIZED poursuit la logique de la page', () => {
    assert.equal(pilotDecision(AUTHORIZATION_STATES.AUTHORIZED), 'CONTINUE');

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
        assert.equal(pilotDecision(state), 'INDEX', `l’état ${state} doit être refusé`);
    }

    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('une exception du garde provoque un refus fermé', () => {
    assert.match(source, /try\s*\{[\s\S]*await requireAuthorizedUser[\s\S]*\}\s*catch\s*\(error\)/);
    assert.match(source, /init\(\)\.catch\(\(\) => \{\s*window\.location\.href = 'index\.html';/);
});

test('la page est strictement consommatrice du garde', () => {
    assert.doesNotMatch(source, /initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandomValues|ermas_device_token_pending/);
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)[\s\S]*?\.(?:insert|update|upsert)\s*\(/);
    assert.doesNotMatch(source, /device_enrollment_allowed\s*:|device_token\s*:|remise\s*:|blocage\s*:/);
    assert.doesNotMatch(source, /resetDevice|changeDevice|enableEnrollment|clearServerToken/);
});

test('le client partagé remplace le client Supabase local', () => {
    assert.ok(source.includes("import { getSupabaseClient } from './js/supabase-client.js'"));
    assert.ok(source.includes('const supabaseClient = getSupabaseClient();'));
    assert.doesNotMatch(source, /SUPABASE_URL|SUPABASE_ANON_KEY|supabase\.createClient/);
});

test('tous les retours utilisent la destination explicite du menu Jumelages', () => {
    assert.ok(source.split("window.location.href = 'jumelages.html'").length - 1 >= 2);
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('le comportement métier autorisé reste présent', () => {
    for (const fragment of [
        "from './js/jumelages-catalog.js'",
        "const requestedType = urlParams.get('type')",
        'if (!isAllowedJumelagesType(requestedType))',
        'const gammeType = requestedType',
        "redirigerVers('taille')",
        "redirigerVers('pneu')",
        'jumelages-jantes-taille.html?type=${encodedType}',
        'jumelages-jantes-pneu.html?type=${encodedType}',
        'Par taille de jante',
        'Par taille de pneu'
    ]) {
        assert.ok(source.includes(fragment), `comportement historique absent : ${fragment}`);
    }
    assert.doesNotMatch(source, /Par taille de jantes|Par taille de pneus/);
});

test('le paramètre type utilise une allowlist fermée sans fallback EVO implicite', () => {
    for (const value of ['EVO', '360', 'TGD', 'TGD+']) {
        assert.equal(isAllowedJumelagesType(value), true);
    }
    for (const value of [null, '', 'ABC', 'TGD++', 'tgd', '360/../foo']) {
        assert.equal(isAllowedJumelagesType(value), false);
    }
    assert.equal(getEncodedJumelagesType('TGD+'), 'TGD%2B');

    assert.doesNotMatch(source, /urlParams\.get\('type'\) \|\| 'EVO'/);
    assert.match(source, /if \(!isAllowedJumelagesType\(requestedType\)\) \{\s*window\.location\.href = 'jumelages\.html';\s*return;/);
});

test('la page de choix utilise les fondations visuelles ERMAS locales', () => {
    assert.ok(source.includes('href="css/app-ermas.css"'));
    assert.ok(source.includes('src="assets/brand/ermas-logo.png"'));
    assert.ok(source.includes('assets/brand/favicon.ico'));
    assert.ok(source.includes('class="app-page-panel"'));
    assert.ok(source.includes('class="app-footer"'));
    assert.doesNotMatch(source, /<img[^>]+(?:photo|unsplash|pexels)/i);
});
