import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import { AUTHORIZATION_STATES } from '../../js/auth-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'jantes-taille.html'), 'utf8');
const sharedStyles = await readFile(path.join(root, 'css', 'app-ermas.css'), 'utf8');

function pageDecision(state) {
    return state === AUTHORIZATION_STATES.AUTHORIZED ? 'LOAD' : 'INDEX';
}

test('seul AUTHORIZED permet le chargement tarifaire', () => {
    assert.equal(pageDecision(AUTHORIZATION_STATES.AUTHORIZED), 'LOAD');

    for (const state of [
        AUTHORIZATION_STATES.NO_SESSION,
        AUTHORIZATION_STATES.ACCOUNT_BLOCKED,
        AUTHORIZATION_STATES.PROFILE_INCOMPLETE,
        AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING,
        AUTHORIZATION_STATES.DEVICE_MISMATCH,
        AUTHORIZATION_STATES.ENROLLMENT_PENDING_ADMIN,
        AUTHORIZATION_STATES.ENROLLMENT_ALLOWED,
        AUTHORIZATION_STATES.SESSION_ERROR,
        AUTHORIZATION_STATES.PROFILE_FETCH_ERROR,
        'UNKNOWN_STATE'
    ]) {
        assert.equal(pageDecision(state), 'INDEX', `l’état ${state} doit être refusé`);
    }
});

test('le garde complet précède la remise et le chargement CSV', () => {
    const guardPosition = source.indexOf('await requireAuthorizedUser({ client: supabaseClient })');
    const authorizedPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const remisePosition = source.indexOf('context.profile.remise');
    const fetchPosition = source.indexOf('fetch(SHEET_CSV_URL)');

    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizedPosition);
    assert.ok(authorizedPosition < remisePosition);
    assert.ok(remisePosition < fetchPosition);
    assert.ok(source.includes("window.location.href = 'index.html'"));
});

test('la remise provient exclusivement du contexte autorisé', () => {
    assert.ok(source.includes('parseFloat(context.profile.remise) || 0'));
    assert.doesNotMatch(source, /\.select\(['"]remise['"]\)/);
    assert.doesNotMatch(source, /(?:remise|blocage|device_token|device_enrollment_allowed)\s*:/);
});

test('aucune écriture de profil, RPC ou génération de token n’est introduite', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)[\s\S]*?\.(?:insert|update|upsert)\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /Math\.random|crypto\.getRandomValues|ermas_device_token_pending/);
    assert.doesNotMatch(source, /resetDevice|changeDevice|enableEnrollment|clearServerToken/);
});

test('le client partagé remplace la configuration locale', () => {
    assert.ok(source.includes("import { getSupabaseClient } from './js/supabase-client.js'"));
    assert.ok(source.includes('const supabaseClient = getSupabaseClient();'));
    assert.doesNotMatch(source, /SUPABASE_URL|SUPABASE_ANON_KEY|supabase\.createClient/);
});

test('les filtres et le calculateur restent inactifs avant autorisation', () => {
    assert.ok(source.includes('let pageAuthorized = false;'));
    assert.ok(source.includes('pageAuthorized = true;'));
    assert.ok(source.split('if (!pageAuthorized) return;').length - 1 >= 4);
});

test('le retour utilise toujours la destination explicite du menu Jantes', () => {
    assert.ok(source.includes("onclick=\"window.location.href = 'jantes.html'\""));
    assert.doesNotMatch(source, /(?:window\.)?history\.back\s*\(/);
    assert.doesNotMatch(source, /document\.referrer/);
});

test('le parser, les prix VF/VV et la navigation historique sont inchangés', () => {
    for (const fragment of [
        "text.split('\\n')",
        "lines[i].split(',').map(val => val.trim().replace(/^\"|\"$/g, ''))",
        'const finalVF = userRemise > 0 ? baseVF * (1 - userRemise / 100) : baseVF;',
        'const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;',
        "sessionStorage.setItem('ermas_calc_product', JSON.stringify(product))",
        "window.location.href = 'calcul-voie.html?source=jantes-taille'"
    ]) {
        assert.ok(source.includes(fragment), `fragment métier absent : ${fragment}`);
    }
});

test('le module commun pilote une préférence de session indépendante', () => {
    assert.ok(source.includes("from './js/net-price-visibility.js'"));
    assert.ok(source.includes('netPriceVisible = isNetPriceVisible();'));
    assert.ok(source.includes('netPriceVisible = setNetPriceVisible(netPriceToggle.checked);'));
    assert.doesNotMatch(source, /localStorage/);
    assert.ok(source.includes('ermas_calc_product'));
});

test('un seul basculeur accessible contrôle tous les prix NET', () => {
    assert.equal(source.match(/id="net-price-toggle"/g)?.length, 1);
    assert.ok(source.includes('Prix NET'));
    assert.ok(source.includes('aria-label="Afficher ou masquer les prix NET"'));
    assert.ok(source.includes('type="checkbox" disabled'));
    assert.ok(source.includes("resultsContent.querySelectorAll('[data-net-price]')"));
    assert.ok(source.includes('element.hidden = !netPriceVisible'));
    assert.ok(source.includes("netPriceControl.classList.toggle('hidden', !hasNetPrice)"));
});

test('les nouveaux résultats respectent la préférence sans flash du NET', () => {
    assert.equal(source.match(/data-net-price \$\{netPriceVisible/g)?.length, 2);
    assert.equal(source.match(/\$\{netPriceVisible \? '' : 'hidden'\}/g)?.length, 2);

    const renderPosition = source.indexOf('resultsContent.innerHTML = html;');
    const visibilityPosition = source.indexOf('updateNetPriceVisibility();', renderPosition);
    const displayPosition = source.indexOf("resultsContainer.classList.remove('hidden');", renderPosition);

    assert.ok(renderPosition >= 0);
    assert.ok(renderPosition < visibilityPosition);
    assert.ok(visibilityPosition < displayPosition);
});

test('le rendu emploie exclusivement Prix BRUT et Prix NET sans taux visible', () => {
    assert.ok(source.match(/Prix BRUT/g)?.length >= 4);
    assert.ok(source.match(/Prix NET/g)?.length >= 2);
    assert.ok(source.match(/class="results-price-block"/g)?.length >= 4);
    assert.ok(source.includes('class="results-primary-action"'));
    assert.doesNotMatch(source, /Remise\s*:|Remise appliquée|Réduction|Économie|Prix NET\s*\([^)]*%/i);
});

test('le basculeur ne modifie ni les formules ni les sources tarifaires', () => {
    assert.ok(source.includes('const finalVF = userRemise > 0 ? baseVF * (1 - userRemise / 100) : baseVF;'));
    assert.ok(source.includes('const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;'));
    assert.ok(source.includes('gid=1966421754&single=true&output=csv'));
    assert.doesNotMatch(source, /history\.back|window\.history\.back|document\.referrer/);
});

test('Jantes Taille utilise le design commun et le footer légal', () => {
    for (const fragment of ['css/app-ermas.css', 'assets/brand/ermas-logo.png', 'assets/brand/favicon.ico', 'results-search-panel', 'results-section', 'class="app-footer"']) {
        assert.ok(source.includes(fragment), `fondation visuelle absente : ${fragment}`);
    }
    assert.ok(source.includes('href="https://www.ermas.fr/mentions-legales" target="_blank" rel="noopener noreferrer"'));
    assert.ok(source.includes('href="https://www.ermas.fr/politique-confidentialite" target="_blank" rel="noopener noreferrer"'));
});

test('le bouton Estimer reste blanc sur bleu avec hover rouge réservé à la souris', () => {
    assert.match(sharedStyles, /\.results-primary-action\s*\{[\s\S]*?background:\s*var\(--ermas-blue\);[\s\S]*?color:\s*#ffffff\s*!important;/);
    assert.match(sharedStyles, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.results-content button:hover[\s\S]*?background:\s*var\(--ermas-red\);/);
    assert.match(sharedStyles, /\.results-content button:focus-visible[\s\S]*?outline:/);
    assert.match(sharedStyles, /\.results-content button:active[\s\S]*?transform:/);
});

test('Jantes Taille croise la dimension technique uniquement lorsque VV est absente', () => {
    assert.ok(source.includes("from './js/wheel-dimension-index.js'"));
    assert.ok(source.includes('const hasValidVariablePrice = Boolean(match.prixVV && !isNaN(parseFloat(match.prixVV)));'));
    assert.ok(source.includes('diameter: match.diametre'));
    assert.ok(source.includes('width: match.largeurJante'));
    assert.ok(source.includes('variableWayState === VARIABLE_WAY_STATES.PRICE'));
    assert.ok(source.includes('variableWayState === VARIABLE_WAY_STATES.NARROW_WHEELS'));
    assert.ok(source.includes('const baseVV = parseFloat(match.prixVV);'));
    assert.ok(source.includes('const finalVV = userRemise > 0 ? baseVV * (1 - userRemise / 100) : baseVV;'));
});
