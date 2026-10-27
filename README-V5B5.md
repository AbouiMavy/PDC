# PDC — V5-B.5 : synthèse financière nationale (développement)

**Périmètre :** `feature/v5b` et projet Supabase `pdc-developpement` uniquement. Pas de données militantes réelles, pas de collecte ni de paiement réels, pas de Vercel, pas de modification de `main`.

## Fonctionnalités

- Nouvelle fonction PostgreSQL privée `pdc_private.api_finance_overview(uuid)` : **lecture seule** ; refus des UUID sans habilitation `national_admin`.
- Une nouvelle route `GET /v1/admin/finance-overview` côté Node.js ; jeton vérifié auprès de Supabase Auth, puis rôle national vérifié par PostgreSQL, comme les autres routes.
- Deux devises **XAF et EUR séparées**, **sans conversion**. Montants en unités mineures : FCFA pour XAF, centimes pour EUR.
- Cinq indicateurs par devise : frais initiaux appelés, frais initiaux confirmés, cotisations annuelles appelées, cotisations annuelles confirmées, dons confirmés.
- Ne sont comptabilisés « confirmés » que les montants **affectés à un paiement `confirmed`**. Les paiements `pending`, `failed`, `refunded` et `cancelled` sont écartés du calcul des montants confirmés. Les appels ne comprennent que les obligations `open`.
- Interface React sur le port de test 5175 : onglets **Adhésions** et **Finances**, FR/EN ; le portrait d'André-Marie Mbida et la carte du Cameroun restent présents.
- Aucune liste nominative, aucune fonction de modification, aucune route publique nouvelle.

### Sens exact des agrégats

Les « montants appelés » correspondent aux obligations ouvertes en base, **pas nécessairement à une dette exigible** ni à un montant effectivement encaissé. Les « montants confirmés » correspondent aux affectations financières associées à un paiement confirmé, **pas à un rapprochement bancaire indépendant**. Les paiements sans affectation ne sont pas intégrés. Les dons ne sont pas mélangés aux frais/cotisations.

## Installation (depuis `/workspaces/PDC`)

1. Vérifier `git switch feature/v5b` ; sauvegarder les fichiers visés, notamment les personnalisations locales éventuelles.
2. Déposer l'archive à la racine du projet puis installer :

```bash
unzip -o pdc-v5b5-finance-national.zip \
  src/features/admin-dev/AdminDev.jsx \
  src/features/admin-dev/admin-dev.css \
  src/features/admin-dev/client.mjs \
  src/features/admin-dev/finance.mjs \
  backend/pdc-api/src/app.mjs \
  backend/pdc-api/src/db.mjs \
  backend/pdc-api/test/finance.test.mjs \
  supabase/migrations/20261025000500_pdc_v5b5_finance_overview.sql \
  tests/sql/v5b5-finance-overview-test.sql \
  tests/v5b5-finance.test.mjs
```

3. Exécuter les tests JavaScript :

```bash
node --test tests/v5b4-admin-dev.test.mjs tests/v5b5-finance.test.mjs
(cd backend/pdc-api && npm test)
npm run build
```

4. Vérifier la base liée puis simuler la migration **sans l'appliquer** :

```bash
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

La seule nouvelle migration attendue est `20261025000500_pdc_v5b5_finance_overview.sql`. **Transmettre le résultat du `--dry-run` avant un véritable push.**

### Après vérification du dry-run (étape ultérieure)

- Appliquer la migration V5-B.5 uniquement sur la base de développement.
- Tester le script `tests/sql/v5b5-finance-overview-test.sql` via SQL Editor. Il nécessite le compte fictif Auth `pdc-v5b3-test@example.invalid` et termine par `ROLLBACK`. Les données fictives et le rôle ajouté dans le test sont annulés.
- Arrêter puis redémarrer Node.js pour charger la nouvelle route (ne pas lancer de serveur API concurrent) :

```bash
cd backend/pdc-api
node --env-file=.env src/index.mjs
```

- Dans le terminal Vite (port 5175 privé), conserver `npx vite --config vite.admin-dev.config.mjs`, rafraîchir `/admin-dev.html`.
- Le compte test non habilité doit toujours obtenir `403` ; pour voir les onglets Finances, il faudra une habilitation **temporaire et révoquée aussitôt** après validation.

## Limites de sécurité

- Les contrôles positifs d'un administrateur sont encore expérimentaux. **Ne pas enregistrer de dossier réel**.
- La fonction SQL utilise `SECURITY DEFINER` et restreint explicitement `EXECUTE` au groupe technique `pdc_api_v5b3` ; aucune lecture directe des tables personnelles n'est accordée au rôle de connexion.
- Les fonctions du socle historique acceptent encore un UUID d'acteur transmis par l'API après vérification Auth. Ceci suppose que les identifiants de connexion PostgreSQL restent secrets. Avant production, étudier un contexte d'identité transmis et vérifié dans la base, et réaliser un audit indépendant des droits et de l'API.
- Le port 5175 doit rester privé ; la Data API reste désactivée et aucune clé `service_role` ne doit être placée dans React.
- Le correctif conserve les deux illustrations **externes** de la V5-B.4 ; leur hébergement local et la vérification de licences seront traités avant production.

## Contrôle Git

```bash
git status --short
git check-ignore -v backend/pdc-api/.env
```

Ne jamais ajouter les fichiers `.env`, les certificats, les ZIP ou les répertoires de sauvegarde à Git.
