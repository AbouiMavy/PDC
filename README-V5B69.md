# PDC — V5-B.6.9 : registre privé des photographies (développement)

**Branche :** `feature/v5b`. **Projet Supabase :** référence `rvgpnmznhzwlzqyefahd`. **Prérequis :** les dix migrations jusqu'à `20261026001000`.

## Périmètre exact

Ce correctif **ajoute de nouveaux fichiers seulement**, sans remplacer les pages, les modèles recto-verso, l'API, l'administration ni les migrations déjà appliquées :

- `supabase/migrations/20261026001100_pdc_v5b69_private_portraits_registry.sql` : registre SQL privé, lié par FK à **chaque demande de carte** (un identifiant différent par personne, y compris couple) ; chemin opaque sans nom ni numéro militant ; contrôle des métadonnées JPEG/PNG, 5 Mio max, dimensions ; un seul portrait courant par demande ; remplacement versionné ; RLS et aucun droit direct aux visiteurs/à l'API actuelle.
- `backend/pdc-api/src/portrait-policy.mjs` : fonctions pures préparatoires pour le *futur serveur de téléversement*. Elles ne lisent ni ne transfèrent aucun fichier.
- `tests/v5b69-private-portraits.test.mjs` : huit tests locaux.
- `tests/sql/v5b69-private-portraits-test.sql` : huit contrôles transactionnels SQL avec fausses données et `ROLLBACK`.

**Pas encore livré :** le téléversement réel, la création du bucket Storage, l'inspection/normalisation des octets des images, l'authentification des membres, la récupération administrative des photos, les URLs signées, le QR réel et l'émission/délivrance des cartes. Le formulaire actuel garde sa prévisualisation locale. Ne pas prétendre que les photos sont sauvegardées après sélection.

## 1 — Installer et tester localement

Téléverser `pdc-v5b69-portraits-prives-preparation.zip` à la racine de Codespaces :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b69-portraits-prives-preparation.zip
node --test tests/v5b69-private-portraits.test.mjs
npm run build
```

**Attendu :** 8 tests réussis, compilation sans erreur (éventuel avertissement Vite de taille de bundle non bloquant).

## 2 — Prévisualiser la onzième migration

```bash
cat supabase/.temp/project-ref
# rvgpnmznhzwlzqyefahd
npx supabase db push --linked --dry-run
```

**Attendu :** uniquement `20261026001100_pdc_v5b69_private_portraits_registry.sql`. **Arrêter là avant confirmation.** Après revue, l'appliquer par `npx supabase db push --linked`, puis vérifier `npx supabase migration list --linked` (11 migrations synchronisées). Dans Supabase SQL Editor, copier le fichier `tests/sql/v5b69-private-portraits-test.sql` et vérifier les huit notices suivies de `Success. No rows returned`.

## 3 — Politique du futur bucket privé

**Ne pas créer de bucket public.** Lorsque le serveur d'upload sera prêt, créer via **Supabase Dashboard → Storage → New bucket** :

- Nom exact : `pdc-member-portraits-dev` ; visibilité **Private** (`public=false`).
- MIME autorisés : `image/jpeg`, `image/png` ; taille maximale **5 MiB** (5 242 880 octets).
- Aucune règle permissive `storage.objects` pour `anon`/`authenticated`. **Auditer également les règles Storage globales existantes** qui pourraient viser tous les buckets.
- Ne jamais insérer de faux fichiers dans `storage.objects` : les opérations de stockage passent par la Storage API, et les fichiers doivent être validés et réencodés par un serveur de confiance avant persistance.
- Ne pas exposer de `service_role` ni de secret de signature dans Vite / navigateur / dépôt. Le modèle futur de téléversement exige un jeton à usage limité lié à la demande de carte et une validation serveur de l'association personne–dossier.
- Ne pas générer de lien signé à durée longue. Une URL signée peut demeurer valable après retrait des droits jusqu'à son expiration ; envisager un flux serveur authentifié pour les contenus sensibles.

Le SQL ne crée volontairement **pas** le bucket via modification des tables internes `storage.*` : celles-ci ne doivent pas être utilisées comme API d'upload. Une ligne `status='stored'` ne constituera une preuve d'existence du fichier que si elle est écrite par notre futur serveur **après** confirmation via Storage.

## Point fonctionnel conservé

La photographie reste facultative pour adhérer ; elle n'est requise que pour demander la carte. Une personne peut sélectionner les deux photographies de son couple mais chaque conjoint a sa demande de carte et son fichier personnel. Le recto Cameroun, le recto Diaspora et le verso commun restent identiques à ceux de la V5-B.6.7 validée. Devise sur la carte : **DIEU – PATRIE – JUSTICE – DÉMOCRATIE / GOD – FATHERLAND – JUSTICE – DEMOCRACY**.

Ce correctif ne modifie **aucun** service en cours : ports 5173, 5175 et 8787 inchangés.
