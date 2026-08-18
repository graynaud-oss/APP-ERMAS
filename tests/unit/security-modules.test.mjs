import assert from 'node:assert/strict';
import test from 'node:test';

import { AUTHORIZATION_STATES, evaluateAuthorization, requireAuthorizedUser } from '../../js/auth-guard.js';
import {
    DEVICE_ENROLLMENT_STATUSES,
    LEGACY_DEVICE_TOKEN_STORAGE_KEY,
    LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY,
    confirmPendingDeviceEnrollment,
    getDeviceTokenStorageKey,
    getPendingDeviceTokenStorageKey,
    initializeAuthorizedDeviceEnrollment,
    migrateLegacyDeviceStorageForUser,
    readLocalDeviceToken,
    readPendingDeviceToken
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
        removeItem: (key) => values.delete(key),
        value: (key) => values.get(key),
        has: (key) => values.has(key)
    };
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

function completeProfile(overrides = {}) {
    return {
        id: USER_A,
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

    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), null);
    assert.equal(writes, 0);
});

test('les clés appareil sont strictement liées au UUID utilisateur', () => {
    assert.equal(getDeviceTokenStorageKey(USER_A), `ermas_device_token:${USER_A}`);
    assert.equal(getPendingDeviceTokenStorageKey(USER_B), `ermas_device_token_pending:${USER_B}`);
    assert.notEqual(getDeviceTokenStorageKey(USER_A), getDeviceTokenStorageKey(USER_B));
    assert.throws(() => getDeviceTokenStorageKey(), /Identifiant utilisateur/);
    assert.throws(() => getDeviceTokenStorageKey('user@example.test'), /Identifiant utilisateur/);
});

test('un userId absent ou invalide ferme l’enrôlement avant tout appel RPC', async () => {
    let rpcCalls = 0;
    await assert.rejects(
        initializeAuthorizedDeviceEnrollment({
            client: { rpc: async () => { rpcCalls += 1; } },
            profile: completeProfile({ id: null, device_token: null, device_enrollment_allowed: true }),
            storage: storage(),
            cryptoProvider: { getRandomValues: () => {} }
        }),
        /Identifiant utilisateur/
    );
    assert.equal(rpcCalls, 0);
});

test('deux comptes du même navigateur ne lisent que leur propre token', () => {
    const fakeStorage = storage({
        [getDeviceTokenStorageKey(USER_A)]: 'dev_account_a',
        [getDeviceTokenStorageKey(USER_B)]: 'dev_account_b'
    });

    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), 'dev_account_a');
    assert.equal(readLocalDeviceToken(USER_B, fakeStorage), 'dev_account_b');
    assert.equal(readLocalDeviceToken(USER_C, fakeStorage), null);
});

test('un token legacy définitif ne migre que s’il correspond au serveur', () => {
    const matchingStorage = storage({ [LEGACY_DEVICE_TOKEN_STORAGE_KEY]: 'dev_match' });
    const migrated = migrateLegacyDeviceStorageForUser({
        userId: USER_A,
        serverDeviceToken: 'dev_match',
        serverEnrollmentAllowed: false,
        storage: matchingStorage
    });
    assert.equal(migrated.migrated, true);
    assert.equal(readLocalDeviceToken(USER_A, matchingStorage), 'dev_match');
    assert.equal(matchingStorage.has(LEGACY_DEVICE_TOKEN_STORAGE_KEY), false);

    for (const serverDeviceToken of [null, 'dev_other']) {
        const ambiguousStorage = storage({ [LEGACY_DEVICE_TOKEN_STORAGE_KEY]: 'dev_legacy' });
        const result = migrateLegacyDeviceStorageForUser({
            userId: USER_B,
            serverDeviceToken,
            serverEnrollmentAllowed: serverDeviceToken === null,
            storage: ambiguousStorage
        });
        assert.equal(result.migrated, false);
        assert.equal(readLocalDeviceToken(USER_B, ambiguousStorage), null);
        assert.equal(ambiguousStorage.value(LEGACY_DEVICE_TOKEN_STORAGE_KEY), 'dev_legacy');
    }
});

test('une clé utilisateur existante interdit toute migration legacy', () => {
    const fakeStorage = storage({
        [getDeviceTokenStorageKey(USER_A)]: 'dev_current',
        [LEGACY_DEVICE_TOKEN_STORAGE_KEY]: 'dev_server'
    });
    const result = migrateLegacyDeviceStorageForUser({
        userId: USER_A,
        serverDeviceToken: 'dev_server',
        serverEnrollmentAllowed: false,
        storage: fakeStorage
    });

    assert.equal(result.migrated, false);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), 'dev_current');
    assert.equal(fakeStorage.value(LEGACY_DEVICE_TOKEN_STORAGE_KEY), 'dev_server');
});

test('un pending legacy ambigu est ignoré et seul un pending confirmé peut être récupéré', () => {
    const ambiguousStorage = storage({ [LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY]: 'dev_pending_old' });
    const ignored = migrateLegacyDeviceStorageForUser({
        userId: USER_A,
        serverDeviceToken: null,
        serverEnrollmentAllowed: true,
        storage: ambiguousStorage
    });
    assert.equal(ignored.migrated, false);
    assert.equal(readLocalDeviceToken(USER_A, ambiguousStorage), null);
    assert.equal(ambiguousStorage.value(LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY), 'dev_pending_old');

    const confirmedStorage = storage({ [LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY]: 'dev_pending_confirmed' });
    const recovered = migrateLegacyDeviceStorageForUser({
        userId: USER_A,
        serverDeviceToken: 'dev_pending_confirmed',
        serverEnrollmentAllowed: false,
        storage: confirmedStorage
    });
    assert.equal(recovered.migrated, true);
    assert.equal(readLocalDeviceToken(USER_A, confirmedStorage), 'dev_pending_confirmed');
    assert.equal(confirmedStorage.has(LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY), false);
});

test('le garde refuse un token local absent ou différent', () => {
    const session = { user: { id: USER_A } };
    const profile = completeProfile();

    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: null }).state, AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING);
    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: 'dev_other' }).state, AUTHORIZATION_STATES.DEVICE_MISMATCH);
    assert.equal(evaluateAuthorization({ session, profile, localDeviceToken: 'dev_server' }).state, AUTHORIZATION_STATES.AUTHORIZED);
    assert.equal(evaluateAuthorization({
        session,
        profile: completeProfile({ device_token: ' dev_server ' }),
        localDeviceToken: 'dev_server'
    }).state, AUTHORIZATION_STATES.DEVICE_MISMATCH);
});

test('le garde distingue attente admin, enrôlement autorisé et état incohérent', () => {
    const session = { user: { id: USER_A } };

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
    const session = { user: { id: USER_A } };
    assert.equal(evaluateAuthorization({ session, profile: completeProfile({ nom: '' }) }).state, AUTHORIZATION_STATES.PROFILE_INCOMPLETE);
    assert.equal(evaluateAuthorization({ session, profile: completeProfile({ blocage: 'OUI' }) }).state, AUTHORIZATION_STATES.ACCOUNT_BLOCKED);
    assert.equal(isProfileComplete(completeProfile()), true);
    assert.equal(isProfileBlocked(completeProfile({ blocage: ' oui ' })), true);
});

test('les erreurs Supabase restent fermées', () => {
    const session = { user: { id: USER_A } };
    assert.equal(evaluateAuthorization({
        session: null,
        sessionError: new Error('auth indisponible')
    }).state, AUTHORIZATION_STATES.SESSION_ERROR);
    assert.equal(evaluateAuthorization({
        session,
        profile: null,
        profileError: new Error('profil indisponible')
    }).state, AUTHORIZATION_STATES.PROFILE_FETCH_ERROR);
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

test('l’enrôlement autorisé utilise pending et ne promeut qu’après confirmation serveur', async () => {
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
        },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
                data: {
                    device_token: rpcArgs.p_token,
                    device_enrollment_allowed: false
                },
                error: null
            })
        })
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
    assert.equal(fakeStorage.value(getDeviceTokenStorageKey(USER_A)), response.token);
    assert.equal(fakeStorage.has(getPendingDeviceTokenStorageKey(USER_A)), false);
    assert.match(response.token, /^dev_[a-f0-9]{64}$/);
});

test('un nouvel utilisateur ignore le token global résiduel et enrôle sa propre clé', async () => {
    let sentToken = null;
    const fakeStorage = storage({ [LEGACY_DEVICE_TOKEN_STORAGE_KEY]: 'dev_old_account' });
    const client = {
        rpc: async (_name, args) => {
            sentToken = args.p_token;
            return { data: 'INITIALIZED', error: null };
        },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
                data: { device_token: sentToken, device_enrollment_allowed: false },
                error: null
            })
        })
    };

    const response = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile({ id: USER_B, device_token: null, device_enrollment_allowed: true }),
        storage: fakeStorage,
        cryptoProvider: { getRandomValues: (bytes) => bytes.fill(13) }
    });

    assert.equal(response.status, DEVICE_ENROLLMENT_STATUSES.INITIALIZED);
    assert.equal(readLocalDeviceToken(USER_B, fakeStorage), sentToken);
    assert.notEqual(sentToken, 'dev_old_account');
    assert.equal(fakeStorage.value(LEGACY_DEVICE_TOKEN_STORAGE_KEY), 'dev_old_account');
});

test('le garde migre invisiblement un utilisateur legacy confirmé', async () => {
    const fakeStorage = storage({ [LEGACY_DEVICE_TOKEN_STORAGE_KEY]: 'dev_server' });
    const profile = completeProfile();
    const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }) },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: profile, error: null })
        })
    };

    const authorization = await requireAuthorizedUser({ client, storage: fakeStorage });
    assert.equal(authorization.state, AUTHORIZATION_STATES.AUTHORIZED);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), 'dev_server');
    assert.equal(fakeStorage.has(LEGACY_DEVICE_TOKEN_STORAGE_KEY), false);
});

test('un autre compte ou appareil ne peut pas emprunter une clé utilisateur existante', async () => {
    const fakeStorage = storage({ [getDeviceTokenStorageKey(USER_C)]: 'dev_server' });
    const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }) },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: completeProfile(), error: null })
        })
    };

    const authorization = await requireAuthorizedUser({ client, storage: fakeStorage });
    assert.equal(authorization.state, AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), null);
    assert.equal(readLocalDeviceToken(USER_C, fakeStorage), 'dev_server');
});

test('un refus RPC conserve le pending sans remplacer le token définitif', async () => {
    const fakeStorage = storage();
    const client = {
        rpc: async () => ({ data: 'ENROLLMENT_NOT_ALLOWED', error: null }),
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
                data: { device_token: null, device_enrollment_allowed: false },
                error: null
            })
        })
    };

    const response = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile({ device_token: null, device_enrollment_allowed: true }),
        storage: fakeStorage,
        cryptoProvider: { getRandomValues: (bytes) => bytes.fill(11) }
    });

    assert.equal(response.status, DEVICE_ENROLLMENT_STATUSES.ENROLLMENT_NOT_ALLOWED);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), null);
    assert.match(readPendingDeviceToken(USER_A, fakeStorage), /^dev_[a-f0-9]{64}$/);
});

test('un pending confirmé est récupéré sans générer ni réécrire le token serveur', async () => {
    const pending = 'dev_pending_exact';
    const fakeStorage = storage({ [getPendingDeviceTokenStorageKey(USER_A)]: pending });
    const profile = completeProfile({ device_token: pending, device_enrollment_allowed: false });

    const confirmation = confirmPendingDeviceEnrollment(profile, USER_A, fakeStorage);
    assert.equal(confirmation.confirmed, true);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), pending);
    assert.equal(readPendingDeviceToken(USER_A, fakeStorage), null);

    const authStorage = storage({ [getPendingDeviceTokenStorageKey(USER_A)]: pending });
    const client = {
        auth: { getSession: async () => ({ data: { session: { user: { id: USER_A } } }, error: null }) },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({ data: profile, error: null })
        })
    };
    const authorization = await requireAuthorizedUser({ client, storage: authStorage });
    assert.equal(authorization.state, AUTHORIZATION_STATES.AUTHORIZED);
    assert.equal(readLocalDeviceToken(USER_A, authStorage), pending);
});

test('une réponse RPC perdue est récupérée par la relecture serveur', async () => {
    let sentToken = null;
    const fakeStorage = storage();
    const client = {
        rpc: async (_name, args) => {
            sentToken = args.p_token;
            return { data: null, error: new Error('réponse réseau perdue') };
        },
        from: () => ({
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
                data: { device_token: sentToken, device_enrollment_allowed: false },
                error: null
            })
        })
    };

    const response = await initializeAuthorizedDeviceEnrollment({
        client,
        profile: completeProfile({ device_token: null, device_enrollment_allowed: true }),
        storage: fakeStorage,
        cryptoProvider: { getRandomValues: (bytes) => bytes.fill(12) }
    });

    assert.equal(response.status, DEVICE_ENROLLMENT_STATUSES.INITIALIZED);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), sentToken);
    assert.equal(readPendingDeviceToken(USER_A, fakeStorage), null);
});

test('un token définitif existant interdit toute génération de pending', async () => {
    let randomCalls = 0;
    const fakeStorage = storage({ [getDeviceTokenStorageKey(USER_A)]: 'dev_existing' });
    const response = await initializeAuthorizedDeviceEnrollment({
        client: { rpc: async () => { throw new Error('RPC interdite'); } },
        profile: completeProfile({ device_token: null, device_enrollment_allowed: true }),
        storage: fakeStorage,
        cryptoProvider: { getRandomValues: () => { randomCalls += 1; } }
    });

    assert.equal(response.status, DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED);
    assert.equal(randomCalls, 0);
    assert.equal(readPendingDeviceToken(USER_A, fakeStorage), null);
    assert.equal(readLocalDeviceToken(USER_A, fakeStorage), 'dev_existing');
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

test('une synchronisation partielle de l’email ne vide pas les autres champs personnels', async () => {
    const updateClient = profileClient();
    await updateOwnPersonalProfile(updateClient, { email: 'new@example.test' });
    const updated = updateClient.calls.find(([name]) => name === 'update')[1];
    assert.deepEqual(updated, { email: 'new@example.test' });
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
