import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {
    NET_PRICE_VISIBILITY_KEY,
    isNetPriceVisible,
    setNetPriceVisible,
    toggleNetPriceVisibility
} from '../../js/net-price-visibility.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const source = await readFile(path.join(root, 'js', 'net-price-visibility.js'), 'utf8');

function createStorage(initialEntries = {}) {
    const values = new Map(Object.entries(initialEntries));

    return {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        snapshot() {
            return Object.fromEntries(values);
        }
    };
}

test('la clé de préférence est explicite et indépendante', () => {
    assert.equal(NET_PRICE_VISIBILITY_KEY, 'ermas_show_net_prices');
});

test('une clé absente produit OFF', () => {
    assert.equal(isNetPriceVisible(createStorage()), false);
});

test('la valeur exacte true produit ON', () => {
    assert.equal(isNetPriceVisible(createStorage({ ermas_show_net_prices: 'true' })), true);
});

test('la valeur false produit OFF', () => {
    assert.equal(isNetPriceVisible(createStorage({ ermas_show_net_prices: 'false' })), false);
});

test('toute valeur inattendue produit OFF', () => {
    for (const value of ['1', 'TRUE', 'yes', '', 'null']) {
        assert.equal(isNetPriceVisible(createStorage({ ermas_show_net_prices: value })), false);
    }
});

test('l’activation écrit uniquement la valeur true', () => {
    const storage = createStorage();
    assert.equal(setNetPriceVisible(true, storage), true);
    assert.equal(storage.snapshot().ermas_show_net_prices, 'true');
});

test('la désactivation écrit uniquement la valeur false', () => {
    const storage = createStorage({ ermas_show_net_prices: 'true' });
    assert.equal(setNetPriceVisible(false, storage), false);
    assert.equal(storage.snapshot().ermas_show_net_prices, 'false');
});

test('toggle passe de OFF à ON', () => {
    const storage = createStorage();
    assert.equal(toggleNetPriceVisibility(storage), true);
    assert.equal(isNetPriceVisible(storage), true);
});

test('toggle passe de ON à OFF', () => {
    const storage = createStorage({ ermas_show_net_prices: 'true' });
    assert.equal(toggleNetPriceVisibility(storage), false);
    assert.equal(isNetPriceVisible(storage), false);
});

test('les autres clés de session restent intactes', () => {
    const storage = createStorage({
        ermas_calc_product: 'calcul',
        ermas_hors_tout_product: 'hors-tout'
    });

    setNetPriceVisible(true, storage);

    assert.deepEqual(storage.snapshot(), {
        ermas_calc_product: 'calcul',
        ermas_hors_tout_product: 'hors-tout',
        ermas_show_net_prices: 'true'
    });
});

test('le module ne dépend ni de localStorage ni de Supabase', () => {
    assert.doesNotMatch(source, /localStorage|supabase|rpc\s*\(|\.from\s*\(/i);
});

test('le module ne contient aucune logique métier de remise ou de calcul tarifaire', () => {
    assert.doesNotMatch(source, /userRemise|profile|discount|remise|toFixed|parseFloat|\/\s*100/i);
});
