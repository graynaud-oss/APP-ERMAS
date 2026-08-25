import { REPAIR_FAMILIES } from './repairs-catalog.js';

function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createRouteButton(title, description, route) {
    const button = createElement('button', 'app-choice-card');
    button.type = 'button';
    button.dataset.repairRoute = route;
    const icon = createElement('span', 'app-choice-card__icon', '↗');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, createElement('span', 'app-choice-card__title', title), createElement('span', 'app-choice-card__description', description));
    return button;
}

export function renderRepairMenu({ onNavigate }) {
    const familyGrid = document.getElementById('repair-family-grid');

    familyGrid.replaceChildren(...REPAIR_FAMILIES.map((family) => createRouteButton(
        family.label,
        family.description,
        family.id === 'deplacement'
            ? 'reparations-prestation.html?type=deplacement-voile'
            : `reparations-famille.html?family=${encodeURIComponent(family.id)}`
    )));

    document.querySelectorAll('[data-repair-route]').forEach((button) => {
        button.addEventListener('click', () => onNavigate(button.dataset.repairRoute));
    });
}
