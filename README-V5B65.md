# PDC — V5-B.6.5 : civilité et correction consolidée du formulaire

**Branche : `feature/v5b`. Développement uniquement. Aucune migration supplémentaire.**

## Périmètre strict

- Le demandeur choisit uniquement **Madame** ou **Monsieur** ; le champ visible « Sexe » a été supprimé.
- Dans la formule **couple diaspora**, la deuxième personne choisit également une **civilité indépendante** (une personne peut saisir les deux dossiers et fournir les deux photos).
- Préfixe **F** calculé à partir de **Madame**, **M** calculé à partir de **Monsieur** ; le serveur SQL V5-B.6.2 utilise déjà exactement cette règle. Six chiffres et lettre **I** inchangés.
- **Lieu de naissance** obligatoire pour chaque nouvelle adhésion, pour chaque membre d’un couple ; le formulaire de dons n'est pas modifié.
- Carte **facultative** ; photo(s) requise(s) uniquement pour une carte demandée. Prévisualisation locale seulement, aucun téléversement à distance.
- Récapitulatif affiche la **civilité** de chaque personne et non le sexe.
- Texte français de l’adhésion définitive conservé **mot pour mot**.
- Aucun changement dans le backend, la numérotation SQL, les neuf migrations, les paiements ou l’administration nationale.

## Fichiers de ce correctif

- `src/pages/Adhesion.jsx` — formulaire et récapitulatif.
- `src/features/adhesion/textes.js` — libellés FR/EN.
- `src/features/adhesion/civilite.mjs` — règle testable civilité → préfixe.
- `tests/v5b6-membership-card.test.mjs` — ancien test V5-B.6.1 mis à jour pour ne plus demander les champs « Sexe ».
- `tests/v5b65-civilite.test.mjs` — sept contrôles supplémentaires.

## Installation — depuis Codespaces

```bash
cd /workspaces/PDC
git switch feature/v5b
mkdir -p .pdc-v5b65-backup/src/pages .pdc-v5b65-backup/src/features/adhesion .pdc-v5b65-backup/tests
cp src/pages/Adhesion.jsx .pdc-v5b65-backup/src/pages/
cp src/features/adhesion/textes.js .pdc-v5b65-backup/src/features/adhesion/
cp tests/v5b6-membership-card.test.mjs .pdc-v5b65-backup/tests/

# Après avoir téléversé ce ZIP à la racine du dépôt :
unzip -o pdc-v5b65-civilite-correctif.zip

# Tests :
node --test tests/v5b65-civilite.test.mjs tests/v5b6-membership-card.test.mjs
node --test tests/tarifs.test.mjs tests/communes-cm.test.mjs
npm run build
```

Le serveur Vite du port **5173** devrait refléter automatiquement le formulaire modifié. Les ports **5175** (administration) et **8787** (API) n'ont pas besoin d’être redémarrés.

## Scénarios de vérification manuelle

1. France, adhésion individuelle, **Madame** : aucune question sur le sexe ; lieu de naissance obligatoire.
2. France, **couple** : civilité indépendante de chaque personne, deux lieux de naissance, deux photos si la carte est demandée.
3. Sans carte : pas de photo exigée. Avec carte : photo(s) obligatoire(s) ; uniquement un aperçu local.
4. Cameroun : initial 2 000 FCFA et modalités de cotisation inchangés ; aucune question sur le sexe.
5. FR/EN et mobile ; le récapitulatif présente la civilité.
6. Dons inchangés ; aucune demande de lieu de naissance.

## Remarques d'architecture

- Le préfixe officiel est un **attribut calculé à partir de la civilité déclarée** ; la civilité ne valide pas l'identité civile du membre.
- Ne **pas** utiliser de vrais noms ou photos dans la version démonstration.
- Le statut « définitif » pour un militant qui ne souhaite pas de carte reste à trancher, puisque la mention validée rattache la définitivité à sa délivrance.
- Le flux réel de paiement/immatriculation n'est pas encore raccordé ; aucune donnée de ce formulaire n'est transmise au backend.
