-- V5C44-T / DEV ONLY. Review before running in Supabase DEV SQL Editor.
-- Non-destructive: adds functions only; does not alter payment/webhook state.
BEGIN;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_authorized_dev(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_actor IS NOT NULL AND EXISTS (
  SELECT 1 FROM pdc_private.role_assignments ra
  WHERE ra.auth_user_id = p_actor
    AND ra.role_code = 'national_treasury'
    AND ra.scope_territory_id IS NULL
    AND ra.valid_from <= pg_catalog.now()
    AND (ra.valid_until IS NULL OR ra.valid_until > pg_catalog.now())
 );
$$;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_authorized_dev(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_authorized_dev(uuid) TO pdc_api_v5b3;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_lookup_dev(p_actor uuid, p_product_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF p_product_id IS NULL OR p_product_id !~ '^PDC_[A-Za-z0-9_-]{24}$' THEN
  RAISE EXCEPTION 'PDC_INVALID_PRODUCT_ID' USING ERRCODE='22023';
 END IF;
 SELECT pg_catalog.jsonb_build_object(
   'productId',c.product_id,
   'paymentId',p.id,
   'expectedGrossXaf',c.amount_xaf::text,
   'currency',p.currency,
   'paymentStatus',p.status,
   'providerTransactionId',p.provider_payment_id,
   'review',(
     SELECT pg_catalog.jsonb_build_object(
       'reviewId',r.id,'decision',r.decision,
       'observedGrossXaf',r.observed_amount_xaf::text,
       'observedNetXaf',r.observed_net_xaf::text,
       'observedFeeXaf',r.observed_fee_xaf::text,
       'finalizedAt',r.finalized_at,'checkedAt',r.checked_at
     ) FROM pdc_private.tara_manual_reviews_v5c44 r
     WHERE r.product_id=c.product_id
     ORDER BY r.checked_at DESC,r.id DESC LIMIT 1
   )
 ) INTO v_result
 FROM pdc_private.tara_checkout_intents_v5c c
 JOIN pdc_private.payment_attempts p ON p.id=c.payment_id
 WHERE c.product_id=p_product_id AND c.link_state='issued'
   AND p.provider='tara' AND p.currency='XAF' AND p.amount_minor=c.amount_xaf;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_lookup_dev(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_lookup_dev(uuid,text) TO pdc_api_v5b3;

-- The existing V5C44 functions remain SECURITY INVOKER, with no direct API grant.
-- The wrapper executes as its owner, checks an active treasury assignment,
-- and records the authenticated actor supplied ONLY by the trusted Node API.
CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_record_dev(
 p_actor uuid,p_product_id text,p_evidence_reference text,
 p_tara_transaction_id text,p_reference_matches boolean,
 p_observed_gross_xaf bigint,p_observed_net_xaf bigint,
 p_fees_calculation_note text,p_merchant_payment_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_review record; v_fee bigint; v_status text;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF p_observed_gross_xaf IS NULL OR p_observed_net_xaf IS NULL OR
    p_observed_gross_xaf < 1 OR p_observed_net_xaf < 0 OR
    p_observed_net_xaf > p_observed_gross_xaf OR
    p_reference_matches IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'PDC_MANUAL_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 v_fee := p_observed_gross_xaf-p_observed_net_xaf;
 -- Do not create another review for a payment already confirmed.
 SELECT p.status INTO v_status
 FROM pdc_private.tara_checkout_intents_v5c c
 JOIN pdc_private.payment_attempts p ON p.id=c.payment_id
 WHERE c.product_id=p_product_id FOR UPDATE OF p;
 IF v_status IS NULL OR v_status NOT IN ('initiated','pending') THEN
  RAISE EXCEPTION 'PDC_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_review FROM pdc_private.tara_v5c44_record_settlement_dev(
   p_product_id, p_actor::text,p_evidence_reference,p_tara_transaction_id,
   p_reference_matches,p_observed_gross_xaf,p_observed_net_xaf,v_fee,
   p_fees_calculation_note,p_merchant_payment_at);
 INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
 VALUES (p_actor,'payment.manual_dashboard_review_recorded_dev',
         'tara_manual_reviews_v5c44',v_review.review_id,
         pg_catalog.jsonb_build_object('product_id',p_product_id,'decision',v_review.decision));
 RETURN pg_catalog.jsonb_build_object('reviewId',v_review.review_id,
   'decision',v_review.decision,'expectedGrossXaf',v_review.expected_amount_xaf::text);
END;
$$;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_record_dev(uuid,text,text,text,boolean,bigint,bigint,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_record_dev(uuid,text,text,text,boolean,bigint,bigint,text,timestamptz) TO pdc_api_v5b3;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_confirm_dev(
 p_actor uuid,p_review_id uuid,p_explicit_confirmation text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result record; v_review pdc_private.tara_manual_reviews_v5c44%ROWTYPE;
BEGIN
 IF NOT pdc_private.treasury_v5c44t_authorized_dev(p_actor) THEN
  RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF p_explicit_confirmation IS DISTINCT FROM 'JE_CONFIRME_APRES_CONTROLE_TARAMONEY' THEN
  RAISE EXCEPTION 'PDC_MANUAL_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_review FROM pdc_private.tara_manual_reviews_v5c44
 WHERE id=p_review_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PDC_REVIEW_NOT_FOUND' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_result FROM pdc_private.tara_v5c44_confirm_manual_payment_dev(
   p_review_id,p_explicit_confirmation);
 -- Avoid duplicate actor audit entries for an idempotent repeat.
 IF v_result.action = 'confirmed_in_dev' THEN
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES (p_actor,'payment.manual_dashboard_confirmed_by_treasury_dev',
    'payment_attempts',v_result.payment_id,
    pg_catalog.jsonb_build_object('manual_review_id',p_review_id,
      'source','TARA_DASHBOARD_MANUAL'));
 END IF;
 RETURN pg_catalog.jsonb_build_object('paymentId',v_result.payment_id,'action',v_result.action);
END;
$$;
REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_confirm_dev(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_confirm_dev(uuid,uuid,text) TO pdc_api_v5b3;
COMMIT;
