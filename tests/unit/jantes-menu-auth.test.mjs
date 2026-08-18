import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jantes.html'), 'utf8');
const accueilSource = await readFile(path.join(root, 'accueil.html'), 'utf8');

test('le menu Jantes utilise le client partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('le garde précède toute activation et tout affichage du menu', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const listenerPosition = source.indexOf("document.querySelectorAll('[data-protected-route]')");
    const displayPosition = source.indexOf("jantesView.classList.remove('hidden')");

    assert.ok(source.includes('id="jantes-view" class="hidden'));
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

test('la navigation Jantes est explicite et déterministe', () => {
    assert.ok(source.includes('data-protected-route="accueil.html"'));
    assert.ok(source.includes('data-protected-route="jantes-taille.html"'));
    assert.ok(source.includes('data-protected-route="jantes-pneu.html"'));
    assert.doesNotMatch(source, /history\.back\s*\(/);
    assert.equal(source.match(/data-protected-route=/g)?.length, 3);
});

test('le contenu historique de la vue Jantes est conservé', () => {
    for (const text of [
        'Catalogue Jantes',
        'Choisissez votre mode de recherche :',
        'Par taille de jante',
        'Recherche directe par dimensions de jante',
        'Par taille de pneu',
        'Recherche indicative par dimension de pneu',
        'Avertissement important :',
        'Il est impératif de vérifier la correspondance et la faisabilité auprès des données techniques du manufacturier avant toute commande.',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `contenu Jantes manquant : ${text}`);
    }
    assert.doesNotMatch(source, /Par taille de jantes|Par taille de pneus/);
});

test('le menu ne contient ni métier, ni remise, ni CSV, ni enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /remise|blocage|device_token|device_enrollment_allowed/);
    assert.doesNotMatch(source, /fetch\s*\(|\.csv|sessionStorage|localStorage|crypto\.getRandomValues|Math\.random/);
});

test('le bouton Jantes de l’accueil pointe déjà vers la nouvelle page', () => {
    assert.ok(accueilSource.includes('data-protected-route="jantes.html"'));
    assert.equal(accueilSource.match(/data-protected-route="jantes\.html"/g)?.length, 1);
});

test('le catalogue Jantes utilise les fondations visuelles ERMAS locales', () => {
    assert.ok(source.includes('href="css/app-ermas.css"'));
    assert.ok(source.includes('src="assets/brand/ermas-logo.png"'));
    assert.ok(source.includes('assets/brand/favicon.ico'));
    assert.ok(source.includes('class="app-choice-grid"'));
    assert.ok(source.includes('class="app-footer"'));
    assert.doesNotMatch(source, /<img[^>]+(?:photo|unsplash|pexels)/i);
});
