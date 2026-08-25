export const REPAIRS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTWjGoPLparHgevFFnvi4cOqQk-q12ZqXSJzZEOWQDr7p-5DRPE4zTuWKXPQQh9m4eZRVHql-B8tf1F/pub?gid=846887838&single=true&output=csv';

const CSV_HEADERS = Object.freeze(['FAMILLE', 'PRESTATION', 'VARIANTE', 'TRANCHE_DIAMETRE', 'EPAISSEUR', 'LARGEUR_MODIFICATION', 'TYPE_PERCAGE', 'NOMBRE_TROUS', 'PRIX']);

export const REPAIR_FAMILIES = Object.freeze([
    { id: 'centres-percage', label: 'Centres & perçage', description: 'Réfections de centre et opérations de perçage.' },
    { id: 'renforcement', label: 'Renforcement', description: 'Renforts et semelles pour jantes agricoles.' },
    { id: 'largeur', label: 'Modification de largeur', description: 'Élargissement ou rétrécissement de jante.' },
    { id: 'deplacement', label: 'Déplacement de voile', description: 'Déplacement de voile embouti soudé.' }
]);

const CENTER_DIAMETERS = Object.freeze([
    { value: 'd200', label: 'Jusqu’à Ø 200 - Ø oxycoupe < 280' },
    { value: 'd203-275', label: 'Ø 203,2 à 275 - Ø oxycoupe < 450' },
    { value: 'd280-335', label: 'Ø 280 à 335 - Ø oxycoupe < 500' }
]);
const THICKNESSES = Object.freeze([
    { value: '12', label: 'Épaisseur 12 mm' }, { value: '15', label: 'Épaisseur 15 mm' },
    { value: '15-special', label: 'Épaisseur 15 mm - acier spécifique' }, { value: '18', label: 'Épaisseur 18 mm' },
    { value: '20', label: 'Épaisseur 20 mm' }, { value: '20-special', label: 'Épaisseur 20 mm - acier spécifique' }
]);
const RIM_DIAMETERS = Object.freeze([
    { value: 'up24', label: 'Ø jante jusqu’à 24″' }, { value: '25-32', label: 'Ø jante de 25″ à 32″' },
    { value: '34-38', label: 'Ø jante de 34″ à 38″' }, { value: '40-48', label: 'Ø jante de 40″ à 48″' },
    { value: '50-54', label: 'Ø jante de 50″ à 54″' }
]);
const SUPPORTS = Object.freeze([{ value: 'voile-nu', label: 'Voile nu' }, { value: 'voile-soude', label: 'Voile soudé' }]);
const DRILLINGS = Object.freeze([{ value: 'unit', label: 'Trou unitaire' }, { value: '8', label: '8 trous' }, { value: '10', label: '10 trous' }, { value: '12', label: '12 trous' }]);
const REINFORCEMENTS = Object.freeze([
    { value: 'round-weld-on', label: 'Fer rond D20, la paire - à souder' }, { value: 'round-welded', label: 'Fer rond D20, la paire - soudé' },
    { value: 'flat-weld-on', label: 'Fer plat 40 × 12, la paire - à souder' }, { value: 'flat-welded', label: 'Fer plat 40 × 12, la paire - soudé' }
]);
const WIDTHS = Object.freeze([{ value: '1-2', label: '1″ à 2″' }, { value: '3-4', label: '3″ à 4″' }, { value: '5-6', label: '5″ à 6″' }, { value: '7-10', label: '7″ à 10″' }]);

const SERVICES = Object.freeze([
    { id: 'refection-centre-voile-nu', family: 'centres-percage', label: 'Réfection de centre de voile nu', description: 'Modification du perçage d’un voile existant ou réparation d’un centre endommagé.', image: 'assets/reparations/refection-centre-voile-nu.png', imageAlt: 'Étapes de réfection du centre d’un voile nu.', selectors: [{ key: 'diameter', label: 'Diamètre d’implantation / oxycoupe', options: CENTER_DIAMETERS }, { key: 'thickness', label: 'Épaisseur du voile', options: THICKNESSES }] },
    { id: 'refection-centre-voile-soude', family: 'centres-percage', label: 'Réfection de centre sur jante à voile soudé', description: 'Réfection du centre directement sur une jante à voile soudé.', image: 'assets/reparations/refection-centre-voile-soude.png', imageAlt: 'Étapes de réfection du centre d’une jante à voile soudé.', selectors: [{ key: 'diameter', label: 'Diamètre d’implantation / oxycoupe', options: CENTER_DIAMETERS }, { key: 'thickness', label: 'Épaisseur du voile', options: THICKNESSES }] },
    { id: 'percage', family: 'centres-percage', label: 'Perçage', description: 'Perçage d’un voile nu ou d’un voile soudé selon le nombre de trous.', selectors: [{ key: 'support', label: 'Support', options: SUPPORTS }, { key: 'drilling', label: 'Type de perçage', options: DRILLINGS }] },
    { id: 'renfort-jante', family: 'renforcement', label: 'Renfort de jante', description: 'Ajout d’un renfort adapté aux fortes contraintes et aux élargissements importants.', image: 'assets/reparations/renfort-jante.png', imageAlt: 'Principe de pose d’un renfort de jante.', selectors: [{ key: 'reinforcement', label: 'Type de renfort', options: REINFORCEMENTS }, { key: 'diameter', label: 'Diamètre de jante', options: RIM_DIAMETERS }] },
    { id: 'semelle-fond-jante', family: 'renforcement', label: 'Semelle en fond de jante', description: 'Semelle soudée permettant d’augmenter la largeur du voile et la capacité de charge.', image: 'assets/reparations/semelle-jante.png', imageAlt: 'Principe de pose d’une semelle en fond de jante.', selectors: [{ key: 'diameter', label: 'Diamètre de jante', options: RIM_DIAMETERS }] },
    { id: 'elargissement-jante', family: 'largeur', label: 'Élargissement de jante', description: 'Ajout d’une bande circulaire d’acier afin d’augmenter la largeur de la jante.', image: 'assets/reparations/elargissement-jante.png', imageAlt: 'Principe d’élargissement d’une jante.', selectors: [{ key: 'width', label: 'Largeur d’élargissement', options: WIDTHS }, { key: 'diameter', label: 'Diamètre de jante', options: RIM_DIAMETERS }] },
    { id: 'retrecissement-jante', family: 'largeur', label: 'Rétrécissement de jante', description: 'Retrait d’une bande circulaire d’acier afin de diminuer la largeur de la jante.', image: 'assets/reparations/retrecissement-jante.png', imageAlt: 'Principe de rétrécissement d’une jante.', selectors: [{ key: 'diameter', label: 'Diamètre de jante', options: RIM_DIAMETERS }] },
    { id: 'deplacement-voile', family: 'deplacement', label: 'Déplacement de voile embouti soudé', description: 'Usinage de la soudure, déplacement du voile puis nouvelle soudure.', image: 'assets/reparations/deplacement-voile.png', imageAlt: 'Principe de déplacement d’un voile embouti soudé.', selectors: [{ key: 'diameter', label: 'Diamètre de jante', options: RIM_DIAMETERS }] }
]);

export const REPAIR_SERVICES = SERVICES;
export const REPAIR_SERVICE_IDS = Object.freeze(SERVICES.map(({ id }) => id));
let catalogPrices = new Map();

function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
            else if (character === '"') quoted = false;
            else cell += character;
        } else if (character === '"') quoted = true;
        else if (character === ',') { row.push(cell); cell = ''; }
        else if (character === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
        else cell += character;
    }
    if (quoted) throw new Error('CSV invalide : guillemet non fermé.');
    if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    while (rows.length && rows.at(-1).every((value) => value.trim() === '')) rows.pop();
    return rows;
}

const optionValue = (options, label) => options.find((option) => option.label === label)?.value ?? null;
const selectionKey = (serviceId, selection) => `${serviceId}|${Object.keys(selection).sort().map((key) => `${key}=${selection[key]}`).join('|')}`;

function expectedSelectionKeys() {
    const keys = new Set();
    for (const service of SERVICES) {
        const first = service.selectors[0].options;
        const second = service.selectors[1]?.options ?? [null];
        for (const firstOption of first) for (const secondOption of second) {
            if (service.id.startsWith('refection-centre-') && firstOption.value === 'd200' && !['12', '15'].includes(secondOption.value)) continue;
            const selection = { [service.selectors[0].key]: firstOption.value };
            if (secondOption) selection[service.selectors[1].key] = secondOption.value;
            keys.add(selectionKey(service.id, selection));
        }
    }
    return keys;
}

const EXPECTED_SELECTION_KEYS = expectedSelectionKeys();

function rowToPriceEntry(record) {
    const service = SERVICES.find(({ label }) => label === record.PRESTATION);
    if (!service) throw new Error(`Prestation inconnue : ${record.PRESTATION}`);
    const family = REPAIR_FAMILIES.find(({ id }) => id === service.family);
    if (record.FAMILLE !== family.label) throw new Error(`Famille incohérente pour ${service.label}.`);
    const selection = {};
    for (const selector of service.selectors) {
        const column = selector.key === 'diameter' ? 'TRANCHE_DIAMETRE'
            : selector.key === 'thickness' ? 'EPAISSEUR'
            : selector.key === 'width' ? 'LARGEUR_MODIFICATION'
            : selector.key === 'support' || selector.key === 'reinforcement' ? 'VARIANTE'
            : 'TYPE_PERCAGE';
        const value = optionValue(selector.options, record[column]);
        if (!value) throw new Error(`Option inconnue pour ${service.label} : ${record[column]}`);
        selection[selector.key] = value;
    }
    if (service.id === 'percage') {
        const expectedHoles = selection.drilling === 'unit' ? '' : selection.drilling;
        if (record.NOMBRE_TROUS !== expectedHoles) throw new Error('Nombre de trous incohérent.');
    }
    const gross = Number(record.PRIX);
    if (!record.PRIX.trim() || !Number.isFinite(gross) || gross <= 0) throw new Error(`Prix invalide pour ${service.label}.`);
    return { serviceId: service.id, selection, gross };
}

export function parseRepairsCatalogCsv(csvText) {
    const rows = parseCsv(csvText);
    if (!rows.length || rows[0].length !== CSV_HEADERS.length || !CSV_HEADERS.every((header, index) => rows[0][index] === header)) throw new Error('Structure CSV invalide.');
    if (rows.slice(1).some((row) => row.length !== CSV_HEADERS.length || row.every((value) => value.trim() === ''))) throw new Error('Ligne CSV invalide.');
    const entries = rows.slice(1).map((row) => rowToPriceEntry(Object.fromEntries(CSV_HEADERS.map((header, index) => [header, row[index].trim()]))));
    if (entries.length !== EXPECTED_SELECTION_KEYS.size || entries.length !== 91) throw new Error('Le catalogue doit contenir exactement 91 tarifs.');
    const actualKeys = new Set(entries.map(({ serviceId, selection }) => selectionKey(serviceId, selection)));
    if (actualKeys.size !== entries.length || actualKeys.size !== EXPECTED_SELECTION_KEYS.size || [...EXPECTED_SELECTION_KEYS].some((key) => !actualKeys.has(key))) throw new Error('Combinaisons tarifaires manquantes ou dupliquées.');
    return entries;
}

export async function loadRepairsCatalog({ fetchImpl = globalThis.fetch } = {}) {
    catalogPrices = new Map();
    if (typeof fetchImpl !== 'function') throw new Error('Chargement des tarifs indisponible.');
    const response = await fetchImpl(REPAIRS_CSV_URL, { cache: 'no-store' });
    if (!response?.ok) throw new Error('Réponse tarifaire indisponible.');
    const entries = parseRepairsCatalogCsv(await response.text());
    catalogPrices = new Map(entries.map((entry) => [selectionKey(entry.serviceId, entry.selection), entry.gross]));
    return entries.length;
}

export function getRepairFamily(familyId) { return REPAIR_FAMILIES.find(({ id }) => id === familyId) ?? null; }
export function getRepairService(serviceId) { return SERVICES.find(({ id }) => id === serviceId) ?? null; }
export function getRepairServicesByFamily(familyId) { return getRepairFamily(familyId) ? SERVICES.filter(({ family }) => family === familyId) : []; }
export function getAvailableRepairOptions(serviceId, key, selection = {}) {
    const service = getRepairService(serviceId);
    const selectorIndex = service?.selectors.findIndex((selector) => selector.key === key) ?? -1;
    if (!service || selectorIndex < 0) return [];
    const previousKeys = service.selectors.slice(0, selectorIndex).map(({ key: previousKey }) => previousKey);
    const validValues = new Set();
    for (const expectedKey of EXPECTED_SELECTION_KEYS) {
        if (!expectedKey.startsWith(`${service.id}|`)) continue;
        const values = Object.fromEntries(expectedKey.split('|').slice(1).map((part) => part.split('=')));
        if (previousKeys.every((previousKey) => values[previousKey] === selection[previousKey])) validValues.add(values[key]);
    }
    return service.selectors[selectorIndex].options.filter(({ value }) => validValues.has(value));
}
export function findRepairPrice(serviceId, selection = {}) {
    const service = getRepairService(serviceId);
    if (!service || !service.selectors.every(({ key }) => typeof selection[key] === 'string')) return null;
    return catalogPrices.get(selectionKey(serviceId, selection)) ?? null;
}
export function calculateRepairNetPrice(grossPrice, remise) {
    const gross = Number.parseFloat(grossPrice);
    const discount = Number.parseFloat(remise);
    if (!Number.isFinite(gross) || !Number.isFinite(discount)) return null;
    return gross * (1 - discount / 100);
}
export function formatRepairPrice(price) { return `${Number(price).toFixed(2).replace('.', ',')} €`; }
