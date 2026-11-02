# V5-C — Commandes publiques, première brique (préparation seulement)

Ce lot implémente **la validation pure côté serveur** du formulaire d'une nouvelle contribution, sans compte militant, pour deux cas :

- Don ponctuel en XAF, montant brut libre mais contrôlé, répartitions en points de base totalisant 100 % ; la déclaration du donateur est exigée.
- Première adhésion **individuelle au Cameroun**, frais initiaux de 2 000 XAF fixés par le serveur, sans cotisation annuelle simultanée ni demande de carte. Les barèmes diaspora et le couple 40 EUR restent strictement hors de ce périmètre.

Le `requestDigest` SHA-256 sert à comparer un nouveau dépôt avec la demande initiale lorsque le backend créera les écritures atomiques. **Ce digest n'authentifie pas le visiteur** et ne remplace pas une preuve anti-abus.

## Ce que le lot ne fait pas

**Il ne crée encore aucune personne, aucun paiement ni aucun dossier dans Supabase. Il ne crée ni n'ouvre de lien TaraMoney.** Il ne monte aucune route et ne contient aucun secret. La protection contre le spam, l'attestation légale du donateur, les documents officiels d'adhésion et les questions d'autorisation restent à traiter avant activation.

## Suite technique nécessaire

1. Ajouter une RPC PostgreSQL privée, transactionnelle et idempotente, accessible au seul rôle technique, qui crée `people`, `donations` ou `membership_applications`/`dues_obligations`, `payment_attempts` et `payment_allocations` en enregistrant **le montant brut** ; comparer le digest avant toute création répétée.
2. Mettre une route publique isolée, avec protection anti-abus et limites de débit, **sans login obligatoire**. Vérifier l'accès ultérieur au dossier par jeton temporaire non devinable, sans pouvoir reconstituer un compte avec le seul numéro de commande.
3. Réutiliser `makeTaraDevService.initiate` : réservation `productId` avant POST Tara, idempotence et état inconnu sans répétition automatique.
4. **Respecter le canal choisi.** Les liens `generalLink` de Tara montrent plusieurs moyens de paiement et ne garantissent pas le routage `mobile` ou `messagerie`. Attendre la validation de la sémantique des liens spécifiques avant tout branchement de boutons publics.
5. Confirmer le règlement par une source fiable, puis créditer la contribution brute. Conserver la commission et le montant net quand les données de chaque transaction sont vérifiées.
6. Étendre le parcours aux cotisations annuelles simultanées, aux dons hors CM, à la diaspora en EUR et au couple 40 EUR sans interpréter leurs montants comme des FCFA.

## Installation

Extraire à la racine du dépôt `/workspaces/PDC-v5c`, puis :

```bash
node --test backend/pdc-api/test/v5c-tara-public-order-preparation.test.mjs
npm test --prefix backend/pdc-api
npm run build
git status --short
```

Conserver `feature/v5c`. Aucune migration ni appel au prestataire dans ce lot. Ne pas activer l'acceptation des contributions réelles avant mise en place et audit des couches manquantes.
