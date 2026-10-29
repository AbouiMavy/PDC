# PDC V5-C — Lot III, préparation de la persistance TaraMoney (DEV)

**Lot cumulatif sur `feature/v5c`.** Aucun déploiement, aucune nouvelle route publique, aucun appel réseau réel, aucune donnée nominative et aucun paiement activé. Ce correctif est **une préparation testable** et non un parcours de paiement complet.

## Trois ajouts

1. Migration additive `supabase/migrations/20261027002000_pdc_v5c_tara_preconciliation_dev.sql` :
   - `tara_checkout_intents_v5c` : `productId` PDC unique, `payment_id` interne, devis XAF, idempotence, états du lien et protection des transitions. Le trigger vérifie le paiement associé dans `payment_attempts`.
   - `tara_webhook_inbox_v5c` : messages non authentifiés et dédupliqués, sans téléphone ni données politiques ; `SUCCESS` ne confirme rien.
   - `tara_reconciliation_evidence_v5c` : résultat de corroboration exclusivement auxiliaire ; **n'écrit pas** `payment_attempts.confirmed`, `payment_events.verified_at`, allocations, adhésions ou cartes.
   - Tables en RLS sans politique, sans GRANT à `anon`, `authenticated`, `service_role` ni aux API nationales. Aucun accès runtime n'est provisionné à ce stade.
2. `tara-dev-service-v5c.mjs` : orchestre un devis issu du serveur, réserve la référence `productId` **avant** l'appel Tara, interdit un deuxième envoi ambigu, normalise les webhooks et propose un rapprochement mobile non comptabilisé.
3. `tara-dev-pg-repository-v5c.mjs` : SQL paramétré et rôle dédié `pdc_tara_v5c_writer` obligatoire. Ce rôle n'est **pas créé ni autorisé** par la migration ; le raccordement sera activé seulement après approbation du périmètre DB, des GRANT minimaux et de l'environnement Tara sandbox.

## Invariants financiers

- Le rapprochement repose sur la correspondance écrite Tara `transactionId = productId`, **sans** confondre `paymentId` du webhook.
- `productPrice` semble être exprimé en XAF sur la page de paiement montrée par l'utilisateur ; **la documentation API ne spécifie toujours pas de champ devise**. L'intégration est donc limitée à XAF.
- Les **40 EUR du couple diaspora** restent exactement 4 000 centimes EUR et deux bénéficiaires sur un seul paiement. Aucune conversion implicite (et surtout aucune interprétation de « 40 » comme « 40 FCFA »).
- L'API mobile et la liste des transactions doivent corroborer le statut ; les paiements carte restent en revue humaine tant que l'API de statut carte n'est pas documentée.
- Les événements non signés ne créent pas de droits. Les transactions ne sont ni créditées ni confirmées par ce lot.
- En cas de délai d'attente du prestataire après la tentative de création, la commande passe en `unknown` et **aucun nouvel appel n'est émis automatiquement** : risque de lien créé avant l'erreur.

## État et limites

- **Pas d'application automatique de la migration** : ne pas lancer `supabase db push`, ni SQL Editor sur une base active. Revue du projet DEV nécessaire.
- Le service `makeTaraDevService` est désactivé par défaut. Le vrai client Tara du lot II exige lui aussi `sandbox` et `allowNetwork=true`.
- Le dépôt SQL refuse tout autre rôle que `pdc_tara_v5c_writer`, qui est réservé à une étape de provisioning et d'audit ultérieure. Le backend de lecture V5-B reste inchangé.
- Aucun webhook HTTP exposé, aucun endpoint checkout, aucun SDK React, aucune modification du build Vite.
- Il faudra un contrôle de bout en bout du `transactionId/productId`, des garanties sur le montant réel des paiements carte, le taux de change et le contexte sandbox, et une transaction de confirmation auditée avant activation.

## Vérifications

```bash
cd /workspaces/PDC-v5c
node --test backend/pdc-api/test/v5c-tara-dev-persistence.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
node scripts/check-v5b-release-candidate.mjs
```

**Aucune PR intermédiaire.** Les commits de sauvegarde restent sur `feature/v5c`.
