export const NARROW_WHEEL_PRICE_TIERS = Object.freeze([
    Object.freeze({ key: 'prixEco', label: 'ECO' }),
    Object.freeze({ key: 'prixPro', label: 'PRO' }),
    Object.freeze({ key: 'prixElite', label: 'ELITE' })
]);

export function parseNarrowWheelPrice(value) {
    const normalized = String(value ?? '').trim().replace(/[\s\u00a0]/g, '').replace(',', '.');
    if (!normalized) return null;
    const price = Number(normalized);
    return Number.isFinite(price) && price > 0 ? price : null;
}

export function getNarrowWheelPricesFromColumns(columns) {
    return {
        prixEco: String(columns[6] ?? '').trim(),
        prixPro: String(columns[7] ?? '').trim(),
        prixElite: String(columns[8] ?? '').trim()
    };
}

export function calculateNarrowWheelNetPrice(price, remise) {
    const validPrice = parseNarrowWheelPrice(price);
    if (validPrice === null) return null;
    const validRemise = Number.parseFloat(remise);
    return Number.isFinite(validRemise) && validRemise > 0
        ? validPrice * (1 - validRemise / 100)
        : validPrice;
}

export function formatNarrowWheelPrice(price) {
    return `${price.toFixed(2)} €`;
}

export function renderNarrowWheelPriceOffers(prices, remise, netVisible) {
    const hasRemise = Number.parseFloat(remise) > 0;
    const cards = NARROW_WHEEL_PRICE_TIERS.map(({ key, label }) => {
        const grossPrice = parseNarrowWheelPrice(prices[key]);
        if (grossPrice === null) {
            return `<article class="results-tier-card"><h3 class="results-tier-card__title">${label}</h3><p class="results-tier-card__unavailable">Non disponible</p></article>`;
        }

        const netPrice = calculateNarrowWheelNetPrice(grossPrice, remise);
        const netBlock = hasRemise
            ? `<div data-net-price ${netVisible ? '' : 'hidden'} class="results-tier-card__net"><span>Prix NET</span><strong>${formatNarrowWheelPrice(netPrice)}</strong></div>`
            : '';
        return `<article class="results-tier-card"><h3 class="results-tier-card__title">${label}</h3><div class="results-tier-card__gross"><span>Prix BRUT</span><strong>${formatNarrowWheelPrice(grossPrice)}</strong></div>${netBlock}</article>`;
    }).join('');

    return `<div class="results-tier-grid" aria-label="Comparaison des tarifs ECO, PRO et ELITE">${cards}</div>`;
}
