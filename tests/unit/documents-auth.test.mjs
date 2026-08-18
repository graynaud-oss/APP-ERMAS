import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'documents.html'), 'utf8');
const accueilSource = await readFile(path.join(root, 'accueil.html'), 'utf8');

function extractFunction(html, name) {
    const start = html.indexOf(`async function ${name}()`);
    if (start < 0) return '';

    let depth = 0;
    let opened = false;
    for (let index = start; index < html.length; index += 1) {
        if (html[index] === '{') {
            depth += 1;
            opened = true;
        } else if (html[index] === '}') {
            depth -= 1;
            if (opened && depth === 0) return html.slice(start, index + 1);
        }
    }

    return '';
}

test('Documents utilise le client partagé et le garde complet', () => {
    assert.ok(source.includes("from './js/supabase-client.js'"));
    assert.ok(source.includes("from './js/auth-guard.js'"));
    assert.ok(source.includes('await requireAuthorizedUser({ client: supabaseClient })'));
    assert.doesNotMatch(source, /supabase\.createClient|createClient\s*\(/);
});

test('le garde précède l’affichage et l’appel Storage', () => {
    const guardPosition = source.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED');
    const authorizationPosition = source.indexOf('pageAuthorized = true');
    const displayPosition = source.indexOf("documentsView.classList.remove('hidden')");
    const loadCallPosition = source.indexOf('await loadDocumentsFromStorage()');

    assert.ok(source.includes('id="documents-view" class="hidden'));
    assert.ok(guardPosition >= 0);
    assert.ok(guardPosition < authorizationPosition);
    assert.ok(authorizationPosition < displayPosition);
    assert.ok(displayPosition < loadCallPosition);
    assert.ok(source.includes('if (!pageAuthorized) return;'));
});

test('tout refus ou toute exception redirige vers index', () => {
    assert.ok(source.match(/window\.location\.href = 'index\.html'/g)?.length >= 3);
    assert.ok(source.includes('initPage().catch(() => {'));
    assert.ok(source.includes('pageAuthorized = false;'));
});

test('le bucket, le listing et le tri historiques sont inchangés', () => {
    assert.ok(source.includes("const DOCUMENTS_BUCKET = 'doc-app-ermas';"));
    assert.ok(source.includes('.from(DOCUMENTS_BUCKET)'));
    assert.ok(source.includes(".list('', {"));
    assert.ok(source.includes('limit: 100'));
    assert.ok(source.includes("sortBy: { column: 'name', order: 'asc' }"));
});

test('le filtre PDF, les noms et les URL publiques sont inchangés', () => {
    assert.ok(source.includes("data.filter(file => file.name && file.name.toLowerCase().endsWith('.pdf'))"));
    assert.ok(source.includes('.getPublicUrl(file.name)'));
    assert.ok(source.includes('const fileUrl = publicUrlData.publicUrl;'));
    assert.ok(source.includes('file.name.replace(/\\.[^/.]+$/, "").replace(/[-_]/g, " ")'));
});

test('la logique Storage conserve tous les marqueurs fonctionnels de référence', () => {
    const extracted = extractFunction(source, 'loadDocumentsFromStorage');

    for (const marker of [
        'Actualisation des documents...',
        '.from(DOCUMENTS_BUCKET)',
        ".list('', {",
        'limit: 100',
        "sortBy: { column: 'name', order: 'asc' }",
        "endsWith('.pdf')",
        'Aucun document disponible pour le moment.',
        '.getPublicUrl(file.name)',
        'Erreur lors du chargement : ${error.message}',
        'errorPanel.textContent',
        'title.textContent = cleanName',
        'viewLink.href = fileUrl',
        "viewLink.target = '_blank'",
        "viewLink.rel = 'noopener noreferrer'",
        'Format PDF',
        "downloadLink.download = ''",
        'Télécharger',
        'container.replaceChildren(documentItems)'
    ]) {
        assert.ok(extracted.includes(marker), `marqueur extrait absent : ${marker}`);
    }
});

test('le contenu visuel et les messages historiques sont conservés', () => {
    for (const text of [
        'Documents Techniques',
        'Fiches techniques et documentations officielles en libre téléchargement.',
        'Chargement des documents...',
        'Actualisation des documents...',
        'Aucun document disponible pour le moment.',
        'Format PDF',
        'Voir',
        'Télécharger',
        '&copy; 2026 ERMAS - Tous droits réservés.'
    ]) {
        assert.ok(source.includes(text), `contenu Documents manquant : ${text}`);
    }
});

test('le retour et le bouton Documents de l’accueil utilisent les routes explicites', () => {
    assert.ok(source.includes('data-protected-route="accueil.html"'));
    assert.doesNotMatch(source, /history\.back\s*\(/);
    assert.ok(accueilSource.includes('data-protected-route="documents.html"'));
    assert.equal(accueilSource.match(/data-protected-route="documents\.html"/g)?.length, 1);
});

test('Documents ne contient ni écriture profil, ni remise, ni CSV, ni enrôlement', () => {
    assert.doesNotMatch(source, /\.from\(['"]profiles['"]\)|\.insert\s*\(|\.update\s*\(|\.upsert\s*\(/);
    assert.doesNotMatch(source, /\.rpc\s*\(|initializeAuthorizedDeviceEnrollment|initialize_own_device_token/);
    assert.doesNotMatch(source, /remise|blocage|device_token|device_enrollment_allowed/);
    assert.doesNotMatch(source, /fetch\s*\(|\.csv|sessionStorage|localStorage|crypto\.getRandomValues|Math\.random/);
});

test('Documents utilise les fondations visuelles ERMAS locales', () => {
    for (const fragment of [
        'href="css/app-ermas.css"',
        'href="assets/brand/favicon.png"',
        'href="assets/brand/favicon.ico"',
        'href="assets/brand/apple-touch-icon.png"',
        'class="hidden app-shell catalog-page documents-page"',
        'class="app-header"',
        'class="app-page-panel documents-panel"',
        'class="app-footer"',
        'https://www.ermas.fr/mentions-legales',
        'https://www.ermas.fr/politique-confidentialite'
    ]) assert.ok(source.includes(fragment), `fondation visuelle absente : ${fragment}`);

    assert.doesNotMatch(source, /fonts\.(?:googleapis|gstatic)\.com|googleusercontent\.com/);
});
