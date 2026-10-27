# PDC — V5-B.6.10-F2 : modèle financier de couple (DEV, préparatoire)

**Prérequis strict :** `feature/v5b` intégrée jusqu'à F1 et projet `pdc-developpement` (`rvgpnmznhzwlzqyefahd`). Migration locale n° 16 : `20261026001600_pdc_v5b610f2_couple_payment_bundle_dev.sql`. Migration ADDITIVE : ne modifie ni les 15 migrations préexistantes ni les fonctions d'admission individuelles.

## Objet et portée

La formule diaspora **couple = 40 EUR** est une **seule commande de 4 000 centimes**, acquittable par **une seule tentative de paiement**, rattachée à **deux demandes individuelles** de deux personnes distinctes (`member`, `partner`). Ce n'est **pas** l'enregistrement artificiel de deux cotisations de 20 EUR : aucun partage des 40 EUR n'est présumé.

- Deux tables privées : `couple_checkout_orders_v5b610f2`, `couple_checkout_beneficiaries_v5b610f2`.
- Une fonction interne `couple_payment_verified_dev_v5b610f2(uuid)` : **lecture de la preuve de paiement**, pas de confirmation bancaire créée, pas d'admission, pas de délivrance de carte.
- Vérifications : 2 dossiers soumis avec consentements enregistrés ; payeur = premier bénéficiaire ; montant et devise imposés ; paiement du bon payeur (Tara ou Stripe) ; statut `confirmed` ; notification enregistrée comme vérifiée ; détection des événements de remboursement/contestation connus ; impossibilité d'affecter le même paiement au registre ancien et à la commande couple.
- Toute opération d'écriture reste **réservée au propriétaire de la base dans le SQL Editor de développement**. Aucune permission `EXECUTE` n'est donnée à l'API, aux rôles `anon`, `authenticated`, `service_role` ni au runtime photos.
- Un module Node.js **pur** prépare le montant et l'association des deux demandes, mais ne démarre aucun serveur ni checkout. Les applications et personnes doivent déjà avoir été créées par un **futur service fiable**, non développé dans F2.
- Aucun accès depuis `src/pages/Adhesion.jsx`, aucun webhook réel et aucune photographie réelle ; le formulaire public reste en simulation.

### Limites explicites

1. Le simple indicateur « paiement vérifié » **n'admet pas deux membres** : `admit_paid_internet_dev` reste volontairement bloqué pour `category_code='couple'`.
2. Le dispositif de jetons E2/F1 demeure bloqué pour les couples. Avant de l'activer, il faudra une **admission atomique de deux personnes** et deux demandes de carte avec vérification individuelle des droits.
3. Les 40 EUR restent affectés à l'**unité de paiement couple** ; ils ne sont **pas** ajoutés aux agrégats habituels `dues_obligations/payment_allocations`, ni répartis en cotisations sans arbitrage doctrinal/comptable.
4. Le statut `confirmed` et `payment_events.verified_at` sont supposés alimentés par un **backend qui vérifiera cryptographiquement les événements**. F2 ne réalise pas cette vérification et ne doit pas être exposée au réseau.
5. Les scripts SQL ne garantissent pas l'absence de secrets ou de droits indirects ailleurs dans le système. Une revue des contrôles, de la confidentialité des données politiques et des schémas d'accès reste nécessaire avant la production.
6. Annulation d'une commande confirmée impossible tant que le paiement n'a pas été remboursé. Réconciliation/remboursement et gestion des pertes réseau à définir pour F3.

## Installation (Codespaces, sans changer le portail)

Placez le ZIP à la racine `/workspaces/PDC`. Vérifiez la branche avant extraction :

```bash
cd /workspaces/PDC
git switch feature/v5b
git status --short
unzip -n pdc-v5b610f2-finance-couple.zip
```

`unzip -n` n'écrase aucun fichier existant. Vérifier les fichiers avant de les committer.

### Tests JavaScript / non-régression

```bash
node --test backend/pdc-api/test/couple-finance-v5b610f2.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
```

**Test spécifique F2 : 16 réussites attendues** (validation pure, adaptateur SQL simulé, garde-fous statiques). Ces tests **ne sont pas** un test PostgreSQL effectif.

### Contrôle du projet Supabase / simulation

```bash
cat supabase/.temp/project-ref
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

**N'APPLIQUEZ PAS LA MIGRATION SUR LA SEULE BASE DU DRY-RUN.** Il faut vérifier qu'il s'agit bien du projet DEV `rvgpnmznhzwlzqyefahd` et que la seule migration proposée est `20261026001600_pdc_v5b610f2_couple_payment_bundle_dev.sql`. Si ce n'est pas le cas, arrêter et examiner les divergences. Ne pas exécuter `db reset`.

Après revue du `dry-run`, obtenir la validation explicite du schéma et des droits ; puis seulement appliquer la migration dans le projet de développement. Exécuter alors **tout** `tests/sql/v5b610f2-couple-bundle-test.sql` dans le SQL Editor DEV. Ce script utilise des fiches fictives et termine par `ROLLBACK`. Ne pas tester sur des dossiers militants réels.

### Suite prévue

**F3** : API serveur de création contrôlée de deux personnes/deux demandes avec politique de consentement, authentification de la session de paiement, prestataires Tara/Stripe, admission atomique des deux personnes, rapprochement du paiement collectif et émission de jetons photos E2 distincts. Ces fonctionnalités ne sont pas incluses dans F2.

### Après tests, versionnement sélectif (et non `git add .`)

```bash
git add \
 README-V5B610F2.md \
 supabase/migrations/20261026001600_pdc_v5b610f2_couple_payment_bundle_dev.sql \
 backend/pdc-api/src/couple-finance-v5b610f2.mjs \
 backend/pdc-api/test/couple-finance-v5b610f2.test.mjs \
 tests/sql/v5b610f2-couple-bundle-test.sql

git diff --cached --check
```

Ne committer ni ZIP, ni `.env`, ni sauvegardes. Aucun merge dans `main` ou déploiement public dans ce jalon.
