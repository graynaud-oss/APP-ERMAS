# Tests de référence APP-ERMAS

Ce dossier caractérise le comportement de la branche `main` au commit
`fc4c5d627291b7b12095e486192989e6713ef37f` avant toute refactorisation.

Il ne prétend pas valider les règles métier : les résultats attendus reproduisent
strictement les formules, conversions et parseurs présents dans les fichiers HTML.

## Exécution

Prérequis : Node.js, sans installation de dépendance.

```sh
node tests/reference/run-reference-tests.mjs
```

Le script vérifie :

- les cas de référence des deux calculateurs ;
- le calcul et le formatage actuel des prix/remises ;
- les différences observables entre les trois familles de parseurs CSV ;
- la présence des clés de stockage et des formules dans les HTML actuels.

Les parcours nécessitant Supabase, un navigateur ou les Google Sheets publiés sont
décrits dans `comportements-actuels.md` et restent des vérifications manuelles.

