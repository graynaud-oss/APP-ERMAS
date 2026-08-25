import { getRepairFamily, getRepairServicesByFamily } from './repairs-catalog.js';

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createServiceButton(service) {
    const button = createElement('button', 'app-choice-card');
    button.type = 'button';
    button.dataset.repairRoute = `reparations-prestation.html?type=${encodeURIComponent(service.id)}`;
    const icon = createElement('span', 'app-choice-card__icon', '↗');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, createElement('span', 'app-choice-card__title', service.label), createElement('span', 'app-choice-card__description', service.description));
    return button;
}

export function renderRepairFamily({ familyId, onNavigate }) {
    const family = getRepairFamily(familyId);
    if (!family) return false;
    document.getElementById('repair-family-title').textContent = family.label;
    document.getElementById('repair-family-subtitle').textContent = family.description;
    const grid = document.getElementById('repair-family-services');
    grid.replaceChildren(...getRepairServicesByFamily(family.id).map(createServiceButton));
    grid.querySelectorAll('[data-repair-route]').forEach((button) => button.addEventListener('click', () => onNavigate(button.dataset.repairRoute)));
    return true;
}
