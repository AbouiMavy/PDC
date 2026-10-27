# PDC — V5-B.6.1 : identité, demande facultative de carte et amorce de numérotation Internet

**Branche : `feature/v5b` — développement uniquement.**

## Modifications visibles

- Adhésions seulement : lieu de naissance obligatoire (y compris pour la deuxième personne d'un couple) ; le formulaire de dons reste inchangé.
- Sexe déclaré M/F pour les préfixes historiques. La civilité reste indépendante du sexe déclaré.
- Demande de carte par case à cocher (facultative) : carte numérique, physique ou les deux.
- Photographie JPEG/PNG de 5 Mo maximum **demandée uniquement lorsqu'une carte est sollicitée**.
- Pour une adhésion de couple, le déclarant peut sélectionner les **deux photos** depuis la même page ; chaque personne aura ultérieurement son numéro et sa carte.
- Prévisualisation locale des portraits, sans téléversement ni enregistrement. Ne pas utiliser pour de vraies adhésions.
- Mention officielle FR validée placée avant acceptation des statuts ; traduction EN.

## Modèle PostgreSQL préparatoire (migration `20261025000600`)

- `people.birth_place` et `people.sex_code` ajoutés **sans imposer ces champs aux donateurs** ; les obligations de la demande d'adhésion sont vérifiées dans le formulaire et devront l'être dans l'API future.
- Préférences de demande de carte dans `membership_applications`.
- Séquence unique `internet_member_number_seq` de 1 à 999999, commune aux préfixes M/F.
- Réservations de numéros destinées à rester uniques et non réutilisables ; table de demandes de carte stockant seulement des métadonnées, pas les photos.
- L'API existante ne peut pas attribuer de numéros ni écrire dans ces nouvelles tables ; ce sera V5-B.6.2. La fonction historique de test `admit_member_dev` reste **inchangée**.
- Les numéros historiques M-PDC-xxxxxx et F-PDC-xxxxxx ne sont pas modifiés. Vérifier qu'aucun numéro `*-PDC-I-*` n'a déjà été attribué avant activation future.
- Les appels à `nextval` peuvent créer des trous dans la séquence : c'est normal en PostgreSQL. Aucune séquence n'est consommée par les tests fournis.

## Installation dans Codespaces

Depuis la racine du projet `PDC` :

```bash
# 1. Préserver les éventuelles modifications locales
mkdir -p .pdc-v5b6-backup/src/pages .pdc-v5b6-backup/src/features/adhesion
cp src/pages/Adhesion.jsx src/pages/Adhesion.css .pdc-v5b6-backup/src/pages/
cp src/features/adhesion/textes.js .pdc-v5b6-backup/src/features/adhesion/

# 2. Déposer le zip à la racine, puis extraire UNIQUEMENT les fichiers fournis
unzip -o pdc-v5b6-adhesion-cartes.zip

# 3. Contrôler les fichiers modifiés
node --test tests/v5b6-membership-card.test.mjs
node --test tests/tarifs.test.mjs tests/communes-cm.test.mjs
npm run build
```

Aucune migration n'est exécutée par l'extraction.

## Étape SQL : validation avant application

```bash
npx supabase db push --linked --dry-run
```

Résultat attendu : **une seule** migration `20261025000600_pdc_v5b6_identity_cards_numbering.sql`.
Ne pas faire `db push` réel avant examen de ce résultat. Après approbation et application de la migration, exécuter `tests/sql/v5b6-identity-numbering-test.sql` dans Supabase SQL Editor. Le script s'achève par `ROLLBACK` et ne crée aucune fiche.

## Tests manuels prioritaires

1. Cameroun : première adhésion, champs date/lieu de naissance, sexe, photo facultative sans demande de carte.
2. Demander carte numérique : photo obligatoire ; aperçu local ; passage au récapitulatif.
3. Diaspora couple : deux lieux/dates de naissance et deux sexes, deux photos demandées si carte demandée ; la même personne peut déposer les deux.
4. Renouvellement : aucun lieu de naissance ni photo exigés.
5. FR/EN, alignement des grilles et affichage mobile.
6. Dons : **aucun lieu de naissance demandé**, communes inchangées.

## Limites à ne pas masquer

- Le formulaire est encore une **démonstration** : aucun paiement, stockage d'images, admission ou attribution de numéro effectifs.
- Les deux faces historiques de la carte sont des **références graphiques**, pas encore un moteur de génération PDF/PNG.
- Les photographies devront plus tard être vérifiées côté serveur et stockées dans un espace privé (pas dans `public/`), avec suppression des métadonnées EXIF et contrôle des autorisations.
- **Arbitrage statutaire restant** : la mention validée lie l'adhésion définitive à la délivrance de la carte, alors que la carte est facultative. Aucun statut « définitif » sans carte n'est implémenté tant que cette règle n'est pas tranchée.
- Le modèle `membership_applications` ne gère pas encore complètement une paire de dossiers indépendants payée en une seule transaction. Ce lien sera traité dans le backend V5-B.6.2.
