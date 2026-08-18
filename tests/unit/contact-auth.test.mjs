import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'contact.html'), 'utf8');
const accueilSource = await readFile(path.join(root, 'accueil.html'), 'utf8');

test('Contact utilise le client partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('le garde précède les actions, le consentement Maps et l’affichage', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const listenerPosition = source.indexOf("document.querySelectorAll('[data-protected-route]')");
    const mapListenerPosition = source.indexOf("showMapButton.addEventListener('click'");
    const mapPosition = source.indexOf('contactMap.src = contactMap.dataset.mapSrc');
    const displayPosition = source.indexOf("contactView.classList.remove('hidden')");

    assert.ok(source.includes('id="contact-view" class="hidden'));
    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < listenerPosition);
    assert.ok(listenerPosition < mapListenerPosition);
    assert.ok(mapListenerPosition < mapPosition);
    assert.ok(mapPosition < displayPosition);
    assert.ok(source.includes('if (!pageAuthorized) return;'));
});

test('tout refus ou toute exception redirige vers index', () => {
    assert.ok(source.match(/window\.location\.href = 'index\.html'/g)?.length >= 3);
    assert.ok(source.includes('initPage().catch(() => {'));
    assert.ok(source.includes('pageAuthorized = false;'));
});

test('les retours vers accueil sont explicites', () => {
    assert.equal(source.match(/data-protected-route="accueil\.html"/g)?.length, 2);
    assert.doesNotMatch(source, /history\.back\s*\(/);
});

test('les coordonnées et contenus historiques sont conservés', () => {
    for (const text of [
        'Nous contacter',
        'Téléphone',
        '03 86 66 47 22',
        'tel:0386664722',
        'Email',
        'contact@ermas.fr',
        'mailto:contact@ermas.fr',
        'Adresse',
        'ZA Les Pelletiers',
        '89100 Soucy',
        'Retour à l\'accueil',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `contenu Contact manquant : ${text}`);
    }
});

test('la carte historique reste inactive avant le clic puis conserve son URL exacte', () => {
    assert.ok(source.includes('<iframe id="contact-map"'));
    assert.ok(source.includes('loading="lazy"'));
    assert.ok(source.includes('allowfullscreen'));
    assert.ok(source.includes('data-map-src="https://maps.google.com/maps?q=ERMAS+Soucy+ZA+Les+Pelletiers'));
    assert.doesNotMatch(source, /<iframe[^>]+\ssrc=/);
    assert.ok(source.includes('id="map-consent-panel"'));
    assert.ok(source.includes('id="show-map-button"'));
    assert.ok(source.includes('Afficher la carte'));
    assert.ok(source.includes("showMapButton.addEventListener('click'"));
    assert.ok(source.includes('if (!pageAuthorized) return;'));
    assert.ok(source.includes('contactMap.src = contactMap.dataset.mapSrc'));
    assert.ok(source.includes("mapConsentPanel.classList.add('hidden')"));
    assert.ok(source.includes("contactMapContainer.classList.remove('hidden')"));
    assert.ok(source.includes("}, { once: true });"));
});

test('Contact ne contient ni métier, ni profil, ni remise, ni CSV, ni Storage, ni enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /remise|blocage|device_token|device_enrollment_allowed/);
    assert.doesNotMatch(source, /supabaseClient\.storage|DOCUMENTS_BUCKET|\.getPublicUrl\s*\(|\.list\s*\(/);
    assert.doesNotMatch(source, /fetch\s*\(|\.csv|sessionStorage|localStorage|crypto\.getRandomValues|Math\.random/);
});

test('le bouton Contact de l’accueil pointe déjà vers la nouvelle page', () => {
    assert.ok(accueilSource.includes('data-protected-route="contact.html"'));
    assert.equal(accueilSource.match(/data-protected-route="contact\.html"/g)?.length, 1);
});

test('aucun consentement Maps n’est mémorisé et aucune écriture externe n’est ajoutée', () => {
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|\.from\(['"]profiles['"]\)|\.rpc\s*\(/);
});

test('Contact utilise le design ERMAS commun et le footer juridique', () => {
    for (const fragment of [
        'css/app-ermas.css', 'assets/brand/favicon.png', 'assets/brand/favicon.ico',
        'assets/brand/apple-touch-icon.png', 'app-shell catalog-page contact-page',
        'class="app-header"', 'class="app-logo-link"', 'class="app-footer"',
        'https://www.ermas.fr/mentions-legales', 'https://www.ermas.fr/politique-confidentialite',
        'target="_blank" rel="noopener noreferrer"'
    ]) assert.ok(source.includes(fragment), `fondation Contact absente : ${fragment}`);
});
