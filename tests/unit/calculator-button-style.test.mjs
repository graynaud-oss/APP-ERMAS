import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');

test('les boutons hors-tout réutilisent exactement la classe du calcul de voie', () => {
    for (const path of ['jantes-taille.html', 'jantes-pneu.html', 'roues-etroites-taille.html', 'roues-etroites-pneu.html']) {
        assert.match(read(path), /Estimer la voie de travail[\s\S]*?<\/button>|class="results-primary-action"[\s\S]*?Estimer la voie de travail/);
    }

    const taille = read('jumelages-jantes-taille.html');
    const pneu = read('jumelages-jantes-pneu.html');
    assert.match(taille, /onclick='ouvrirCalculateurHorsTout\([^>]+class="results-primary-action"[\s\S]*?Calculer la largeur hors tout/);
    assert.match(pneu, /onclick='ouvrirCalculHorsTout\([^>]+class="results-primary-action"[\s\S]*?Calculer Largeur Hors Tout/);
    assert.doesNotMatch(taille + pneu, /class="[^"]*bg-red-(?:500|600|700)[^"]*"[\s\S]{0,120}Calculer (?:la )?Largeur Hors Tout/i);
});
