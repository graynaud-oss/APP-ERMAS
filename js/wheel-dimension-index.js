export const NARROW_WHEELS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=21297594&single=true&output=csv';

export const VARIABLE_WAY_STATES = Object.freeze({
    PRICE: 'PRICE',
    NARROW_WHEELS: 'NARROW_WHEELS',
    UNAVAILABLE: 'UNAVAILABLE'
});

function parseCsvLine(line) {
    return line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((value) => value.trim().replace(/^"|"$/g, ''));
}

export function normalizeWheelDimensionPart(value) {
    const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;

    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) ? String(numericValue) : null;
}

export function createWheelDimensionKey(diameter, width) {
    const normalizedDiameter = normalizeWheelDimensionPart(diameter);
    const normalizedWidth = normalizeWheelDimensionPart(width);
    if (normalizedDiameter === null || normalizedWidth === null) return null;
    return `${normalizedDiameter}|${normalizedWidth}`;
}

export function buildWheelDimensionIndex(csvText) {
    const index = new Set();
    const lines = String(csvText ?? '').split('\n');

    for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
        if (!lines[rowIndex].trim()) continue;
        const columns = parseCsvLine(lines[rowIndex]);
        const key = createWheelDimensionKey(columns[1], columns[0]);
        if (key !== null) index.add(key);
    }

    return index;
}

export function getVariableWayState({ hasValidVariablePrice, diameter, width, narrowWheelDimensions }) {
    if (hasValidVariablePrice) return VARIABLE_WAY_STATES.PRICE;
    const key = createWheelDimensionKey(diameter, width);
    return key !== null && narrowWheelDimensions.has(key)
        ? VARIABLE_WAY_STATES.NARROW_WHEELS
        : VARIABLE_WAY_STATES.UNAVAILABLE;
}
