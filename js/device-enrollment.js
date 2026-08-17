export const DEVICE_TOKEN_STORAGE_KEY = 'ermas_device_token';
export const PENDING_DEVICE_TOKEN_STORAGE_KEY = 'ermas_device_token_pending';

export const DEVICE_ENROLLMENT_STATUSES = Object.freeze({
    INITIALIZED: 'INITIALIZED',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
    ENROLLMENT_NOT_ALLOWED: 'ENROLLMENT_NOT_ALLOWED',
    ALREADY_INITIALIZED: 'ALREADY_INITIALIZED',
    INVALID_TOKEN: 'INVALID_TOKEN'
});

const KNOWN_STATUSES = new Set(Object.values(DEVICE_ENROLLMENT_STATUSES));

export function readLocalDeviceToken(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== 'function') return null;

    const token = storage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    return typeof token === 'string' && token.length > 0 ? token : null;
}

export function readPendingDeviceToken(storage = globalThis.localStorage) {
    if (!storage || typeof storage.getItem !== 'function') return null;

    const token = storage.getItem(PENDING_DEVICE_TOKEN_STORAGE_KEY);
    return typeof token === 'string' && token.length > 0 ? token : null;
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

export function confirmPendingDeviceEnrollment(profile, storage = globalThis.localStorage) {
    if (!storage
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Stockage local requis pour confirmer l’appareil.');
    }

    const definitiveToken = readLocalDeviceToken(storage);
    if (definitiveToken) return Object.freeze({ confirmed: false, token: definitiveToken });

    const pendingToken = readPendingDeviceToken(storage);
    const serverToken = profile?.device_token;
    const canConfirm = pendingToken
        && typeof serverToken === 'string'
        && serverToken === pendingToken
        && profile.device_enrollment_allowed === false;

    if (!canConfirm) return Object.freeze({ confirmed: false, token: null });

    storage.setItem(DEVICE_TOKEN_STORAGE_KEY, pendingToken);
    storage.removeItem(PENDING_DEVICE_TOKEN_STORAGE_KEY);
    return Object.freeze({ confirmed: true, token: pendingToken });
}

export async function initializeAuthorizedDeviceEnrollment({
    client,
    profile,
    storage = globalThis.localStorage,
    cryptoProvider = globalThis.crypto
}) {
    const rejectedStatus = assertEnrollmentIsAllowed(profile);
    if (rejectedStatus) return Object.freeze({ status: rejectedStatus });

    if (!client || typeof client.rpc !== 'function') {
        throw new Error('Client Supabase requis pour initialiser l’appareil.');
    }
    if (!storage
        || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Stockage local requis pour initialiser l’appareil.');
    }

    if (readLocalDeviceToken(storage)) {
        return Object.freeze({ status: DEVICE_ENROLLMENT_STATUSES.ALREADY_INITIALIZED });
    }

    let token = readPendingDeviceToken(storage);
    if (!token) {
        token = generateEnrollmentToken(cryptoProvider);
        storage.setItem(PENDING_DEVICE_TOKEN_STORAGE_KEY, token);
    }

    const { data, error } = await client.rpc('initialize_own_device_token', {
        p_token: token
    });

    const { data: refreshedProfile, error: profileError } = await client
        .from('profiles')
        .select('device_token, device_enrollment_allowed')
        .eq('id', profile.id)
        .maybeSingle();

    if (!profileError) {
        const confirmation = confirmPendingDeviceEnrollment(refreshedProfile, storage);
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
