import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    createAdminNotice,
    deleteAdminNotice,
    fetchAdminNotices,
    fetchAvailableNotices,
    fetchNoticeReadIds,
    getUnreadNotices,
    markNoticeRead,
    updateAdminNotice,
    validateNotice
} from '../../js/app-notices.js';
import { renderNoticeContent } from '../../js/notices-ui.js';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const accueil = read('accueil.html');
const admin = read('admin-informations.html');
const adminScript = read('js/admin-notices.js');
const dataScript = read('js/app-notices.js');
const uiScript = read('js/notices-ui.js');
const css = read('css/app-ermas.css');

function queryClient(response = { data: [], error: null }) {
    const calls = [];
    const builder = {
        select(...args) { calls.push(['select', ...args]); return this; },
        order(...args) { calls.push(['order', ...args]); return Promise.resolve(response); },
        eq(...args) { calls.push(['eq', ...args]); return this; },
        insert(...args) { calls.push(['insert', ...args]); return this; },
        update(...args) { calls.push(['update', ...args]); return this; },
        delete(...args) { calls.push(['delete', ...args]); return this; },
        single() { calls.push(['single']); return Promise.resolve(response); },
        then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
    };
    return {
        calls,
        from(table) { calls.push(['from', table]); return builder; }
    };
}

const validNotice = (overrides = {}) => ({
    title: 'Information ERMAS',
    message: 'Message destiné aux revendeurs.',
    type: 'information',
    active: true,
    starts_at: '2026-08-01T00:00:00Z',
    ends_at: '2026-09-30T23:59:59Z',
    ...overrides
});

test('la lecture des informations s’appuie sur app_notices et le tri serveur', async () => {
    const client = queryClient();
    await fetchAvailableNotices(client);
    assert.deepEqual(client.calls[0], ['from', 'app_notices']);
    assert.deepEqual(client.calls.at(-1), ['order', 'created_at', { ascending: false }]);
    assert.doesNotMatch(dataScript, /new Date\(\)|Date\.now\(\)/);
});

test('active, starts_at et ends_at restent sélectionnés pour la politique serveur', () => {
    assert.match(dataScript, /id, title, message, type, active, starts_at, ends_at, created_at, updated_at/);
    assert.doesNotMatch(dataScript, /DEMO_NOTICES|notice-demo-001|Nouveaux tarifs disponibles/);
});

test('une table vide ne produit aucune information non lue', () => {
    assert.deepEqual(getUnreadNotices([], new Set()), []);
});

test('une information non lue est détectée', () => {
    const notices = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(getUnreadNotices(notices, new Set(['a'])), [{ id: 'b' }]);
});

test('une information lue ne se réaffiche plus automatiquement', () => {
    assert.deepEqual(getUnreadNotices([{ id: 'a' }], ['a']), []);
});

test('les lectures sont récupérées uniquement pour le bon UID', async () => {
    const client = queryClient({ data: [{ notice_id: 'n1' }], error: null });
    const result = await fetchNoticeReadIds(client, 'user-a');
    assert.deepEqual(result.data, ['n1']);
    assert.deepEqual(client.calls.at(-1), ['eq', 'user_id', 'user-a']);
});

test('J’AI COMPRIS insère uniquement le couple notice et UID courant', async () => {
    const client = queryClient();
    await markNoticeRead(client, 'notice-a', 'user-a');
    assert.deepEqual(client.calls, [
        ['from', 'app_notice_reads'],
        ['insert', { user_id: 'user-a', notice_id: 'notice-a' }]
    ]);
});

test('deux comptes produisent deux acquittements séparés', async () => {
    const first = queryClient();
    const second = queryClient();
    await markNoticeRead(first, 'notice-a', 'user-a');
    await markNoticeRead(second, 'notice-a', 'user-b');
    assert.notDeepEqual(first.calls[1][1], second.calls[1][1]);
});

test('le titre est obligatoire', () => {
    assert.equal(validateNotice(validNotice({ title: ' ' })).valid, false);
});

test('le message est obligatoire', () => {
    assert.equal(validateNotice(validNotice({ message: '' })).valid, false);
});

test('la date de fin ne peut pas précéder la date de début', () => {
    const result = validateNotice(validNotice({ starts_at: '2026-09-02', ends_at: '2026-09-01' }));
    assert.equal(result.valid, false);
    assert.match(result.errors.ends_at, /postérieure ou égale/);
});

test('seuls Information, Important et Maintenance sont autorisés', () => {
    for (const type of ['information', 'important', 'maintenance']) {
        assert.equal(validateNotice(validNotice({ type })).valid, true);
    }
    assert.equal(validateNotice(validNotice({ type: 'admin' })).valid, false);
});

test('le CRUD admin utilise uniquement app_notices et une liste fermée de champs', async () => {
    const createClient = queryClient({ data: {}, error: null });
    await createAdminNotice(createClient, validNotice({ injected: 'forbidden' }));
    const inserted = createClient.calls.find(([name]) => name === 'insert')[1];
    assert.deepEqual(Object.keys(inserted), ['title', 'message', 'type', 'active', 'starts_at', 'ends_at']);
    assert.equal(Object.hasOwn(inserted, 'injected'), false);

    const updateClient = queryClient({ data: {}, error: null });
    await updateAdminNotice(updateClient, 'notice-a', validNotice());
    assert.deepEqual(updateClient.calls.find(([name]) => name === 'eq'), ['eq', 'id', 'notice-a']);

    const deleteClient = queryClient();
    await deleteAdminNotice(deleteClient, 'notice-a');
    assert.deepEqual(deleteClient.calls, [['from', 'app_notices'], ['delete'], ['eq', 'id', 'notice-a']]);

    const listClient = queryClient();
    await fetchAdminNotices(listClient);
    assert.deepEqual(listClient.calls[0], ['from', 'app_notices']);
});

test('le contenu Supabase est rendu comme texte et jamais comme HTML', () => {
    const created = [];
    const documentObject = {
        createElement(tagName) {
            const element = { tagName, className: '', textContent: '', append(child) { (this.children ||= []).push(child); } };
            created.push(element);
            return element;
        }
    };
    const container = { dataset: {}, replaceChildren() {}, append(child) { (this.children ||= []).push(child); } };
    const attack = '<script>alert(1)</script>';
    renderNoticeContent(container, { ...validNotice(), id: 'x', title: attack, message: attack }, documentObject);
    assert.equal(created.filter(({ textContent }) => textContent === attack).length, 2);
    assert.doesNotMatch(uiScript, /\.innerHTML\s*=/);
    assert.doesNotMatch(adminScript, /\.innerHTML\s*=/);
});

test('aucune date technique de validité n’est affichée aux utilisateurs', () => {
    assert.doesNotMatch(uiScript, /notice\.starts_at|notice\.ends_at|Valable jusqu/);
    assert.doesNotMatch(accueil, /Valable jusqu/);
});

test('les dates restent présentes dans le formulaire et la liste admin', () => {
    assert.match(admin, /name="starts_at" type="date"/);
    assert.match(admin, /name="ends_at" type="date"/);
    assert.match(adminScript, /notice\.starts_at/);
    assert.match(adminScript, /notice\.ends_at/);
});

test('une seule popup automatique est sélectionnée par ouverture', () => {
    assert.match(accueil, /const \[automaticNotice\] = getUnreadNotices/);
    assert.doesNotMatch(accueil, /for\s*\([^)]*getUnreadNotices/);
});

test('la croix ferme sans acquittement et J’AI COMPRIS écrit côté serveur', () => {
    assert.match(accueil, /notice-dialog-close[\s\S]*closeDialog\(noticeDialog\)/);
    assert.doesNotMatch(accueil, /notice-dialog-close[\s\S]{0,120}markNoticeRead/);
    assert.match(accueil, /onAcknowledge: async[\s\S]*markNoticeRead/);
});

test('la rubrique reste accessible après lecture et ne contient aucun lien admin', () => {
    assert.match(accueil, /id="open-notices-list"/);
    assert.match(accueil, /renderNoticesList/);
    assert.doesNotMatch(accueil, /admin-informations\.html/);
});

test('la popup est initialisée seulement après AUTHORIZED', () => {
    assert.ok(accueil.indexOf('pageAuthorized = true') < accueil.indexOf('await fetchAvailableNotices'));
    assert.match(accueil, /id="app-view" class="hidden/);
});

test('la modale et l’admin restent responsive et respectent la safe-area', () => {
    assert.match(css, /max-height: calc\(100dvh[^;]*safe-area-inset-top[^;]*safe-area-inset-bottom/);
    assert.match(css, /html:has\(dialog\[open\]\)[\s\S]*overflow: hidden/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.notice-dialog[\s\S]*\.admin-notices-form/);
});
