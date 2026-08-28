export const NOTICE_TYPES = Object.freeze(['information', 'important', 'maintenance']);
export const NOTICE_SELECT_COLUMNS = 'id, title, message, type, active, starts_at, ends_at, created_at, updated_at';

export function validateNotice(notice) {
    const errors = {};
    if (!String(notice?.title ?? '').trim()) errors.title = 'Le titre est obligatoire.';
    if (!String(notice?.message ?? '').trim()) errors.message = 'Le message est obligatoire.';
    if (!NOTICE_TYPES.includes(notice?.type)) errors.type = 'Le type sélectionné est invalide.';

    const start = notice?.starts_at ? Date.parse(notice.starts_at) : null;
    const end = notice?.ends_at ? Date.parse(notice.ends_at) : null;
    if (start !== null && !Number.isFinite(start)) errors.starts_at = 'La date de début est invalide.';
    if (end !== null && !Number.isFinite(end)) errors.ends_at = 'La date de fin est invalide.';
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
        errors.ends_at = 'La date de fin doit être postérieure ou égale à la date de début.';
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

export function normalizeNoticeInput(notice) {
    return {
        title: String(notice.title).trim(),
        message: String(notice.message).trim(),
        type: notice.type,
        active: notice.active === true,
        starts_at: notice.starts_at || null,
        ends_at: notice.ends_at || null
    };
}

function requireClient(client) {
    if (!client || typeof client.from !== 'function') {
        throw new Error('Client Supabase requis pour les informations ERMAS.');
    }
}

export async function fetchAvailableNotices(client) {
    requireClient(client);
    return client
        .from('app_notices')
        .select(NOTICE_SELECT_COLUMNS)
        .order('created_at', { ascending: false });
}

export async function fetchNoticeReadIds(client, userId) {
    requireClient(client);
    if (!userId) throw new Error('USER_UID_REQUIRED');
    const { data, error } = await client
        .from('app_notice_reads')
        .select('notice_id')
        .eq('user_id', userId);
    return { data: (data || []).map(({ notice_id }) => String(notice_id)), error };
}

export async function markNoticeRead(client, noticeId, userId) {
    requireClient(client);
    if (!noticeId || !userId) throw new Error('NOTICE_AND_USER_REQUIRED');
    return client
        .from('app_notice_reads')
        .insert({ user_id: userId, notice_id: noticeId });
}

export function getUnreadNotices(notices, readIds) {
    const read = readIds instanceof Set ? readIds : new Set(readIds || []);
    return notices.filter((notice) => !read.has(String(notice.id)));
}

export async function fetchAdminNotices(client) {
    requireClient(client);
    return client
        .from('app_notices')
        .select(NOTICE_SELECT_COLUMNS)
        .order('created_at', { ascending: false });
}

export async function createAdminNotice(client, notice) {
    requireClient(client);
    const validation = validateNotice(notice);
    if (!validation.valid) return { data: null, error: null, validation };
    return client
        .from('app_notices')
        .insert(normalizeNoticeInput(notice))
        .select(NOTICE_SELECT_COLUMNS)
        .single();
}

export async function updateAdminNotice(client, noticeId, notice) {
    requireClient(client);
    if (!noticeId) throw new Error('NOTICE_ID_REQUIRED');
    const validation = validateNotice(notice);
    if (!validation.valid) return { data: null, error: null, validation };
    return client
        .from('app_notices')
        .update(normalizeNoticeInput(notice))
        .eq('id', noticeId)
        .select(NOTICE_SELECT_COLUMNS)
        .single();
}

export async function deleteAdminNotice(client, noticeId) {
    requireClient(client);
    if (!noticeId) throw new Error('NOTICE_ID_REQUIRED');
    return client.from('app_notices').delete().eq('id', noticeId);
}
