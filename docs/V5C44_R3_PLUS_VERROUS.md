# PDC V5-C.44 — R3+ : retour et images TaraMoney

## Modifications
- V5-C.44 UX R3 conservé intégralement : bouton payer prioritaire, paiement différé, accusé PDC, textes FR/EN.
- `returnUrl` pointe vers `/retour-paiement` et non vers `/`. C'est une page de retour neutre, sans confirmation financière ou dossier privé accessible publiquement.
- Le backend peut transmettre `productPictureUrl` à TaraMoney, différent pour les dons et l'adhésion, uniquement si une URL d'image publique HTTPS a été fournie par le trésorier.
- Variables serveur `PDC_V5C41_DONATION_PICTURE_URL`, `PDC_V5C41_MEMBERSHIP_PICTURE_URL`, `PDC_V5C41_ANNUAL_PICTURE_URL` : JPEG/PNG HTTPS sans paramètres d'URL ni authentification. TaraMoney doit pouvoir les consulter depuis son serveur. Le rendu sur `/pay` et `/cardpay` reste à confirmer.

## Fonctions préexistantes mais non libérables par ce patch UX seul
- Frais initiaux et cotisations annuelles calculés dans `src/features/adhesion/tarifs.mjs`.
- Couple diaspora 40 EUR = 4 000 centimes, deux bénéficiaires distincts et SQL dédié, mais pas de checkout public EUR branché.
- Photos : aperçu JPEG/PNG, contrôles de taille, composants d'ingestion protégée sous autorisation après validation ; pas encore de téléversement initial ni conservation avant finalisation.
- Le checkout React refuse `modeCotisation !== 'aucun'`, `demandeCarte=true`, et diaspora. Le serveur accepte seulement `donation` et `initial_membership`, le SQL de commande V5C23 n'accepte que `donation` et `individual_initial` avec montant de 2 000 XAF. Retirer seulement les verrous React ferait payer sans allocation correcte.
- La cotisation annuelle simultanée exige : émission du devis côté serveur, SQL enregistrant deux obligations (frais initiaux et cotisation) et leurs allocations sans double crédit, puis tests idempotence, rapprochement et recette.
- Dons anonymes publiquement et renouvellements : restent désactivés par décision métier.
- Dons mensuels : pas de mandat / prestataire de prélèvement récurrent, ne pas annoncer d'abonnement.
- La page retour ne récupère pas automatiquement le `paymentId` ; récupération sécurisée d'un dossier et réponse Tara vérifiée restent à développer.
- Encodage TaraMoney : conserver les accents UTF-8 côté PDC. Le fournisseur doit corriger le mojibake ; des essais avec un Content-Type UTF-8 explicite sont possibles.

## Sécurité
Aucune migration SQL, aucune admission, aucun paiement automatiquement confirmé. Ne pas brancher la clé de production dans les scripts de test Sandbox.
