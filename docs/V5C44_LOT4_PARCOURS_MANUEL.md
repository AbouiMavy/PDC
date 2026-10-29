# V5-C.44.4 — Parcours de demande et rapprochement manuel DEV

> **Version complétée par V5-C.44.5** : pour tout contrôle BRUT/FRAIS/NET et toute confirmation, utiliser exclusivement `docs/V5C44_LOT45_BRUT_NET_MANUEL.md` après application de la migration `...04450`. Les exemples ci-dessous décrivent le protocole initial et ne doivent plus servir à une confirmation financière.


## Deux fonctions différentes
1. **Accusé de réception** : une commande DEV validée par l'API retourne un `paymentId` et un montant XAF. Le demandeur peut terminer la navigation via « Terminer et conserver ma référence ». La page finale ne prétend ni que le paiement a été encaissé, ni que l'adhésion est accordée. Aucune information bancaire n'est fournie par cette page.
2. **Rapprochement trésorerie** : une personne habilitée consulte le tableau de bord marchand TaraMoney, compare une opération **individuelle** à la référence PDC, puis consigne sa décision dans une table privée SQL. Si une preuve `PAID` certaine concorde, un opérateur privilégié déclenche ensuite explicitement la confirmation dans **Supabase DEV**. Aucun script ne confirme automatiquement.

## Périmètre
- Les formulaires et modes de paiement existants sont conservés.
- Le module public d'essai demeure verrouillé hors Sandbox : les variables `VITE_PDC_V5C29_*` ne sont pas modifiées.
- L'API TaraMoney et ses webhooks ne sont PAS requis pour la revue humaine.
- Aucune clé Tara n'est stockée ni sollicitée par ce lot.
- Seuls les dossiers déjà persistés et rattachés à un `productId` Tara émis (`issued`) peuvent entrer dans le contrôle SQL. Le virement bancaire requiert un circuit séparé et n'est pas confirmé ici.
- Les paiements ne sont confirmés **que lorsque l'agent déclenche explicitement la seconde RPC**, sous contrôle du SQL Editor privilégié, et uniquement en DEV.
- L'admission au PDC reste distincte : une application en `draft` n'est PAS admise ; textes officiels/consentements et vérifications administratives sont à stabiliser avant activation réelle.

## Installation
1. Installer les fichiers de ce lot sur `feature/v5c44`, contrôler les tests et compiler le frontend. Ne pas activer le checkout public.
2. **Après revue**, ouvrir uniquement le SQL Editor du projet Supabase DEV `rvgpnmznhzwlzqyefahd`, inspecter puis exécuter **UNE SEULE FOIS** la migration `supabase/migrations/20261029004440_pdc_v5c444_manual_review_dev.sql`.
3. Ne pas appliquer la migration en production ni appeler `supabase db push` sans synchroniser l'historique des migrations précédemment appliquées manuellement.

## File d'attente de la trésorerie (lecture seule)
Dans SQL Editor DEV après installation de la migration, lister les 100 commandes les plus anciennes à traiter, sans exposer les coordonnées personnelles :
```sql
SELECT c.product_id,c.amount_xaf,c.currency,c.link_state,
       p.status AS payment_status,o.order_kind,o.created_at,
       COALESCE(last_check.decision,'not_reviewed') AS review_decision
FROM pdc_private.tara_checkout_intents_v5c c
JOIN pdc_private.payment_attempts p ON p.id=c.payment_id
JOIN pdc_private.public_checkout_orders_v5c o ON o.payment_id=p.id
LEFT JOIN LATERAL (
 SELECT m.decision FROM pdc_private.tara_manual_reviews_v5c44 m
 WHERE m.product_id=c.product_id ORDER BY m.checked_at DESC,m.id DESC LIMIT 1
) last_check ON true
WHERE p.status IN ('initiated','pending') AND c.link_state='issued'
ORDER BY o.created_at,c.product_id
LIMIT 100;
```
Cette liste **ne prouve aucun règlement** : l'opérateur doit chercher individuellement les transactions correspondantes dans TaraMoney.

## Étape opérateur 0 : identifier une demande
Dans SQL Editor DEV :
```sql
SELECT c.product_id, c.payment_id, c.amount_xaf, c.currency,
       c.link_state, p.status AS pdc_payment_status,
       o.order_kind
FROM pdc_private.tara_checkout_intents_v5c c
JOIN pdc_private.payment_attempts p ON p.id=c.payment_id
JOIN pdc_private.public_checkout_orders_v5c o ON o.payment_id=p.id
WHERE c.product_id = 'REMPLACER_PAR_PRODUCT_ID';
```
Comparer manuellement avec le **détail d'une transaction individuelle** dans l'interface marchande TaraMoney : même référence associée au paiement, même montant brut, même devise, statut final payé. Les listes de **collectes agrégées** ne sont pas des preuves individuelles. Consigner une référence de pièce vérifiable par l'équipe de trésorerie. Aucune référence de carte, donnée personnelle ou capture non expurgée dans le dépôt Git.

## Étape opérateur 1 : inscrire la vérification humaine (sans confirmer)
Exemple de **structure** SQL : remplacer impérativement les valeurs par une véritable opération observée. Ne pas exécuter un exemple de paiement fictif !
```sql
BEGIN;
SELECT * FROM pdc_private.tara_v5c44_record_manual_review_dev(
  'REMPLACER_PAR_PRODUCT_ID',
  'OPERATEUR_TRESORERIE',
  'PREUVE_MARCHANDE_2026_10_29_01',
  'REMPLACER_PAR_REFERENCE_TRANSACTION_TARA',
  true,  -- a-t-on effectivement vérifié le rapprochement des références ?
  'PAID', -- uniquement si le tableau de bord affiche réellement un paiement final
  500,    -- montant réel OBSERVÉ ; jamais présumé
  'XAF'
);
COMMIT;
```
La première RPC renvoie `review_id`, `decision`, `expected_amount_xaf`. Une erreur ou un écart donne `disputed` / `awaiting_payment` : **ne pas passer à l'étape 2**.

## Étape opérateur 2 : confirmation humaine explicite dans DEV
Uniquement après relecture de l'opération et conservation de la pièce commerciale, pour une décision `matched_for_operator_confirmation` :
```sql
BEGIN;
SELECT * FROM pdc_private.tara_v5c44_confirm_manual_payment_dev(
  'REMPLACER_PAR_REVIEW_ID'::uuid,
  'JE_CONFIRME_APRES_CONTROLE_TARAMONEY'
);
COMMIT;
```
Cette étape, si elle réussit, change `payment_attempts.status` en `confirmed`, conserve l'identifiant fournisseur, ajoute un événement `manual_dashboard_confirmation_dev` et une entrée à `audit_log` dans **la même transaction**. Elle n'admet PAS le membre, ne délivre PAS de carte, n'envoie PAS de reçu définitif et ne modifie pas la base Production. En cas de doute : ne pas appeler cette fonction ; laisser le dossier en attente.

## Limites de sécurité avant production
- Identifier les opérateurs avec une authentification et des rôles vérifiables (`national_treasury`) et prévoir idéalement double validation avant toute confirmation réelle ; le `operator_label` DEV est déclaratif.
- Prévoir un circuit de correction des erreurs humaines / annulations / remboursements et un traitement des virements.
- Prévoir un point de suivi authentifié pour le demandeur, au lieu de déduire un paiement de l'état de navigation React (falsifiable).
- Remplacer les documents statutaires et notices provisoires avant collecte d'adhésions réelles.
- Les paiements issus d'une clé de PRODUCTION temporaire ne doivent pas être confirmés dans DEV sans référence métier identique et preuve individuelle.
