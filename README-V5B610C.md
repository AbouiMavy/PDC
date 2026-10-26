# PDC — V5-B.6.10-C : passerelle d'authentification de dépôt de photos (DEV)

**Branche** `feature/v5b` • **Projet Supabase** `rvgpnmznhzwlzqyefahd` • **Prérequis** 12 migrations appliquées et test SQL V5-B.6.10-B réussi.

## Limite délibérée de cette étape

Cette livraison prépare un service d'upload **réservé à un administrateur national authentifié** mais **ne crée pas de route HTTP** et **n'envoie pas encore de fichier réel**. Elle ajoute un rôle technique PostgreSQL séparé, initialement sans mot de passe, puis la composition privée de quatre contrôles : Supabase Auth (`/auth/v1/user`), habilitation nationale depuis la connexion SQL de lecture seule, droit d'écriture limité à trois fonctions SQL, relecture et empreinte du fichier dans le bucket privé.

Un rôle PostgreSQL compromis peut encore présenter un `actorId` d'administrateur aux fonctions SQL existantes de V5-B.6.10-B ; la séparation des secrets et une vérification de jeton serveur sont donc indispensables. **Cette étape ne constitue pas une autorisation de mise en production.**

Les deux rectos de carte, Cameroun/diaspora, et leur verso commun restent inchangés, avec la devise de **carte** « DIEU – PATRIE – JUSTICE – DÉMOCRATIE / GOD – FATHERLAND – JUSTICE – DEMOCRACY ».

## Fichiers inclus

- `supabase/migrations/20261026001300_pdc_v5b610c_portrait_upload_runtime_dev.sql` : rôle **`LOGIN`** distinct `pdc_portrait_upload_runtime_v5b610c` à **mot de passe NULL**, sans privilège direct sur les tables. Il ne peut pas se connecter par mot de passe tant que son propriétaire ne l'a pas configuré lors d'une prochaine étape.
- `backend/pdc-api/src/portrait-admin-auth-v5b610c.mjs` : extrait l'identité du token réellement vérifié ; refuse sans `national_admin` actif. L'ID de l'acteur n'est jamais accepté comme paramètre utilisateur.
- `backend/pdc-api/src/portrait-writer-db-v5b610c.mjs` : connexion PostgreSQL dédiée, rôle exact et pooler vérifiés, CA TLS exigée. Aucun accès via le login SQL de l'API 8787.
- `backend/pdc-api/src/portrait-runtime-v5b610c.mjs` : composition **non appelée par l'API 8787**, avec interrupteur DEV explicite. Le secret `service_role` reste exclusivement côté serveur ; jamais dans Vite.
- `tests/v5b610c-auth-upload.test.mjs` : 14 contrôles unitaires sans photo réelle ni accès réseau.
- `tests/sql/v5b610c-runtime-rights-test.sql` : 7 vérifications PostgreSQL **en lecture seule** après application de la migration.

## 1 — Installer dans Codespaces

Déposer `pdc-v5b610c-passerelle-photos-admin-dev.zip` à la racine du dépôt, puis :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b610c-passerelle-photos-admin-dev.zip
node --test tests/v5b610c-auth-upload.test.mjs
npm run build
```

**Attendu : 14 tests réussis, 0 échec, 0 test ignoré, puis compilation Vite sans erreur.**

## 2 — Simuler la treizième migration (NE PAS APPLIQUER ENCORE)

```bash
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

Référence attendue : `rvgpnmznhzwlzqyefahd`.

**La seule migration proposée doit être** :

```text
20261026001300_pdc_v5b610c_portrait_upload_runtime_dev.sql
```

**S'arrêter après cette simulation** et confirmer les résultats. La migration ne définit aucun mot de passe, aucune photo réelle et aucune carte officielle.

## 3 — Étape ultérieure après vérification

Après accord, pousser la 13e migration ; vérifier 13 migrations synchronisées ; exécuter `tests/sql/v5b610c-runtime-rights-test.sql` en SQL Editor (7 notices, `Success. No rows returned`). Ensuite seulement, configurer de façon sûre un mot de passe propre au rôle technique et prévoir une **demande de carte fictive persistante et nettoyable** pour le premier upload intégral de test. Ne pas coller un mot de passe SQL en clair dans les migrations, SQL Editor ou le chat ; `psql \password` est préférable pour sa gestion interactive.

## Mesures de sécurité

- Ne pas monter de route POST sur 8787, ne pas modifier `src/app.mjs` et ne pas ouvrir de port supplémentaire.
- Ne jamais exposer la clé Supabase `service_role` dans React, dans `VITE_*`, dans un commit ou dans un résultat de test.
- Aucune image de militant pendant les essais.
- L'habilitation d'un compte de test reste limitée dans le temps ; elle ne remplace pas les contrôles métier des demandes de cartes.
- Une photo associée au dossier ne déclenche jamais une délivrance de carte : la revue hebdomadaire reste obligatoire.
- Si une validation d'upload échoue ou devient incertaine, ne pas supprimer à l'aveugle un fichier potentiellement confirmé en base.
