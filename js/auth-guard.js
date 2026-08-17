import { getSupabaseClient } from './supabase-client.js';
import { getOwnProfile, isProfileBlocked, isProfileComplete } from './profile.js';
import { readLocalDeviceToken } from './device-enrollment.js';

export const AUTHORIZATION_STATES = Object.freeze({
    AUTHORIZED: 'AUTHORIZED',
    NO_SESSION: 'NO_SESSION',
    SESSION_ERROR: 'SESSION_ERROR',
    PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
    PROFILE_INCOMPLETE: 'PROFILE_INCOMPLETE',
    PROFILE_FETCH_ERROR: 'PROFILE_FETCH_ERROR',
    ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',
    ENROLLMENT_PENDING_ADMIN: 'ENROLLMENT_PENDING_ADMIN',
    ENROLLMENT_ALLOWED: 'ENROLLMENT_ALLOWED',
    SERVER_TOKEN_MISSING: 'SERVER_TOKEN_MISSING',
    LOCAL_TOKEN_MISSING: 'LOCAL_TOKEN_MISSING',
    DEVICE_MISMATCH: 'DEVICE_MISMATCH',
    INCONSISTENT_DEVICE_STATE: 'INCONSISTENT_DEVICE_STATE'
});

function result(state, context = {}) {
    return Object.freeze({
        authorized: state === AUTHORIZATION_STATES.AUTHORIZED,
        state,
        ...context
    });
}

export function evaluateAuthorization({
    session,
    profile,
    localDeviceToken,
    sessionError = null,
    profileError = null
}) {
    if (sessionError) return result(AUTHORIZATION_STATES.SESSION_ERROR, { error: sessionError });
    if (!session?.user) return result(AUTHORIZATION_STATES.NO_SESSION);
    if (profileError) return result(AUTHORIZATION_STATES.PROFILE_FETCH_ERROR, { error: profileError });
    if (!profile) return result(AUTHORIZATION_STATES.PROFILE_NOT_FOUND, { session, user: session.user });
    if (isProfileBlocked(profile)) return result(AUTHORIZATION_STATES.ACCOUNT_BLOCKED, { session, user: session.user, profile });
    if (!isProfileComplete(profile)) return result(AUTHORIZATION_STATES.PROFILE_INCOMPLETE, { session, user: session.user, profile });

    const serverToken = typeof profile.device_token === 'string'
        ? profile.device_token.trim()
        : '';
    const enrollmentAllowed = profile.device_enrollment_allowed === true;

    if (serverToken && enrollmentAllowed) {
        return result(AUTHORIZATION_STATES.INCONSISTENT_DEVICE_STATE, { session, user: session.user, profile });
    }

    if (!serverToken) {
        return result(
            enrollmentAllowed
                ? AUTHORIZATION_STATES.ENROLLMENT_ALLOWED
                : AUTHORIZATION_STATES.ENROLLMENT_PENDING_ADMIN,
            { session, user: session.user, profile }
        );
    }

    if (!localDeviceToken) {
        return result(AUTHORIZATION_STATES.LOCAL_TOKEN_MISSING, { session, user: session.user, profile });
    }

    if (serverToken !== localDeviceToken) {
        return result(AUTHORIZATION_STATES.DEVICE_MISMATCH, { session, user: session.user, profile });
    }

    return result(AUTHORIZATION_STATES.AUTHORIZED, {
        session,
        user: session.user,
        profile,
        localDeviceToken
    });
}

export async function requireAuthorizedUser({
    client = getSupabaseClient(),
    storage = globalThis.localStorage
} = {}) {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    const session = sessionData?.session ?? null;

    if (sessionError || !session?.user) {
        return evaluateAuthorization({ session, sessionError });
    }

    const { data: profile, error: profileError } = await getOwnProfile(client, session.user.id);
    const localDeviceToken = readLocalDeviceToken(storage);

    return evaluateAuthorization({
        session,
        profile,
        localDeviceToken,
        profileError
    });
}

