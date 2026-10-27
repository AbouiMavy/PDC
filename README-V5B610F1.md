# PDC — V5-B.6.10-F1 : passerelle de dépôt des portraits du demandeur (DEV)

**Lot additif, pas de remplacement des 14 migrations précédentes.** Dépend de la V5-B.6.10-E2 (`20261026001400`) et de l'état de `feature/v5b` consolidé dans `develop`. Projet exclusivement `pdc-developpement` (`rvgpnmznhzwlzqyefahd`). Cette archive ne crée aucun nouveau processus de paiement, n'émet aucune autorisation et ne délivre aucune carte.

## Périmètre exact

- **01500** : nouvelle migration PostgreSQL. Une unique fonction SQL consomme le jeton E2 **et** réserve un objet privé dans la **même transaction** ; `confirm` et `cancel` sont distinctes de la voie administrative. Association `card_portrait_assets.applicant_grant_id` unique.
- **Backend Node.js** : adaptateur SQL paramétré, service d'ingestion avec Sharp, vérification SHA-256 après relecture Storage, nettoyage prudent, point d'entrée HTTP **séparé et désactivé par défaut**.
- **Tests** : 14 tests JavaScript Node.js et 1 script SQL transactionnel (`BEGIN`/`ROLLBACK`) à exécuter uniquement après installation de 01500 dans la base DEV.
- **Compatibilité** : réutilise `applicant-grant-ledger-v5b610e2.mjs`, `portrait-normalize-v5b610b.mjs`, `portrait-policy.mjs`, `portrait-storage-v5b610b.mjs` et `portrait-writer-db-v5b610c.mjs`. Ne modifie pas ces fichiers.
- **Front-end** : `src/pages/Adhesion.jsx` reste **strictement** en préparation locale ; aucun envoi depuis le portail n'est activé.

## Sécurité / fonctionnalités NON opérationnelles

1. L'émission du jeton E2 reste impossible pour les rôles API ; sa mise en service réclame une session de paiement vérifiée, un webhook authentifié et un rapprochement des demandes.
2. **Couples non pris en charge** : E2 refuse `category_code='couple'`. Il faudra auparavant un schéma financier pour l'affectation des 40 € aux deux bénéficiaires.
3. E2 exige **adhésion acceptée, membre actif, demande de carte et paiement effectivement confirmé**, avant tout dépôt. Le site public n'implémente pas encore ce parcours : **ne pas le présenter comme opérationnel**.
4. Un jeton consommé ne redevient pas valide après échec du stockage : une nouvelle émission devra provenir du futur serveur de paiement, jamais d'un appel arbitraire de l'utilisateur.
5. Une rupture réseau pendant la confirmation SQL requiert une **réconciliation humaine**. Le serveur ne supprime pas l'objet Storage dans cette situation.
6. Les octets restent dans le bucket **privé** `pdc-member-portraits-dev` ; pas d'URL publique, d'upsert ni de données réelles de militants.
7. Le serveur HTTP est réservé au **loopback**, à des origines locales explicites et à des tests privés. Un Codespace peut transférer ses ports : **ne pas rendre ce port public**, et ne pas le brancher dans Vercel.
8. La passerelle est un jalon technique non audité en production. La limitation de débit, les protections contre les abus, la gestion de capacité et les traitements de données sensibles devront être revus avant tout accès internet.

## Installation dans Codespaces

```bash
cd /workspaces/PDC
git switch feature/v5b
git status --short
unzip -n pdc-v5b610f1-raccordement-backend.zip
```

`unzip -n` ne remplace pas les fichiers existants. **Ne pas** lancer les anciens scripts d'installation V5-A/V5-B. Vérifier la liste des nouveaux fichiers et leurs contenus avant de modifier Supabase.

### Tests JavaScript locaux sans serveur ni stockage réel

```bash
node --test backend/pdc-api/test/applicant-portrait-v5b610f1.test.mjs
(cd backend/pdc-api && npm test)
node --test tests/*.test.mjs
npm run build
```

Le nouveau test attend **14 réussites / 0 échec** ; les autres tests doivent conserver leurs résultats antérieurs. L'avertissement Vite `chunks > 500 kB` n'est pas une erreur.

### Vérification des migrations (NE PAS appliquer immédiatement)

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

Attendu : **uniquement** `20261026001500_pdc_v5b610f1_applicant_portrait_gateway_dev.sql` comme migration à appliquer ; toutes les précédentes jusqu'à 01400 sont déjà synchronisées. Si la liste est différente, **arrêter et ne rien pousser**. Ne pas utiliser `supabase db reset`.

**Après validation du dry-run et du projet lié par le responsable du dépôt uniquement :**

```bash
npx supabase db push --linked
npx supabase migration list --linked
```

Attendu : **15 migrations concordantes**. Puis coller et exécuter dans **Supabase SQL Editor du projet DEV** le contenu de `tests/sql/v5b610f1-applicant-gateway-test.sql`. Le script finit par `ROLLBACK`, ne garde aucun membre ni photo et ne touche pas au compteur réel.

### Versionnement après validation

```bash
git add \
  README-V5B610F1.md \
  supabase/migrations/20261026001500_pdc_v5b610f1_applicant_portrait_gateway_dev.sql \
  backend/pdc-api/src/applicant-portrait-repository-v5b610f1.mjs \
  backend/pdc-api/src/applicant-portrait-ingest-v5b610f1.mjs \
  backend/pdc-api/src/applicant-portrait-http-v5b610f1.mjs \
  backend/pdc-api/src/applicant-portrait-start-v5b610f1.mjs \
  backend/pdc-api/test/applicant-portrait-v5b610f1.test.mjs \
  tests/sql/v5b610f1-applicant-gateway-test.sql

git diff --cached --check
git diff --cached --stat
```

Éviter `git add .` : les archives ZIP et sauvegardes locales sont hors dépôt. Ne pas fusionner ce lot dans `main` ni créer d'émission de jetons.

## Contrat technique du point d'entrée (non activé)

`POST /v1/dev/applicant-portrait` sur le port **privé** défini par `PDC_APPLICANT_PORT` ; corps binaire JPEG ou PNG, au plus 5 Mio ; entêtes `Authorization: Bearer <jeton E2 43 caractères>`, `X-PDC-Card-Request-Id: <UUID>`, `Content-Type: image/jpeg` ou `image/png`, `Origin` dans la liste locale. Retour minimal `{ "cardRequestId": "<UUID>", "status": "stored" }`. Aucun `GET` de portrait, aucune URL signée publique.

Le fichier `applicant-portrait-start-v5b610f1.mjs` **ne démarre pas automatiquement**. Il refuse le lancement sans paramètres de DEV explicites : `PDC_SUPABASE_PROJECT_REF`, `PDC_ENABLE_APPLICANT_PORTRAIT_DEV=YES`, `PDC_ENABLE_PORTRAIT_UPLOAD_DEV=YES`, `PDC_APPLICANT_HOST=127.0.0.1`, `PDC_APPLICANT_PORT` (port non privilégié), connexion PostgreSQL du rôle restreint `pdc_portrait_upload_runtime_v5b610c`, CA TLS et clé Storage de développement. **Ne saisir ni publier de secrets dans les échanges ou sur GitHub.**

Ne pas chercher à démarrer ce serveur avant la création d'un jeu d'essai fictif avec jeton E2 autorisé et la revue de sécurité correspondante.

## Suite V5-B.6.10-F2

- Enregistrement réel **côté serveur** de la demande et des personnes liées au paiement, sans confiance accordée aux totaux transmis par React.
- Confirmation cryptographique des webhooks Tara/Stripe, idempotence, gestion des remboursements.
- Attribution d'autorisations E2 au demandeur **sur preuve de possession de sa session de paiement**.
- Résolution financière de la cotisation commune du couple et autorisations **distinctes** par bénéficiaire.
- Activation graduelle du formulaire, avec protection contre les abus, audit d'accès, rétention, droits des personnes et revue juridique spécifique aux données d'appartenance politique.
