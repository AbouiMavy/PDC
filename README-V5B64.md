# PDC V5-B.6.4 — Interface nationale de revue hebdomadaire (lecture seule)

**Cible exclusive :** branche `feature/v5b`, Supabase de développement `rvgpnmznhzwlzqyefahd`, Codespaces. Ne pas déployer sur `main` / Vercel. Aucun dossier réel.

## Portée

- **Migration n°9** : deux fonctions PostgreSQL privées `api_review_batches(uuid)` et `api_review_members(uuid,uuid,integer)` ; toutes deux vérifient l'habilitation `national_admin` et sont `SECURITY DEFINER` avec schéma de recherche vide et exécution réservée au rôle technique `pdc_api_v5b3`. Aucune permission d'accès direct aux tables.
- **API Node.js** : `GET /v1/admin/reviews` (20 derniers lots) et `GET /v1/admin/reviews/:uuid?offset=0` (50 entrées/page, maximum offset=10000). Vérification Supabase Auth + rôle national par requête, aucun endpoint d'écriture.
- **Interface React** : nouvel onglet « Revues hebdomadaires » / « Weekly reviews » sur `/admin-dev.html`, présentation des lots, états et membres fictifs, pagination, indicateur de carte demandée. Aucune photo ni carte produite.
- **Préservation** de `/v1/admin/session`, `/v1/admin/dashboard` et `/v1/admin/finance-overview`, de la mise en page et de la photographie historique existantes. Aucune modification du formulaire public, de la civilité ni des dons.

**Important :** les actions `open_weekly_review_dev`, `revoke_internet_membership_dev`, `close_weekly_review_dev` restent accessibles **uniquement via SQL Editor**, sans permissions API. L'absence de boutons « Révoquer / Clôturer » est intentionnelle jusqu'à une API d'écriture contrôlée et auditée.

## Installation

Depuis `/workspaces/PDC` :

```bash
cd /workspaces/PDC
git switch feature/v5b
mkdir -p .pdc-v5b64-backup
cp backend/pdc-api/src/{app.mjs,db.mjs} src/features/admin-dev/{AdminDev.jsx,client.mjs} .pdc-v5b64-backup/
unzip -o pdc-v5b64-revues-admin-readonly.zip
node --test tests/v5b64-review-client.test.mjs
(cd backend/pdc-api && npm test)
npm run build
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

**Attention :** `unzip -o` remplace *quatre* fichiers existants listés ci-dessus. Si tu as personnalisé ces fichiers depuis V5-B.5, comparer la sauvegarde avec les nouveaux fichiers avant d'écraser. Les répertoires de sauvegarde restent exclus de Git.

Le `--dry-run` doit montrer **uniquement** :

```text
20261025000900_pdc_v5b64_review_readonly_api.sql
```

Attendre cette vérification avant `db push` réel.

## Après confirmation du dry-run (étape suivante)

1. `npx supabase db push --linked`, puis `npx supabase migration list --linked` (9 migrations en local/remote).
2. Coller `tests/sql/v5b64-review-readonly-test.sql` dans Supabase SQL Editor ; attendre 8 notices et `Success. No rows returned` (fin `ROLLBACK`).
3. Redémarrer Node.js avec `cd backend/pdc-api && node --env-file=.env src/index.mjs` (8787).
4. Sur un autre terminal `cd /workspaces/PDC && npx vite --config vite.admin-dev.config.mjs --host 0.0.0.0 --port 5175 --strictPort`. Port 5175 : **Private**, page `/admin-dev.html`.
5. Utilisateur Auth fictif sans `national_admin` : HTTP 403. Avec habilitation temporaire : accès aux onglets, liste de revues vide attendue tant que tous les tests SQL sont annulés par `ROLLBACK`.

## Contrôles et limites

- Tests locaux vérifiés lors de la préparation : **25/25 tests Node.js réussis** (API existante + nouvelles routes + client), mais **pas de test réel PostgreSQL** ni de compilation complète du portail dans ton Codespace à cette étape.
- Ni images ni identités réelles, aucune écriture financière, aucun webhook, aucune carte. Pas de JWT dans le SQL Editor ni de clé administrative dans le navigateur.
- Les fonctions `SECURITY DEFINER` acceptent l'identifiant d'acteur transmis par l'API après validation du jeton. Le système actuel est un **prototype** et nécessite un audit de sécurité supplémentaire avant utilisation avec de vrais militants.
- Les photos d'adhérents et la délivrance des cartes relèvent des prochaines itérations. La mention de définitivité de l'adhésion sans demande de carte demeure à arbitrer.
- Aucun compte d'administration de production ni élévation permanente de permissions n'est ajouté.
