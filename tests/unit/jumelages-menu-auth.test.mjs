import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages.html'), 'utf8');
const accueilSource = await readFile(path.join(root, 'accueil.html'), 'utf8');

test('le menu Jumelages utilise le client partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('le garde précède l’activation et l’affichage du catalogue', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const listenerPosition = source.indexOf("document.querySelectorAll('[data-protected-route]')");
    const displayPosition = source.lastIndexOf("jumelagesView.classList.remove('hidden')");

    assert.ok(source.includes('id="jumelages-view" class="hidden'));
    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < listenerPosition);
    assert.ok(listenerPosition < displayPosition);
    assert.ok(source.includes('if (!pageAuthorized) return;'));
});

test('tout refus ou toute exception redirige vers index', () => {
    assert.ok(source.match(/window\.location\.href = 'index\.html'/g)?.length >= 3);
    assert.ok(source.includes('initPage().catch(() => {'));
    assert.ok(source.includes('pageAuthorized = false;'));
});

test('les parcours EVO et 360 sont exacts et fermés', () => {
    assert.ok(source.includes('data-protected-route="jumelages-choix.html?type=EVO"'));
    assert.ok(source.includes('data-protected-route="jumelages-choix.html?type=360"'));
    assert.doesNotMatch(source, /URLSearchParams|window\.location\.search/);
});

test('TGD et TGD+ conservent leurs valeurs et utilisent les routes encodées', () => {
    assert.ok(source.includes('data-gamme="TGD"'));
    assert.ok(source.includes('data-gamme="TGD+"'));
    assert.ok(source.includes('data-protected-route="jumelages-choix.html?type=TGD"'));
    assert.ok(source.includes('data-protected-route="jumelages-choix.html?type=TGD%2B"'));
    assert.doesNotMatch(source, /id="jumelages-tgd-view"|id="jumelages-tgd-plus-view"/);
    assert.doesNotMatch(source, /data-information-view|data-return-to-catalogue|showInformationView|showCatalogue/);
});

test('le retour vers accueil reste explicite et aucun history.back n’est utilisé', () => {
    assert.ok(source.includes('data-protected-route="accueil.html"'));
    assert.doesNotMatch(source, /history\.back\s*\(/);
});

test('le contenu historique du menu Jumelages est conservé', () => {
    for (const text of [
        'Catalogue Jumelages',
        'Sélectionnez le type de gamme :',
        '300 à 500 cv',
        '80 à 320 cv',
        '120 à 250 cv',
        '160 à 400 cv',
        'Consulter les fiches produits &amp; documentations techniques &rarr;',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `contenu Jumelages manquant : ${text}`);
    }
});

test('le menu ne contient ni métier, ni remise, ni CSV, ni enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /remise|blocage|device_token|device_enrollment_allowed/);
    assert.doesNotMatch(source, /fetch\s*\(|\.csv|sessionStorage|localStorage|crypto\.getRandomValues|Math\.random/);
});

test('le bouton Jumelages de l’accueil pointe déjà vers la nouvelle page', () => {
    assert.ok(accueilSource.includes('data-protected-route="jumelages.html"'));
    assert.equal(accueilSource.match(/data-protected-route="jumelages\.html"/g)?.length, 1);
});

test('le catalogue Jumelages utilise les fondations visuelles ERMAS locales', () => {
    assert.ok(source.includes('href="css/app-ermas.css"'));
    assert.ok(source.includes('src="assets/brand/ermas-logo.png"'));
    assert.ok(source.includes('assets/brand/favicon.ico'));
    assert.ok(source.includes('class="app-choice-grid"'));
    assert.ok(source.includes('class="app-footer"'));
    assert.doesNotMatch(source, /<img[^>]+(?:photo|unsplash|pexels)/i);
});
