# PDC — V5-C.24 : liaison dossier/obligation + entrée publique protégée (DEV)

**Branche** : `feature/v5c`. Lot incrémental sur V5-C.23. **Pas de mise en production, aucun webhook actif et aucune modification directe de Supabase.**

## Diagnostic et correctif

La migration 023 créait un dossier `membership_applications`, mais n'inscrivait **pas son UUID** dans `dues_obligations.application_id`. Or, l'admission ultérieure parcourt ce lien. Le script idempotent `scripts/patch-v5c-023-linkage.py` répare la migration 023 **tant qu'elle n'a pas été appliquée** et renforce le script `tests/sql/v5c-public-orders-rollback.sql` pour contrôler cette relation.

**Si la migration 023 a déjà été appliquée dans Supabase : NE PAS utiliser cette édition de migration comme réparation de la base.** Il faut un nouveau correctif SQL, audité et distinct, après vérification de l'état réel des données.

## Entrée HTTP publique de préparation (non montée)

`backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs` expose, si et seulement si elle est montée explicitement avec `enabled:true` et `environment:'sandbox'`, `POST /v1/public/orders`.

- Aucune session de militant nécessaire.
- CORS limité aux origines exactes autorisées, `POST` uniquement, JSON borné à 12 ko.
- Exige deux dépendances serveur réelles et vérifiables : `enforceRateLimit` et `verifyHuman` (preuve anti-bot), puis appelle `repository.create` du lot 023. Les tests utilisent des mocks ; **aucun fournisseur anti-robots réel n'est configuré**.
- Accepte `{ "verificationToken": "...", "order": { ... } }` ; le jeton de vérification ne passe pas dans `repository.create`.
- Retourne `status: "pending_payment_setup"`, montant brut XAF, référence opaque et drapeaux de paiement non confirmé. **Aucun lien TaraMoney n'est émis** et aucun moyen de paiement n'est forcé sur la page générale multi-moyens.
- Le service d'administration V5-B en lecture seule reste inchangé.

### Installer dans Codespaces

Déposer `PDC_V5C_024_public_order_http_linkage.zip` à la racine du repo, puis :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_024_public_order_http_linkage.zip
python3 scripts/patch-v5c-023-linkage.py
node --test backend/pdc-api/test/v5c-tara-public-order-http.test.mjs tests/v5c-public-order-linkage.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

**Ne pas lancer `supabase db push`, ne pas exécuter SQL Editor sur le projet réel et ne pas monter le nouveau serveur HTTP à ce stade.** Le test SQL ROLLBACK du lot 023 nécessitera une base DEV vérifiée *après* accord explicite de déploiement SQL.

## Limites

- Ce module ne fait qu'autoriser la création **préparatoire** des commandes dans le futur, pas encaisser.
- Le don ponctuel XAF et la première adhésion individuelle CM sont dans le périmètre du lot 023. Cotisations simultanées, dons EUR, couple diaspora restent hors périmètre.
- Il reste à implémenter un anti-bot réel, une limite de débit durable interinstances, le système de récupération de commande par capacité temporaire et la vérification du prestataire. Les liens par canal Tara doivent être documentés avant ouverture publique.
- Les frais du prestataire sont supportés par le PDC et devront être rapprochés séparément du brut.
