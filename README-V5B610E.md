# PDC — V5-B.6.10-E : préparation des photos du candidat (sans activation du dépôt public)

## Portée

Projet DEV `rvgpnmznhzwlzqyefahd`, branche `feature/v5b`. Les 13 migrations existantes ne changent pas.

**IMPORTANT — Aucun téléversement réel depuis le site n'est activé.** Le formulaire d'adhésion ne dispose pas encore d'un enregistrement de demande et d'un paiement rapproché. Donner aujourd'hui accès à l'ancienne passerelle réservée à `national_admin` permettrait de contourner l'autorisation individuelle. Ce correctif établit le contrat et prépare correctement les fichiers dans le formulaire, sans créer un accès public prématuré.

- `src/features/adhesion/portrait-upload-intent-v5b610e.mjs` : préparation en mémoire des fichiers membre/conjoint et contrat de transfert conditionné à deux autorisations *distinctes* du serveur.
- `backend/pdc-api/src/applicant-portrait-permission-v5b610e.mjs` : contrat serveur pur, non monté dans `app.mjs`. Il attend une future validation **atomique** d'une autorisation de paiement (usage unique), liée à une demande de carte précise ; il ne divulgue aucune clé ni URL Storage.
- `scripts/apply-v5b610e-form.mjs` : modification ciblée du formulaire existant. Au récapitulatif, indique sans ambiguïté que les photos **ne sont pas envoyées** et ajoute un contrôle de préparation locale.
- `tests/v5b610e-applicant-portraits.test.mjs` : 16 tests de sécurité et de correspondance individuelle/couple.

## Installation

À la racine Codespaces `/workspaces/PDC`, sauvegarder d'abord la page :

```bash
cd /workspaces/PDC
git switch feature/v5b
mkdir -p .pdc-v5b610e-backup
cp src/pages/Adhesion.jsx .pdc-v5b610e-backup/
unzip -o pdc-v5b610e-preparation-formulaire.zip
node scripts/apply-v5b610e-form.mjs
```

Le script est idempotent et refuse de modifier un fichier inattendu (message `PDC_V5B610E_LAYOUT_MISMATCH`) : dans ce cas, ne pas forcer. Il **n'écrase pas** `Adhesion.jsx`.

## Tests

```bash
node --test tests/v5b610e-applicant-portraits.test.mjs
npm run build
```

Attendu : `16 pass, 0 fail`; compilation Vite sans erreur. L'exécution `npm run build` est à valider dans Codespaces (dépendances React du dépôt absentes de l'archive).

Avec le port 5173 ouvert : `/adhesion`. Tester une adhésion individuelle puis une adhésion de couple diaspora, avec demande de carte. Le récapitulatif doit annoncer « Les photos restent sur cet appareil et ne sont PAS encore téléversées ». Sans demande de carte, aucune photo n'est exigée. Le formulaire de dons reste inchangé.

## Suite pour un véritable dépôt public (non comprise ici)

1. Enregistrer l'adhésion et rapprocher un paiement vérifié côté serveur ; résoudre le paiement unique pour deux adhérents d'un couple.
2. Émettre **depuis le serveur seulement** une autorisation opaque aléatoire et courte (≤ 15 min) pour **chaque** `card_request_id` et bénéficiaire, jamais à partir d'une simple référence, d'un email ou d'un numéro militant.
3. Enregistrer son empreinte SHA-256, contrôler atomiquement usage unique, délai, demande, droit du bénéficiaire, statut actif et paiement.
4. Créer une fonction SQL **distincte** de l'ancienne procédure administrative `portrait_reserve_v5b610b`, laquelle exige `national_admin`. Conserver l'écriture PostgreSQL dans un rôle privé dédié. Contrôler fréquence et taille, consentement, et interdire les autorisations croisées entre conjoints.
5. Seule une fois ces étapes validées, raccorder une route de téléversement à l'API et déclencher `transferAuthorizedPortraits` dans le parcours après paiement, avec reprise en cas de perte réseau et nettoyage des fichiers orphelins.

Aucune nouvelle migration, aucune activation de secret, aucune modification du port 8787 ou de Supabase Storage ici. Ne pas utiliser de photographies réelles pendant les tests.
