export const ADMIN_ACCESS_STATES = Object.freeze({
    ADMIN: 'ADMIN',
    STANDARD: 'STANDARD',
    ERROR: 'ERROR'
});

export async function getCurrentAdminStatus(client) {
    if (!client || typeof client.rpc !== 'function') {
        return Object.freeze({ state: ADMIN_ACCESS_STATES.ERROR, isAdmin: false, error: new Error('Client Supabase requis.') });
    }

    const { data, error } = await client.rpc('is_current_user_admin');
    if (error || typeof data !== 'boolean') {
        return Object.freeze({
            state: ADMIN_ACCESS_STATES.ERROR,
            isAdmin: false,
            error: error || new Error('Réponse de rôle administrateur invalide.')
        });
    }

    return Object.freeze({
        state: data ? ADMIN_ACCESS_STATES.ADMIN : ADMIN_ACCESS_STATES.STANDARD,
        isAdmin: data
    });
}
