# PDC — V5-B.6.8 : File sécurisée de préparation des cartes (développement)

**Branche :** `feature/v5b`. **Supabase cible :** le projet de développement ayant pour référence `rvgpnmznhzwlzqyefahd`.

## Ce que fait cette itération

- Ajoute un **dixième** script SQL : `20261026001000_pdc_v5b68_card_queue_readonly.sql`.
- Fournit la fonction privée `pdc_private.api_card_preparation_queue(actor,offset)`, accessible à l'API via son groupe restreint, et uniquement pour un compte avec rôle national actif.
- Affiche l'onglet bilingue **« Cartes à préparer » / « Cards to prepare »** dans `/admin-dev.html`, via `GET /v1/admin/cards?offset=0` (pagination par 50).
- N'affiche que les demandes liées à une adhésion active, numérotée dans la série Internet, et **expressément contrôlée favorablement dans une revue hebdomadaire clôturée**. Les demandes révoquées, non contrôlées, émises ou déjà délivrées sont exclues.
- Distingue le **recto Cameroun** du **recto Diaspora** selon `membership_applications.residence_group`, indépendamment du pays actuel de résidence ; le verso commun n'est pas modifié.
- Indique seulement si une **clé privée de photographie est renseignée**, sans exposer cette clé ni les pixels de la photographie.

**Cette itération NE fait PAS :** uploader ou récupérer une photographie, vérifier les pièces d'identité, générer une carte valide, créer un QR actif, délivrer une carte, saisir des décisions de revue, permettre à un adhérent de consulter son dossier. Les formulaires, les modèles graphiques et la devise **« DÉMOCRATIE / DEMOCRACY »** ne sont pas modifiés.

**Couples** : le paiement commun et l'association des deux adhérents restent à implémenter. Le présent correctif n'invente pas cette logique.

## Installation dans Codespaces

Déposer l'archive à la racine du dépôt. **Ne pas mélanger avec les archives antérieures**.

```bash
cd /workspaces/PDC
git switch feature/v5b
mkdir -p .pdc-v5b68-backup
cp backend/pdc-api/src/{app.mjs,db.mjs} src/features/admin-dev/{AdminDev.jsx,client.mjs} .pdc-v5b68-backup/
unzip -o pdc-v5b68-cartes-file-lecture-seule.zip
node --test tests/v5b68-card-client.test.mjs
(cd backend/pdc-api && npm test)
npm run build
```

Le ZIP **remplace exactement 4 fichiers existants** (ceux sauvegardés ci-dessus), et ajoute `CardQueuePanel.jsx`, une migration, des tests et ce guide. Il n'écrase pas `carte-dev.html`, les deux rectos ou le verso.

## Séquencement SQL sécurisé

```bash
cd /workspaces/PDC
cat supabase/.temp/project-ref
# Doit être : rvgpnmznhzwlzqyefahd
npx supabase db push --linked --dry-run
```

**Attendu : une seule migration candidate**, `20261026001000_pdc_v5b68_card_queue_readonly.sql`. Arrêter ici et examiner le résultat **avant** tout `npx supabase db push --linked` réel.

Après vérification puis application de la dixième migration, `npx supabase migration list --linked` doit montrer 10 migrations. Dans Supabase SQL Editor, exécuter intégralement `tests/sql/v5b68-card-queue-readonly-test.sql`. Ce script utilise un compte Auth fictif `pdc-v5b3-test@example.invalid`, crée des dossiers fictifs dans `BEGIN`, lance 8 contrôles, et termine par **ROLLBACK**. Attendu : `Success. No rows returned` et notices `1/8` à `8/8`.

## Interface et API

Si l'API `8787` était lancée avant l'installation, **redémarrer l'instance existante** pour charger le nouveau code ; ne pas lancer un deuxième serveur sur le même port. Garder 5173 (site) et 5175 (administration) si leurs processus sont actifs. Accéder à la page **`/admin-dev.html` sur 5175**, se connecter avec le compte fictif autorisé, puis ouvrir **« Cartes à préparer »**.

**Une liste vide est normale :** les scénarios de tests se terminent par ROLLBACK ; aucune adhésion fictive persistante n'a été volontairement créée.

Pour diagnostiquer sans token :

```bash
curl -i http://127.0.0.1:8787/health
curl -i 'http://127.0.0.1:8787/v1/admin/cards?offset=0'
```

Attendu : HTTP **200** pour `/health`, HTTP **401 AUTH_REQUIRED** pour `/v1/admin/cards?offset=0` sans jeton. Ce 401 prouve la route présente mais ne prouve pas la validité de la fonction SQL ; celle-ci est testée séparément.

## Sécurité / limites

- Authentification Supabase Auth + rôle national vérifié à **chaque requête**.
- Fonctions `SECURITY DEFINER` avec recherche de schéma vide, révocation des permissions pour `anon`, `authenticated` et `service_role`, droit d'exécution restreint au groupe API existant.
- Aucun droit direct SELECT/UPDATE des tables privées accordé au compte API.
- Aucun identifiant de stockage privé n'est renvoyé au navigateur ; l'indicateur « référence présente » **ne garantit pas l'existence ou la validité de la photo**.
- `GET` uniquement ; aucune écriture et aucune émission ou délivrance.
- Le code n'est pas destiné à `main`, Vercel ou à des données de militants réels.

### Prochaine étape technique

Concevoir l'upload privé des photographies (stockage, contrôle de contenu, droits, suppression), puis les procédures d'émission/délivrance et de révocation des titres, avec QR de validité à jeton non révélateur d'identité. Cette étape nécessite une authentification de membre distincte et un contrôle des droits ; elle ne doit pas être simulée par un simple lien public au numéro militant.
