import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const pages = ['jantes-pneu.html', 'roues-etroites-pneu.html', 'jumelages-jantes-pneu.html'];
const sources = new Map(await Promise.all(pages.map(async (file) => [file, await readFile(path.join(root, file), 'utf8')])));

function flowFor(rows, largeur) {
    const filtered = rows.filter((item) => item.largeurPneu === largeur);
    const rapports = [...new Set(filtered.map((item) => item.rapport))].filter(Boolean);
    return {
        hasRapports: rapports.length > 0,
        rapports,
        diametres: rapports.length === 0
            ? [...new Set(filtered.map((item) => item.diametrePneu))].filter(Boolean)
            : []
    };
}

test('les trois pages implémentent le mode sans rapport contrôlé', () => {
    for (const [file, source] of sources) {
        for (const marker of [
            'id="rapport-field"',
            'id="diametre-label"',
            'let selectedWidthHasRapports = true;',
            'if (rapports.length === 0)',
            "rapportField.classList.add('hidden')",
            "diametreLabel.textContent = '2. Diamètre pneu'",
            "rapportField.classList.remove('hidden')",
            "diametreLabel.textContent = '3. Diamètre pneu'",
            '(!selectedWidthHasRapports || item.rapport === chosenR)'
        ]) assert.ok(source.includes(marker), `${file} : marqueur absent ${marker}`);
    }
});

test('une largeur avec rapports conserve le flux historique', () => {
    assert.deepEqual(flowFor([
        { largeurPneu: '18.4', rapport: '38', diametrePneu: '30' },
        { largeurPneu: '18.4', rapport: '42', diametrePneu: '34' }
    ], '18.4'), { hasRapports: true, rapports: ['38', '42'], diametres: [] });
});

test('une largeur sans rapport alimente directement les diamètres dédupliqués', () => {
    assert.deepEqual(flowFor([
        { largeurPneu: '20.8', rapport: '', diametrePneu: '38' },
        { largeurPneu: '20.8', rapport: '', diametrePneu: '38' },
        { largeurPneu: '20.8', rapport: '', diametrePneu: '42' }
    ], '20.8'), { hasRapports: false, rapports: [], diametres: ['38', '42'] });
});

test('les transitions avec rapport et sans rapport recalculent chaque largeur', () => {
    const rows = [
        { largeurPneu: '18.4', rapport: '38', diametrePneu: '30' },
        { largeurPneu: '20.8', rapport: '', diametrePneu: '38' },
        { largeurPneu: '24.5', rapport: '', diametrePneu: '42' }
    ];
    assert.equal(flowFor(rows, '18.4').hasRapports, true);
    assert.equal(flowFor(rows, '20.8').hasRapports, false);
    assert.equal(flowFor(rows, '18.4').hasRapports, true);
    assert.deepEqual(flowFor(rows, '24.5').diametres, ['42']);
});

test('le cas mixte privilégie le mode avec rapport', () => {
    const flow = flowFor([
        { largeurPneu: '16.9', rapport: '', diametrePneu: '28' },
        { largeurPneu: '16.9', rapport: '34', diametrePneu: '30' }
    ], '16.9');
    assert.equal(flow.hasRapports, true);
    assert.deepEqual(flow.rapports, ['34']);
});
