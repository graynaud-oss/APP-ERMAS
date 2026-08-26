export function applyManiproNetVisibility(elements, visible) {
    const netVisible = visible === true;
    Array.from(elements).forEach((element) => {
        element.hidden = !netVisible;
        element.classList?.toggle('hidden', !netVisible);
    });
    return netVisible;
}

export function hasValidDiscount(value) {
    const discount = Number(value);
    return value !== null && value !== '' && Number.isFinite(discount) && discount > 0;
}
