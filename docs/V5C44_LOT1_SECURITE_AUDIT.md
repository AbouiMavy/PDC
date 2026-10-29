# V5-C.44 — Lot 1 : authenticité et audit financier sans écriture

## Statut de ce lot

Implémentation **non déployée**, **DEV exclusivement**, sans création ni règlement TaraMoney.
Aucune route HTTP ajoutée ; aucune écriture de confirmation en base ; aucun secret demandé.

### 44.1 — Authentification fournisseur

- Le seul `token` privé placé dans l'URL du webhook PDC prouve au mieux la connaissance de cette URL, **pas la provenance TaraMoney**.
- Aucune spécification fournisseur vérifiée dans le projet ne décrit l'algorithme de signature, le nom du header, le contenu signé, les délais ou l'anti-rejeu.
- `tara-provider-auth-v5c44.mjs` constitue donc un **verrou fermé**. Il refuse systématiquement d'attribuer `authenticated=true` à une notification, même dotée de champs trompeurs.
- La réception V5-C.41 continue de stocker des **indices non fiables**. Ne pas activer de confirmation de paiement ou d'admission à partir de ces indices.
- **À obtenir de TaraMoney** : secret de signature distinct du jeton PDC, algorithme exact, header exact, représentation canonique des octets signés, timestamp/nonce et politique anti-rejeu, exemples de signature vérifiables (test vector), comportement lors des réémissions.

### 44.2 — Rapprochement financier indépendant

- Migration additive `20261029004400_pdc_v5c44_audit_context_dev.sql` : fonction de lecture privée, limitée au rôle PostgreSQL `pdc_tara_v5c_writer`, sans données personnelles.
- `tara-readonly-audit-v5c44.mjs` : lecture de la commande et des méthodes persistées depuis la base, jamais depuis le navigateur.
- Réutilisation de `reconcileTaraProduct()` existant pour le canal **Mobile Money** : statut Tara + liste paginée des transactions + montant/devise XAF + identifiant du produit.
- Refus des contextes inconnus, des montants invalides, des liens non émis, des statuts de paiement non éligibles et des canaux incohérents.
- **Carte, lien général, WhatsApp, Telegram, Dikalo :** `manual_review` en attendant le contrat fournisseur adéquat ; **aucun recours au statut mobile pour une carte**.
- Toute décision `corroborated` signifie uniquement que deux sources de statut sont compatibles ; la réponse contient toujours `paymentConfirmed:false`, `admissionGranted:false`, `settlementAuthorized:false`.
- Panne fournisseur : `manual_review` sans fuite d'exception ou de clé.

## Étapes pour installer (ne pas déployer)

1. Depuis un Codespace sur `main` synchronisée, créer une branche dédiée `feature/v5c44`.
2. Ajouter les quatre fichiers du lot, sans remplacer les fichiers existants.
3. Exécuter `node --test backend/pdc-api/test/v5c44-readonly-security.test.mjs` puis les tests V5-C existants et `npm run build`.
4. **Ne pas exécuter la migration sur Supabase Production**. Avant application au projet DEV, inspecter sa fonction et ses droits, et réaliser une revue.
5. Ne pas déployer l'Edge Function et ne pas faire de transaction TaraMoney lors de cette étape.

## Hors périmètre restant

- Brancher la vérification cryptographique réelle dès réception du contrat écrit de TaraMoney.
- Définir un mécanisme fiable de preuve pour les paiements par carte et par canaux tiers.
- Ajouter le journal d'audit opérationnel persistant, la reprise des incidents, puis la confirmation atomique en V5-C.45.
- Valider la conversion EUR/XAF ; aucun montant EUR n'est admis dans cette première lecture.
