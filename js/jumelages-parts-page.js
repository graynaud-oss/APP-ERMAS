import { AUTHORIZATION_STATES, requireAuthorizedUser } from './auth-guard.js';
import { getSupabaseClient } from './supabase-client.js';
import { isNetPriceVisible, setNetPriceVisible } from './net-price-visibility.js';
import {
    filterPartsByGamme,
    findSelectedParts,
    getFieldOptions,
    getPartType,
    getRepereLabel,
    getVariantFields,
    groupPartsByRepere,
    JUMELAGES_PARTS_CSV_URL,
    parsePartsCatalogCsv,
    PARTS_CATALOG_GAMMES,
    PARTS_HOTSPOTS,
    transformHotspotPositionForDesktop,
    transformHotspotPositionForMobile
} from './jumelages-parts-catalog.js';

const supabaseClient = getSupabaseClient();

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function formatPrice(value) {
    return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export async function initPartsCatalogPage() {
    const root = document.querySelector('[data-parts-catalog-gamme]');
    const gamme = root?.dataset.partsCatalogGamme;
    if (!PARTS_CATALOG_GAMMES.includes(gamme)) {
        window.location.href = 'jumelages.html';
        return;
    }

    let context;
    try {
        context = await requireAuthorizedUser({ client: supabaseClient });
    } catch {
        window.location.href = 'index.html';
        return;
    }
    if (context.state !== AUTHORIZATION_STATES.AUTHORIZED) {
        window.location.href = 'index.html';
        return;
    }

    const content = document.getElementById('parts-protected-content');
    const status = document.getElementById('parts-status');
    let items;
    try {
        const response = await fetch(JUMELAGES_PARTS_CSV_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        items = filterPartsByGamme(parsePartsCatalogCsv(await response.text()), gamme);
        if (items.length === 0 || items.some(item => item.gamme !== gamme)) throw new Error('Catalogue de gamme incohérent');
    } catch {
        status.textContent = 'Le catalogue de pièces est momentanément indisponible.';
        status.classList.add('parts-status--error');
        content.hidden = false;
        return;
    }

    const state = {
        remise: Number.parseFloat(context.profile?.remise) || 0,
        netVisible: isNetPriceVisible(),
        selectedRepere: '',
        selections: {}
    };
    const groups = groupPartsByRepere(items);
    status.textContent = 'Sélectionnez une pièce sur le schéma.';
    renderHotspots(gamme, groups, state);
    installNetControl(state);
    content.hidden = false;

    function selectRepere(repere) {
        state.selectedRepere = repere;
        state.selections = {};
        document.querySelectorAll('[data-parts-repere]').forEach(element => {
            const selected = element.dataset.partsRepere === repere;
            element.classList.toggle('is-selected', selected);
            element.setAttribute('aria-pressed', String(selected));
        });
        renderPartCard(repere, groups.get(repere) || [], state, selectRepere);
        document.getElementById('parts-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderHotspots(currentGamme, currentGroups) {
        const layer = document.getElementById('parts-hotspots');
        Object.entries(PARTS_HOTSPOTS[currentGamme]).forEach(([repere, coordinates]) => {
            if (!currentGroups.has(repere)) return;
            const positions = Array.isArray(coordinates[0]) ? coordinates : [coordinates];
            positions.forEach((position, positionIndex) => {
                const button = createElement('button', 'parts-hotspot');
                button.type = 'button';
                const desktopPosition = transformHotspotPositionForDesktop(currentGamme, repere, position, positionIndex);
                const mobilePosition = transformHotspotPositionForMobile(currentGamme, repere, position, positionIndex);
                button.style.setProperty('--parts-desktop-x', `${desktopPosition[0]}%`);
                button.style.setProperty('--parts-desktop-y', `${desktopPosition[1]}%`);
                button.style.setProperty('--parts-mobile-x', `${mobilePosition[0]}%`);
                button.style.setProperty('--parts-mobile-y', `${mobilePosition[1]}%`);
                button.dataset.partsRepere = repere;
                button.setAttribute('aria-label', `Repère ${repere.toUpperCase()} — ${getRepereLabel(repere, currentGroups.get(repere))}`);
                button.setAttribute('aria-pressed', 'false');
                const visualLabel = repere === 'd-e' ? (positionIndex === 0 ? 'd' : 'e') : repere;
                const label = createElement('span', 'parts-hotspot__label', visualLabel === 'l' ? 'L' : visualLabel);
                label.setAttribute('aria-hidden', 'true');
                button.append(label);
                button.addEventListener('click', () => selectRepere(repere));
                layer.append(button);
            });
        });
    }

}

function installNetControl(state) {
    const control = document.getElementById('net-price-control');
    const toggle = document.getElementById('net-price-toggle');
    const status = document.getElementById('net-price-toggle-state');
    control.classList.toggle('hidden', state.remise <= 0);
    toggle.checked = state.netVisible;
    status.textContent = state.netVisible ? 'ON' : 'OFF';
    toggle.addEventListener('change', () => {
        state.netVisible = setNetPriceVisible(toggle.checked);
        status.textContent = state.netVisible ? 'ON' : 'OFF';
        document.querySelectorAll('[data-net-price]').forEach(element => { element.hidden = !state.netVisible; });
    });
}

function renderPartCard(repere, items, state) {
    const detail = document.getElementById('parts-detail');
    detail.replaceChildren();
    const eyebrow = createElement('p', 'parts-detail__eyebrow', repere ? `Repère ${repere.toUpperCase()}` : 'Pièce sélectionnée');
    const title = createElement('h2', 'parts-detail__title', getRepereLabel(repere, items));
    const form = createElement('div', 'parts-variant-form');
    detail.append(eyebrow, title, form);

    const fields = getVariantFields(repere, items, state.selections);
    renderFields(fields);
    renderMatches();

    function renderFields(currentFields) {
        form.replaceChildren();
        currentFields.forEach((field, index) => {
            const wrapper = createElement('label', 'parts-field');
            const label = createElement('span', 'parts-field__label', `${index + 1}. ${field.label}`);
            const select = createElement('select', 'parts-field__select');
            select.dataset.variantField = field.key;
            const placeholder = createElement('option', '', `Sélectionnez ${field.label.toLowerCase()}`);
            placeholder.value = '';
            select.append(placeholder);
            getFieldOptions(items, state.selections, field.key).forEach(value => {
                const option = createElement('option', '', value);
                option.value = value;
                select.append(option);
            });
            select.value = state.selections[field.key] || '';
            select.addEventListener('change', () => {
                const position = currentFields.findIndex(candidate => candidate.key === field.key);
                currentFields.slice(position).forEach(candidate => { delete state.selections[candidate.key]; });
                state.selections[field.key] = select.value;
                const nextFields = getVariantFields(repere, items, state.selections);
                renderFields(nextFields);
                renderMatches();
            });
            wrapper.append(label, select);
            form.append(wrapper);
        });
    }

    function renderMatches() {
        detail.querySelector('.parts-price-results')?.remove();
        const currentFields = getVariantFields(repere, items, state.selections);
        const matches = currentFields.length === 0 ? items : findSelectedParts(items, state.selections, currentFields);
        const results = createElement('div', 'parts-price-results');
        if (matches.length === 0) {
            results.append(createElement('p', 'parts-detail__instruction', currentFields.length ? 'Complétez les choix pour afficher le prix.' : 'Aucun tarif disponible.'));
        } else {
            matches.forEach(item => results.append(createPriceCard(item, state)));
        }
        detail.append(results);
    }
}

function createPriceCard(item, state) {
    const card = createElement('article', 'parts-price-card');
    card.append(createElement('h3', 'parts-price-card__title', item.designation));
    const details = [
        item.variante,
        item.dimension,
        item.diametrePouces ? `Ø ${item.diametrePouces}\"` : '',
        item.longueurMm ? `${item.longueurMm} mm` : '',
        item.plageDiametre
    ].filter(Boolean);
    if (details.length) card.append(createElement('p', 'parts-price-card__meta', details.join(' · ')));
    if (item.categorie === 'SUPPLEMENT') card.append(createElement('p', 'parts-price-card__notice', 'Supplément — à ajouter au prix de la pièce principale.'));

    if (item.prixBrut === null) {
        card.append(createElement('p', 'parts-price-card__unavailable', 'Prix sur consultation'));
        return card;
    }
    const prices = createElement('div', 'parts-prices');
    const gross = createElement('div', 'parts-price-line');
    gross.append(createElement('span', '', 'Prix BRUT'), createElement('strong', '', formatPrice(item.prixBrut)));
    prices.append(gross);
    if (state.remise > 0) {
        const net = createElement('div', 'parts-price-line parts-price-line--net');
        net.dataset.netPrice = '';
        net.hidden = !state.netVisible;
        const netValue = item.prixBrut * (1 - state.remise / 100);
        net.append(createElement('span', '', 'Prix NET'), createElement('strong', '', formatPrice(netValue)));
        prices.append(net);
    }
    card.append(prices);
    return card;
}

initPartsCatalogPage().catch(() => { window.location.href = 'index.html'; });
