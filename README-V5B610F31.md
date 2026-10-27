# PDC — V5-B.6.10-F3.1 : correctif de l'ambiguïté `slot` (42702)

## Diagnostic et statut

La migration 01700 (F3) a été **appliquée** dans Supabase DEV, mais son test SQL a échoué avec `ERROR 42702: column reference "slot" is ambiguous`. La procédure `admit_paid_couple_dev_v5b610f3` déclare `RETURNS TABLE(slot text,...)`, ce qui crée une variable PL/pgSQL homonyme de la colonne `slot` de `couple_checkout_beneficiaries_v5b610f2`.

Ce correctif **ne réécrit pas 01700** : il ajoute la migration **01800**, qui fait `CREATE OR REPLACE FUNCTION` de cette seule procédure et qualifie les **deux** références concernées (`b.slot='member'` et `b.slot='partner'`). La fonction reste `SECURITY INVOKER`, sans accès public et sans modification des données ni des règles métier. Le test SQL F3 original reste la référence de validation.

## Installation dans Codespaces

Conserver la branche `feature/v5b`; depuis la racine du dépôt :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -n pdc-v5b610f31-correctif-slot.zip
node --test tests/v5b610f31-slot-fix.test.mjs
node --test backend/pdc-api/test/couple-admission-v5b610f3.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
```

Attendu pour le nouveau contrôle : **3 tests réussis**. Tous les tests déjà validés doivent rester verts.

## Appliquer à Supabase DEV après contrôle

```bash
cat supabase/.temp/project-ref
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Le projet doit être **rvgpnmznhzwlzqyefahd** ; seule **20261026001800_pdc_v5b610f31_fix_ambiguous_slot_dev.sql** doit apparaître dans le dry-run. Si c'est le cas, appliquer :

```bash
npx supabase db push --linked
npx supabase migration list --linked
```

Attendu : 18 migrations locales et distantes. Ne pas retoucher 01700 ni utiliser `db reset`.

Dans **Supabase SQL Editor DEV**, relancer le fichier COMPLET déjà présent :

`tests/sql/v5b610f3-couple-admission-test.sql`

Attendu : `Success. No rows returned`, avec les notices des **12 contrôles**. Le script se termine par `ROLLBACK` ; il ne conserve pas les dossiers fictifs. Un nouveau problème SQL pourrait apparaître après résolution de la première erreur : dans ce cas, ne pas prétendre que F3 est entièrement validée ; transmettre l'erreur exacte.

## Enregistrement dans Git (après tests SQL validés)

```bash
git add \
  supabase/migrations/20261026001800_pdc_v5b610f31_fix_ambiguous_slot_dev.sql \
  tests/v5b610f31-slot-fix.test.mjs \
  README-V5B610F31.md

git diff --cached --check
git diff --cached --stat
```

Ajouter également les cinq fichiers F3 si ceux-ci ne sont pas encore versionnés ; ne pas ajouter les ZIP ni les sauvegardes. Ne fusionner dans `develop` qu'après validation des tests SQL. La délivrance des cartes, l'activation du site public et les paiements réels restent désactivés.
