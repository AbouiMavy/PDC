# V5-C.44.4–44.5 — Fin du parcours et rapprochement manuel BRUT / FRAIS / NET

**Périmètre : développement, `feature/v5c44`, Supabase DEV `rvgpnmznhzwlzqyefahd`.**

## Décision

- **Dons / première adhésion Cameroun simple (2 000 XAF)**, dans les limites du checkout déjà implanté : préparation du dossier et du lien TaraMoney, puis **page PDC d'accusé de réception** portant la référence de paiement PDC et, si le lien est émis, le `productId` de rapprochement.
- Le payeur conserve le **reçu TaraMoney du montant brut**. TaraMoney peut notifier au marchand le **montant net**, consultable au tableau de bord. Le PDC ne réémet **pas** le reçu financier de TaraMoney.
- La trésorerie rapproche **une opération individuelle du dashboard marchand**, non un agrégat de collecte ou le seul e-mail de notification. Elle saisit le **montant brut**, le **montant net**, les **frais** et la référence de transaction. Aucun barème n'est figé dans le logiciel : l'opérateur applique le tarif Tara connu.
- **Même transaction économique** : brut = net + frais (en XAF). Pour le don de 500 XAF illustré par les captures transmises, le cas arithmétique est 500 = 424 + 76 ; **cet exemple n'autorise pas à confirmer un paiement sans vérification individuelle**.
- La phase de saisie est **sans effet financier** ; la phase de confirmation est une action SQL explicite et traçable, exécutée manuellement par un opérateur privilégié dans Supabase **DEV seulement**. Aucun rôle web, `anon`, `authenticated`, `service_role` ou writer checkout n'y a accès. La procédure n'admet pas le militant et n'envoie aucun e-mail.
- Ne pas utiliser la **clé TaraMoney de production** dans les scripts Sandbox (`provider-read`, émission de liens) ; aucune clé n'est requise pour le rapprochement manuel.

## Préparation

1. Installer le paquet R2 sur `feature/v5c44`, faire passer les tests Node et `npm run build`, vérifier le commit. **L'installateur ne lance aucune migration, ne contacte pas Tara et ne confirme rien.**
2. Dans le SQL Editor du **projet DEV seulement**, après relecture, exécuter dans cet ordre, **une fois chacun** :
   - `supabase/migrations/20261029004440_pdc_v5c444_manual_review_dev.sql`
   - `supabase/migrations/20261029004450_pdc_v5c445_manual_gross_net_dev.sql`
   Si la 04440 a déjà été exécutée, ne réexécuter que 04450 après vérification de l'historique.
3. Ne pas lancer `supabase db push` vers une base dont l'historique a été partiellement appliqué manuellement ; ne jamais appliquer ces deux migrations à la production.

## A. File d'attente privée des opérations

```sql
SELECT c.product_id AS ref_rapprochement, p.id AS ref_paiement_pdc,
       c.amount_xaf AS montant_brut_attendu, c.currency,
       p.status AS statut_pdc, o.order_kind, o.created_at,
       COALESCE(last_review.decision,'not_reviewed') AS derniere_decision
FROM pdc_private.tara_checkout_intents_v5c c
JOIN pdc_private.payment_attempts p ON p.id = c.payment_id
JOIN pdc_private.public_checkout_orders_v5c o ON o.payment_id = p.id
LEFT JOIN LATERAL (
  SELECT r.decision FROM pdc_private.tara_manual_reviews_v5c44 r
  WHERE r.product_id=c.product_id
  ORDER BY r.checked_at DESC, r.id DESC LIMIT 1
) last_review ON true
WHERE c.link_state='issued' AND p.status IN ('initiated','pending')
ORDER BY o.created_at LIMIT 100;
```

**Ne pas rapprocher par montant seul.** Vérifier le `productId`, la référence fournisseur, la date, le canal, le statut final et les montants. Plusieurs dons de même valeur peuvent coexister.

## B. Saisie d'une preuve marchande, sans confirmation

Le code suivant est un **gabarit**, pas un jeu de valeurs à exécuter. Remplacer tous les marqueurs avec une transaction réellement visualisée dans le dashboard marchand. La date marchande doit comporter un fuseau horaire : `2026-10-29T14:58:45-03:00` est un *exemple de format*, et non une preuve de transaction.

```sql
BEGIN;
SELECT * FROM pdc_private.tara_v5c44_record_settlement_dev(
  'REMPLACER_PRODUCT_ID_PDC',
  'OPERATEUR_TRESORERIE',
  'REFERENCE_INTERNE_DE_LA_PREUVE',
  'REMPLACER_TRANSACTION_ID_TARA',
  true, -- seulement après comparaison EFFECTIVE des références
  500,  -- brut lu sur le reçu/détail marchand, XAF
  424,  -- net lu sur la fiche marchande, XAF
   76,  -- frais déduits du tarif réel / du détail marchand, XAF
  'Bareme Tara et ligne de paiement verifies',
  '2026-10-29T14:58:45-03:00'::timestamptz
);
COMMIT;
```

La fonction retourne `review_id` et `decision`. Un avis `disputed` indique un écart. **Ne pas confirmer** si les références ne coïncident pas, si le statut n'est pas final, si l'extrait n'est pas une transaction individuelle ou si le net/les frais ne sont pas justifiés. L'ancien enregistrement 04440 sans net/frais **ne suffit plus** pour confirmer après 04450.

## C. Confirmation explicite DEV, après contrôle humain

Cette action **écrit réellement** un `payment_attempts.status='confirmed'` dans **Supabase DEV**. Ne l'exécuter que sur une **transaction de test autorisée**, après identification certaine de la pièce et vérification humaine. La clé de production temporaire ne justifie **pas** d'enregistrer un paiement réel dans DEV. Elle ne doit pas être lancée comme « test automatique ».

```sql
BEGIN;
SELECT * FROM pdc_private.tara_v5c44_confirm_manual_payment_dev(
  'REMPLACER_REVIEW_ID'::uuid,
  'JE_CONFIRME_APRES_CONTROLE_TARAMONEY'
);
COMMIT;
```

Vérifications transactionnelles : contexte PDC/Tara, unicité de la transaction fournisseur, montant brut égal à la commande, somme net + frais = brut, allocation unique valide, `PAID` et présence d'une preuve issue du dashboard. Le compte rendu d'audit inclut les trois montants.

### D. Contrôle a posteriori en lecture seule

```sql
SELECT r.product_id, r.decision, r.observed_amount_xaf AS brut_xaf,
       r.observed_fee_xaf AS frais_xaf,
       r.observed_net_xaf AS net_xaf, r.evidence_origin,
       r.finalized_at, p.status AS statut_pdc, p.confirmed_at
FROM pdc_private.tara_manual_reviews_v5c44 r
JOIN pdc_private.payment_attempts p ON p.id=r.payment_id
WHERE r.id='REMPLACER_REVIEW_ID'::uuid;
```

## Limitations à traiter avant mise en production

- **Habilitations et traçabilité** : ici `operator_label` est déclaratif, et la confirmation utilise un compte SQL Editor privilégié ; il manque un service opérateur avec JWT vérifié, rôle `national_treasury`, autorisations minimales et journalisation d'identité forte, idéalement double validation.
- **Réconciliation automatique** : conserver les travaux 44.1–44.3 et résoudre, avec Tara, la divergence entre `transactionlist` (collectes) et les transactions individuelles, ainsi que l'API statut mobile et la signature des webhooks. Ne jamais traiter une réponse `ERROR` comme `PAID`.
- **Reste du parcours** : renouvellement, adhésions diaspora/couple, carte et cotisation simultanée hors périmètre déjà supporté ; virement hors Tara non couvert par cette procédure ; pièces légales/consentements d'adhésion provisoires.
- **Retour navigateur** : l'accusé PDC est un état d'interface transmis après création de commande, **pas** une consultation de statut certifiée par serveur. En cas de fermeture d'onglet, la référence doit être conservée par le demandeur ; un point d'accès authentifié au dossier reste à construire.
- **Comptabilité** : la présente migration journalise net et frais, mais ne crée aucune écriture comptable autonome de frais ni un journal de décaissement. Un relevé de liquidation bancaire n'est pas présumé par un paiement `PAID`.
