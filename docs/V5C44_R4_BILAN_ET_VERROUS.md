# PDC R4 — livrable DEV, préparation ouverture publique

## Déployé par cet installateur
- R3 : CTA paiement visible avant le bouton de conservation, option payer plus tard, reçu de demande téléchargeable distinct du reçu de paiement.
- Retour TaraMoney `/retour-paiement` neutre ; aucune déclaration d'encaissement fondée sur une URL.
- `productPictureUrl` en option, avec URLs HTTPS publiques configurées par le backend pour les dons et adhésions. Aucun drapeau, aucune devise ni image artificielle ajoutés aux fichiers de production.
- Première adhésion Cameroun avec paiement simultané des frais initiaux (2 000 XAF) et d'une cotisation annuelle totale ou partielle : contrôle côté navigateur, calcul du serveur, SQL atomique de deux allocations, vérification des réservations Tara pour 1 ou 2 allocations.
- Module de devis FX pour appliquer un taux fournisseur explicite validé et arrondir au multiple **supérieur** de 5/10 XAF. L'ancien module historique à taux fixe est conservé intact, en attendant le branchement d'une vraie quote Tara contrôlée.

## À ne pas activer en production sans développement et recette complémentaires
- **Diaspora** : le contrat public actuel est uniquement XAF et la dette légale EUR est conservée distinctement ; une passerelle de rapprochement multi-devise doit être validée avant émission de lien Tara. Le module `tara-eur-xaf-v5c.mjs` existant n'est pas une preuve de taux fournisseur du jour.
- **Photographies** : `portrait-upload-intent-v5b610e.mjs`, F1, F4, stockage privé, atelier de cartes sont conservés. Le contrôle photo E2/F1 exige actuellement paiement et admission. Pour accepter *avant* paiement, il faut une passerelle de dépôt provisoire et des autorisations d'accès/effacement indépendantes des jetons de délivrance de carte. Cet installateur n'active pas de dépôt pré-paiement fictif.
- **Page retour** : ne réhydrate pas encore de dossier par jeton privé contrôlé après fermeture du navigateur ; elle informe sans divulguer de données.
- **Bannières** : `PDC_V5C41_DONATION_PICTURE_URL`, `PDC_V5C41_MEMBERSHIP_PICTURE_URL` et `PDC_V5C41_ANNUAL_PICTURE_URL` à renseigner après export Canva, HTTPS public et vérification de leur affichage sur `/pay/` et `/cardpay/`.
- Dons anonymes, renouvellements, dons mensuels : non activés.
- Tests SQL multi-allocations sur une base isolée, bilan financier et audit du productId : prérequis au premier encaissement public.
- Aucun `supabase db push`, aucun paiement réel, aucune confirmation ou admission par l'installateur.

## Installation SQL, séparée et DEV uniquement
Après revue, appliquer en SQL Editor DEV sur le projet de référence `rvgpnmznhzwlzqyefahd` :
`supabase/migrations/20261029004510_pdc_v5c45_annual_shared_checkout_dev.sql`.
Ne pas appliquer en production sans examen des invariants et des permissions.
