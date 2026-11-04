-- V5C44-T2 / DEV ONLY / REVIEW ONLY - DO NOT EXECUTE
-- Replacement candidate for 05000; not an additional migration.
-- Requires privileged owner with access to pdc_private and underlying INVOKER functions.
-- No historical row deletion. Financial writes occur only on explicit operator calls.
BEGIN;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_authorized_dev(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_actor IS NOT NULL AND EXISTS (
  SELECT 1 FROM pdc_private.role_assignments ra
  WHERE ra.auth_user_id=p_actor AND ra.role_code='national_treasury'
    AND ra.scope_territory_id IS NULL
    AND ra.valid_from<=pg_catalog.now()
    AND (ra.valid_until IS NULL OR ra.valid_until>pg_catalog.now())
 );
$$;

-- This guard deliberately rejects ambiguous historical records and diaspora orders.
CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_is_domestic_dev(p_product text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
   SELECT 1 FROM pdc_private.tara_checkout_intents_v5c i
   JOIN pdc_private.payment_attempts p ON p.id=i.payment_id
   WHERE i.product_id=p_product AND i.link_state='issued'
     AND p.provider='tara' AND p.currency='XAF' AND p.amount_minor=i.amount_xaf
     AND NOT EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_orders r WHERE r.payment_id=p.id)
     AND EXISTS (
       SELECT 1 FROM pdc_private.payment_allocations a
       LEFT JOIN pdc_private.donations d ON d.id=a.donation_id
       LEFT JOIN pdc_private.dues_obligations o ON o.id=a.obligation_id
       WHERE a.payment_id=p.id AND a.amount_minor>0
         AND ((d.id IS NOT NULL AND a.obligation_id IS NULL)
           OR (o.id IS NOT NULL AND a.donation_id IS NULL))
     )
 );
$$;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_record_dev(
 p_actor uuid,p_product_id text,p_evidence_reference text,
 p_tara_transaction_id text,p_reference_matches boolean,
 p_observed_gross_xaf bigint,p_observed_net_xaf bigint,
 p_fees_calculation_note text,p_merchant_payment_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_review record; v_status text; v_fee bigint;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF NOT pdc_private.treasury_v5c44t_is_domestic_dev(p_product_id) THEN
  RAISE EXCEPTION 'PDC_DOMESTIC_CONTEXT_INVALID' USING ERRCODE='22023'; END IF;
 IF p_observed_gross_xaf IS NULL OR p_observed_net_xaf IS NULL OR
    p_observed_gross_xaf NOT BETWEEN 1 AND 2147483647 OR
    p_observed_net_xaf NOT BETWEEN 0 AND 2147483647 OR
    p_observed_net_xaf>p_observed_gross_xaf OR
    p_reference_matches IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PDC_MANUAL_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT p.status INTO v_status FROM pdc_private.tara_checkout_intents_v5c i
 JOIN pdc_private.payment_attempts p ON p.id=i.payment_id
 WHERE i.product_id=p_product_id FOR UPDATE OF p;
 IF v_status NOT IN ('initiated','pending') OR v_status IS NULL THEN
  RAISE EXCEPTION 'PDC_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='22023'; END IF;
 v_fee:=p_observed_gross_xaf-p_observed_net_xaf;
 SELECT * INTO v_review FROM pdc_private.tara_v5c44_record_settlement_dev(
   p_product_id,p_actor::text,p_evidence_reference,p_tara_transaction_id,
   p_reference_matches,p_observed_gross_xaf,p_observed_net_xaf,v_fee,
   p_fees_calculation_note,p_merchant_payment_at);
 INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
 VALUES(p_actor,'payment.manual_dashboard_review_recorded_dev',
   'tara_manual_reviews_v5c44',v_review.review_id,
   pg_catalog.jsonb_build_object('product_id',p_product_id,'decision',v_review.decision));
 RETURN pg_catalog.jsonb_build_object('reviewId',v_review.review_id,'decision',v_review.decision);
END;
$$;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_confirm_dev(
 p_actor uuid,p_review_id uuid,p_explicit_confirmation text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_review pdc_private.tara_manual_reviews_v5c44%ROWTYPE; v_result record;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_explicit_confirmation IS DISTINCT FROM 'JE_CONFIRME_APRES_CONTROLE_TARAMONEY' THEN
  RAISE EXCEPTION 'PDC_MANUAL_CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_review FROM pdc_private.tara_manual_reviews_v5c44
 WHERE id=p_review_id FOR UPDATE;
 IF NOT FOUND OR NOT pdc_private.treasury_v5c44t_is_domestic_dev(v_review.product_id) THEN
  RAISE EXCEPTION 'PDC_DOMESTIC_CONTEXT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_result FROM pdc_private.tara_v5c44_confirm_manual_payment_dev(
   p_review_id,p_explicit_confirmation);
 IF v_result.action='confirmed_in_dev' THEN
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES(p_actor,'payment.manual_dashboard_confirmed_by_treasury_dev',
   'payment_attempts',v_result.payment_id,
   pg_catalog.jsonb_build_object('manual_review_id',p_review_id));
 END IF;
 RETURN pg_catalog.jsonb_build_object('paymentId',v_result.payment_id,'action',v_result.action);
END;
$$;

CREATE OR REPLACE FUNCTION pdc_private.treasury_r5_record_dev(
 p_actor uuid,p_order uuid,p_product text,p_transaction text,p_status text,
 p_gross bigint,p_net bigint,p_fees bigint,p_evidence text,
 p_merchant_paid_at timestamptz,p_references_verified boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_payment uuid; v_status text; v_evidence uuid;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT p.id,p.status INTO v_payment,v_status
 FROM pdc_private.r5_diaspora_orders r
 JOIN pdc_private.payment_attempts p ON p.id=r.payment_id
 JOIN pdc_private.tara_checkout_intents_v5c i ON i.payment_id=p.id
 WHERE r.id=p_order AND i.product_id=p_product AND i.quote_id=r.id
   AND i.link_state='issued' AND p.provider='tara' AND p.currency='XAF'
   AND p.amount_minor=i.amount_xaf AND r.provider_amount_xaf=i.amount_xaf
   AND r.status='submitted_pending_payment' AND p.provider_payment_id IS NULL
 FOR UPDATE OF p;
 IF v_payment IS NULL OR v_status NOT IN ('initiated','pending') THEN
  RAISE EXCEPTION 'PDC_R5_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='22023'; END IF;
 IF p_status IS DISTINCT FROM 'PAID' OR p_references_verified IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PDC_R5_PAID_PROOF_REQUIRED' USING ERRCODE='22023'; END IF;
 v_evidence:=pdc_private.r5_record_fx_evidence_dev(
   p_order,p_product,p_transaction,p_status,p_gross,p_net,p_fees,
   p_evidence,p_actor::text,p_merchant_paid_at,p_references_verified);
 INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
 VALUES(p_actor,'r5.fx_dashboard_recorded_by_treasury_dev',
   'r5_financial_reconciliations',v_evidence,
   pg_catalog.jsonb_build_object('order_id',p_order,'product_id',p_product));
 RETURN pg_catalog.jsonb_build_object('evidenceId',v_evidence,'paymentId',v_payment);
END;
$$;

CREATE OR REPLACE FUNCTION pdc_private.treasury_r5_confirm_dev(
 p_actor uuid,p_evidence uuid,p_phrase text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ev pdc_private.r5_financial_reconciliations%ROWTYPE; v_result record;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_phrase IS DISTINCT FROM 'JE_CONFIRME_LE_RAPPROCHEMENT_DIASPORA_DEV' THEN
  RAISE EXCEPTION 'PDC_R5_EXPLICIT_CONFIRMATION_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_ev FROM pdc_private.r5_financial_reconciliations
 WHERE id=p_evidence FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS (
   SELECT 1 FROM pdc_private.r5_diaspora_orders r
   JOIN pdc_private.tara_checkout_intents_v5c i ON i.payment_id=r.payment_id
   WHERE r.id=v_ev.order_id AND i.product_id=v_ev.product_id AND i.quote_id=r.id
 ) THEN RAISE EXCEPTION 'PDC_R5_CONTEXT_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_result FROM pdc_private.r5_confirm_verified_fx_dev(p_evidence,p_phrase);
 INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
 VALUES(p_actor,'r5.fx_dashboard_confirmed_by_treasury_dev','payment_attempts',
   v_result.confirmed_payment_id,pg_catalog.jsonb_build_object('evidence_id',p_evidence));
 RETURN pg_catalog.jsonb_build_object('paymentId',v_result.confirmed_payment_id,
   'confirmation',v_result.confirmation);
END;
$$;

-- IMPORTANT: Only grant these after reviewing owner, API authentication and role isolation.
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_authorized_dev(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_is_domestic_dev(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_record_dev(uuid,text,text,text,boolean,bigint,bigint,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_confirm_dev(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pdc_private.treasury_r5_record_dev(uuid,uuid,text,text,text,bigint,bigint,bigint,text,timestamptz,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION pdc_private.treasury_r5_confirm_dev(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_authorized_dev(uuid) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_record_dev(uuid,text,text,text,boolean,bigint,bigint,text,timestamptz) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_confirm_dev(uuid,uuid,text) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_r5_record_dev(uuid,uuid,text,text,text,bigint,bigint,bigint,text,timestamptz,boolean) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_r5_confirm_dev(uuid,uuid,text) TO pdc_api_v5b3;
COMMIT;
