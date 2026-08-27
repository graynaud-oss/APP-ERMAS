import {
    generateDeviceToken,
    getDeviceTokenStorageKey,
    getPendingDeviceTokenStorageKey,
    readPendingDeviceToken
} from './device-enrollment.js';

const DEVICE_TOKEN_PATTERN = /^dev_[0-9a-f]{64}$/;
const TICKET_PATTERN = /^[0-9a-f]{64}$/;

export const DEVICE_TRANSFER_STATUSES = Object.freeze({
    CREATED: 'CREATED',
    TRANSFERRED: 'TRANSFERRED',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    INVALID_TOKEN: 'INVALID_TOKEN',
    PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
    TRANSFER_NOT_ALLOWED: 'TRANSFER_NOT_ALLOWED',
    INVALID_TICKET: 'INVALID_TICKET',
    EXPIRED_TICKET: 'EXPIRED_TICKET',
    USED_TICKET: 'USED_TICKET',
    SOURCE_DEVICE_CHANGED: 'SOURCE_DEVICE_CHANGED'
});

function requireRpcClient(client) {
    if (!client || typeof client.rpc !== 'function') {
        throw new Error('Client Supabase requis pour le transfert d’appareil.');
    }
}

function requireWritableStorage(storage) {
    if (!storage
        || typeof storage.getItem !== 'function'
        || typeof storage.setItem !== 'function'
        || typeof storage.removeItem !== 'function') {
        throw new Error('Stockage local requis pour le transfert d’appareil.');
    }
}

function normalizeRpcStatus(data) {
    return typeof data === 'string' ? data : null;
}

export async function createDeviceTransferTicket({ client, currentDeviceToken }) {
    requireRpcClient(client);

    if (!DEVICE_TOKEN_PATTERN.test(currentDeviceToken || '')) {
        return Object.freeze({ status: DEVICE_TRANSFER_STATUSES.INVALID_TOKEN, ticket: null });
    }

    const { data, error } = await client.rpc('create_device_transfer_ticket', {
        p_current_token: currentDeviceToken
    });

    if (error) return Object.freeze({ status: null, ticket: null, error });
    if (TICKET_PATTERN.test(data || '')) {
        return Object.freeze({ status: DEVICE_TRANSFER_STATUSES.CREATED, ticket: data });
    }

    return Object.freeze({ status: normalizeRpcStatus(data), ticket: null });
}

export async function claimDeviceTransferTicket({
    client,
    ticket,
    userId,
    currentServerToken,
    storage = globalThis.localStorage,
    cryptoProvider = globalThis.crypto
}) {
    requireRpcClient(client);
    requireWritableStorage(storage);

    const normalizedTicket = typeof ticket === 'string' ? ticket.trim().toLowerCase() : '';
    if (!TICKET_PATTERN.test(normalizedTicket)) {
        return Object.freeze({ status: DEVICE_TRANSFER_STATUSES.INVALID_TICKET, token: null });
    }

    let newDeviceToken = readPendingDeviceToken(userId, storage);
    if (!DEVICE_TOKEN_PATTERN.test(newDeviceToken || '') || newDeviceToken === currentServerToken) {
        newDeviceToken = generateDeviceToken(cryptoProvider);
        storage.setItem(getPendingDeviceTokenStorageKey(userId), newDeviceToken);
    }

    const { data, error } = await client.rpc('claim_device_transfer_ticket', {
        p_ticket: normalizedTicket,
        p_new_device_token: newDeviceToken
    });

    if (error) return Object.freeze({ status: null, token: null, error });

    const status = normalizeRpcStatus(data);
    if (status !== DEVICE_TRANSFER_STATUSES.TRANSFERRED) {
        return Object.freeze({ status, token: null });
    }

    storage.setItem(getDeviceTokenStorageKey(userId), newDeviceToken);
    storage.removeItem(getPendingDeviceTokenStorageKey(userId));
    return Object.freeze({ status, token: newDeviceToken });
}
