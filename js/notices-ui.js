const TYPE_LABELS = Object.freeze({
    information: 'Information',
    important: 'Important',
    maintenance: 'Maintenance'
});

function appendTextElement(documentObject, parent, tagName, className, text) {
    const element = documentObject.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
}

export function formatNoticeDate(value, locale = 'fr-FR') {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export function renderNoticeContent(container, notice, documentObject = globalThis.document) {
    container.replaceChildren();
    container.dataset.noticeType = notice.type;
    appendTextElement(documentObject, container, 'p', 'notice-modal__eyebrow', 'INFORMATION ERMAS');
    appendTextElement(documentObject, container, 'span', `notice-type notice-type--${notice.type}`, TYPE_LABELS[notice.type]);
    appendTextElement(documentObject, container, 'h2', 'notice-modal__title', notice.title);
    appendTextElement(documentObject, container, 'p', 'notice-modal__message', notice.message);
}

export function openNoticeDialog({ dialog, content, notice, acknowledgeButton, onAcknowledge }) {
    renderNoticeContent(content, notice, dialog.ownerDocument);
    acknowledgeButton.onclick = async () => {
        acknowledgeButton.disabled = true;
        await onAcknowledge?.(notice);
        dialog.close();
        acknowledgeButton.disabled = false;
    };
    dialog.showModal();
}

export function renderNoticesList({ container, notices, seenIds, onOpen, documentObject = globalThis.document }) {
    container.replaceChildren();
    if (notices.length === 0) {
        appendTextElement(documentObject, container, 'p', 'notices-list__empty', 'Aucune information active actuellement.');
        return;
    }

    for (const notice of notices) {
        const button = documentObject.createElement('button');
        button.type = 'button';
        button.className = 'notices-list__item';
        if (!seenIds.has(notice.id)) button.classList.add('is-unread');
        appendTextElement(documentObject, button, 'span', `notice-type notice-type--${notice.type}`, TYPE_LABELS[notice.type]);
        appendTextElement(documentObject, button, 'strong', 'notices-list__title', notice.title);
        appendTextElement(documentObject, button, 'span', 'notices-list__date', formatNoticeDate(notice.created_at));
        const excerpt = notice.message.length > 120 ? `${notice.message.slice(0, 117)}…` : notice.message;
        appendTextElement(documentObject, button, 'span', 'notices-list__excerpt', excerpt);
        appendTextElement(documentObject, button, 'span', 'notices-list__state', seenIds.has(notice.id) ? 'Lu' : 'Non lu');
        button.addEventListener('click', () => onOpen(notice));
        container.append(button);
    }
}
