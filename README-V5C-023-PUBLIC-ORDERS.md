# V5-C.23 — Commandes publiques atomiques + six rubriques de l'adhésion

## Contenu

1. `scripts/apply-adhesion-six-sections-v5c.py` — correctif **idempotent** appliqué localement aux formulaires existants. Adhérer : **1. Type de démarche, 2. Informations personnelles, 3. Cotisation annuelle, 4. Carte de membre, 5. Mode de paiement, 6. Déclarations et documents**. Le mode renouvellement n'affiche pas les sections 3 et 4 sans utilité tant que le solde n'est pas disponible. La grille commune Soutenir conserve son propre titre et ses quatre moyens de paiement.
2. `supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql` — **migration ADDITIVE, DÉVELOPPEMENT UNIQUEMENT, NON APPLIQUÉE**. Une RPC SQL transactionnelle génère les références et crée le payeur, le don / dossier d'adhésion, le paiement brut et son affectation ; retentatives avec idempotence, verrou, unique et digest. RLS, aucun accès public direct.
3. `backend/pdc-api/src/v5c/tara-public-order-pg-v5c.mjs` — seul client serveur pour invoquer la RPC, sous le rôle **pdc_tara_v5c_writer**, **désactivé par défaut**. Utilise la validation V5-C précédente et retourne un devis privé compatible avec l'orchestrateur de réservation Tara.
4. Deux tests Node et un script SQL de test sous `BEGIN ... ROLLBACK` pour la DEV.

## Périmètre réel

- **Don ponctuel XAF** : montant brut validé sur serveur (100 à 100 000 000 FCFA), répartition vers un ou plusieurs postes totalisant 100 %, paiement `initiated`. Pas de cotisation créditée avant confirmation.
- **Première adhésion individuelle Cameroun** : frais d'adhésion **2 000 FCFA** définis sur serveur, dossier créé **en brouillon** car les statuts et notices officiels sont encore provisoires. Aucune admission n'est accordée. Cotisation annuelle simultanée, renouvellement, couple et diaspora EUR **non couverts**.
- Les modes `mobile`/`tara` conservent le prestataire Tara ; `carte` = Stripe selon l'interface actuelle ; `virement` = virement bancaire. **Aucun lien multi-moyen Tara n'est envoyé au navigateur.** Les liens spécifiques aux canaux ne sont pas encore suffisamment documentés pour une activation sans ambiguïté.
- La somme brute est en base ; aucune réduction au titre des commissions Tara.
- **Aucun endpoint public n'est monté**, ni CAPTCHA/rate-limit, ni code OTP permettant de récupérer un dossier. Les données ne sont donc pas encore saisies en production depuis le site. Aucune clé API dans React.

## Installation (Codespaces, branche feature/v5c)

Téléverser le ZIP à la racine du dépôt, puis :

```bash
cd /workspaces/PDC-v5c
unzip -n PDC_V5C_023_public_orders_six_sections.zip
python3 scripts/apply-adhesion-six-sections-v5c.py
node --test tests/v5c-adhesion-six-sections.test.mjs \
  backend/pdc-api/test/v5c-tara-public-order-pg.test.mjs
npm test --prefix backend/pdc-api
node --test tests/*.test.mjs
npm run build
git diff --check
git status --short
```

Ne pas appliquer SQL, ne pas exécuter `supabase db push`, ne pas activer Tara sur un compte réel. La migration 022 du lot précédent est peut-être encore en attente : examiner son état séparément et ne pas l'appliquer par automatisme. Avant une application manuelle de 023, il faut valider le projet Supabase DEV et faire un audit des droits + tests concurrents ; le script SQL `tests/sql/v5c-public-orders-rollback.sql` est fourni pour cela après installation.

Aucun commit n'est nécessaire tant que les tests n'ont pas été exécutés dans le Codespace. Le dépôt GitHub n'a pas été modifié par ce ZIP.
