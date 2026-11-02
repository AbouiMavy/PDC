# PDC V5-C.26 — Liens de paiement Tara par canal

## Correction du contrat fournisseur

Le `POST /api/tara/paymentlinks` renvoie les champs nommés par l'utilisateur :

- `smsLink` → choix `mobile` (MTN/Orange),
- `whatsappLink` → choix `tara`, canal WhatsApp,
- `telegramLink` → choix `tara`, canal Telegram,
- `dikaloLink` → choix `tara`, canal Dikalo,
- `cardLink` → choix `carte` (TaraMoney),
- `generalLink` → **non utilisé pour remplacer un canal spécifique absent**.

Cette correction traite la réponse fournisseur **et** la sélection du lien. Elle ne monte pas encore de nouvelle route HTTP émettant les liens : le lot 025 réserve les commandes en DB et ne crée pas encore le paiement réel. L'émission opérationnelle devra persister le lien du canal sélectionné avec son `productId` avant d'autoriser le retry HTTP, sans réémettre une collecte après timeout.

## Modifications

- `tara-server-client-v5c.mjs` : conserve les champs supplémentaires vérifiés ; ne multiplie pas les méthodes d'authentification du service en copiant les trois en-têtes du Google Apps Script (API privée côté serveur uniquement).
- `tara-channel-links-v5c.mjs` : choisit le champ exact, interdit le repli silencieux et les protocoles de liens dangereux.
- `tara-public-checkout-coordinator-v5c.mjs` : les cartes Tara sont désormais réservées chez Tara ; virement toujours hors Tara.
- `20261028002300_pdc_v5c_public_order_atomic_dev.sql` : `provider='tara'` pour la carte, `bank_transfer` pour le virement ; support Dikalo. **La migration 023 doit être non appliquée**. Si déjà appliquée, NE PAS exécuter ce patch SQL comme une mise à jour : une migration additive corrective devra être rédigée.
- `PaymentMethods.jsx` : Dikalo ajouté aux sous-canaux, en commun pour Adhérer et Soutenir ; les textes FR/EN n'annoncent plus Stripe par défaut pour la carte.
- Tests : vérification de 5 choix de canaux, de 6 champs, des liens absents, des URL malveillantes et de l’absence de substitution.

La liste de domaines autorisés pour les liens de partage est volontairement restrictive. Si les véritables liens renvoyés par Tara utilisent d'autres domaines ou un schéma d'application non couvert, **ne pas ouvrir la validation à tous les domaines** : vérifier un exemple réel anonymisé et adapter explicitement l'autorisation.

## Installation sur `feature/v5c`

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_026_liens_par_canal.zip
python3 scripts/patch-v5c-026-tara-channels.py
node --test backend/pdc-api/test/v5c-tara-channel-links.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

Ne pas exécuter `supabase db push` et ne pas appeler la vraie API Tara pour tester ce lot : les tests fournissent des réponses simulées. Pas de données privées ou clés réelles dans Git.
