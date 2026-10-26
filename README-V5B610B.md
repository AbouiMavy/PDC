# Portail PDC — V5-B.6.10-B : association sécurisée des portraits (DEV)

**Branche :** `feature/v5b` • **Projet Supabase :** `rvgpnmznhzwlzqyefahd` • **Prérequis :** 11 migrations synchronisées et bucket privé `pdc-member-portraits-dev` vérifié en V5-B.6.10-A.

## Objet exact

Cette itération construit le **circuit serveur** qui reliera une image privée à la **demande de carte d'une personne**. Elle ne publie **aucune route d'upload sur le site** : l'authentification du membre et l'attribution des deux demandes d'un couple restent à raccorder après validation du paiement. Les nouvelles fonctions SQL sont restreintes à un rôle `NOLOGIN`, différent du lecteur API existant. **Aucune carte officielle n'est émise.**

Les originaux des cartes restent intacts : recto Cameroun (conseils/comités), recto diaspora (secteurs), verso identique et devise « DIEU – PATRIE – JUSTICE – DÉMOCRATIE / GOD – FATHERLAND – JUSTICE – DEMOCRACY ».

## Ce que fait réellement le correctif

- Validation d'image **sur un serveur de confiance** via `sharp` : JPEG/PNG authentique, dimensions 240–4096 px, limite 5 Mio, réencodage JPEG, orientation redressée, suppression des métadonnées EXIF.
- Réservation de clé privée opaque et **rattachement à un seul `membership_card_requests.id`**. Un opérateur autorisé peut rattacher séparément deux photographies aux deux demandes d'un couple.
- Après upload avec remplacement désactivé, relecture du fichier et contrôle de son SHA-256 ; **alors seulement** confirmation en base et mise à jour de `portrait_storage_key`.
- Un nouveau portrait remplace l'ancien dans le registre ; l'ancien devient `retired`. Sa suppression effective du Storage devra être pilotée par un mécanisme d'expiration et d'audit, pas directement en SQL.
- L'API publique/admin actuelle sur 8787 **reste en lecture seule**. Les fonctions d'écriture sont uniquement accordées au rôle non connectable `pdc_portrait_writer_v5b610` ; aucun login technique d'upload n'est créé ici.
- En cas d'échec avant confirmation SQL, tentative de nettoyage Storage et annulation de réservation. En cas d'incertitude **pendant** la confirmation SQL, le système arrête le traitement et demande une réconciliation, sans effacer aveuglément un fichier potentiellement référencé.

## 1 — Installer les fichiers et vérifier les tests

Dépose `pdc-v5b610b-association-portraits-prives.zip` à la racine de Codespaces :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b610b-association-portraits-prives.zip
```

La normalisation utilise `sharp` **côté backend seulement**. Installer cette dépendance une seule fois dans le backend Node :

```bash
cd /workspaces/PDC/backend/pdc-api
npm install sharp --save
cd /workspaces/PDC
```

Cela actualise **uniquement** les dépendances du backend, pas celles du site React.

```bash
node --test tests/v5b610b-portrait-association.test.mjs
npm run build
```

**Attendu : 12 tests réussis, 0 échec, 0 test ignoré**, puis compilation réussie. Si `sharp` n'est pas installé, 10 tests passent et 2 sont ignorés : **ne pas considérer l'itération pleinement testée dans ce cas**.

## 2 — Examiner la douzième migration sans la pousser

```bash
cd /workspaces/PDC
cat supabase/.temp/project-ref
npx supabase db push --linked --dry-run
```

Attendu : référence `rvgpnmznhzwlzqyefahd` et **uniquement** :

```
Would push these migrations:
 • 20261026001200_pdc_v5b610b_portrait_write_gateway_dev.sql
```

**S'arrêter après le `--dry-run` et confirmer le résultat avant d'exécuter `db push` réel.** Aucun redémarrage des ports n'est nécessaire.

## 3 — Suite après approbation de la migration

Appliquer la migration `20261026001200` après confirmation, vérifier 12 migrations synchronisées, puis exécuter dans **Supabase SQL Editor** le fichier `tests/sql/v5b610b-portrait-gateway-test.sql`. Ce script contient **10 contrôles transactionnels**, crée seulement des données fictives, n'envoie aucune image à Storage et termine par `ROLLBACK`. Résultat attendu : dix notices et `Success. No rows returned`.

## À NE PAS faire

- Ne pas insérer la clé `service_role` dans le navigateur, dans un fichier `VITE_*`, dans Git ou dans `.env.example`.
- Ne pas accorder `EXECUTE` des nouvelles fonctions à `anon`, `authenticated` ou `pdc_api_runtime_v5b3`.
- Ne pas considérer un champ photo choisi dans le formulaire comme une photographie déjà enregistrée.
- Ne pas essayer d'émettre une carte officielle, même si le fichier est chargé.
- Ne pas utiliser de photographies de militants pendant les tests de ce paquet.

**Limite fonctionnelle assumée :** il reste à mettre en place une authentification propre aux adhérents ou un jeton strictement lié à la demande après confirmation du paiement, un service d'upload dédié avec login PostgreSQL restreint, l'association du paiement commun à deux dossiers pour les couples, et une procédure de nettoyage des anciennes versions. Aucune de ces étapes n'est contournée par ce correctif.
