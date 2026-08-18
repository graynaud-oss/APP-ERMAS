import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jumelages-information.html'), 'utf8');
const menuSource = await readFile(path.join(root, 'jumelages.html'), 'utf8');

test('la page information utilise le client partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('le garde précède strictement la lecture du paramètre type', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const parameterPosition = source.indexOf('new URLSearchParams(window.location.search)');
    const displayPosition = source.indexOf("informationView.classList.remove('hidden')");

    assert.ok(source.includes('id="information-view" class="hidden'));
    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < parameterPosition);
    assert.ok(parameterPosition < displayPosition);
});

test('tout refus ou toute exception redirige vers index', () => {
    assert.ok(source.match(/window\.location\.href = 'index\.html'/g)?.length >= 3);
    assert.ok(source.includes('initPage().catch(() => {'));
    assert.ok(source.includes('pageAuthorized = false;'));
});

test('seules les valeurs TGD et TGD+ sont acceptées', () => {
    assert.ok(source.includes('const INFORMATION_BY_TYPE = Object.freeze({'));
    assert.ok(source.includes('TGD: Object.freeze({'));
    assert.ok(source.includes("'TGD+': Object.freeze({"));
    assert.ok(source.includes('Object.hasOwn(INFORMATION_BY_TYPE, type)'));
    assert.ok(source.includes("window.location.href = 'jumelages.html'"));
    assert.doesNotMatch(source, /innerHTML/);
});

test('les routes TGD et TGD+ utilisent les valeurs et encodages exacts', () => {
    assert.ok(menuSource.includes('jumelages-information.html?type=TGD"'));
    assert.ok(menuSource.includes('jumelages-information.html?type=TGD%2B"'));
    assert.doesNotMatch(menuSource, /jumelages-information\.html\?type=TGD\+"/);
});

test('les deux contenus informatifs historiques et puissances sont conservés', () => {
    for (const text of [
        'Catalogue Jumelages - TGD',
        'Catalogue Jumelages - TGD+',
        '120 à 250 cv',
        '160 à 400 cv',
        'Contenu de la rubrique Jumelages TGD en cours de configuration.',
        'Contenu de la rubrique Jumelages TGD+ en cours de configuration.',
        'Sélectionnez une option :',
        'Retour au catalogue',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `contenu informatif manquant : ${text}`);
    }
});

test('les retours vers Jumelages sont explicites', () => {
    assert.equal(source.match(/data-protected-route="jumelages\.html"/g)?.length, 2);
    assert.doesNotMatch(source, /history\.back\s*\(/);
});

test('la page ne contient ni métier, ni profil, ni remise, ni CSV, ni enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /remise|blocage|device_token|device_enrollment_allowed/);
    assert.doesNotMatch(source, /fetch\s*\(|\.csv|sessionStorage|localStorage|crypto\.getRandomValues|Math\.random/);
});

test('EVO et 360 restent inchangés et les anciennes sous-vues ont disparu', () => {
    assert.ok(menuSource.includes('jumelages-choix.html?type=EVO'));
    assert.ok(menuSource.includes('jumelages-choix.html?type=360'));
    assert.doesNotMatch(menuSource, /id="jumelages-tgd-view"|id="jumelages-tgd-plus-view"/);
    assert.doesNotMatch(menuSource, /showInformationView|showCatalogue|data-information-view|data-return-to-catalogue/);
});
