import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'accueil.html'), 'utf8');
const redesignedPages = [
    'accueil.html',
    'jantes.html',
    'roues-etroites.html',
    'jumelages.html',
    'jumelages-choix.html',
    'jumelages-information.html',
    'jumelages-pieces-evo.html',
    'jumelages-pieces-360.html',
    'reparations-modifications.html',
    'reparations-famille.html',
    'reparations-prestation.html'
];
const redesignedSources = await Promise.all(
    redesignedPages.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])
);

test('accueil utilise le client Supabase partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('seul AUTHORIZED active et affiche le contenu protégé', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const listenerPosition = source.indexOf("document.querySelectorAll('[data-protected-route]')");
    const displayPosition = source.indexOf("appView.classList.remove('hidden')");

    assert.ok(source.includes('id="app-view" class="hidden'));
    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < listenerPosition);
    assert.ok(listenerPosition < displayPosition);
    assert.ok(source.includes('if (!pageAuthorized) return;'));
});

test('toute erreur ou tout état non autorisé produit un refus fermé', () => {
    assert.ok(source.includes("window.location.href = 'index.html'"));
    assert.ok(source.match(/window\.location\.href = 'index\.html'/g)?.length >= 3);
    assert.ok(source.includes('initPage().catch(() => {'));
    assert.ok(source.includes('pageAuthorized = false;'));
});

test('le visuel et les textes de l’accueil historique sont conservés', () => {
    for (const text of [
        'Bienvenue sur notre espace technique réservé aux revendeurs',
        'Sélectionnez une rubrique ci-dessous :',
        'JANTES',
        'JUMELAGES',
        'ROUES ETROITES',
        'RÉPARATIONS &amp; MODIFICATIONS',
        'DOCUMENTS',
        'NOUS CONTACTER',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `texte ou élément visuel manquant : ${text}`);
    }
});

test('accueil charge localement les fondations visuelles et les actifs officiels', () => {
    assert.ok(source.includes('href="./css/app-ermas.css"'));
    assert.ok(source.includes('src="./assets/brand/ermas-logo.png"'));
    assert.ok(source.includes('href="./assets/brand/favicon.png"'));
    assert.ok(source.includes('href="./assets/brand/favicon.ico"'));
    assert.ok(source.includes('href="./assets/brand/apple-touch-icon.png"'));
    assert.doesNotMatch(source, /fonts\.googleapis\.com/);
});

test('accueil distingue cinq cartes métier et deux accès secondaires', () => {
    assert.equal(source.match(/class="nav-card"/g)?.length, 5);
    assert.equal(source.match(/class="nav-card nav-card--secondary"/g)?.length, 2);
    assert.ok(source.includes('class="home-primary-grid"'));
    assert.ok(source.includes('class="home-secondary-grid"'));
    assert.ok(source.includes('class="app-header"'));
    assert.ok(source.includes('class="app-footer"'));
});

test('les cinq cartes métier utilisent les nouveaux PNG décoratifs dans le conteneur historique', () => {
    for (const asset of ['jantes.png', 'jumelages.png', 'roues-etroites.png', 'manipro.png', 'reparations-modifications.png']) {
        assert.match(source, new RegExp(`<span class="nav-card__icon nav-card__icon--image" aria-hidden="true"><img src="\\./assets/home-icons/${asset.replace('.', '\\.') }" alt="" loading="lazy"></span>`));
    }
    assert.equal(source.match(/assets\/home-icons\//g)?.length, 5);
    assert.doesNotMatch(source, /assets\/manipro\/manipro\.gif/);
});

test('les routes métier prévues sont préparées sans navigation anticipée', () => {
    for (const route of [
        'jantes.html',
        'jumelages.html',
        'roues-etroites.html',
        'reparations-modifications.html',
        'documents.html',
        'contact.html'
    ]) {
        assert.ok(source.includes(`data-protected-route="${route}"`), `route manquante : ${route}`);
    }

    assert.equal(source.match(/data-protected-route=/g)?.length, 7);
});

test('accueil ne contient aucune logique de profil, remise ou enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /(?:remise|blocage|device_token|device_enrollment_allowed)\s*:/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|crypto\.getRandomValues|Math\.random/);
});

test('tous les footers refondus exposent les deux liens juridiques officiels sécurisés', () => {
    const legalLink = '<a href="https://www.ermas.fr/mentions-legales" target="_blank" rel="noopener noreferrer">Mentions légales</a>';
    const privacyLink = '<a href="https://www.ermas.fr/politique-confidentialite" target="_blank" rel="noopener noreferrer">Politique de confidentialité</a>';

    for (const [file, pageSource] of redesignedSources) {
        assert.ok(pageSource.includes(legalLink), `lien Mentions légales incorrect dans ${file}`);
        assert.ok(pageSource.includes(privacyLink), `lien Politique de confidentialité incorrect dans ${file}`);
        assert.equal(pageSource.match(/class="app-footer__links"/g)?.length, 1, `footer juridique dupliqué dans ${file}`);
    }
});
