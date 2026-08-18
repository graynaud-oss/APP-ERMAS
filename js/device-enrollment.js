export const LEGACY_DEVICE_TOKEN_STORAGE_KEY = 'ermas_device_token';
export const LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY = 'ermas_device_token_pending';

const DEVICE_TOKEN_STORAGE_PREFIX = `${LEGACY_DEVICE_TOKEN_STORAGE_KEY}:`;
const PENDING_DEVICE_TOKEN_STORAGE_PREFIX = `${LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY}:`;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEVICE_ENROLLMENT_STATUSES = Object.freeze({
    INITIALIZED: 'INITIALIZED',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
    ENROLLMENT_NOT_ALLOWED: 'ENROLLMENT_NOT_ALLOWED',
    ALREADY_INITIALIZED: 'ALREADY_INITIALIZED',
    INVALID_TOKEN: 'INVALID_TOKEN'
});

const KNOWN_STATUSES = new Set(Object.values(DEVICE_ENROLLMENT_STATUSES));

function requireUserId(userId) {
    if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) {
        throw new TypeError('Identifiant utilisateur Supabase valide requis pour le stockage appareil.');
    }
    return userId.toLowerCase();
}

function requireReadableStorage(storage) {
    if (!storage || typeof storage.getItem !== 'function') {
        throw new Error('Stockage local requis pour lire l’appareil.');
    }
}

function requireWritableStorage(storage) {
    requireReadableStorage(storage);
    if (typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
        throw new Error('Stockage local requis pour enregistrer l’appareil.');
    }
}

export function getDeviceTokenStorageKey(userId) {
    return `${DEVICE_TOKEN_STORAGE_PREFIX}${requireUserId(userId)}`;
}

export function getPendingDeviceTokenStorageKey(userId) {
    return `${PENDING_DEVICE_TOKEN_STORAGE_PREFIX}${requireUserId(userId)}`;
}

export function readLocalDeviceToken(userId, storage = globalThis.localStorage) {
    requireReadableStorage(storage);
    const token = storage.getItem(getDeviceTokenStorageKey(userId));
    return typeof token === 'string' && token.length > 0 ? token : null;
}

export function readPendingDeviceToken(userId, storage = globalThis.localStorage) {
    requireReadableStorage(storage);
    const token = storage.getItem(getPendingDeviceTokenStorageKey(userId));
    return typeof token === 'string' && token.length > 0 ? token : null;
}

export function migrateLegacyDeviceStorageForUser({
    userId,
    serverDeviceToken,
    serverEnrollmentAllowed,
    storage = globalThis.localStorage
}) {
    requireWritableStorage(storage);
    const deviceKey = getDeviceTokenStorageKey(userId);

    if (storage.getItem(deviceKey)) {
        return Object.freeze({ migrated: false, source: null });
    }

    const legacyToken = storage.getItem(LEGACY_DEVICE_TOKEN_STORAGE_KEY);
    if (typeof serverDeviceToken === 'string'
        && serverDeviceToken.length > 0
        && legacyToken === serverDeviceToken) {
        storage.setItem(deviceKey, legacyToken);
        storage.removeItem(LEGACY_DEVICE_TOKEN_STORAGE_KEY);
        return Object.freeze({ migrated: true, source: 'LEGACY_DEVICE_TOKEN' });
    }

    const legacyPending = storage.getItem(LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY);
    if (typeof serverDeviceToken === 'string'
        && serverDeviceToken.length > 0
        && serverEnrollmentAllowed === false
        && legacyPending === serverDeviceToken) {
        storage.setItem(deviceKey, legacyPending);
        storage.removeItem(LEGACY_PENDING_DEVICE_TOKEN_STORAGE_KEY);
        return Object.freeze({ migrated: true, source: 'LEGACY_PENDING_DEVICE_TOKEN' });
    }

    return Object.freeze({ migrated: false, source: null });
}

function generateEnrollmentToken(cryptoProvider) {
    if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') {
        throw new Error('Un générateur cryptographique est requis pour l’enrôlement.');
    }

    const bytes = new Uint8Array(32);
    cryptoProvider.getRandomValues(bytes);
    return `dev_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function assertEnrollmentIsAllowed(profile) {
    if (!profile) return DEVICE_ENROLLMENT_STATUSES.PROFILE_NOT_FOUND;
    if (profile.device_token !== null) return DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED;
    if (profile.device_enrollment_allowed !== true) return DEVICE_ENROLLMENT_STATUSES.ENROLLMENT_NOT_ALLOWED;
    return null;
}

export function confirmPendingDeviceEnrollment(profile, userId, storage = globalThis.localStorage) {
    requireWritableStorage(storage);
    const definitiveToken = readLocalDeviceToken(userId, storage);
    if (definitiveToken) return Object.freeze({ confirmed: false, token: definitiveToken });

    const pendingToken = readPendingDeviceToken(userId, storage);
    const serverToken = profile?.device_token;
    const canConfirm = pendingToken
        && typeof serverToken === 'string'
        && serverToken === pendingToken
        && profile.device_enrollment_allowed === false;

    if (!canConfirm) return Object.freeze({ confirmed: false, token: null });

    storage.setItem(getDeviceTokenStorageKey(userId), pendingToken);
    storage.removeItem(getPendingDeviceTokenStorageKey(userId));
    return Object.freeze({ confirmed: true, token: pendingToken });
}

export async function initializeAuthorizedDeviceEnrollment({
    client,
    profile,
    userId = profile?.id,
    storage = globalThis.localStorage,
    cryptoProvider = globalThis.crypto
}) {
    const rejectedStatus = assertEnrollmentIsAllowed(profile);
    if (rejectedStatus) return Object.freeze({ status: rejectedStatus });

    const normalizedUserId = requireUserId(userId);
    if (!client || typeof client.rpc !== 'function') {
        throw new Error('Client Supabase requis pour initialiser l’appareil.');
    }
    requireWritableStorage(storage);

    if (readLocalDeviceToken(normalizedUserId, storage)) {
        return Object.freeze({ status: DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED });
    }

    let token = readPendingDeviceToken(normalizedUserId, storage);
    if (!token) {
        token = generateEnrollmentToken(cryptoProvider);
        storage.setItem(getPendingDeviceTokenStorageKey(normalizedUserId), token);
    }

    const { data, error } = await client.rpc('initialize_own_device_token', {
        p_token: token
    });

    const { data: refreshedProfile, error: profileError } = await client
        .from('profiles')
        .select('device_token, device_enrollment_allowed')
        .eq('id', normalizedUserId)
        .maybeSingle();

    if (!profileError) {
        const confirmation = confirmPendingDeviceEnrollment(refreshedProfile, normalizedUserId, storage);
        if (confirmation.confirmed) {
            return Object.freeze({
                status: DEVICE_ENROLLMENT_STATUSES.INITIALIZED,
                token: confirmation.token
            });
        }
    }

    if (error || profileError) {
        return Object.freeze({ status: null, error: error || profileError });
    }

    const status = typeof data === 'string' ? data : null;
    if (!KNOWN_STATUSES.has(status)) {
        return Object.freeze({
            status: null,
            error: new Error('Statut d’enrôlement Supabase inconnu.')
        });
    }

    return Object.freeze({ status, token: null });
}
