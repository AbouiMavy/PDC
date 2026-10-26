# PDC — V5-B.6.10-A : test réel du stockage privé de photographies (DEV)

**Branche :** `feature/v5b` • **Projet :** `rvgpnmznhzwlzqyefahd` • **Prérequis :** 11 migrations jusqu'à `20261026001100`.

## Portée

Ce correctif ajoute seulement :
- `backend/pdc-api/src/private-storage-dev.mjs` (client Storage **pour le test opérateur uniquement**),
- `backend/pdc-api/scripts/check-private-portraits-dev.mjs` (test réel, avec suppression),
- `backend/pdc-api/test/private-storage-dev.test.mjs` (12 tests simulés, sans réseau),
- `tests/assets/fictive-portrait-test.png` (image **artificielle**, sans portrait humain),
- `tests/sql/v5b610-bucket-audit-readonly.sql` (contrôle du bucket, lecture seule),
- ce guide.

**Aucun fichier existant n'est écrasé.** Il n'y a **ni migration n°12, ni nouveau serveur, ni accès de téléversement sur le portail**. Cette étape valide réellement le chemin privé de Supabase Storage avant d'intégrer les photos des personnes et le registre `pdc_private.card_portrait_assets`. Aucun fichier réel de membre n'est utilisé.

## Étape 1 — Installer et tester dans Codespaces

Déposer l'archive à la racine du dépôt, puis :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b610a-test-storage-prive.zip
node --test backend/pdc-api/test/private-storage-dev.test.mjs
npm run build
```

Attendu : **12 tests réussis, 0 échec** ; compilation Vite sans erreur. Les tests Node ne contactent pas Supabase.

## Étape 2 — Créer le bucket (UNE SEULE FOIS)

Sur **Supabase > projet `pdc-developpement` > Storage > New Bucket** :

| Paramètre | Valeur |
| --- | --- |
| Bucket name | `pdc-member-portraits-dev` |
| Public bucket | **NON / Private** |
| File size limit | **5 MB max** (une valeur <= 5 242 880 octets) |
| Allowed MIME types | **exactement** `image/jpeg`, `image/png` |

Les contrôles d'accès des objets Storage ne doivent donner **aucun SELECT/INSERT/UPDATE/DELETE** non conditionné à `anon` ou `authenticated`. Inspecter les règles générales existantes dans **Storage > Policies** : elles peuvent concerner plusieurs buckets. Le bucket est utilisé seulement pour les essais de développement.

**Important :** créer le bucket avec le Dashboard, **ne pas insérer de lignes dans `storage.objects` par SQL**, et ne pas rendre public le bucket.

Dans SQL Editor, exécuter `tests/sql/v5b610-bucket-audit-readonly.sql`. Attendu : `Success. No rows returned` avec la notice « bucket privé ... conforme ».

## Étape 3 — Clé d'opérateur : ne jamais l'afficher ni la committer

Pour ce test CLI local, il faut une clé Supabase **`service_role` legacy (JWT)** à récupérer depuis **Supabase > Project Settings > API Keys**, côté **projet de développement uniquement**. C'est une clé avec **de très larges permissions**, qui contourne RLS : **ne jamais la placer dans le React, `VITE_*`, un fichier suivi par Git, un capture d'écran, ni la partager dans un chat**.

Dans **un terminal Codespaces** (commandes Bash ; la saisie de la clé est masquée) :

```bash
cd /workspaces/PDC
export PDC_SUPABASE_PROJECT_REF="$(cat supabase/.temp/project-ref)"
read -rsp 'Clé service_role (développement, saisie masquée) : ' SUPABASE_SERVICE_ROLE_KEY; echo
export SUPABASE_SERVICE_ROLE_KEY
PDC_DEV_STORAGE_SMOKE=YES node backend/pdc-api/scripts/check-private-portraits-dev.mjs
unset SUPABASE_SERVICE_ROLE_KEY
```

**Résultat attendu :** cinq contrôles `1/5` à `5/5` et `V5-B.6.10-A OK`.

Le programme vérifie la configuration privée du bucket, envoie une **image fictive**, la relit sous authentification, compare son empreinte SHA-256, teste deux URL sans autorisation, puis **supprime** l'objet et vérifie l'absence du fichier.

En cas d'erreur `PDC_CLEANUP_REQUIRES_MANUAL_ACTION`, ne relancez pas sans vérifier : ouvrir **Storage > pdc-member-portraits-dev > dev-smoketests** et supprimer le fichier d'essai mentionné, puis réessayer. Aucun nom ni numéro militant n'apparaît dans les chemins.

## Limites de sécurité et prochaine étape

- La clé `service_role` donne potentiellement accès à des données sensibles. Cette procédure **ne s'exécute pas sur le site** et ne doit pas être intégrée à l'API publique.
- Il n'y a **pas encore** d'authentification directe des membres, d'endpoint de photo, ni d'association d'un objet à `card_portrait_assets`.
- Les demandes de cartes restent conditionnées à la revue hebdomadaire ; **aucune émission officielle** n'est débloquée.
- Ne pas téléverser de photographies personnelles avec cette procédure d'essai.
- La future itération implémentera la vérification d'identité d'un membre/demandeur, la normalisation/validation d'images côté serveur (dont suppression EXIF), l'inscription transactionnelle dans le registre et le remplacement avec nettoyage audité. Le stockage restera privé.

Le port **5173** suffit à continuer les tests de l'atelier ; aucun changement des ports 5175 et 8787 n'est requis pour ce test CLI.
