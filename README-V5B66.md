# PDC — Correctif V5-B.6.6 : ordonnancement du formulaire d’adhésion

Branche : `feature/v5b`. Correctif **purement visuel**, fondé sur les fichiers V5-B.6.5.

## Corrections

- Identité : **Nom / Prénom**, puis **Date / Lieu de naissance**.
- Champ **Pays / Profession** sur une seule ligne au lieu d'une profession orpheline.
- Coordonnées : **Adresse e-mail / Téléphone**.
- Pour l’adhésion de couple diaspora : **E-mail du partenaire / Téléphone du partenaire** sur une seule ligne.
- Grilles régulières : espacement unique entre colonnes/lignes, sans marges supplémentaires sur les champs de la grille.
- Responsive : **deux colonnes sur ordinateur, une seule sur écrans étroits**.

Aucun changement des validations, libellés, tarifs, méthodes de paiement, civilités, choix de carte, numéro militant, ou dons. Aucune migration Supabase. Aucun redémarrage requis sur les ports 5175 et 8787.

## Installer dans Codespaces

Déposer l’archive ZIP à la racine du dépôt et exécuter :

```bash
cd /workspaces/PDC
git switch feature/v5b
unzip -o pdc-v5b66-correctif-grille.zip

git apply --check patches/v5b66-layout.patch
# Continuer seulement si aucune erreur n'apparaît :
git apply patches/v5b66-layout.patch
```

`git apply --check` est volontairement conservateur : il refuse le correctif si les fichiers ont divergé. **Ne pas forcer** en cas d'échec ; fournir le message pour préparer un patch adapté.

## Tests

```bash
node --test tests/v5b66-layout.test.mjs
node --test tests/v5b65-civilite.test.mjs tests/v5b6-membership-card.test.mjs
npm run build
```

Visuellement, vérifier les parcours : Cameroun, diaspora individuelle, diaspora couple ; afficher avec navigateur large puis étroit (moins de 640 px) ; choisir une carte ou ne pas la demander. Le serveur Vite du site (5173) met normalement à jour automatiquement le CSS et React.

## Annuler si nécessaire

Tant que le correctif n’a pas été fusionné ou modifié par la suite :

```bash
git apply --reverse patches/v5b66-layout.patch
```

La révocation affecte seulement les deux fichiers `src/pages/Adhesion.jsx` et `src/pages/Adhesion.css`.
