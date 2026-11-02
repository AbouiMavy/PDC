# PDC — V5-C.25 : commande publique → réservation Tara, par canal (DEV)

## Objectif et limite vérifiable

La création de commande V5-C.23 est désormais enchaînée à la **réservation de la référence produit Tara** par la passerelle SQL V5-C.21, **sans obligation de compte militant** et sans émettre automatiquement un lien généraliste.

- `backend/pdc-api/src/v5c/tara-public-checkout-coordinator-v5c.mjs` : compose `makePublicOrderPgV5C({pool})` et `makeTaraDevPgRepository({pool})`, en validant le montant XAF brut, le devis privé marqué comme fiable côté serveur, l'identité du paiement, le choix du canal et la réservation idempotente.
- `scripts/patch-v5c-024-checkout-status.py` : adapte exclusivement `tara-public-order-http-v5c.mjs` pour afficher `reserved_channel_pending`, `pending_external_payment` ou `manual_review`. N'envoie **aucune URL Tara** au navigateur.
- `scripts/patch-v5c-023-rollback-reservation.py` : enrichit le SQL de rollback du lot 023/024 pour vérifier un don, une première adhésion, deux réservations Tara et la reprise idempotente ; ne se connecte jamais à Supabase.
- `backend/pdc-api/test/v5c-tara-public-checkout-coordinator.test.mjs` : tests Node avec mocks, sans connexion, sans argent réel.

### Règles métier appliquées

| Choix formulaire | Paiement créé dans la SQL 023 | Action V5-C.25 | Lien émis ? |
|---|---|---|---|
| Mobile Money | `provider='tara'` | Réservation Tara privée | Non |
| Tara WhatsApp / Telegram | `provider='tara'` | Réservation Tara privée, canal vérifié | Non |
| Carte / portefeuilles | `provider='stripe'` | Aucune réservation Tara | Non |
| Virement | `provider='bank_transfer'` | Aucune réservation Tara | Non |

**Raison du blocage volontaire du lien** : le `generalLink` confirmé lors du test précédent ouvre une **page affichant plusieurs moyens de paiement**. Il ne respecte donc pas la distinction de canal demandée. Il est incorrect de prétendre qu'il existe déjà une URL/API Tara dédiée à MTN, Orange Money, WhatsApp ou Telegram sans documentation du prestataire. Le futur routeur fournisseur ne sera activé qu'avec des contrats vérifiés.

**Idempotence** : les écritures SQL 023 et 021 sont deux transactions séparées. Une panne après la première laisse une commande valide sans réservation ; le même `idempotencyKey` permet de reprendre la réservation sans recréer la contribution. Aucun `createPaymentLink` n'est appelé ni relancé à cette étape.

**Comptabilité** : `grossAmountXaf` est la contribution brute ; aucune commission n'est ajoutée au paiement du contributeur. Les frais et le net nécessitent une preuve côté fournisseur. Aucune confirmation d'encaissement ou admission automatique n'est faite.

## Installer sur `feature/v5c`

Téléversez le ZIP à la racine de `/workspaces/PDC-v5c` puis :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_025_reservation_publique.zip
python3 scripts/patch-v5c-024-checkout-status.py
python3 scripts/patch-v5c-023-rollback-reservation.py
node --test backend/pdc-api/test/v5c-tara-public-checkout-coordinator.test.mjs \
            backend/pdc-api/test/v5c-tara-public-order-http.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

Attention : le script de rollback **nécessite le correctif 024** déjà appliqué. Il échoue sans modifier le fichier si sa structure est inattendue. L'archive contient du code et des scripts, pas une migration exécutable automatiquement. **Ne pas lancer `supabase db push`.** Le script SQL ne doit pas être exécuté sur une base active ou sans validation du périmètre de développement.

## Points bloquants pour le paiement opérationnel

1. Contrôler sur un projet PostgreSQL DEV isolé que les migrations 021 à 023 sont compatibles et passer le test SQL de rollback. Ne pas supposer que les tests Node simulent PostgreSQL.
2. Provisionner le rôle technique SQL limité à ses fonctions, avec authentification TLS et secrets serveur (actuellement `PASSWORD NULL`) ; ne jamais utiliser `service_role` ou un compte administrateur à la place.
3. Raccorder une vérification anti-robots et une limitation de débit réelles. Les callbacks de la route HTTP 024 sont injectés et uniquement simulés dans les tests.
4. Obtenir les URL / endpoints de **paiement dédié par canal** auprès de TaraMoney (et le parcours Stripe). Ne pas utiliser `generalLink` pour forcer la page multi-options.
5. Préparer les obligations et cotisations simultanées / couple EUR, l'admission sur consentement documenté et la confirmation de paiement, sans crédits automatiques sur un webhook non signé.

Aucun déploiement, aucune modification du serveur d'administration V5-B, aucune PR automatique.
