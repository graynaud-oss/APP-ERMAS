# Référence des comportements actuels

Référence observée sur `main` au commit
`fc4c5d627291b7b12095e486192989e6713ef37f`. Cette documentation décrit le code
tel qu'il existe ; les comportements surprenants ne constituent pas des recommandations.

## 1. Calculateurs

### Calcul de voie

Source : `calcul-voie.html`.

Entrées :

- `fam` : valeur du champ `input-fam`, convertie avec `parseFloat` ;
- `deportMaxI` : propriété du produit lu depuis `ermas_calc_product` ;
- `deportMinJ` : propriété du même produit.

Les déports invalides, vides ou absents deviennent `0` via `parseFloat(x) || 0`.
Une FAM invalide provoque une alerte et aucun résultat. Les nombres négatifs ne sont
pas interdits par le JavaScript.

Formules actuelles :

```text
voieMaxi = FAM + 2 × deportMaxI
voieMini = FAM − 2 × deportMinJ
```

L'affichage utilise `toFixed(1)` et le suffixe ` mm`. Les cinq cas exacts sont dans
`cas-reference.json`.

### Calcul de largeur hors tout

Source : `calcul-hors-tout.html`.

Entrées utilisateur : voie actuelle, largeur de jante choisie et entretoise souhaitée.
Entrées produit : `colC` (hors-tout Jumelage) et `colD` (emboîtement Jumelage),
lues depuis `ermas_hors_tout_product`. La jante engin apporte son hors-tout et son
emboîtement depuis le CSV de la gamme.

Une voie ou entretoise invalide provoque une alerte. Les quatre valeurs géométriques
invalides deviennent `0` dans les chemins actuels.

Formule actuelle :

```text
résultat = voie
         + horsToutJumelage
         + 2 × horsToutJanteEngin
         + 2 × entretoiseSouhaitee
         − 2 × emboitementJanteEngin
         − 2 × emboitementJumelage
```

L'affichage utilise `toFixed(1)` et le suffixe ` mm`. Les quatre cas exacts sont dans
`cas-reference.json`.

## 2. Prix et remises

Formule commune observée :

```text
si remise > 0 : prixNet = prixCatalogue × (1 − remise / 100)
sinon          : prixNet = prixCatalogue
```

L'affichage monétaire utilise `toFixed(2)` et ` €`.

| Cas | Comportement actuel |
|---|---|
| Remise 0 % | Le net égale le catalogue ; l'interface affiche seulement le prix catalogue. |
| Remise positive | Le catalogue et le prix net remisé sont affichés. |
| Prix avec point (`123.45`) | `parseFloat` produit `123.45`. |
| Prix avec virgule (`123,45`) dans Jantes/Jumelages | `parseFloat` produit `123` ; la partie décimale est perdue. |
| Prix avec virgule dans Roues étroites | Les deux pages remplacent la première virgule par un point avant `parseFloat`, donc `123.45`. |
| Prix absent Jantes | Les blocs VF/VV vérifient la présence et affichent « Non disponible ». |
| Prix absent Jumelages | Le tarif principal ou l'option concernée est absent/non disponible selon le bloc. |
| Prix absent Roues étroites | La chaîne vide est convertie en `0`, donc un prix `0.00 €` peut être affiché. |
| Prix invalide Jantes/Jumelages | Les gardes `!isNaN(parseFloat(...))` le traitent comme indisponible. |
| Prix invalide Roues étroites | `parseFloat(... ) || 0` donne `0`, affiché `0.00 €`. |
| Remise négative ou nulle | La condition `remise > 0` est fausse : aucune remise appliquée. |
| Remise supérieure à 100 | Aucun bornage : la formule peut produire un prix négatif. |

La récupération de `profiles.remise` utilise elle-même `parseFloat(remise) || 0`.

## 3. Parseurs CSV actuels

### Famille A — découpage simple

Présente notamment dans `jantes-taille.html` et `jantes-pneu.html` :

```js
line.split(',').map(...)
```

Elle accepte les lignes simples et cellules vides, mais découpe une cellule contenant
une virgule même si elle est entre guillemets.

### Famille B — expression régulière

Présente dans les pages Jumelages et `calcul-hors-tout.html` : découpage sur une
virgule seulement si le reste de la ligne contient un nombre pair de guillemets.

Elle conserve une cellule avec virgule, mais n'implémente pas complètement CSV :
les guillemets doublés internes restent doublés et les cellules multilignes ne sont
pas prises en charge.

### Famille C — boucle avec état `inQuotes`

Présente dans les pages Roues étroites. La boucle ignore chaque caractère `"` et
bascule l'état `inQuotes`.

Elle conserve une virgule entre guillemets, mais supprime tous les guillemets, y
compris ceux que le standard CSV encode en les doublant. Les cellules multilignes ne
sont pas prises en charge.

### Fixtures anonymisées

- `fixtures/csv/cas-limites.csv` : cas syntaxiques isolés ;
- `fixtures/csv/jantes.csv` : structure à dix colonnes VF/VV ;
- `fixtures/csv/jumelages.csv` : structure à onze colonnes et options ;
- `fixtures/csv/roues-etroites.csv` : structure prix VV.

Elles contiennent volontairement cellules simples, virgules citées, guillemets
doublés, cellules vides, décimaux, valeurs invalides et ligne vide terminale.

## 4. Navigation et stockage navigateur

### `localStorage`

| Clé | Producteur | Consommateur | Contenu actuel |
|---|---|---|---|
| `ermas_device_token` | `index.html:getDeviceToken()` si absente | `index.html:handleSession()` et onboarding | Chaîne `dev_...` produite avec `Math.random()` et `Date.now()` |

### `sessionStorage`

| Clé | Producteur(s) | Consommateur(s) | Usage |
|---|---|---|---|
| `ermas_calc_product` | `jantes-taille.html`, `jantes-pneu.html`, `roues-etroites-taille.html`, `roues-etroites-pneu.html` | `calcul-voie.html` | Objet produit JSON avec nom et déports I/J |
| `ermas_hors_tout_product` | `jumelages-jantes-taille.html`, `jumelages-jantes-pneu.html` | `calcul-hors-tout.html` | Objet Jumelage JSON avec colonnes C/D et informations produit |
| `ermas_jante_diametre` | `jumelages-jantes-taille.html` | même page | Restauration du filtre diamètre |
| `ermas_jante_largeur` | `jumelages-jantes-taille.html` | même page | Restauration du filtre largeur |
| `ermas_jante_tendeurs` | `jumelages-jantes-taille.html` | même page | Restauration du filtre tendeurs |
| `ermas_pneu_largeur` | `jumelages-jantes-pneu.html` | même page | Restauration du filtre largeur de pneu |
| `ermas_pneu_rapport` | `jumelages-jantes-pneu.html` | même page | Restauration du filtre rapport |
| `ermas_pneu_diametre` | `jumelages-jantes-pneu.html` | même page | Restauration du filtre diamètre |

Les paramètres d'URL `?type=EVO` et `?type=360` transportent la gamme entre les
pages Jumelages. Les autres navigations utilisent `window.location.href` ou
`history.back()`.

## 5. Authentification — scénarios actuels

### Utilisateur non connecté

- Dans `index.html`, la vue Connexion est affichée et les autres vues sont masquées.
- Dans chaque page secondaire, `getSession()` sans session redirige vers `index.html`.

### Utilisateur connecté avec profil complet

- `index.html` récupère `nom, prenom, entreprise, device_token, email, blocage`.
- Si le compte n'est pas bloqué et le jeton d'appareil concorde, l'accueil apparaît.
- L'email du profil est mis à jour avec l'email Auth.
- Les pages tarifaires récupèrent séparément `profiles.remise`.

### Profil incomplet ou absent

- Dans `index.html`, absence du profil ou de `nom`, `prenom` ou `entreprise` : affichage
  de l'onboarding.
- L'envoi fait un `upsert` avec id, email, identité, entreprise et device token.
- Les pages secondaires ne reproduisent pas ce contrôle ; elles vérifient seulement
  la session.

### Compte bloqué

- Dans `index.html`, si `blocage`, converti en chaîne et en minuscules, vaut exactement
  `oui`, la vue Compte bloqué apparaît.
- Les pages secondaires ne vérifient actuellement pas `blocage`.

### Mauvais `device_token`

- Dans `index.html`, si le profil contient un jeton non vide différent du jeton local :
  alerte, déconnexion Supabase et retour à la connexion.
- Si le profil ne contient pas de jeton, cette comparaison ne bloque pas l'accès.
- Les pages secondaires ne vérifient actuellement pas le jeton.

## 6. Vérifications manuelles nécessaires

1. Exécuter les cinq scénarios Auth avec une configuration Supabase de test.
2. Vérifier les politiques RLS et les droits réels de `profiles` pour chacun des rôles.
3. Vérifier la liste et le téléchargement des PDF du bucket `doc-app-ermas`.
4. Comparer les fixtures avec les formes réelles de CSV sans copier de données
   commerciales dans le dépôt.
5. Parcourir chaque navigation depuis l'accueil, par URL directe et après rechargement.
6. Vérifier les résultats calculés dans l'interface et leur format à une décimale.
7. Vérifier l'affichage des prix à deux décimales, avec et sans remise.
8. Tester `history.back()` après ouverture directe et depuis un onglet externe.
9. Tester les listes déroulantes et cartes sur mobile, tablette et desktop.

## 7. Hypothèses à faire valider par le métier

Ces questions ne modifient pas la référence actuelle :

- Les déports négatifs doivent-ils réellement être acceptés ?
- Une donnée géométrique invalide doit-elle compter comme zéro ou bloquer le calcul ?
- Le résultat hors-tout doit-il inclure `horsToutJumelage` une seule fois, comme
  aujourd'hui, ou selon une autre convention ?
- La FAM, les déports, hors-tout, emboîtements et entretoises sont-ils toujours en mm ?
- Une remise doit-elle être bornée entre 0 et 100 % ?
- Un prix vide de Roue étroite doit-il être affiché à `0.00 €` ou être indisponible ?
- Les clés de filtre doivent-elles être communes aux gammes EVO et 360 ?
- Un profil sans `device_token` doit-il être autorisé sans revendication de l'appareil ?
- Les tarifs Google Sheets et les PDF sont-ils intentionnellement publics ?

