import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
    claimDeviceTransferTicket,
    createDeviceTransferTicket,
    DEVICE_TRANSFER_STATUSES
} from '../../js/device-transfer.js';
import {
    getDeviceTokenStorageKey,
    getPendingDeviceTokenStorageKey
} from '../../js/device-enrollment.js';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20260826000000_secure_device_transfer.sql');
const checks = read('supabase/checks/v15_device_transfer_post_migration.sql');
const installer = read('installer.html');
const index = read('index.html');
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceToken = `dev_${'1'.repeat(64)}`;
const ticket = 'a'.repeat(64);

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        value: (key) => values.get(key) ?? null
    };
}

test('la migration V15 crée uniquement le mécanisme dédié avec RLS sans policy client', () => {
    assert.match(migration, /CREATE TABLE public\.device_transfer_tickets/);
    assert.match(migration, /ALTER TABLE public\.device_transfer_tickets ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(migration, /CREATE POLICY/i);
    assert.match(migration, /REVOKE ALL ON TABLE public\.device_transfer_tickets\s+FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(migration, /REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
});

test('les secrets sont aléatoires, hashés et limités à dix minutes', () => {
    assert.match(migration, /extensions\.gen_random_bytes\(32\)/);
    assert.match(migration, /extensions\.digest\(v_ticket, 'sha256'\)/);
    assert.match(migration, /extensions\.digest\(v_device_token, 'sha256'\)/);
    assert.match(migration, /pg_catalog\.make_interval\(mins => 10\)/);
    assert.doesNotMatch(migration, /ticket_secret\s+text/i);
});

test('les deux RPC sont SECURITY DEFINER, search_path vide et réservées à authenticated', () => {
    assert.equal((migration.match(/SECURITY DEFINER/g) || []).length, 2);
    assert.equal((migration.match(/SET search_path TO ''/g) || []).length, 2);
    assert.match(migration, /ALTER FUNCTION public\.create_device_transfer_ticket\(text\) OWNER TO postgres/);
    assert.match(migration, /ALTER FUNCTION public\.claim_device_transfer_ticket\(text, text\) OWNER TO postgres/);
    assert.equal((migration.match(/TO authenticated;/g) || []).length, 2);
    assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/g);
});

test('create exige UID, token source valide, profil non bloqué et token identique', () => {
    const body = migration.split('CREATE OR REPLACE FUNCTION public.create_device_transfer_ticket')[1]
        .split('ALTER FUNCTION public.create_device_transfer_ticket')[0];
    assert.match(body, /v_user_id := auth\.uid\(\)/);
    assert.match(body, /p_current_token !~ '\^dev_\[0-9a-f\]\{64\}\$'/);
    assert.match(body, /FOR UPDATE/);
    assert.match(body, /pg_catalog\.lower\(\s*pg_catalog\.btrim\(coalesce\(v_blocage, ''\)\)\s*\) <> 'non'/);
    assert.match(body, /v_device_token IS DISTINCT FROM p_current_token/);
    assert.match(body, /SET used_at = pg_catalog\.now\(\)/);
});

test('claim verrouille profil et ticket avant le remplacement atomique', () => {
    const body = migration.split('CREATE OR REPLACE FUNCTION public.claim_device_transfer_ticket')[1]
        .split('ALTER FUNCTION public.claim_device_transfer_ticket')[0];
    assert.ok((body.match(/FOR UPDATE/g) || []).length >= 2);
    assert.match(body, /t\.user_id = v_user_id/);
    assert.match(body, /t\.ticket_hash = v_ticket_hash/);
    assert.match(body, /v_ticket\.used_at IS NOT NULL/);
    assert.match(body, /v_ticket\.expires_at <= pg_catalog\.now\(\)/);
    assert.match(body, /SOURCE_DEVICE_CHANGED/);
    assert.match(body, /UPDATE public\.profiles\s+SET device_token = p_new_device_token/);
    assert.match(body, /UPDATE public\.device_transfer_tickets\s+SET used_at = pg_catalog\.now\(\)/);
});

test('aucune RPC V15 ne lit ni ne modifie device_enrollment_allowed', () => {
    const functions = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'));
    assert.doesNotMatch(functions, /device_enrollment_allowed/);
    assert.doesNotMatch(migration, /UPDATE public\.profiles[\s\S]*?SET[\s\S]*?blocage\s*=/i);
    assert.doesNotMatch(migration, /UPDATE public\.profiles[\s\S]*?SET[\s\S]*?remise\s*=/i);
});

test('les deux RPC normalisent blocage exactement comme la RPC de production', () => {
    const normalizedCheck = /pg_catalog\.lower\(\s*pg_catalog\.btrim\(coalesce\(v_blocage, ''\)\)\s*\) <> 'non'/g;
    assert.equal((migration.match(normalizedCheck) || []).length, 2);
    assert.doesNotMatch(migration, /v_blocage IS DISTINCT FROM 'non'/);
});

test('les contrôles post-migration couvrent structure, RLS, grants, ACL et définitions', () => {
    for (const marker of ['information_schema.columns', 'pg_catalog.pg_constraint', 'pg_catalog.pg_indexes', 'pg_catalog.pg_policies', 'pg_catalog.pg_get_functiondef', 'pg_catalog.has_function_privilege', 'pg_catalog.has_table_privilege']) {
        assert.match(checks, new RegExp(marker.replaceAll('.', '\\.')));
    }
    const statements = checks
        .replace(/^--.*$/gm, '')
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);
    assert.ok(statements.every((statement) => /^SELECT\b/i.test(statement)));
});

test('Safari autorisé prépare un ticket via la RPC sans stockage local du secret', async () => {
    let call = null;
    const response = await createDeviceTransferTicket({
        client: { rpc: async (name, args) => { call = { name, args }; return { data: ticket, error: null }; } },
        currentDeviceToken: sourceToken
    });
    assert.deepEqual(call, { name: 'create_device_transfer_ticket', args: { p_current_token: sourceToken } });
    assert.equal(response.status, DEVICE_TRANSFER_STATUSES.CREATED);
    assert.equal(response.ticket, ticket);
    assert.doesNotMatch(installer, /localStorage[^\n]*(?:ticket|code)/i);
});

test('un appareil sans token source valide ne peut pas demander de ticket', async () => {
    let rpcCalls = 0;
    const response = await createDeviceTransferTicket({
        client: { rpc: async () => { rpcCalls += 1; } },
        currentDeviceToken: null
    });
    assert.equal(response.status, DEVICE_TRANSFER_STATUSES.INVALID_TOKEN);
    assert.equal(rpcCalls, 0);
});

test('le claim réussi remplace la clé utilisateur seulement après TRANSFERRED', async () => {
    const local = storage({ [getDeviceTokenStorageKey(userId)]: sourceToken });
    let sentToken = null;
    const response = await claimDeviceTransferTicket({
        client: { rpc: async (name, args) => { assert.equal(name, 'claim_device_transfer_ticket'); sentToken = args.p_new_device_token; return { data: 'TRANSFERRED', error: null }; } },
        ticket,
        userId,
        currentServerToken: sourceToken,
        storage: local,
        cryptoProvider: { getRandomValues: (bytes) => bytes.fill(2) }
    });
    assert.equal(response.status, DEVICE_TRANSFER_STATUSES.TRANSFERRED);
    assert.match(sentToken, /^dev_[0-9a-f]{64}$/);
    assert.notEqual(sentToken, sourceToken);
    assert.equal(local.value(getDeviceTokenStorageKey(userId)), sentToken);
    assert.equal(local.value(getPendingDeviceTokenStorageKey(userId)), null);
});

test('un claim refusé ne remplace jamais le token autorisé local', async () => {
    const local = storage({ [getDeviceTokenStorageKey(userId)]: sourceToken });
    const response = await claimDeviceTransferTicket({
        client: { rpc: async () => ({ data: 'EXPIRED_TICKET', error: null }) },
        ticket,
        userId,
        currentServerToken: sourceToken,
        storage: local,
        cryptoProvider: { getRandomValues: (bytes) => bytes.fill(3) }
    });
    assert.equal(response.status, DEVICE_TRANSFER_STATUSES.EXPIRED_TICKET);
    assert.equal(local.value(getDeviceTokenStorageKey(userId)), sourceToken);
    assert.match(local.value(getPendingDeviceTokenStorageKey(userId)), /^dev_[0-9a-f]{64}$/);
});

test('un code mal formé est refusé avant RPC et sans génération de token', async () => {
    let rpcCalls = 0;
    let randomCalls = 0;
    const local = storage();
    const response = await claimDeviceTransferTicket({
        client: { rpc: async () => { rpcCalls += 1; } },
        ticket: 'code faux',
        userId,
        currentServerToken: sourceToken,
        storage: local,
        cryptoProvider: { getRandomValues: () => { randomCalls += 1; } }
    });
    assert.equal(response.status, DEVICE_TRANSFER_STATUSES.INVALID_TICKET);
    assert.equal(rpcCalls, 0);
    assert.equal(randomCalls, 0);
});

test('la PWA iOS n’affiche le claim que pour token absent ou différent après authentification', () => {
    assert.match(index, /isStandalone\(window\) && isIosDevice\(window\.navigator\)/);
    assert.match(index, /isIosStandaloneApp\(\)/);
    assert.match(index, /AUTHORIZATION_STATES\.LOCAL_TOKEN_MISSING/);
    assert.match(index, /AUTHORIZATION_STATES\.DEVICE_MISMATCH/);
    assert.match(index, /Finaliser l’installation/);
    assert.match(index, /Collez le code généré dans Safari/);
    assert.match(index, /claimDeviceTransferTicket/);
    assert.match(index, /response\.status === DEVICE_TRANSFER_STATUSES\.TRANSFERRED/);
    assert.match(index, /await handleSession\(\{ allowEnrollment: false \}\)/);
});

test('le transfert n’appelle jamais la RPC d’enrôlement normal', () => {
    const module = read('js/device-transfer.js');
    assert.doesNotMatch(module, /initialize_own_device_token/);
    assert.doesNotMatch(module, /device_enrollment_allowed/);
    assert.doesNotMatch(module, /enableEnrollment|resetDevice|changeDevice|clearServerToken/);
});

test('l’invariant single-device est matérialisé par un unique UPDATE du token serveur', () => {
    const claimBody = migration.split('CREATE OR REPLACE FUNCTION public.claim_device_transfer_ticket')[1]
        .split('ALTER FUNCTION public.claim_device_transfer_ticket')[0];
    assert.equal((claimBody.match(/UPDATE public\.profiles/g) || []).length, 1);
    assert.equal((claimBody.match(/SET device_token\s*=\s*p_new_device_token/g) || []).length, 1);
    assert.doesNotMatch(migration, /INSERT INTO public\.profiles/);
    assert.doesNotMatch(migration, /device_tokens|authorized_devices/);
});

test('les scénarios mauvais UID, usage unique, expiration et source changée sont traités côté serveur', () => {
    assert.match(migration, /t\.user_id = v_user_id/);
    assert.match(migration, /RETURN 'USED_TICKET'/);
    assert.match(migration, /RETURN 'EXPIRED_TICKET'/);
    assert.match(migration, /RETURN 'SOURCE_DEVICE_CHANGED'/);
    assert.match(migration, /p_new_device_token = v_device_token[\s\S]*RETURN 'INVALID_TOKEN'/);
});
