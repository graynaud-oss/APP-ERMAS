export const PRODUCT_OPTION_FAMILIES = Object.freeze({
    STANDARD_WHEELS: 'standard-wheels',
    NARROW_WHEELS: 'narrow-wheels',
    DUAL_WHEELS: 'dual-wheels'
});

export const PRODUCT_OPTION_PRICES = Object.freeze({
    HLE_15: 364,
    HLE_20: 457,
    TELEINFLATION: 83.5,
    RIM_STRIPE: 234
});

export function hasValidOptionDiscount(remise) {
    const parsedDiscount = Number.parseFloat(remise);
    return Number.isFinite(parsedDiscount) && parsedDiscount > 0;
}

export function calculateOptionNetPrice(grossPrice, remise) {
    const parsedPrice = Number.parseFloat(grossPrice);
    const parsedDiscount = Number.parseFloat(remise);
    return parsedPrice * (1 - parsedDiscount / 100);
}

export function formatOptionPrice(price) {
    return `${Number(price).toFixed(2)} €`;
}

function renderPrice(price, remise, netPriceVisible) {
    const grossPrice = formatOptionPrice(price);
    if (!hasValidOptionDiscount(remise)) {
        return `<div class="product-options__price"><span>Prix BRUT</span><strong>${grossPrice}</strong></div>`;
    }

    const netPrice = formatOptionPrice(calculateOptionNetPrice(price, remise));
    return `
        <div class="product-options__price"><span>Prix BRUT</span><strong>${grossPrice}</strong></div>
        <div class="product-options__price product-options__price--net results-price-block__net" data-net-price ${netPriceVisible ? '' : 'hidden'}><span class="text-[10px] uppercase tracking-wider text-red-400 font-semibold">Prix NET</span><strong class="text-white font-bold text-sm">${netPrice}</strong></div>
    `;
}

function renderSingleOption(title, price, remise, netPriceVisible) {
    return `
        <article class="product-options__card">
            <h3>${title}</h3>
            ${renderPrice(price, remise, netPriceVisible)}
        </article>
    `;
}

function renderHleOption(remise, netPriceVisible) {
    return `
        <article class="product-options__card">
            <h3>Centre renforcé HLE</h3>
            <p class="product-options__variant-note">Deux variantes au choix</p>
            <div class="product-options__variant">
                <h4>15 mm</h4>
                ${renderPrice(PRODUCT_OPTION_PRICES.HLE_15, remise, netPriceVisible)}
            </div>
            <div class="product-options__variant">
                <h4>20 mm</h4>
                ${renderPrice(PRODUCT_OPTION_PRICES.HLE_20, remise, netPriceVisible)}
            </div>
        </article>
    `;
}

export function renderAvailableProductOptions({ family, discount, netPriceVisible, hasResults = true }) {
    if (!hasResults) return '';

    const includeHle = family === PRODUCT_OPTION_FAMILIES.STANDARD_WHEELS;
    const cards = [
        includeHle ? renderHleOption(discount, netPriceVisible) : '',
        renderSingleOption('Pré-équipement télégonflage', PRODUCT_OPTION_PRICES.TELEINFLATION, discount, netPriceVisible),
        renderSingleOption('Peinture à liseret', PRODUCT_OPTION_PRICES.RIM_STRIPE, discount, netPriceVisible)
    ].join('');

    const introduction = includeHle
        ? 'Les jantes présentées ci-dessus peuvent recevoir les équipements et finitions suivants.'
        : 'Les produits présentés ci-dessus peuvent recevoir les équipements et finitions suivants.';

    return `
        <section class="product-options" data-product-options aria-labelledby="product-options-title">
            <div class="product-options__heading">
                <h2 id="product-options-title">OPTIONS DISPONIBLES</h2>
                <p>${introduction}</p>
            </div>
            <div class="product-options__grid${includeHle ? '' : ' product-options__grid--compact'}">${cards}</div>
        </section>
    `;
}
