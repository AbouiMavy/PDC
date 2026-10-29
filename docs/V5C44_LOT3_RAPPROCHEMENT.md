# PDC V5-C.44 — Lot 3 : rapprochement des transactions, sans encaissement

## Objectif
Comparer une commande financière enregistrée dans PostgreSQL **DEV** avec les informations de statut et de liste des transactions consultées depuis l'API TaraMoney (quand cela est explicitement autorisé). **La référence est le `productId` PDC ; la liste Tara utilise `transactionId === productId` selon les informations reçues du prestataire.** Ne pas assimiler le `paymentId` du webhook à cette référence.

## Modes opératoires

- **Simulation sans réseau** : `bash scripts/v5c44-audit-dev.sh mock matching` (ou `pending`, `missing`, `mismatch`, `duplicate`, `card`, `general`, `provider-error`, `unissued`, `pagination-incomplete`). La concordance issue de `matching` est exclusivement fictive.
- **Lecture de la base DEV seule** : `bash scripts/v5c44-audit-dev.sh db-only` puis saisie de la référence et des identifiants PostgreSQL restreints. Retour `PROVIDER_NOT_CONSULTED` ; aucune interrogation TaraMoney.
- **Consultation facultative de l'API TaraMoney Sandbox** : `bash scripts/v5c44-audit-dev.sh provider-read` ; nécessite le *productId* d'une commande DEV existante, le compte PostgreSQL restreint, une clé API **Sandbox** dont le périmètre a été confirmé par Tara, et une autorisation explicite de l'opérateur. Uniquement deux opérations de lecture : `/api/tara/transactions/status` et `/api/tara/transactionlist`. Le prestataire expose les mêmes noms de domaine en Sandbox et Production : ne jamais utiliser de clé Production.

## Interprétation du rapport

- `corroborated` : pour **Mobile Money seulement**, statut fournisseur `SUCCESS` et transaction de liste `PAID` avec la même référence, le même montant XAF et une pagination complète. Cela indique une **concordance des sources consultées**, pas un mouvement comptable confirmé.
- `not_verified` : aucun élément final concordant ou aucun fournisseur interrogé ; **ne pas** interpréter comme échec de paiement.
- `manual_review` : incohérence, erreur fournisseur, méthode non couverte, doublon ou pagination incomplète ; contrôle humain nécessaire.
- Pour carte bancaire, lien général, WhatsApp, Telegram ou Dikalo : pas de statut confirmé dans ce lot ; le rapprochement est `manual_review` en l'absence de contrat probant applicable.

Le JSON retourne **toujours** `paymentConfirmed:false`, `admissionGranted:false` et `settlementAuthorized:false`. Il n'écrit aucun résultat en base, n'envoie aucun webhook, ne crée aucun lien, ne change aucun statut. Les informations d'identité et les clés API ne sont jamais incluses dans le rapport. Référence produit tronquée.

## Contrôles et limites

- La lecture PostgreSQL n'est autorisée qu'avec la session `pdc_tara_v5c_writer` sur le projet DEV connu. La migration V5-C.44.2 doit déjà être appliquée ; ne pas la rejouer.
- Les appels aux API Tara sont **POST de consultation**, pas des ordres de paiement. Ils ne sont exécutés que dans `provider-read`, jamais en simulation ou en lecture DB seule.
- La recherche est bornée à 10 pages de 20 lignes par défaut ; **une liste incomplète ne donne jamais une concordance positive**.
- L'algorithme officiel de signature webhook n'est pas documenté. Les webhooks restent de simples indices non authentifiés.
- Ne pas fusionner V5-C.44 dans les branches partagées avant revue globale et clôture de l'itération.
