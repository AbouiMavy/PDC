# V5-C — TaraMoney, adaptateur serveur et rapprochement corroboré (DEV)

**Lot cumulatif sur `feature/v5c`**, sans PR intermédiaire, sans installation du SDK React, sans webhook public, sans migration SQL, sans écriture en base et sans paiement réel.

## Fichiers

- `tara-server-client-v5c.mjs` : POST Tara `/paymentlinks`, `/transactions/status`, `/transactionlist`, contrôle des réponses, verrou réseau opt-in sandbox.
- `tara-checkout-v5c.mjs` : préparation d'une requête Tara issue exclusivement du devis privé *brandé* de C1 ; les prix navigateur sont refusés par `contracts.mjs`.
- `tara-webhook-v5c.mjs` : lecture et normalisation d'un webhook NON authentifié (aucune confiance sur `SUCCESS`).
- `tara-reconciliation-v5c.mjs` : rapprochement `productId == transactionId` (réponse écrite Tara), double contrôle serveur `SUCCESS` et `PAID`, XAF, montant exact, prévention de doublons, recherche paginée bornée.
- Tests Node autonomes : mocks sans accès réseau ni secret.

## Points du contrat Tara confirmés par l'utilisateur

1. Génération de lien : `POST https://www.dklo.co/api/tara/paymentlinks` ; `apiKey`, `businessId`, `productId` **obligatoire**, `productName`, `productPrice`, `productDescription`, `returnUrl`, `webHookUrl`; réponse `generalLink`, éventuellement `cardLink`.
2. Webhook de collecte / carte : `businessId`, `paymentId` (ID du paiement Tara), `productId` (référence PDC), `amount`, `collectionId`, `status=SUCCESS`, dates ; `phoneNumber` facultatif.
3. Statut mobile : `POST https://www.dklo.co/api/tara/transactions/status` ; entrée `apiKey,businessId,productId` ; sortie `productId,status,message`.
4. Liste générale : `POST https://www.dklo.co/api/tara/transactionlist` ; entrée `apiKey,businessId,start,size` ; sortie exemple `{transactionId,amount,currency,status,paidAt}`.
5. Tara a répondu explicitement : **`transactionId` correspond au `productId` fourni par notre système**. Cette correspondance doit être confirmée sur un jeu de données de test réel et jamais extrapolée au `paymentId`.
6. Statuts différents : `SUCCESS` (statut mobile/webhook) et `PAID` (liste). Deux confirmations indépendantes et montant/devise cohérents sont requis avant une décision `corroborated`. L'appel doit préciser `paymentChannel='mobile'` : toute carte demeure en revue manuelle.

## Limites conservatrices

- **Aucun paiement EUR via l'API de liens** pour le moment : l'exemple fourni ne précise pas de champ devise. Couple 40 EUR et autres opérations EUR restent désactivés tant que Tara n'a pas clarifié la prise en charge et le format des montants.
- Pas de liaison automatique au SDK React : le modèle documenté est une API **serveur**. Aucun `apiKey`/`businessId` dans le bundle public. Nous pourrons évaluer le SDK plus tard.
- La liste `paid/transactionlist` n'est **pas appelée**, car sa méthode et les paramètres précis n'étaient pas documentés. La liste générale POST suffit pour les premiers tests.
- Pour les cartes, le statut `/transactions/status` est documenté « Mobile ». Aucune présomption qu'il vérifie les cartes. Elles restent en revue manuelle jusqu'à confirmation du contrat carte.
- Le webhook ne présente **aucune signature** dans la documentation reçue. C'est un déclencheur de vérification et non une preuve, quelle que soit l'URL HTTPS ou un token privé optionnel.
- La sortie `corroborated` est **un résultat de vérification**, pas une écriture SQL ni une activation de l'adhésion. Ne pas la convertir en `payment_attempts.confirmed` sans transaction SQL atomique, référence persistée, rôle DB dédié, et invariants métier.
- Identifiants provisoires Tara et environnement sandbox doivent être confirmés par le marchand. **Ne pas appeler la vraie API avant cette confirmation**. `makeTaraServerClient()` est désactivé tant que `environment='sandbox'` et `allowNetwork=true` ne sont pas explicitement passés. Ne pas copier les clés ici, dans un patch, dans Git ou dans des logs.
- Aucun secret ni numéro de téléphone envoyé aux logs ; erreurs fournisseur volontairement génériques.

## Tester et conserver sur la même branche

```bash
cd /workspaces/PDC-v5c
node --test backend/pdc-api/test/v5c-tara-integration.test.mjs
node --test backend/pdc-api/test/v5c-core.test.mjs tests/v5c-boundaries.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
node scripts/check-v5b-release-candidate.mjs
git diff --check
```

Aucun `supabase db push`, aucune route publique, aucun live checkout. Conserver la branche `feature/v5c` pour le lot C1–C6 complet.
