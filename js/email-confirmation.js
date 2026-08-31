export const SIGN_UP_CONFIRMATION_STATES = Object.freeze({
    CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
    CONFIRMATION_NOT_ENFORCED: 'CONFIRMATION_NOT_ENFORCED',
    INVALID_RESPONSE: 'INVALID_RESPONSE'
});

export function getEmailConfirmationRedirectUrl(location = globalThis.location) {
    if (!location?.href) throw new Error('URL courante indisponible.');
    return new URL('index.html', location.href).href;
}

export function classifySignUpConfirmation(data) {
    if (!data?.user) return SIGN_UP_CONFIRMATION_STATES.INVALID_RESPONSE;
    return data.session
        ? SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_NOT_ENFORCED
        : SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_REQUIRED;
}

export async function enforceSignUpEmailConfirmation(client, data) {
    const state = classifySignUpConfirmation(data);
    if (state !== SIGN_UP_CONFIRMATION_STATES.CONFIRMATION_NOT_ENFORCED) {
        return Object.freeze({ state, error: null });
    }

    const { error = null } = await client.auth.signOut({ scope: 'local' });
    return Object.freeze({ state, error });
}

export function getSignInErrorMessage(error) {
    return error?.code === 'email_not_confirmed'
        ? 'Votre adresse email n’est pas encore confirmée. Consultez l’email reçu avant de vous connecter.'
        : 'Identifiants incorrects.';
}
