import { getSupabaseClient } from './supabase-client.js';
import { AUTHORIZATION_STATES, requireAuthorizedUser } from './auth-guard.js';
import {
    createAdminNotice,
    deleteAdminNotice,
    fetchAdminNotices,
    updateAdminNotice,
    validateNotice
} from './app-notices.js';
import { openNoticeDialog } from './notices-ui.js';

const client = getSupabaseClient();
const app = document.getElementById('admin-app');
const denied = document.getElementById('admin-access-denied');
const form = document.getElementById('notice-form');
const list = document.getElementById('admin-notices-list');
const feedback = document.getElementById('notice-form-feedback');
const previewDialog = document.getElementById('notice-preview-dialog');
const previewContent = document.getElementById('notice-preview-content');
const previewAcknowledge = document.getElementById('notice-preview-acknowledge');
let editingId = null;
let adminAuthorized = false;

function dateValue(value, endOfDay = false) {
    if (!value) return null;
    return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`;
}

function formNotice() {
    return {
        title: form.elements.title.value,
        message: form.elements.message.value,
        type: form.elements.type.value,
        active: form.elements.active.checked,
        starts_at: dateValue(form.elements.starts_at.value),
        ends_at: dateValue(form.elements.ends_at.value, true)
    };
}

function showFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('is-error', error);
}

function showPreview(notice) {
    if (!adminAuthorized) return;
    const validation = validateNotice(notice);
    if (!validation.valid) {
        showFeedback(Object.values(validation.errors)[0], true);
        return;
    }
    openNoticeDialog({ dialog: previewDialog, content: previewContent, notice, acknowledgeButton: previewAcknowledge });
}

function fillForm(notice) {
    if (!adminAuthorized) return;
    editingId = notice.id;
    form.elements.title.value = notice.title;
    form.elements.message.value = notice.message;
    form.elements.type.value = notice.type;
    form.elements.active.checked = notice.active;
    form.elements.starts_at.value = notice.starts_at?.slice(0, 10) || '';
    form.elements.ends_at.value = notice.ends_at?.slice(0, 10) || '';
    showFeedback(`Modification de « ${notice.title} »`);
    form.elements.title.focus();
}

function actionButton(label, action, notice) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'app-button app-button--secondary admin-notice-card__action';
    button.textContent = label;
    button.addEventListener('click', () => action(notice));
    return button;
}

async function renderAdminList() {
    if (!adminAuthorized) return;
    list.replaceChildren();
    const { data, error } = await fetchAdminNotices(client);
    if (error) throw error;
    if (!data?.length) {
        const empty = document.createElement('p');
        empty.className = 'notices-list__empty';
        empty.textContent = 'Aucune information enregistrée.';
        list.append(empty);
        return;
    }

    for (const notice of data) {
        const article = document.createElement('article');
        article.className = 'admin-notice-card';
        const title = document.createElement('h3');
        title.textContent = notice.title;
        const meta = document.createElement('p');
        meta.textContent = `${notice.type} · ${notice.active ? 'Actif' : 'Inactif'} · ${notice.starts_at?.slice(0, 10) || 'sans début'} → ${notice.ends_at?.slice(0, 10) || 'sans fin'}`;
        const actions = document.createElement('div');
        actions.className = 'admin-notice-card__actions';
        actions.append(
            actionButton('Modifier', fillForm, notice),
            actionButton('Aperçu', showPreview, notice),
            actionButton('Supprimer', async (item) => {
                if (!adminAuthorized) return;
                const { error: deleteError } = await deleteAdminNotice(client, item.id);
                if (deleteError) throw deleteError;
                if (editingId === item.id) editingId = null;
                await renderAdminList();
            }, notice)
        );
        article.append(title, meta, actions);
        list.append(article);
    }
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!adminAuthorized) return;
    const notice = formNotice();
    const validation = validateNotice(notice);
    if (!validation.valid) {
        showFeedback(Object.values(validation.errors)[0], true);
        return;
    }
    const result = editingId
        ? await updateAdminNotice(client, editingId, notice)
        : await createAdminNotice(client, notice);
    if (result.error) {
        showFeedback('Enregistrement impossible.', true);
        return;
    }
    form.reset();
    form.elements.active.checked = true;
    editingId = null;
    showFeedback('Information enregistrée.');
    await renderAdminList();
});

document.getElementById('notice-preview-button').addEventListener('click', () => showPreview(formNotice()));
document.getElementById('notice-preview-close').addEventListener('click', () => previewDialog.close());

async function initAdmin() {
    const context = await requireAuthorizedUser({ client });
    if (context.state === AUTHORIZATION_STATES.NO_SESSION || context.state === AUTHORIZATION_STATES.SESSION_ERROR) {
        window.location.href = 'index.html';
        return;
    }
    if (context.state !== AUTHORIZATION_STATES.AUTHORIZED || context.isAdmin !== true) {
        denied.classList.remove('hidden');
        return;
    }
    adminAuthorized = true;
    app.classList.remove('hidden');
    await renderAdminList();
}

initAdmin().catch(() => {
    adminAuthorized = false;
    denied.classList.remove('hidden');
});
