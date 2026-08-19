import { createWheelDimensionKey } from './wheel-dimension-index.js';

export const JUMELAGES_TYPES = Object.freeze(['EVO', '360', 'TGD', 'TGD+']);

export const JUMELAGES_TIRE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=139891043&single=true&output=csv';

export const JUMELAGES_CATALOG_URLS = Object.freeze({
    EVO: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=1732806915&single=true&output=csv',
    '360': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=1287684735&single=true&output=csv',
    TGD: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=1649910681&single=true&output=csv',
    'TGD+': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=801659039&single=true&output=csv'
});

export function isAllowedJumelagesType(type) {
    return JUMELAGES_TYPES.includes(type);
}

export function isTgdJumelagesType(type) {
    return type === 'TGD' || type === 'TGD+';
}

export function getJumelagesCatalogUrl(type) {
    return isAllowedJumelagesType(type) ? JUMELAGES_CATALOG_URLS[type] : null;
}

export function getEncodedJumelagesType(type) {
    return isAllowedJumelagesType(type) ? encodeURIComponent(type) : null;
}

function parseCsvLine(line) {
    return line
        .split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/)
        .map((value) => value.trim().replace(/^\"|\"$/g, ''));
}

export function parseTgdCatalogCsv(csvText) {
    const rows = [];
    const lines = String(csvText ?? '').split(/\r?\n/);

    for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
        if (!lines[rowIndex].trim()) continue;
        const columns = parseCsvLine(lines[rowIndex]);
        if (columns.length < 4) continue;
        rows.push({
            largeurJante: columns[0] || '',
            diametre: columns[1] || '',
            nom: columns[2] || '',
            prix: columns[3] || '',
            tendeurs: '',
            colC: '',
            colD: '',
            kitSansJantes: '',
            joncs: '',
            paireTendeurs: '',
            entretoises: ''
        });
    }

    return rows;
}

export function filterTiresByAvailableCatalogDimensions(tireRows, catalogRows) {
    const availableDimensions = new Set(
        catalogRows
            .map((row) => createWheelDimensionKey(row.diametre, row.largeurJante))
            .filter((key) => key !== null)
    );

    return tireRows.filter((row) => {
        const key = createWheelDimensionKey(row.diametrePneu, row.largeurJante);
        return key !== null && availableDimensions.has(key);
    });
}

export function findCatalogProductsForTires(tireRows, catalogRows) {
    const requestedDimensions = new Set(
        tireRows
            .map((row) => createWheelDimensionKey(row.diametrePneu, row.largeurJante))
            .filter((key) => key !== null)
    );
    const products = catalogRows.filter((row) => {
        const key = createWheelDimensionKey(row.diametre, row.largeurJante);
        return key !== null && requestedDimensions.has(key);
    });
    const uniqueProducts = new Map();

    for (const product of products) {
        const dimensionKey = createWheelDimensionKey(product.diametre, product.largeurJante);
        const key = `${dimensionKey}|${String(product.nom ?? '').trim().toLowerCase()}|${String(product.prix ?? '').trim()}`;
        if (!uniqueProducts.has(key)) uniqueProducts.set(key, product);
    }

    return [...uniqueProducts.values()];
}
