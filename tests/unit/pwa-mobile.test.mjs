import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    configureInstallPage,
    INSTALL_NOTICE_STORAGE_KEY,
    isIosDevice,
    isIosSafari,
    isMobileOrTablet,
    isStandalone,
    markInstallNoticeSeen,
    shouldShowInstallNotice
} from '../../js/pwa.js';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('service-worker.js');
const installer = read('installer.html');
const accueil = read('accueil.html');
const index = read('index.html');

test('le manifeste PWA décrit ERMAS Technique et ses icônes existantes', () => {
    assert.equal(manifest.name, 'ERMAS Technique');
    assert.equal(manifest.short_name, 'ERMAS');
    assert.equal(manifest.description, 'Plateforme technique ERMAS réservée aux revendeurs.');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.background_color, '#ffffff');
    assert.equal(manifest.theme_color, '#ffffff');
    for (const icon of manifest.icons) {
        assert.ok(fs.existsSync(new URL(`.${icon.src}`, root)));
        assert.equal(icon.type, 'image/png');
    }
    assert.deepEqual(manifest.icons.map(({ sizes }) => sizes), ['192x192', '512x512']);
    assert.ok(fs.existsSync(new URL('assets/brand/apple-touch-icon.png', root)));
});

test('les pages d’entrée déclarent la PWA mobile sans contourner Auth', () => {
    for (const page of [index, accueil, installer]) {
        assert.match(page, /rel="manifest" href="\/manifest\.webmanifest"/);
        assert.match(page, /name="theme-color" content="#ffffff"/);
        assert.match(page, /apple-mobile-web-app-capable/);
        assert.match(page, /apple-mobile-web-app-status-bar-style/);
        assert.match(page, /apple-mobile-web-app-title/);
        assert.match(page, /viewport-fit=cover/);
        assert.match(page, /\/js\/pwa\.js/);
    }
    assert.match(installer, /requireAuthorizedUser/);
    assert.match(installer, /AUTHORIZATION_STATES\.AUTHORIZED/);
    assert.match(installer, /window\.location\.href = 'index\.html'/);
});

test('le service worker ne met en cache qu’une allowlist statique sûre', () => {
    assert.match(worker, /ermas-static-v1/);
    assert.match(worker, /STATIC_ASSETS/);
    assert.match(worker, /STATIC_PATHS\.has\(url\.pathname\)/);
    assert.match(worker, /self\.skipWaiting\(\)/);
    assert.match(worker, /self\.clients\.claim\(\)/);
    assert.match(worker, /name\.startsWith\('ermas-static-'\)/);
    assert.doesNotMatch(worker, /docs\.google(?:usercontent)?\.com/);
    assert.doesNotMatch(worker, /supabase\.co/);
    assert.doesNotMatch(worker, /cache\.put/);
    assert.match(worker, /url\.origin !== self\.location\.origin[\s\S]*fetch\(request\)/);
    assert.match(worker, /event\.respondWith\(fetch\(request\)\)/);
});

test('l’enregistrement du service worker est racine, silencieux et non bloquant', () => {
    const pwa = read('js/pwa.js');
    assert.match(pwa, /serviceWorker\.register\('\/service-worker\.js', \{ scope: '\/' \}\)/);
    assert.match(pwa, /catch \{[\s\S]*return null/);
    assert.match(pwa, /window\.addEventListener\('load'/);
});

test('Android, iOS, standalone et desktop sont distingués sans CTA PC', () => {
    assert.equal(isMobileOrTablet({ userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 1 }), true);
    assert.equal(isMobileOrTablet({ userAgent: 'Mozilla/5.0 (iPhone)', maxTouchPoints: 5 }), true);
    assert.equal(isMobileOrTablet({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 }), false);
    assert.equal(isIosSafari({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari', maxTouchPoints: 5 }), true);
    assert.equal(isIosSafari({ userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit CriOS Safari', maxTouchPoints: 5 }), false);
    assert.equal(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad)', maxTouchPoints: 5 }), true);
    assert.equal(isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
    assert.match(installer, /id="install-button"[^>]*class="hidden/);
    assert.match(installer, /L’installation est proposée uniquement sur téléphone et tablette/);
});

test('la configuration n’affiche jamais le CTA Android sur iOS ou desktop', () => {
    const element = () => ({ classList: { removed: [], remove(name) { this.removed.push(name); } } });
    const buildPanels = () => ({ button: element(), androidPanel: element(), iosPanel: element(), iosUnsupportedMessage: element(), desktopMessage: element() });
    const safariPanels = buildPanels();
    assert.equal(configureInstallPage(safariPanels, { matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari', maxTouchPoints: 5 } }), 'ios');
    assert.deepEqual(safariPanels.iosPanel.classList.removed, ['hidden']);
    assert.deepEqual(safariPanels.androidPanel.classList.removed, []);
    const chromeIosPanels = buildPanels();
    assert.equal(configureInstallPage(chromeIosPanels, { matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit CriOS Safari', maxTouchPoints: 5 } }), 'ios-unsupported');
    assert.deepEqual(chromeIosPanels.androidPanel.classList.removed, []);
    assert.deepEqual(chromeIosPanels.iosPanel.classList.removed, []);
    assert.deepEqual(chromeIosPanels.iosUnsupportedMessage.classList.removed, ['hidden']);
    const desktopPanels = buildPanels();
    assert.equal(configureInstallPage(desktopPanels, { matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 } }), 'desktop');
    assert.deepEqual(desktopPanels.androidPanel.classList.removed, []);
    assert.deepEqual(desktopPanels.desktopMessage.classList.removed, ['hidden']);
});

test('la page installer fournit uniquement les parcours Android et Safari demandés', () => {
    assert.match(accueil, /data-protected-route="installer\.html"/);
    assert.match(accueil, /INSTALLER L’APP/);
    assert.match(installer, /INSTALLER ERMAS/);
    assert.match(installer, /Touchez le bouton Partager de Safari/);
    assert.match(installer, /Sur l’écran d’accueil/);
    assert.match(installer, /Ouvrir comme app web/);
    assert.doesNotMatch(installer, /Windows|macOS|Linux/);
});

test('la notice d’installation apparaît une seule fois sur mobile non standalone', () => {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
    const mobileWindow = {
        matchMedia: () => ({ matches: false }),
        navigator: { userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit Safari', maxTouchPoints: 5 }
    };

    assert.equal(shouldShowInstallNotice({ windowObject: mobileWindow, storage }), true);
    assert.equal(markInstallNoticeSeen(storage), true);
    assert.equal(values.get(INSTALL_NOTICE_STORAGE_KEY), 'true');
    assert.equal(shouldShowInstallNotice({ windowObject: mobileWindow, storage }), false);
});

test('la notice reste absente en standalone et sur desktop', () => {
    const unseenStorage = { getItem: () => null };
    assert.equal(shouldShowInstallNotice({
        windowObject: { matchMedia: () => ({ matches: true }), navigator: { userAgent: 'Mozilla/5.0 (iPhone)' } },
        storage: unseenStorage
    }), false);
    assert.equal(shouldShowInstallNotice({
        windowObject: { matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0 } },
        storage: unseenStorage
    }), false);
});

test('la notice accueil est non bloquante, accessible et mémorisée après chaque action', () => {
    assert.match(accueil, /id="install-notice"[^>]*class="hidden app-notice pwa-install-notice"/);
    assert.match(accueil, /Installer ERMAS Technique/);
    assert.match(accueil, /VOIR COMMENT L’INSTALLER/);
    assert.match(accueil, /id="install-notice-dismiss"[^>]*aria-label="Masquer cette information"/);
    assert.match(accueil, /installNoticeOpen\.addEventListener[\s\S]*markInstallNoticeSeen\(\)[\s\S]*window\.location\.href = 'installer\.html'/);
    assert.match(accueil, /installNoticeDismiss\.addEventListener[\s\S]*markInstallNoticeSeen\(\)[\s\S]*installNotice\.classList\.add\('hidden'\)/);
    assert.match(accueil, /button\.dataset\.protectedRoute === 'installer\.html'[\s\S]*markInstallNoticeSeen\(\)/);
    assert.ok(accueil.indexOf('context.state !== AUTHORIZATION_STATES.AUTHORIZED') < accueil.indexOf('shouldShowInstallNotice()'));
});

test('le guide Safari présente l’installation avant le transfert sans créer de ticket automatiquement', () => {
    const stepOne = installer.indexOf('Étape 1');
    const stepTwo = installer.indexOf('Étape 2');
    const clickHandler = installer.indexOf("prepareTransferButton.addEventListener('click'");
    const ticketCall = installer.indexOf('await createDeviceTransferTicket');
    assert.ok(stepOne >= 0 && stepOne < stepTwo);
    assert.ok(stepTwo < clickHandler && clickHandler < ticketCall);
    assert.match(installer, /Ajouter l’application/);
    assert.match(installer, /Transférer votre accès/);
    assert.match(installer, /Ce code est valable 10 minutes et ne peut être utilisé qu’une seule fois/);
    assert.match(installer, /Copiez ce code[\s\S]*Ouvrez ERMAS Technique[\s\S]*Connectez-vous[\s\S]*Collez le code/);
    assert.doesNotMatch(installer, /localStorage[^\n]*(?:ticket|code)/i);
});

test('un navigateur iOS non Safari reçoit seulement l’instruction Safari', () => {
    assert.match(installer, /id="ios-unsupported"[^>]*class="hidden/);
    assert.match(installer, /Pour installer ERMAS Technique sur iPhone ou iPad, ouvrez cette page dans Safari/);
    assert.ok(installer.indexOf('id="ios-unsupported"') > installer.indexOf('</div>'));
});

test('Android conserve beforeinstallprompt et son bouton natif sans ticket imposé', () => {
    const pwa = read('js/pwa.js');
    const androidBlock = installer.slice(installer.indexOf('id="android-install"'), installer.indexOf('id="ios-install"'));
    assert.match(pwa, /beforeinstallprompt/);
    assert.match(pwa, /deferredInstallPrompt\.prompt\(\)/);
    assert.match(androidBlock, /id="install-button"/);
    assert.match(androidBlock, /INSTALLER ERMAS/);
    assert.doesNotMatch(androidBlock, /transfert|ticket|code/i);
});

test('la page hors ligne ne contient aucun prix ni donnée métier de secours', () => {
    const offline = read('offline.html');
    assert.match(offline, /Connexion requise/);
    assert.match(offline, /données techniques et tarifaires nécessitent une connexion internet/);
    assert.doesNotMatch(offline, /Prix|€|Supabase|CSV/);
});
