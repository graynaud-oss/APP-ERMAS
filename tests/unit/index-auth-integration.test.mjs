import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');
const sharedStyles = await readFile(path.join(root, 'css', 'app-ermas.css'), 'utf8');

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
        'ADMIN_CHECK_ERROR',
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

test('les anciennes vues et fonctions applicatives sont absentes', () => {
    for (const viewId of [
        'app-view',
        'jantes-view',
        'jumelages-view',
        'jumelages-tgd-view',
        'jumelages-tgd-plus-view',
        'roues-etroites-view',
        'contact-view',
        'documents-view'
    ]) {
        assert.doesNotMatch(indexSource, new RegExp(`id=["']${viewId}["']`), `vue résiduelle : ${viewId}`);
    }

    for (const functionName of [
        'showJantesView',
        'showJumelagesView',
        'showRouesEtroitesView',
        'showDocumentsView',
        'showContactView',
        'showHomeView',
        'selectGamme',
        'navigateToProtectedPage',
        'loadDocumentsFromStorage'
    ]) {
        assert.doesNotMatch(indexSource, new RegExp(`(?:function|window\\.)\\s*${functionName}`), `fonction résiduelle : ${functionName}`);
    }

    assert.doesNotMatch(indexSource, /DOCUMENTS_BUCKET|documents-list|\.storage\b/);
});

test('le chemin critique AUTHORIZED redirige uniquement vers accueil sans écriture', () => {
    const authorizedCase = indexSource.match(/case AUTHORIZATION_STATES\.AUTHORIZED:[\s\S]*?default:/)?.[0] || '';
    assert.doesNotMatch(authorizedCase, /updateOwnPersonalProfile|\.update\s*\(/);
    assert.ok(authorizedCase.includes("window.location.href = 'accueil.html'"));
    assert.doesNotMatch(authorizedCase, /appView\.classList\.remove\(['"]hidden['"]\)/);
    assert.equal(indexSource.match(/window\.location\.href = 'accueil\.html'/g)?.length, 1);
});

test('les vues et parcours Auth requis restent présents', () => {
    for (const viewId of ['login-view', 'onboarding-view', 'blocked-view', 'access-status-view']) {
        assert.match(indexSource, new RegExp(`id=["']${viewId}["']`), `vue Auth manquante : ${viewId}`);
    }
    for (const functionName of ['logoutUser', 'showAccessStatus', 'showOnboarding', 'processAuthorizedEnrollment', 'handleSession']) {
        assert.match(indexSource, new RegExp(`function\\s+${functionName}\\s*\\(`), `fonction Auth manquante : ${functionName}`);
    }
    assert.ok(indexSource.includes('supabaseClient.auth.signInWithPassword({ email, password })'));
    assert.ok(indexSource.includes('supabaseClient.auth.signUp({ email, password })'));
    assert.ok(indexSource.includes('supabaseClient.auth.resetPasswordForEmail(email,'));
    assert.ok(indexSource.includes('window.logoutUser = logoutUser;'));
});

test('index ne contient plus de responsabilité catalogue, documents, contact ou calcul', () => {
    assert.doesNotMatch(indexSource, /SHEET_CSV_URL|PNEU_CSV_URL|TARIFS_CSV_URL|URLS_CSV|fetch\s*\(/);
    assert.doesNotMatch(indexSource, /calcul-voie\.html|calcul-hors-tout\.html|ermas_calc_product|ermas_hors_tout_product/);
    assert.doesNotMatch(indexSource, /getPublicUrl|\.list\s*\(/);
});

test('index utilise les fondations visuelles ERMAS locales et le footer juridique commun', () => {
    for (const fragment of [
        'href="css/app-ermas.css"', 'assets/brand/ermas-logo.png', 'class="app-logo"',
        'assets/brand/favicon.png', 'assets/brand/favicon.ico', 'assets/brand/apple-touch-icon.png',
        'class="app-shell auth-page"', 'class="app-header"', 'class="auth-main"',
        'class="app-footer"', 'https://www.ermas.fr/mentions-legales',
        'https://www.ermas.fr/politique-confidentialite', 'target="_blank" rel="noopener noreferrer"'
    ]) assert.ok(indexSource.includes(fragment), `fondation visuelle absente : ${fragment}`);
    assert.doesNotMatch(indexSource, /lh3\.googleusercontent\.com/);
});

test('connexion, onboarding et états partagent des composants Auth isolés', () => {
    for (const fragment of [
        'class="auth-panel"', 'class="auth-form"', 'class="auth-field"',
        'auth-button auth-button--primary', 'auth-button auth-button--secondary',
        'auth-status auth-status--error', 'auth-status auth-status--warning',
        'auth-status__icon', 'auth-status__contact'
    ]) assert.ok(indexSource.includes(fragment), `composant Auth absent : ${fragment}`);
    assert.match(sharedStyles, /\.auth-page\s*\{[\s\S]*?min-height:\s*100vh/);
    assert.match(sharedStyles, /@supports \(min-height: 100dvh\)[\s\S]*?\.auth-page/);
    assert.match(sharedStyles, /\.auth-main\s*\{[\s\S]*?flex:\s*1/);
    assert.match(sharedStyles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.auth-button--primary:hover/);
});

test('les identifiants, contraintes et contrôles fonctionnels Auth restent présents', () => {
    for (const id of [
        'auth-form', 'email', 'password-field-container', 'password', 'forgot-password-container',
        'forgot-btn', 'submit-btn', 'toggle-mode', 'error-msg', 'success-msg',
        'onboarding-form', 'profile-nom', 'profile-prenom', 'profile-entreprise',
        'onboarding-error-msg', 'access-status-title', 'access-status-message'
    ]) assert.match(indexSource, new RegExp(`id=["']${id}["']`), `identifiant Auth absent : ${id}`);
    for (const id of ['email', 'password', 'profile-nom', 'profile-prenom', 'profile-entreprise']) {
        assert.match(indexSource, new RegExp(`id=["']${id}["'][^>]*required`), `contrainte required absente : ${id}`);
    }
    assert.doesNotMatch(indexSource, /localStorage|ermas_show_net_prices/);
});
