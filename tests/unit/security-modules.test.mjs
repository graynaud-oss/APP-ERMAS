import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTHORIZATION_STATES, evaluateAuthorization } from '../../js/auth-guard.js';
import {
    DEVICE_ENROLLMENT_STATUSES,
    DEVICE_TOKEN_STORAGE_KEY,
    initializeAuthorizedDeviceEnrollment,
    readLocalDeviceToken
} from '../../js/device-enrollment.js';
import {
    createOwnProfile,
    isProfileBlocked,
    isProfileComplete,
    updateOwnPersonalProfile
} from '../../js/profile.js';
import { createSupabaseClient } from '../../js/supabase-client.js';

function storage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, value),
        value: (key) => values.get(key)
    };
}

function completeProfile(overrides = {}) {
    return {
        nom: 'Martin',
        prenom: 'Alice',
        entreprise: 'Exemple',
        blocage: 'non',
        device_token: 'dev_server',
        device_enrollment_allowed: false,
        ...overrides
    };
}

test('la lecture locale est pure et ne génère jamais de token', () => {
    let writes = 0;
    const fakeStorage = {
        getItem: () => null,
        setItem: () => { writes += 1; }
    };

    assert.equal(readLocalDeviceToken(fakeStorage), null);
    assert.equal(writes, 0);
});

test('le garde refuse un token local absent ou différent', () => {
    const session = { user: { id: 'user-a' } };
    const profile = completeProfile();

    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: null }).state, AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING);
    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: 'dev_other' }).state, AUTHORIZATION_STATES.DEVICE_MISMATCH);
    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: 'dev_server' }).state, AUTHORIZATION_STATES.AUTHORIZED);
});

test('le garde distingue attente admin, enrôlement autorisé et état incohérent', () => {
    const session = { user: { id: 'user-a' } };

    assert.equal(evaluateAuthorization({
        session,
        profile: completeProfile({ device_token: null }),
        localDeviceToken: null
    }).state, AUTHORIZATION_STATES.ENROLLMENT_PENDING_ADMIN);

    assert.equal(evaluateAuthorization({
        session,
        profile: completeProfile({ device_token: null, device_enrollment_allowed: true }),
        localDeviceToken: null
    }).state, AUTHORIZATION_STATES.ENROLLMENT_ALLOWED);

    assert.equal(evaluateAuthorization({
        session,
        profile: completeProfile({ device_enrollment_allowed: true }),
        localDeviceToken: 'dev_server'
    }).state, AUTHORIZATION_STATES.INCONSISTENT_DEVICE_STATE);
});

test('le garde refuse profil incomplet et compte bloqué', () => {
    const session = { user: { id: 'user-a' } };
    assert.equal(evaluateAuthorization({ session, profile: completeProfile({ nom: '' }) }).state, AUTHORIZATION_STATES.PROFILE_INCOMPLETE);
    assert.equal(evaluateAuthorization({ session, profile: completeProfile({ blocage: 'OUI' }) }).state, AUTHORIZATION_STATES.ACCOUNT_BLOCKED);
    assert.equal(isProfileComplete(completeProfile()), true);
    assert.equal(isProfileBlocked(completeProfile({ blocage: ' oui ' })), true);
});

test('aucun token n’est généré quand l’enrôlement est fermé ou déjà réalisé', async () => {
    let randomCalls = 0;
    let rpcCalls = 0;
    const cryptoProvider = { getRandomValues: () => { randomCalls += 1; } };
    const client = { rpc: async () => { rpcCalls += 1; } };

    const closed = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile({ device_token: null }),
        storage: storage(),
        cryptoProvider
    });
    const initialized = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile(),
        storage: storage(),
        cryptoProvider
    });

    assert.equal(closed.status, DEVICE_ENROLLMENT_STATUSES.ENROLLMENT_NOT_ALLOWED);
    assert.equal(initialized.status, DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED);
    assert.equal(randomCalls, 0);
    assert.equal(rpcCalls, 0);
});

test('l’enrôlement autorisé génère localement puis appelle uniquement la RPC dédiée', async () => {
    let rpcName = null;
    let rpcArgs = null;
    const fakeStorage = storage();
    const cryptoProvider = {
        getRandomValues: (bytes) => bytes.fill(10)
    };
    const client = {
        rpc: async (name, args) => {
            rpcName = name;
            rpcArgs = args;
            return { data: 'INITIALIZED', error: null };
        }
    };

    const response = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile({ device_token: null, device_enrollment_allowed: true }),
        storage: fakeStorage,
        cryptoProvider
    });

    assert.equal(response.status, DEVICE_ENROLLMENT_STATUSES.INITIALIZED);
    assert.equal(rpcName, 'initialize_own_device_token');
    assert.equal(rpcArgs.p_token, response.token);
    assert.equal(fakeStorage.value(DEVICE_TOKEN_STORAGE_KEY), response.token);
    assert.match(response.token, /^dev_[a-f0-9]{64}$/);
});

function profileClient() {
    const calls = [];
    const terminal = { single: async () => ({ data: {}, error: null }) };
    const query = {
        insert(value) { calls.push(['insert', value]); return this; },
        update(value) { calls.push(['update', value]); return this; },
        select(value) { calls.push(['select', value]); return this; },
        eq(column, value) { calls.push(['eq', column, value]); return this; },
        single: terminal.single
    };
    return {
        calls,
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
        from: (table) => { calls.push(['from', table]); return query; }
    };
}

test('les écritures de profil excluent tous les champs administratifs', async () => {
    const forbiddenInput = {
        email: ' user@example.test ',
        nom: ' Martin ',
        prenom: ' Alice ',
        entreprise: ' Exemple ',
        remise: 99,
        blocage: 'non',
        device_token: 'dev_attack',
        device_enrollment_allowed: true,
        id: 'other-user'
    };

    const createClient = profileClient();
    await createOwnProfile(createClient, forbiddenInput);
    const inserted = createClient.calls.find(([name]) => name === 'insert')[1];
    assert.deepEqual(inserted, {
        id: 'user-a',
        email: 'user@example.test',
        nom: 'Martin',
        prenom: 'Alice',
        entreprise: 'Exemple'
    });

    const updateClient = profileClient();
    await updateOwnPersonalProfile(updateClient, forbiddenInput);
    const updated = updateClient.calls.find(([name]) => name === 'update')[1];
    assert.deepEqual(updated, {
        email: 'user@example.test',
        nom: 'Martin',
        prenom: 'Alice',
        entreprise: 'Exemple'
    });
});

test('le client partagé utilise uniquement la configuration publique attendue', () => {
    let received = null;
    const sdk = {
        createClient: (url, key, options) => {
            received = { url, key, options };
            return { kind: 'client' };
        }
    };

    assert.deepEqual(createSupabaseClient(sdk), { kind: 'client' });
    assert.match(received.url, /^https:\/\/.+\.supabase\.co$/);
    assert.equal(received.options.auth.persistSession, true);
    assert.equal(received.options.auth.autoRefreshToken, true);
    assert.equal(received.options.auth.detectSessionInUrl, true);
    assert.equal(received.key.includes('service_role'), false);
});

