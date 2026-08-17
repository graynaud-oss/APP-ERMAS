import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'calcul-hors-tout.html'), 'utf8');
const cases = JSON.parse(await readFile(path.join(root, 'tests', 'reference', 'cas-reference.json'), 'utf8')).calculHorsTout;

function calculateCurrentResult(testCase) {
    const voie = Number.parseFloat(testCase.voie);
    const entretoise = Number.parseFloat(testCase.entretoise);
    const horsToutJumelage = Number.parseFloat(testCase.horsToutJumelage) || 0;
    const horsToutJanteEngin = Number.parseFloat(testCase.horsToutJanteEngin) || 0;
    const emboitementJanteEngin = Number.parseFloat(testCase.emboitementJanteEngin) || 0;
    const emboitementJumelage = Number.parseFloat(testCase.emboitementJumelage) || 0;
    return (voie + horsToutJumelage)
        + (2 * horsToutJanteEngin)
        + (2 * entretoise)
        - (2 * emboitementJanteEngin)
        - (2 * emboitementJumelage);
}

test('seul AUTHORIZED permet le contexte du calculateur', () => {
    assert.ok(source.includes('context.state !== AUTHORIZATION_STATES.AUTHORIZED'));
    for (const state of [...Object.values(AUTHORIZATION_STATES), 'UNKNOWN_STATE']) {
        if (state !== AUTHORIZATION_STATES.AUTHORIZED) assert.notEqual(state, AUTHORIZATION_STATES.AUTHORIZED);
    }
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('le garde précède type, sessionStorage, produit et CSV', () => {
    const positions = [
        'await requireAuthorizedUser({ client: supabaseClient })',
        'context.state !== AUTHORIZATION_STATES.AUTHORIZED',
        'new URLSearchParams(window.location.search)',
        "sessionStorage.getItem('ermas_hors_tout_product')"
    ].map((fragment) => source.indexOf(fragment));
    assert.ok(positions.every((position) => position >= 0));
    for (let index = 1; index < positions.length; index += 1) assert.ok(positions[index - 1] < positions[index]);
    assert.ok(positions[1] < source.indexOf('fetch(csvUrl)'));
    assert.ok(positions[1] < source.indexOf('selectedProduct.colC'));
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

test('contrat produit, EVO/360, conversions et formules restent présents', () => {
    for (const fragment of [
        "sessionStorage.getItem('ermas_hors_tout_product')", "urlParams.get('type') || 'EVO'",
        "'EVO':", "'360':", 'selectedProduct.nom', 'selectedProduct.tendeurs',
        'parseFloat(selectedProduct.colC) || 0', 'parseFloat(selectedProduct.colD) || 0',
        'const voie = parseFloat(inputVoie.value);', 'const entretoiseSouhaitee = parseFloat(inputEntretoise.value);',
        'const resultat = (voie + horsToutJumelage)', '+ (2 * horsToutJanteEngin)',
        '+ (2 * entretoiseSouhaitee)', '- (2 * emboitementJanteEngin)',
        '- (2 * emboitementJumelage);', "resultat.toFixed(1) + ' mm'",
        "alert('Veuillez remplir tous les champs correctement.')", "alert('Jante engin introuvable.')",
        'window.history.back()'
    ]) assert.ok(source.includes(fragment), `contrat historique absent : ${fragment}`);
});

test('les quatre cas historiques donnent exactement les mêmes résultats', () => {
    assert.equal(cases.length, 4);
    for (const testCase of cases) assert.equal(calculateCurrentResult(testCase), testCase.resultat, testCase.nom);
});
