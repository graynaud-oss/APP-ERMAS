import { calculateRepairNetPrice, findRepairPrice, formatRepairPrice, getAvailableRepairOptions, getRepairService } from './repairs-catalog.js';
import { isNetPriceVisible, setNetPriceVisible } from './net-price-visibility.js';

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function selectedLabel(service, key, value) {
    return service.selectors.find((selector) => selector.key === key)?.options.find((option) => option.value === value)?.label ?? '';
}

export function initializeRepairServicePage({ serviceId, remise = 0 }) {
    const service = getRepairService(serviceId);
    if (!service) return false;

    const state = { selection: {}, netVisible: isNetPriceVisible(), remise: Number.parseFloat(remise) || 0 };
    const title = document.getElementById('repair-service-title');
    const subtitle = document.getElementById('repair-service-description');
    const media = document.getElementById('repair-service-media');
    const form = document.getElementById('repair-service-form');
    const result = document.getElementById('repair-service-result');
    const status = document.getElementById('repair-service-status');
    const control = document.getElementById('net-price-control');
    const toggle = document.getElementById('net-price-toggle');
    const toggleState = document.getElementById('net-price-toggle-state');
    const back = document.getElementById('repair-service-back');

    title.textContent = service.label;
    subtitle.textContent = service.description;
    status.hidden = true;
    back.dataset.protectedRoute = `reparations-famille.html?family=${encodeURIComponent(service.family)}`;

    if (service.image) {
        const image = createElement('img', 'repair-service-image');
        image.src = service.image;
        image.alt = service.imageAlt;
        image.width = 1200;
        image.height = 420;
        media.replaceChildren(image);
        media.hidden = false;
    } else {
        media.replaceChildren();
        media.hidden = true;
    }

    function renderResult() {
        const gross = findRepairPrice(service.id, state.selection);
        result.replaceChildren();
        if (gross === null) {
            result.hidden = true;
            control.classList.add('hidden');
            return;
        }

        const card = createElement('article', 'repair-result-card');
        card.append(createElement('h2', 'repair-result-card__title', service.label));
        const parameters = createElement('dl', 'repair-result-card__parameters');
        service.selectors.forEach((selector) => {
            const row = createElement('div');
            row.append(createElement('dt', '', selector.label), createElement('dd', '', selectedLabel(service, selector.key, state.selection[selector.key])));
            parameters.append(row);
        });
        card.append(parameters);
        const prices = createElement('div', 'repair-result-card__prices');
        const grossLine = createElement('div', 'results-tier-card__gross');
        grossLine.append(createElement('span', '', 'Prix BRUT'), createElement('strong', '', formatRepairPrice(gross)));
        prices.append(grossLine);
        if (state.remise > 0 && state.netVisible) {
            const netLine = createElement('div', 'results-tier-card__net');
            netLine.dataset.netPrice = '';
            netLine.append(createElement('span', '', 'Prix NET'), createElement('strong', '', formatRepairPrice(calculateRepairNetPrice(gross, state.remise))));
            prices.append(netLine);
        }
        card.append(prices);
        result.append(card);
        result.hidden = false;
        control.classList.toggle('hidden', state.remise <= 0);
    }

    function renderSelectors() {
        form.replaceChildren();
        service.selectors.forEach((selector, selectorIndex) => {
            const field = createElement('div', 'repair-field');
            const id = `repair-${selector.key}`;
            const label = createElement('label', 'repair-field__label', selector.label);
            label.htmlFor = id;
            const select = createElement('select', 'repair-field__select');
            select.id = id;
            select.name = selector.key;
            const placeholder = createElement('option', '', 'Sélectionnez…');
            placeholder.value = '';
            select.append(placeholder);
            getAvailableRepairOptions(service.id, selector.key, state.selection).forEach((option) => {
                const element = createElement('option', '', option.label);
                element.value = option.value;
                element.selected = state.selection[selector.key] === option.value;
                select.append(element);
            });
            select.disabled = selectorIndex > 0 && !state.selection[service.selectors[selectorIndex - 1].key];
            select.addEventListener('change', () => {
                if (select.value) state.selection[selector.key] = select.value;
                else delete state.selection[selector.key];
                service.selectors.slice(selectorIndex + 1).forEach(({ key }) => delete state.selection[key]);
                renderSelectors();
                renderResult();
            });
            field.append(label, select);
            form.append(field);
        });
    }

    toggle.checked = state.netVisible;
    toggleState.textContent = state.netVisible ? 'ON' : 'OFF';
    toggle.addEventListener('change', () => {
        state.netVisible = setNetPriceVisible(toggle.checked);
        toggleState.textContent = state.netVisible ? 'ON' : 'OFF';
        renderResult();
    });

    renderSelectors();
    renderResult();
    return true;
}

export function showRepairCatalogUnavailable(serviceId) {
    const service = getRepairService(serviceId);
    if (!service) return false;
    document.getElementById('repair-service-title').textContent = service.label;
    document.getElementById('repair-service-description').textContent = service.description;
    document.getElementById('repair-service-back').dataset.protectedRoute = `reparations-famille.html?family=${encodeURIComponent(service.family)}`;
    document.getElementById('repair-service-form').replaceChildren();
    document.getElementById('repair-service-result').hidden = true;
    document.getElementById('net-price-control').classList.add('hidden');
    const status = document.getElementById('repair-service-status');
    status.textContent = 'Tarifs temporairement indisponibles.';
    status.hidden = false;
    return true;
}
