export const JUMELAGES_PARTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=350997467&single=true&output=csv';

export const PARTS_CATALOG_GAMMES = Object.freeze(['EVO', '360']);
export const PARTS_CATALOG_COLUMNS = Object.freeze([
    'GAMME', 'REPERE', 'CATEGORIE', 'DESIGNATION', 'VARIANTE',
    'DIAMETRE_POUCES', 'LONGUEUR_MM', 'DIMENSION', 'PLAGE_DIAMETRE', 'PRIX_HT'
]);

const FIELD_LABELS = Object.freeze({
    designation: 'Variante',
    type: "Type d'entretoise",
    dimension: 'Dimension',
    longueurMm: 'Longueur sous tête',
    diametrePouces: 'Diamètre',
    plageDiametre: 'Plage de diamètre',
    variante: 'Plage de diamètre'
});

function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < String(text ?? '').length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            row.push(cell);
            cell = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && text[index + 1] === '\n') index += 1;
            row.push(cell);
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += character;
        }
    }
    row.push(cell);
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
}

export function parsePartsCatalogCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];
    const headers = rows[0].map(value => value.replace(/^\uFEFF/, '').trim());
    if (headers.length !== PARTS_CATALOG_COLUMNS.length
        || PARTS_CATALOG_COLUMNS.some((column, index) => headers[index] !== column)) {
        throw new Error('Structure CSV pièces détachées inattendue');
    }

    return rows.slice(1).map(values => ({
        gamme: String(values[0] ?? '').trim(),
        repere: String(values[1] ?? '').trim().toLowerCase(),
        categorie: String(values[2] ?? '').trim(),
        designation: String(values[3] ?? '').trim(),
        variante: String(values[4] ?? '').trim(),
        diametrePouces: String(values[5] ?? '').trim(),
        longueurMm: String(values[6] ?? '').trim(),
        dimension: String(values[7] ?? '').trim(),
        plageDiametre: String(values[8] ?? '').trim(),
        prixBrut: parseFrenchPrice(values[9])
    })).filter(item => item.gamme || item.repere || item.designation);
}

export function parseFrenchPrice(value) {
    const normalized = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (normalized === '') return null;
    const price = Number(normalized);
    return Number.isFinite(price) ? price : null;
}

export function filterPartsByGamme(items, gamme) {
    if (!PARTS_CATALOG_GAMMES.includes(gamme)) return [];
    return items.filter(item => item.gamme === gamme);
}

export function groupPartsByRepere(items) {
    const groups = new Map();
    items.forEach(item => {
        const key = item.repere || '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });
    return groups;
}

export function getPartType(item) {
    return `${item.categorie} — ${item.designation}`;
}

export function getVariantFields(repere, items, selections = {}) {
    if (items.length <= 1) return [];
    if (repere === 'f') return [{ key: 'longueurMm', label: 'Longueur' }];
    if (repere === 'g') return [{ key: 'designation', label: 'Type / diamètre' }];
    if (repere === 'h') return [
        { key: 'dimension', label: 'Dimension' },
        { key: 'longueurMm', label: 'Longueur sous tête' }
    ];
    if (repere === 'i') {
        const fields = [{ key: 'type', label: FIELD_LABELS.type }];
        const chosenType = selections.type || '';
        if (chosenType.includes('cylindrique pleine') || chosenType.includes('étagée pleine')) {
            fields.push({ key: 'diametrePouces', label: FIELD_LABELS.diametrePouces });
            fields.push({ key: 'longueurMm', label: 'Longueur' });
        } else if (chosenType) {
            fields.push({ key: 'plageDiametre', label: FIELD_LABELS.plageDiametre });
        }
        return fields;
    }
    if (repere === 'l') return [
        { key: 'designation', label: 'Type de jonc' },
        { key: 'variante', label: FIELD_LABELS.variante }
    ];

    const candidates = ['designation', 'variante', 'dimension', 'longueurMm', 'diametrePouces', 'plageDiametre'];
    return candidates
        .filter(key => new Set(items.map(item => item[key]).filter(Boolean)).size > 1)
        .map(key => ({ key, label: FIELD_LABELS[key] || key }));
}

export function getFieldValue(item, key) {
    return key === 'type' ? getPartType(item) : String(item[key] ?? '');
}

export function filterPartsBySelections(items, selections, stopBeforeKey = '') {
    const entries = Object.entries(selections);
    const limit = stopBeforeKey ? entries.findIndex(([key]) => key === stopBeforeKey) : entries.length;
    const activeEntries = limit >= 0 ? entries.slice(0, limit) : entries;
    return items.filter(item => activeEntries.every(([key, value]) => !value || getFieldValue(item, key) === value));
}

export function getFieldOptions(items, selections, key) {
    const eligible = filterPartsBySelections(items, selections, key);
    return [...new Set(eligible.map(item => getFieldValue(item, key)).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'fr', { numeric: true }));
}

export function findSelectedParts(items, selections, fields) {
    if (fields.some(field => !selections[field.key])) return [];
    return items.filter(item => fields.every(field => getFieldValue(item, field.key) === selections[field.key]));
}

export function getRepereLabel(repere, items) {
    if (!repere) return 'Autres pièces & services';
    const names = [...new Set(items.map(item => item.designation).filter(Boolean))];
    if (repere === 'i') return 'Entretoises';
    if (repere === 'g') return 'Œilletons & anneaux';
    if (repere === 'l') return 'Joncs';
    return names[0] || `Repère ${repere.toUpperCase()}`;
}

export function rotateHotspotPositionCounterClockwise(position) {
    if (!Array.isArray(position) || position.length !== 2
        || position.some(value => !Number.isFinite(value) || value < 0 || value > 100)) {
        throw new Error('Coordonnées de hotspot invalides');
    }
    return [position[1], 100 - position[0]];
}

export const PARTS_MOBILE_DIAGRAMS = Object.freeze({
    EVO: Object.freeze({
        sourceWidth: 2020,
        sourceHeight: 620,
        crop: Object.freeze({ left: 30, top: 180, right: 620, bottom: 1835 })
    }),
    360: Object.freeze({
        sourceWidth: 1960,
        sourceHeight: 470,
        crop: Object.freeze({ left: 30, top: 180, right: 470, bottom: 1810 })
    })
});

export const PARTS_DESKTOP_DIAGRAMS = Object.freeze({
    EVO: Object.freeze({
        sourceWidth: 2020,
        sourceHeight: 620,
        crop: Object.freeze({ left: 185, top: 30, right: 1840, bottom: 620 })
    }),
    360: Object.freeze({
        sourceWidth: 1960,
        sourceHeight: 470,
        crop: Object.freeze({ left: 150, top: 30, right: 1780, bottom: 470 })
    })
});

const PARTS_DESKTOP_HOTSPOT_ADJUSTMENTS = Object.freeze({
    EVO: Object.freeze({
        a: [[-4.3, 5.6]], b: [[-6, 6.3]], c: [[-10.6, 2.4]],
        'd-e': [[-1.6, 2.2], [2.8, -7.4]], f: [[-6.2, 0.3]],
        g: [[9.5, -1.6]], h: [[9.1, 0.4]], i: [[-7.7, 1.1]],
        j: [[-0.1, 8.6]], k: [[-9.7, -1.3]], l: [[-5.9, 2.4]], m: [[-1.8, 2.1]]
    }),
    360: Object.freeze({
        a: [[-1.1, 3.8]], b: [[-8.3, 4.3]], c: [[7.8, -0.3]],
        'd-e': [[-0.8, 4.1], [-5.8, 3.9]], f: [[-9.1, 4.3]],
        g: [[-0.4, 3.5]], h: [[0, 4.2]], i: [[-14.1, 6.1]],
        j: [[-12.4, 1.1]], k: [[-17.5, 20]], l: [[-1.3, 0.8]], m: [[-3.9, 10.7]]
    })
});

// Corrections résiduelles mesurées sur les centres des repères du bitmap.
// Elles restent propres au mobile et ne modifient jamais les mappings desktop.
const PARTS_MOBILE_HOTSPOT_ADJUSTMENTS = Object.freeze({
    EVO: Object.freeze({
        a: [[5.6, 3.3]], b: [[6.3, 5]], c: [[2.4, 9.6]],
        'd-e': [[2.2, 0.6], [-7.4, -3.8]], f: [[0.3, 5.2]],
        g: [[-1.6, -10.5]], h: [[0.4, -10.1]], i: [[1.1, 6.7]],
        j: [[8.6, -0.9]], k: [[-1.3, 8.7]], l: [[2.4, 4.9]], m: [[2.1, 0.8]]
    }),
    360: Object.freeze({
        a: [[3.8, 0.1]], b: [[4.3, 7.3]], c: [[-0.3, -8.8]],
        'd-e': [[4.1, -0.2], [3.9, 4.8]], f: [[4.3, 8.1]],
        g: [[3.5, -0.6]], h: [[4.2, -1]], i: [[6.1, 13.1]],
        j: [[1.1, 11.4]], k: [[20, 16.5]], l: [[0.8, 0.3]], m: [[10.7, 2.9]]
    })
});

export function transformHotspotPositionForMobile(gamme, repere, position, positionIndex = 0) {
    const diagram = PARTS_MOBILE_DIAGRAMS[gamme];
    if (!diagram) throw new Error('Gamme de schéma mobile invalide');
    rotateHotspotPositionCounterClockwise(position);

    const rotatedX = (position[1] / 100) * diagram.sourceHeight;
    const rotatedY = (1 - position[0] / 100) * diagram.sourceWidth;
    const adjustment = PARTS_MOBILE_HOTSPOT_ADJUSTMENTS[gamme]?.[repere]?.[positionIndex] || [0, 0];
    const cropWidth = diagram.crop.right - diagram.crop.left;
    const cropHeight = diagram.crop.bottom - diagram.crop.top;

    return [
        ((rotatedX + adjustment[0] - diagram.crop.left) / cropWidth) * 100,
        ((rotatedY + adjustment[1] - diagram.crop.top) / cropHeight) * 100
    ];
}

export function transformHotspotPositionForDesktop(gamme, repere, position, positionIndex = 0) {
    const diagram = PARTS_DESKTOP_DIAGRAMS[gamme];
    if (!diagram) throw new Error('Gamme de schéma desktop invalide');
    rotateHotspotPositionCounterClockwise(position);

    const adjustment = PARTS_DESKTOP_HOTSPOT_ADJUSTMENTS[gamme]?.[repere]?.[positionIndex] || [0, 0];
    const sourceX = (position[0] / 100) * diagram.sourceWidth + adjustment[0];
    const sourceY = (position[1] / 100) * diagram.sourceHeight + adjustment[1];
    const cropWidth = diagram.crop.right - diagram.crop.left;
    const cropHeight = diagram.crop.bottom - diagram.crop.top;

    return [
        ((sourceX - diagram.crop.left) / cropWidth) * 100,
        ((sourceY - diagram.crop.top) / cropHeight) * 100
    ];
}

export const PARTS_HOTSPOTS = Object.freeze({
    EVO: Object.freeze({
        a: [42, 16], b: [37, 32], c: [37, 50], 'd-e': [[46, 66], [49, 66]], f: [61, 40],
        g: [78, 55], h: [79, 89], i: [62, 86], j: [54, 82], k: [50, 81], l: [40, 72], m: [17, 81]
    }),
    360: Object.freeze({
        a: [32, 17], b: [37, 17], c: [41, 17], 'd-e': [[48, 17], [56, 17]], f: [66, 17],
        g: [84, 17], h: [88, 17], i: [64, 94], j: [55, 95], k: [51, 88], l: [39, 92], m: [17, 87]
    })
});
