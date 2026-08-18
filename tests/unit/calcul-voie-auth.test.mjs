import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'calcul-voie.html'), 'utf8');
const cases = JSON.parse(await readFile(path.join(root, 'tests', 'reference', 'cas-reference.json'), 'utf8')).calculVoie;

function calculateCurrentResult(testCase) {
    const fam = Number.parseFloat(testCase.fam);
    const dataI = Number.parseFloat(testCase.deportMaxI) || 0;
    const dataJ = Number.parseFloat(testCase.deportMinJ) || 0;
    return {
        voieMaxi: fam + (2 * dataI),
        voieMini: fam - (2 * dataJ)
    };
}

test('seul AUTHORIZED permet le contexte calculateur', () => {
    assert.ok(source.includes('context.state !== AUTHORIZATION_STATES.AUTHORIZED'));
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        if (state !== AUTHORIZATION_STATES.AUTHORIZED) assert.notEqual(state, AUTHORIZATION_STATES.AUTHORIZED);
    }
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('le garde précède sessionStorage, JSON et données produit', () => {
    const positions = [
        'await requireAuthorizedUser({ client: supabaseClient })',
        'context.state !== AUTHORIZATION_STATES.AUTHORIZED',
    ].map((fragment) => source.indexOf(fragment));
    assert.ok(positions.every((position) => position >= 0));
    assert.ok(positions[0] < positions[1]);

    const productReadPosition = source.indexOf("const selectedProduct = JSON.parse(sessionStorage.getItem('ermas_calc_product'));");
    const dataIPosition = source.indexOf('selectedProduct.deportMaxI');
    const dataJPosition = source.indexOf('selectedProduct.deportMinJ');
    assert.ok(positions[1] < productReadPosition);
    assert.ok(productReadPosition < dataIPosition);
    assert.ok(dataIPosition < dataJPosition);
});

test('le retour utilise une table fermée lue uniquement après autorisation', () => {
    const destinations = {
        'jantes-taille': 'jantes-taille.html',
        'jantes-pneu': 'jantes-pneu.html',
        'roues-etroites-taille': 'roues-etroites-taille.html',
        'roues-etroites-pneu': 'roues-etroites-pneu.html'
    };
    const destinationFor = (sourceParam) => destinations[sourceParam] || 'accueil.html';

    assert.equal(destinationFor('jantes-taille'), 'jantes-taille.html');
    assert.equal(destinationFor('jantes-pneu'), 'jantes-pneu.html');
    assert.equal(destinationFor('roues-etroites-taille'), 'roues-etroites-taille.html');
    assert.equal(destinationFor('roues-etroites-pneu'), 'roues-etroites-pneu.html');
    assert.equal(destinationFor(null), 'accueil.html');
    assert.equal(destinationFor('https://example.test'), 'accueil.html');

    const authorizedPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const sourceReadPosition = source.indexOf("urlParams.get('source')");
    assert.ok(authorizedPosition < sourceReadPosition);
    assert.ok(source.includes('const SOURCE_DESTINATIONS = Object.freeze({'));
    assert.ok(source.includes("backDestination = SOURCE_DESTINATIONS[sourceParam] || 'accueil.html';"));
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('client partagé, refus fermé et verrou local sont présents', () => {
    assert.ok(source.includes("import { getSupabaseClient } from './js/supabase-client.js'"));
    assert.ok(source.includes('const supabaseClient = getSupabaseClient();'));
    assert.doesNotMatch(source, /SUPABASE_URL|SUPABASE_ANON_KEY|supabase\.createClient/);
    assert.ok(source.includes('let pageAuthorized = false;'));
    assert.ok(source.includes('pageAuthorized = true;'));
    assert.ok(source.includes('if (!pageAuthorized) return;'));
});

test('aucune écriture administrative ni enrôlement n’est introduit', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)[\s\S]*?\.(?:insert|update|upsert)\s*\(/);
    assert.doesNotMatch(source, /(?:remise|blocage|device_token|device_enrollment_allowed)\s*:/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandomValues|ermas_device_token_pending/);
});

test('contrat, conversions, formules et affichage historiques restent présents', () => {
    for (const fragment of [
        "sessionStorage.getItem('ermas_calc_product')",
        'dataI = parseFloat(selectedProduct.deportMaxI) || 0;',
        'dataJ = parseFloat(selectedProduct.deportMinJ) || 0;',
        'const fam = parseFloat(inputFam.value);',
        'const voieMaxi = fam + (2 * dataI);',
        'const voieMini = fam - (2 * dataJ);',
        "voieMaxi.toFixed(1) + ' mm'", "voieMini.toFixed(1) + ' mm'",
        "alert('Veuillez renseigner une valeur valide pour la FAM.')",
        "window.location.href = 'jantes-taille.html'"
    ]) assert.ok(source.includes(fragment), `contrat historique absent : ${fragment}`);
});

test('les cinq cas historiques donnent exactement les mêmes résultats', () => {
    assert.equal(cases.length, 5);
    for (const testCase of cases) {
        assert.deepEqual(calculateCurrentResult(testCase), {
            voieMaxi: testCase.voieMaxi,
            voieMini: testCase.voieMini
        }, testCase.nom);
    }
});
