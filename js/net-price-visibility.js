export const NET_PRICE_VISIBILITY_KEY = 'ermas_show_net_prices';

export function isNetPriceVisible(storage = globalThis.sessionStorage) {
    return storage?.getItem(NET_PRICE_VISIBILITY_KEY) === 'true';
}

export function setNetPriceVisible(visible, storage = globalThis.sessionStorage) {
    const normalizedVisible = visible === true;
    storage?.setItem(NET_PRICE_VISIBILITY_KEY, normalizedVisible ? 'true' : 'false');
    return normalizedVisible;
}

export function toggleNetPriceVisibility(storage = globalThis.sessionStorage) {
    return setNetPriceVisible(!isNetPriceVisible(storage), storage);
}
