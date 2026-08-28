import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN_ACCESS_STATES, getCurrentAdminStatus } from '../../js/admin-access.js';
import { AUTHORIZATION_STATES, evaluateAuthorization, requireAuthorizedUser } from '../../js/auth-guard.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const migration = read('supabase/migrations/20260828000000_app_notices_admin.sql');
const checks = read('supabase/checks/v16_app_notices_admin_post_migration.sql');
const adminPage = read('admin-informations.html');
const adminScript = read('js/admin-notices.js');
const authGuard = read('js/auth-guard.js');
const htmlSources = fs.readdirSync(root)
    .filter((name) => name.endsWith('.html') && name !== 'admin-informations.html')
    .map((name) => [name, read(name)]);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const profile = (overrides = {}) => ({
    id: USER_ID,
    nom: 'Nom',
    prenom: 'Prénom',
    entreprise: 'ERMAS',
    blocage: 'non',
    device_token: 'dev_server',
    device_enrollment_allowed: false,
    ...overrides
});
const session = { user: { id: USER_ID } };

function guardClient({ isAdmin, profileData = profile(), adminError = null }) {
    const calls = [];
    return {
        calls,
        auth: { getSession: async () => ({ data: { session }, error: null }) },
        rpc: async (name) => {
            calls.push(['rpc', name]);
            return { data: isAdmin, error: adminError };
        },
        from: (table) => {
            calls.push(['from', table]);
            return {
                select() { return this; },
                eq() { return this; },
                maybeSingle: async () => ({ data: profileData, error: null })
            };
        }
    };
}

function memoryStorage(values = {}) {
    const entries = new Map(Object.entries(values));
    return {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
        removeItem: (key) => entries.delete(key)
    };
}

test('la migration crée les trois tables additives avec RLS', () => {
    for (const table of ['app_admins', 'app_notices', 'app_notice_reads']) {
        assert.match(migration, new RegExp(`CREATE TABLE public\\.${table}`));
        assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    }
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN)|TRUNCATE/i);
});

test('app_admins est inaccessible directement aux rôles client', () => {
    assert.match(migration, /REVOKE ALL ON TABLE public\.app_admins FROM PUBLIC, anon, authenticated, service_role/);
    assert.doesNotMatch(migration, /GRANT [^;]+ ON (?:TABLE )?public\.app_admins/i);
    assert.doesNotMatch(migration, /CREATE POLICY [\s\S]*?ON public\.app_admins/);
});

test('is_current_user_admin est SECURITY DEFINER durcie et réservée à authenticated', () => {
    const body = migration.split('CREATE OR REPLACE FUNCTION public.is_current_user_admin()')[1]
        .split('ALTER FUNCTION public.is_current_user_admin()')[0];
    assert.match(body, /SECURITY DEFINER/);
    assert.match(body, /SET search_path TO ''/);
    assert.match(body, /auth\.uid\(\) IS NOT NULL/);
    assert.match(body, /FROM public\.app_admins/);
    assert.match(migration, /ALTER FUNCTION public\.is_current_user_admin\(\) OWNER TO postgres/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_current_user_admin\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.is_current_user_admin\(\) TO authenticated/);
});

test('les notices imposent types, textes non vides et dates ordonnées', () => {
    assert.match(migration, /type IN \('information', 'important', 'maintenance'\)/);
    assert.match(migration, /pg_catalog\.btrim\(title\) <> ''/);
    assert.match(migration, /pg_catalog\.btrim\(message\) <> ''/);
    assert.match(migration, /ends_at >= starts_at/);
});

test('les standards ne voient que les notices actives dans leur période côté serveur', () => {
    const policy = migration.split('CREATE POLICY app_notices_select_authenticated')[1]
        .split('CREATE POLICY app_notices_insert_admin')[0];
    assert.match(policy, /active = true/);
    assert.match(policy, /starts_at IS NULL OR starts_at <= pg_catalog\.now\(\)/);
    assert.match(policy, /ends_at IS NULL OR ends_at >= pg_catalog\.now\(\)/);
    assert.match(policy, /public\.is_current_user_admin\(\)/);
});

test('le CRUD notices est accordé par colonnes et verrouillé par les policies admin', () => {
    assert.match(migration, /GRANT SELECT \(id, title, message, type, active, starts_at, ends_at, created_at, updated_at\)/);
    assert.match(migration, /GRANT INSERT \(title, message, type, active, starts_at, ends_at\)/);
    assert.match(migration, /GRANT UPDATE \(title, message, type, active, starts_at, ends_at\)/);
    assert.match(migration, /GRANT DELETE ON TABLE public\.app_notices TO authenticated/);
    for (const action of ['insert', 'update', 'delete']) {
        const pattern = new RegExp(`CREATE POLICY app_notices_${action}_admin[\\s\\S]*?public\\.is_current_user_admin\\(\\)`);
        assert.match(migration, pattern);
    }
});

test('les acquittements sont propres à auth.uid et sans UPDATE/DELETE client', () => {
    assert.match(migration, /PRIMARY KEY \(user_id, notice_id\)/);
    assert.match(migration, /app_notice_reads_select_own[\s\S]*USING \(user_id = auth\.uid\(\)\)/);
    assert.match(migration, /app_notice_reads_insert_own[\s\S]*user_id = auth\.uid\(\)/);
    assert.match(migration, /GRANT INSERT \(user_id, notice_id\)/);
    assert.doesNotMatch(migration, /GRANT (?:UPDATE|DELETE)[^;]*app_notice_reads/i);
});

test('anon et service_role ne reçoivent aucun accès métier V16', () => {
    for (const table of ['app_admins', 'app_notices', 'app_notice_reads']) {
        assert.match(migration, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`));
    }
    assert.doesNotMatch(migration, /GRANT [^;]+ TO (?:anon|service_role)/i);
});

test('V16 ne modifie jamais profiles, les tokens, enrollment ou les RPC device', () => {
    assert.doesNotMatch(migration, /(?:UPDATE|ALTER TABLE) public\.profiles/i);
    assert.doesNotMatch(migration, /device_token|device_enrollment_allowed|initialize_own_device_token|device_transfer/i);
    assert.doesNotMatch(authGuard, /initialize_own_device_token|claim_device_transfer_ticket|create_device_transfer_ticket/);
});

test('un standard au token correct reste AUTHORIZED', () => {
    const result = evaluateAuthorization({ session, profile: profile(), localDeviceToken: 'dev_server', isAdmin: false });
    assert.equal(result.state, AUTHORIZATION_STATES.AUTHORIZED);
    assert.equal(result.deviceEnforcementBypassed, false);
});

test('un standard au token absent ou différent reste refusé', () => {
    assert.equal(evaluateAuthorization({ session, profile: profile(), localDeviceToken: null }).state, AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING);
    assert.equal(evaluateAuthorization({ session, profile: profile(), localDeviceToken: 'dev_other' }).state, AUTHORIZATION_STATES.DEVICE_MISMATCH);
});

test('un admin sans token local ou avec token différent est autorisé sans rotation', () => {
    for (const localDeviceToken of [null, 'dev_other']) {
        const result = evaluateAuthorization({ session, profile: profile(), localDeviceToken, isAdmin: true });
        assert.equal(result.state, AUTHORIZATION_STATES.AUTHORIZED);
        assert.equal(result.isAdmin, true);
        assert.equal(result.deviceEnforcementBypassed, true);
    }
});

test('le bypass admin ne contourne ni profil incomplet ni blocage', () => {
    assert.equal(evaluateAuthorization({ session, profile: profile({ nom: '' }), isAdmin: true }).state, AUTHORIZATION_STATES.PROFILE_INCOMPLETE);
    assert.equal(evaluateAuthorization({ session, profile: profile({ blocage: 'oui' }), isAdmin: true }).state, AUTHORIZATION_STATES.ACCOUNT_BLOCKED);
});

test('requireAuthorizedUser admin ne lit ni n’écrit le stockage device', async () => {
    const client = guardClient({ isAdmin: true });
    const forbiddenStorage = new Proxy({}, { get() { throw new Error('DEVICE_STORAGE_ACCESSED'); } });
    const result = await requireAuthorizedUser({ client, storage: forbiddenStorage });
    assert.equal(result.state, AUTHORIZATION_STATES.AUTHORIZED);
    assert.equal(result.isAdmin, true);
    assert.deepEqual(client.calls.filter(([name]) => name === 'rpc'), [['rpc', 'is_current_user_admin']]);
});

test('une erreur de rôle admin refuse l’accès sans retomber en standard', async () => {
    const result = await requireAuthorizedUser({ client: guardClient({ isAdmin: null, adminError: new Error('rpc down') }), storage: memoryStorage() });
    assert.equal(result.state, AUTHORIZATION_STATES.ADMIN_CHECK_ERROR);
    assert.equal(result.authorized, false);
});

test('le retrait admin réactive immédiatement le token canonique standard', async () => {
    const adminResult = await requireAuthorizedUser({ client: guardClient({ isAdmin: true }), storage: memoryStorage() });
    assert.equal(adminResult.state, AUTHORIZATION_STATES.AUTHORIZED);

    const downgraded = await requireAuthorizedUser({ client: guardClient({ isAdmin: false }), storage: memoryStorage() });
    assert.equal(downgraded.state, AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING);
});

test('le rôle est demandé exclusivement à la RPC serveur et jamais au client local', async () => {
    const admin = await getCurrentAdminStatus({ rpc: async (name) => ({ data: name === 'is_current_user_admin', error: null }) });
    assert.equal(admin.state, ADMIN_ACCESS_STATES.ADMIN);
    assert.equal(admin.isAdmin, true);
    const module = read('js/admin-access.js');
    assert.doesNotMatch(module, /localStorage|sessionStorage|email|admin=true|URLSearchParams/);
});

test('la page admin reste cachée avant garde et refuse standard ou non connecté', () => {
    assert.match(adminPage, /id="admin-app" class="hidden app-shell"/);
    assert.match(adminPage, /id="admin-access-denied" class="hidden/);
    assert.match(adminScript, /await requireAuthorizedUser\(\{ client \}\)/);
    assert.match(adminScript, /context\.isAdmin !== true/);
    assert.match(adminScript, /window\.location\.href = 'index\.html'/);
    const initAdminBody = adminScript.slice(adminScript.indexOf('async function initAdmin()'));
    assert.ok(initAdminBody.indexOf('adminAuthorized = true') < initAdminBody.indexOf("app.classList.remove('hidden')"));
    assert.ok(initAdminBody.indexOf("app.classList.remove('hidden')") < initAdminBody.indexOf('await renderAdminList()'));
});

test('aucune page utilisateur ne contient de lien vers admin-informations', () => {
    for (const [name, source] of htmlSources) {
        assert.doesNotMatch(source, /admin-informations\.html/, `lien admin exposé dans ${name}`);
    }
});

test('aucun premier administrateur ni aucune notice ne sont seedés', () => {
    assert.doesNotMatch(migration, /INSERT INTO public\.app_admins|INSERT INTO public\.app_notices/i);
    assert.doesNotMatch([migration, adminScript, read('js/app-notices.js')].join('\n'), /notice-demo-001|Nouveaux tarifs disponibles|ermas_admin_notices_demo|ermas_seen_notices/);
});

test('le fichier de contrôle post-migration est strictement READ ONLY et complet', () => {
    assert.doesNotMatch(checks, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/i);
    for (const object of ['app_admins', 'app_notices', 'app_notice_reads', 'is_current_user_admin']) {
        assert.match(checks, new RegExp(object));
    }
});
