export const PROFILE_SELECT_COLUMNS = [
    'id',
    'email',
    'nom',
    'prenom',
    'entreprise',
    'remise',
    'blocage',
    'device_token',
    'device_enrollment_allowed'
].join(', ');

function normalizePersonalFields(fields = {}, includeMissing = false) {
    const normalized = {};

    for (const field of ['email', 'nom', 'prenom', 'entreprise']) {
        if (includeMissing || Object.hasOwn(fields, field)) {
            normalized[field] = typeof fields[field] === 'string' ? fields[field].trim() : '';
        }
    }

    return normalized;
}

async function requireCurrentUser(client) {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;
    if (!data?.user) throw new Error('Utilisateur Supabase non authentifié.');

    return data.user;
}

export function isProfileComplete(profile) {
    return Boolean(
        profile
        && typeof profile.nom === 'string'
        && profile.nom.trim()
        && typeof profile.prenom === 'string'
        && profile.prenom.trim()
        && typeof profile.entreprise === 'string'
        && profile.entreprise.trim()
    );
}

export function isProfileBlocked(profile) {
    return Boolean(
        profile?.blocage
        && profile.blocage.toString().trim().toLowerCase() === 'oui'
    );
}

export async function getOwnProfile(client, userId) {
    if (!userId) throw new Error('Identifiant utilisateur requis pour lire le profil.');

    return client
        .from('profiles')
        .select(PROFILE_SELECT_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
}

export async function createOwnProfile(client, fields) {
    const user = await requireCurrentUser(client);
    const personalFields = normalizePersonalFields(fields, true);

    return client
        .from('profiles')
        .insert({
            id: user.id,
            ...personalFields
        })
        .select(PROFILE_SELECT_COLUMNS)
        .single();
}

export async function updateOwnPersonalProfile(client, fields) {
    const user = await requireCurrentUser(client);
    const personalFields = normalizePersonalFields(fields);

    return client
        .from('profiles')
        .update(personalFields)
        .eq('id', user.id)
        .select(PROFILE_SELECT_COLUMNS)
        .single();
}
