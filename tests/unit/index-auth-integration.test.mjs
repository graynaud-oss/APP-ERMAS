import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');

test('index charge les quatre modules du Lot 1 comme modules ES', () => {
    assert.match(indexSource, /<script type="module">/);
    for (const modulePath of [
        './js/supabase-client.js',
        './js/profile.js',
        './js/auth-guard.js',
        './js/device-enrollment.js'
    ]) {
        assert.ok(indexSource.includes(`from '${modulePath}'`), `import manquant : ${modulePath}`);
    }
});

test('l’ancien générateur automatique et l’UPSERT administratif ont disparu', () => {
    assert.doesNotMatch(indexSource, /function\s+getDeviceToken\s*\(/);
    assert.doesNotMatch(indexSource, /Math\.random\s*\(/);
    assert.doesNotMatch(indexSource, /\.from\(['"]profiles['"]\)\.upsert|\.upsert\s*\(/s);
    assert.doesNotMatch(indexSource, /resetDevice|changeDevice|clearServerToken|enableEnrollment/);
});

test('l’onboarding utilise uniquement les helpers personnels spécialisés', () => {
    assert.ok(indexSource.includes('createOwnProfile(supabaseClient, personalFields)'));
    assert.ok(indexSource.includes('updateOwnPersonalProfile(supabaseClient, personalFields)'));
    assert.doesNotMatch(indexSource, /device_token\s*:/);
    assert.doesNotMatch(indexSource, /device_enrollment_allowed\s*:/);
    assert.doesNotMatch(indexSource, /remise\s*:/);
    assert.doesNotMatch(indexSource, /blocage\s*:/);
});

test('tous les états d’autorisation requis sont traités explicitement', () => {
    for (const state of [
        'NO_SESSION',
        'SESSION_ERROR',
        'PROFILE_NOT_FOUND',
        'PROFILE_INCOMPLETE',
        'PROFILE_FETCH_ERROR',
        'ACCOUNT_BLOCKED',
        'ENROLLMENT_PENDING_ADMIN',
        'ENROLLMENT_ALLOWED',
        'SERVER_TOKEN_MISSING',
        'LOCAL_TOKEN_MISSING',
        'DEVICE_MISMATCH',
        'INCONSISTENT_DEVICE_STATE',
        'AUTHORIZED'
    ]) {
        assert.ok(indexSource.includes(`AUTHORIZATION_STATES.${state}`), `état non traité : ${state}`);
    }
});

test('l’enrôlement passe exclusivement par la fonction contrôlée puis revérifie la session', () => {
    assert.ok(indexSource.includes('initializeAuthorizedDeviceEnrollment({'));
    assert.ok(indexSource.includes("enrollment.status === DEVICE_ENROLLMENT_STATUSES.INITIALIZED"));
    assert.ok(indexSource.includes("enrollment.status === DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED"));
    assert.ok(indexSource.includes('await handleSession({ allowEnrollment: false })'));
});

test('les réponses périmées de handleSession sont ignorées', () => {
    assert.ok(indexSource.includes('let authorizationRequestGeneration = 0;'));
    assert.ok(indexSource.includes('const requestGeneration = ++authorizationRequestGeneration;'));
    assert.ok(indexSource.includes('if (requestGeneration !== authorizationRequestGeneration) return;'));
    assert.ok(
        indexSource.split('if (requestGeneration !== authorizationRequestGeneration) return;').length - 1 >= 4,
        'les contrôles de péremption doivent couvrir session, erreurs, enrôlement et navigation'
    );
});

test('chaque navigation vers une page protégée exige une autorisation fraîche', () => {
    const navigationFunction = indexSource.match(/async function navigateToProtectedPage\(path\) \{[\s\S]*?\n        \}/)?.[0] || '';
    assert.ok(navigationFunction.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.ok(navigationFunction.includes('authorization.state === AUTHORIZATION_STATES.AUTHORIZED'));
    assert.ok(navigationFunction.includes('window.location.href = path'));
    assert.ok(
        navigationFunction.indexOf('authorization.state === AUTHORIZATION_STATES.AUTHORIZED')
            < navigationFunction.indexOf('window.location.href = path'),
        'la navigation doit rester après la revalidation AUTHORIZED'
    );
});

test('le chemin critique AUTHORIZED redirige uniquement vers accueil sans écriture', () => {
    const authorizedCase = indexSource.match(/case AUTHORIZATION_STATES\.AUTHORIZED:[\s\S]*?default:/)?.[0] || '';
    assert.doesNotMatch(authorizedCase, /updateOwnPersonalProfile|\.update\s*\(/);
    assert.ok(authorizedCase.includes("window.location.href = 'accueil.html'"));
    assert.doesNotMatch(authorizedCase, /appView\.classList\.remove\(['"]hidden['"]\)/);
    assert.equal(indexSource.match(/window\.location\.href = 'accueil\.html'/g)?.length, 1);
});

test('les fonctions onclick nécessaires sont explicitement exposées par le module', () => {
    for (const functionName of [
        'logoutUser',
        'navigateToProtectedPage',
        'selectGamme',
        'showJantesView',
        'showJumelagesView',
        'showRouesEtroitesView',
        'showContactView',
        'showDocumentsView',
        'showHomeView'
    ]) {
        assert.ok(indexSource.includes(`window.${functionName} = ${functionName};`), `fonction globale manquante : ${functionName}`);
    }
});
