import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const css = await readFile(path.join(root, 'css', 'app-ermas.css'), 'utf8');
const navigation = await readFile(path.join(root, 'js', 'home-navigation.js'), 'utf8');
const accueil = await readFile(path.join(root, 'accueil.html'), 'utf8');
const index = await readFile(path.join(root, 'index.html'), 'utf8');

const protectedPages = [
    'calcul-hors-tout.html', 'calcul-voie.html', 'contact.html', 'documents.html', 'installer.html',
    'jantes-pneu.html', 'jantes-taille.html', 'jantes.html', 'jumelages-choix.html',
    'jumelages-information.html', 'jumelages-jantes-pneu.html', 'jumelages-jantes-taille.html',
    'jumelages-pieces-360.html', 'jumelages-pieces-evo.html', 'jumelages.html', 'manipro.html',
    'reparations-famille.html', 'reparations-modifications.html', 'reparations-prestation.html',
    'roues-etroites-pneu.html', 'roues-etroites-taille.html', 'roues-etroites.html'
];

test('le header est sticky, opaque et placé au-dessus du contenu', () => {
    assert.match(css, /\.app-header\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?z-index:\s*40;/);
    assert.match(css, /\.app-header\s*\{[\s\S]*?background:\s*rgba\(255, 255, 255, 0\.94\)/);
});

test('le header respecte la safe area iOS', () => {
    assert.match(css, /\.app-header\s*\{[\s\S]*?padding-top:\s*env\(safe-area-inset-top\)/);
});

test('la navigation déplace Retour et Accueil dans le header et retire Déconnexion', () => {
    assert.match(navigation, /backButton/);
    assert.match(navigation, /link\.href = 'index\.html'/);
    assert.match(navigation, /\[data-global-logout\]/);
    assert.match(navigation, /logoutButton\.remove\(\)/);
    assert.match(navigation, /headerInner\.append\(actions\)/);
});

test('la destination Accueil historique reste index.html', () => {
    assert.match(navigation, /link\.href = 'index\.html'/);
    assert.doesNotMatch(navigation, /link\.href = 'accueil\.html'/);
});

test('le module ne modifie ni Auth, ni Supabase, ni les tokens', () => {
    assert.doesNotMatch(navigation, /supabase|requireAuthorizedUser|device_token|localStorage|sessionStorage|signOut/i);
});

test('toutes les pages protégées avec un Retour chargent la navigation de header', async () => {
    for (const file of protectedPages) {
        const source = await readFile(path.join(root, file), 'utf8');
        assert.match(source, /home-navigation\.js/, file);
        assert.match(source, /data-global-logout/, file);
        assert.match(source, /app-page-header/, file);
    }
});

test('l’accueil ne contient aucun lien Accueil vers lui-même', () => {
    assert.doesNotMatch(accueil, /data-home-link|home-navigation\.js/);
    assert.match(accueil, /data-global-logout/);
});

test('l’accueil place son unique bouton Déconnexion après les ressources et avant le footer', () => {
    assert.equal((accueil.match(/data-global-logout/g) || []).length, 1);
    assert.ok(accueil.indexOf('home-resources-title') < accueil.indexOf('data-global-logout'));
    assert.ok(accueil.indexOf('data-global-logout') < accueil.indexOf('<footer'));
});

test('la page de connexion ne reçoit aucune action applicative', () => {
    assert.doesNotMatch(index, /data-global-logout|home-navigation\.js|app-back-button/);
});

test('le header mobile répartit les deux actions sur une ligne compacte', () => {
    assert.match(css, /\.app-header-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(82px, 1fr\)\)/);
    assert.match(css, /\.app-header-actions \.app-back-button,[\s\S]*?min-height:\s*40px/);
    assert.match(css, /\.app-header__inner:has\(\.app-header-actions\)\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
    assert.match(css, /\.app-header-actions\s*\{[\s\S]*?width:\s*auto/);
    assert.doesNotMatch(css, /\.app-header-actions\s*\{[^}]*width:\s*100%/s);
    assert.doesNotMatch(css, /\.app-header-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
});

test('Retour et Accueil ne reçoivent aucune flèche décorative', () => {
    assert.doesNotMatch(css, /\.app-back-button::before/);
    assert.doesNotMatch(navigation, /←|→|\\2190|\\2192/);
});

test('la zone de déconnexion est clairement séparée des dernières cartes', () => {
    assert.match(css, /\.home-logout\s*\{[\s\S]*?margin-top:\s*44px;[\s\S]*?padding-top:\s*22px;[\s\S]*?border-top:/);
});

test('le déplacement réutilise le bouton Retour sans recréer de déconnexion', () => {
    assert.match(navigation, /actions\.append\(backButton\)/);
    assert.doesNotMatch(navigation, /actions\.append\(logoutButton\)/);
    assert.doesNotMatch(navigation, /textContent = 'Retour'|textContent = 'Se déconnecter'/);
});
