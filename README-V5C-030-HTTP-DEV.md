# PDC V5-C.30 — Lot HTTP DEV sécurisé

**Base GitHub :** `AbouiMavy/PDC`, `feature/v5c`, commit `12a0457`.
**Périmètre :** DEV isolé ; aucune migration SQL nouvelle, aucun encaissement, aucune émission de lien Tara.

## Fonctionnalités

- Réglage explicite du listener HTTP **sur `127.0.0.1` seulement**, avec `PDC_V5C30_ISSUE_LINKS=false` obligatoire.
- Prise en compte d'une adresse IP fiable dans `tara-public-order-http-v5c.mjs` : l'adresse est évaluée avant le CAPTCHA ou la moindre transaction SQL.
- Deux modes : `direct` (rejette tout header de forwarding), `single-proxy` (n'accepte que le proxy TCP autorisé et un **unique** `X-Forwarded-For`).
- Pas de confiance implicite dans `X-Forwarded-For`, `Forwarded`, `X-Real-IP` ou `CF-Connecting-IP`.
- Connexion PostgreSQL limitée au rôle `pdc_tara_v5c_writer`, au Project Ref DEV et à une connexion TLS avec CA vérifiée.
- Dépendances V5-C.29 réutilisées : Turnstile serveur, limitation HMAC PostgreSQL et traitement des commandes atomiques.
- Tests d'origine HTTP, refus des en-têtes forgés, adresses de clients distinctes, politique de connexion PostgreSQL.

**Attention :** le mode `single-proxy` n'est sûr que si un **proxy isolé remplace systématiquement** les en-têtes de forwarding fournis par le navigateur, et si aucun client extérieur ne peut joindre directement le listener. N'exposez PAS le port Codespaces directement à Internet. Un proxy local qui préserve les `X-Forwarded-For` entrants est insuffisant. Sans une telle garantie, garder le service arrêté.

## Installation (sur le vrai Codespace)

Copier l'archive dans `/workspaces/PDC-v5c` :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_030_HTTP_DEV_SECURISE.zip
python3 scripts/apply-v5c30-http.py
bash scripts/v5c30-validate-local.sh
```

Le patch vérifie ses trois fichiers et leurs signatures **avant tout remplacement** ; il est idempotent. Les nouveaux tests ne contactent jamais une base distante. Ne pas committer les archives ZIP ni des fichiers `.env` remplis.

## Préconditions avant de démarrer sur Supabase DEV

1. `npx supabase migration list --linked` : 023/027/029 sont marquées appliquées ; 022 reste en attente. **Ne pas lancer `supabase db push`.**
2. Le rôle `pdc_tara_v5c_writer` existe depuis 021 avec `PASSWORD NULL` : aucun login réseau n'est possible dans cet état. L'administrateur DEV doit fournir un **mot de passe distinct** dans un coffre de secrets et éventuellement lui donner accès au réseau DB. Avec un accès PostgreSQL administrateur sécurisé et vérifié, `psql` offre `\password pdc_tara_v5c_writer`, saisie interactive sans mettre le mot de passe dans une commande SQL historique. Ne pas communiquer les mots de passe dans ChatGPT/GitHub.
3. Dans Supabase **Connect**, copier la vraie chaîne de connexion du **Session pooler** et remplacer seulement l'identifiant `postgres.<ref>` par `pdc_tara_v5c_writer.<ref>` avec son mot de passe propre ; vérifier les droits du compte. L'hôte ne se déduit pas de la région.
4. Télécharger le certificat CA de confiance depuis Supabase Database settings vers un chemin absolu *hors dépôt*. Ne pas désactiver `rejectUnauthorized` et ne pas ajouter `sslmode=disable`.
5. Créer un widget Turnstile spécifique à DEV ; le secret ne doit être connu que du serveur, l'hostname doit correspondre à l'origine utilisée. Turnstile exige `action=pdc-public-order` et Siteverify côté serveur.
6. Configurer le proxy HTTPS sur l'unique hostname autorisé, le listener backend restant loopback. Le proxy **doit supprimer toutes les valeurs `Forwarded`, `X-Forwarded-For`, `X-Real-IP`, `CF-Connecting-IP` d'origine visiteur**, puis réécrire un seul `X-Forwarded-For` à partir de son adresse client effectivement validée. Vérifier concrètement cette politique, sinon ne pas activer.
7. Prévoir la purge des buckets d'anti-abus vieux de plus de 24h par DBA, un dispositif de supervision et une politique de données personnelles. Tests exclusivement avec coordonnées fictives.

## Configuration

Le fichier `.env.v5c30.example` ne contient **aucun** secret actif. Ne jamais copier ses valeurs dans `VITE_*` ou dans Git. Les variables utilisées par le démarreur sont `PDC_V5C30_ENABLED`, `PDC_V5C30_ENV`, `PDC_V5C30_ISSUE_LINKS`, `PDC_V5C30_PORT`, `PDC_V5C30_PROXY_MODE`, `PDC_V5C30_TRUSTED_PROXY_PEERS`, `PDC_V5C30_ALLOWED_ORIGIN`, `PDC_V5C30_PROJECT_REF`, `PDC_V5C30_DATABASE_URL`, `PDC_V5C30_DB_CA_FILE`, `PDC_V5C30_RATE_HMAC_SECRET`, `PDC_V5C30_TURNSTILE_SECRET`, `PDC_V5C30_TURNSTILE_HOSTNAME`.

Une fois **tous** les prérequis vérifiés sur DEV et les secrets injectés depuis un coffre :

```bash
cd /workspaces/PDC-v5c
PDC_V5C30_ENABLED=true PDC_V5C30_ENV=sandbox PDC_V5C30_ISSUE_LINKS=false \
  node backend/pdc-api/scripts/start-public-sandbox-v5c30.mjs
```

Le script ne réalise aucun `listen()` si les préconditions manquent. Il ne se raccorde pas au serveur administratif national déjà présent. Il **n'ajoute aucun paiement confirmé**. `issueLinks` est forcé à `false`.

Pour des tests négatifs après démarrage local (sans créer de commande) :

```bash
PDC_V5C30_PROBE_ORIGIN=https://votre-domaine-dev.example \
  node backend/pdc-api/scripts/probe-public-sandbox-v5c30.mjs
```

## Périmètre de validation

- **Tests locaux (simulations)** : adresse TCP vs XFF forgé ; proxy local autorisé ; rôle DB attendu ; réponse HTTP sans paiement ; blocage origine inconnue.
- **DEV connecté, non exécuté par ce paquet** : login rôle, vérification CA, Turnstile siteverify, bucket DB, création de commande fictive et réservation sans émission de lien.
- **Non autorisé dans V5-C.30** : appel Tara, confirmation de paiement, passage d'adhésion `draft` à `submitted`, versement réel, déploiement public.

## Limites de conception

La branche frontend V5-C.29 reste désactivée : l'activation dans Vite et les essais avec jetons Turnstile nécessitent un point HTTPS réellement isolé, un domaine approuvé et des protections réseau. Le rôle SQL créé en 021 ne peut pas encore s'authentifier sur le réseau tant que le DBA n'a pas provisionné son secret. Le paiement par carte nécessite toujours la vérification des URL effectivement retournées par Tara. La migration **022 n'a pas été installée** et ne doit pas être marquée applied artificiellement.
