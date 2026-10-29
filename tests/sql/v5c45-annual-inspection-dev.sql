-- Lecture seule / SQL Editor DEV après revue et application de 04510.
-- Aucun appel au fournisseur ni modification de statut.
SELECT to_regprocedure('pdc_private.tara_v5c_create_public_order(jsonb)') IS NOT NULL
  AS annual_public_order_present,
  to_regprocedure('pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)') IS NOT NULL
  AS annual_intent_present,
  to_regprocedure('pdc_private.tara_v5c44_confirm_manual_payment_dev(uuid,text)') IS NOT NULL
  AS manual_confirmation_present,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='pdc_private' AND table_name='public_checkout_orders_v5c'
      AND column_name='annual_paid_xaf') AS annual_paid_column_present;
SELECT o.order_kind, o.gross_amount_xaf, o.annual_paid_xaf,
  COUNT(a.id) AS allocations_count, COALESCE(SUM(a.amount_minor),0) AS allocations_total,
  (COALESCE(SUM(a.amount_minor),0)=o.gross_amount_xaf) AS allocation_matches
FROM pdc_private.public_checkout_orders_v5c o
LEFT JOIN pdc_private.payment_allocations a ON a.payment_id=o.payment_id
GROUP BY o.id,o.order_kind,o.gross_amount_xaf,o.annual_paid_xaf
ORDER BY MAX(o.created_at) DESC LIMIT 20;
