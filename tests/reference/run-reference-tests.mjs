import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const cases = JSON.parse(await readFile(path.join(here, 'cas-reference.json'), 'utf8'));

// Reproductions intentionnelles des expressions actuellement présentes dans les HTML.
function calculVoie(famValue, maxValue, minValue) {
  const fam = Number.parseFloat(famValue);
  const dataI = Number.parseFloat(maxValue) || 0;
  const dataJ = Number.parseFloat(minValue) || 0;
  if (Number.isNaN(fam)) return { erreur: true };
  return { voieMaxi: fam + (2 * dataI), voieMini: fam - (2 * dataJ) };
}

function calculHorsTout(c) {
  const voie = Number.parseFloat(c.voie);
  const entretoise = Number.parseFloat(c.entretoise);
  if (Number.isNaN(voie) || Number.isNaN(entretoise)) return { erreur: true };
  const hj = Number.parseFloat(c.horsToutJumelage) || 0;
  const hje = Number.parseFloat(c.horsToutJanteEngin) || 0;
  const eje = Number.parseFloat(c.emboitementJanteEngin) || 0;
  const ej = Number.parseFloat(c.emboitementJumelage) || 0;
  return { resultat: (voie + hj) + (2 * hje) + (2 * entretoise) - (2 * eje) - (2 * ej) };
}

function prixNetActuel(prix, remise) {
  const base = Number.parseFloat(prix);
  return remise > 0 ? base * (1 - remise / 100) : base;
}

function splitSimple(line) {
  return line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
}

function splitRegex(line) {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((v) => v.trim().replace(/^"|"$/g, ''));
}

function splitManuel(line) {
  const cols = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      cols.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += char;
  }
  cols.push(current.trim().replace(/^"|"$/g, ''));
  return cols;
}

for (const c of cases.calculVoie) {
  const actual = calculVoie(c.fam, c.deportMaxI, c.deportMinJ);
  assert.equal(actual.voieMaxi, c.voieMaxi, `calcul-voie maxi : ${c.nom}`);
  assert.equal(actual.voieMini, c.voieMini, `calcul-voie mini : ${c.nom}`);
}
assert.deepEqual(calculVoie('invalide', 10, 5), { erreur: true });

for (const c of cases.calculHorsTout) {
  assert.equal(calculHorsTout(c).resultat, c.resultat, `calcul-hors-tout : ${c.nom}`);
}
assert.deepEqual(calculHorsTout({ voie: '', entretoise: 10 }), { erreur: true });

for (const c of cases.prix) {
  const actual = prixNetActuel(c.prix, c.remise);
  assert.equal(actual, c.net, `prix net : ${c.nom}`);
  assert.equal(actual.toFixed(2), c.affichage, `format prix : ${c.nom}`);
}
assert.equal(Number.parseFloat('123,45'), 123, 'parseFloat direct tronque à la virgule');
assert.equal(Number.parseFloat('123,45'.replace(',', '.')), 123.45, 'variante Roues étroites remplace la virgule');
assert.ok(Number.isNaN(Number.parseFloat('invalide')), 'prix invalide donne NaN avant les gardes propres aux pages');

const edgeLines = (await readFile(path.join(here, 'fixtures', 'csv', 'cas-limites.csv'), 'utf8')).split(/\r?\n/);
const commaLine = edgeLines.find((line) => line.startsWith('virgule,'));
const quoteLine = edgeLines.find((line) => line.startsWith('guillemets,'));
const blankLine = edgeLines.at(-1);

assert.equal(splitSimple(commaLine).length, 4, 'split simple casse une cellule contenant une virgule');
assert.deepEqual(splitRegex(commaLine), ['virgule', 'Alpha, Beta', 'virgule entre guillemets']);
assert.deepEqual(splitManuel(commaLine), ['virgule', 'Alpha, Beta', 'virgule entre guillemets']);
assert.equal(splitRegex(quoteLine)[1], 'Produit ""Démo""', 'le parser regex conserve les guillemets doublés internes');
assert.equal(splitManuel(quoteLine)[1], 'Produit Démo', 'le parser manuel supprime tous les guillemets');
assert.equal(blankLine, '', 'la fixture contient une ligne vide terminale');

for (const fixture of ['jantes.csv', 'jumelages.csv', 'roues-etroites.csv']) {
  const text = await readFile(path.join(here, 'fixtures', 'csv', fixture), 'utf8');
  assert.ok(text.includes('123.45') || /\d+\.\d+/.test(text), `${fixture} contient un décimal`);
  assert.ok(text.includes(',,'), `${fixture} contient une cellule vide`);
}

const sourceChecks = {
  'calcul-voie.html': ['fam + (2 * dataI)', 'fam - (2 * dataJ)', "sessionStorage.getItem('ermas_calc_product')"],
  'calcul-hors-tout.html': ['(voie + horsToutJumelage)', '(2 * entretoiseSouhaitee)', "sessionStorage.getItem('ermas_hors_tout_product')"],
  'index.html': ["localStorage.getItem('ermas_device_token')", '.select(\'nom, prenom, entreprise, device_token, email, blocage\')'],
  'jumelages-jantes-taille.html': ["sessionStorage.setItem('ermas_jante_diametre'", "sessionStorage.setItem('ermas_jante_largeur'", "sessionStorage.setItem('ermas_jante_tendeurs'"],
  'jumelages-jantes-pneu.html': ["sessionStorage.setItem('ermas_pneu_largeur'", "sessionStorage.setItem('ermas_pneu_rapport'", "sessionStorage.setItem('ermas_pneu_diametre'"]
};

for (const [file, fragments] of Object.entries(sourceChecks)) {
  const source = await readFile(path.join(root, file), 'utf8');
  for (const fragment of fragments) assert.ok(source.includes(fragment), `${file} doit encore contenir : ${fragment}`);
}

console.log(`OK — ${cases.calculVoie.length} cas calcul-voie`);
console.log(`OK — ${cases.calculHorsTout.length} cas calcul-hors-tout`);
console.log(`OK — ${cases.prix.length} cas prix/remise`);
console.log('OK — caractérisation des 3 parseurs CSV et des 4 fixtures');
console.log('OK — contrats de source, navigation et stockage présents');

