# PDC — V5-B.3.1 : compte technique restreint (développement uniquement)

**Statut : migration en attente de validation.** N'active aucun service distant, n'attribue aucun mot de passe et ne crée aucun utilisateur militant.

## Objectif

La V5-B.3 a déjà créé `pdc_api_v5b3` comme groupe `NOLOGIN`, sans lecture directe du registre. Cette migration crée `pdc_api_runtime_v5b3`, un rôle `LOGIN` **sans mot de passe**, membre du groupe technique. Il restera inutilisable pour une connexion par mot de passe jusqu'à une configuration ultérieure, hors Git et hors historique SQL.

## Installation (branche `feature/v5b`)

Déposer le ZIP dans la racine `PDC` et exécuter :

```sh
unzip -n pdc-v5b31-role-restreint.zip
npx supabase db push --linked --dry-run
```

**Arrêter pour vérifier** que seule `20261025000400_pdc_v5b31_runtime_role.sql` est proposée et que le projet est bien `pdc-developpement`.

Après validation, seulement :

```sh
npx supabase db push --linked
npx supabase migration list --linked
```

Ouvrir `tests/sql/v5b31-runtime-role-test.sql`, copier tout son contenu dans le SQL Editor **du projet de développement** et l'exécuter en une seule requête. L'éditeur devrait afficher `Success. No rows returned` et éventuellement trois notices. Le test vérifie la création, les privilèges effectifs du rôle, et le refus d'un utilisateur inconnu ; il termine par `ROLLBACK`.

## Étape suivante, non incluse

1. Définir un mot de passe fort avec une commande interactive d'administration PostgreSQL (`psql` et `\password`), **pas** dans le SQL Editor Supabase ni dans les migrations.
2. Copier le serveur/port du `Session pooler` dans `Connect` sur Supabase ; pour les rôles personnalisés, le nom d'utilisateur du pooler est `pdc_api_runtime_v5b3.<PROJECT_REF>`.
3. Télécharger le certificat d'autorité Supabase depuis les paramètres de base, puis configurer la connexion chiffrée avec validation de certificat.
4. Configurer localement le backend `backend/pdc-api/` sans exposer le port Codespaces ; utiliser `node --env-file=.env src/index.mjs` après la configuration des secrets.
5. Vérifier l'API `/health`, puis les refus `401` et `403` avant tout test avec compte administrateur fictif.

Aucun identifiant de connexion, mot de passe, clé ou jeton ne doit être fourni dans le chat, commité ou poussé.

**Important :** cela ne constitue pas une autorisation de déployer l'API ni d'enregistrer des personnes réelles. Le mécanisme d'admission V5-B.2 reste un prototype isolé.
