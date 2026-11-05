-- PDC T12-B — PROPOSITION SQL DEV ; REVUE ET APPLICATION MANUELLE UNIQUEMENT.
-- Ne PAS inclure dans supabase/migrations avant validation de l'état réel de DEV.
-- Dépendances : schéma R5 04600 déjà appliqué et fonctions R5 existantes.
-- Jamais de confirmation d'un paiement sur simple réponse SUCCESS de Mobile Pay.
BEGIN;

CREATE TABLE pdc_private.t12_r5_mobile_direct_dev (
  product_id text PRIMARY KEY REFERENCES pdc_private.tara_checkout_intents_v5c(product_id),
  order_id uuid NOT NULL UNIQUE REFERENCES pdc_private.r5_diaspora_orders(id),
  payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
  phone_hmac text NOT NULL CHECK(phone_hmac ~ '^[a-f0-9]{64}$'),
  phone_last4 char(4) NOT NULL CHECK(phone_last4 ~ '^[0-9]{4}$'),
  request_state text NOT NULL DEFAULT 'requested' CHECK(request_state IN
    ('requested','request_initiated','request_rejected','unknown')),
  provider_status text CHECK(provider_status IN ('SUCCESS','FAILURE')),
  provider_message text CHECK(length(provider_message) BETWEEN 1 AND 80),
  vendor text CHECK(vendor ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((request_state='requested' AND resolved_at IS NULL AND provider_status IS NULL)
      OR (request_state='unknown' AND provider_status IS NULL)
      OR (request_state='request_initiated' AND provider_status='SUCCESS' AND resolved_at IS NOT NULL)
      OR (request_state='request_rejected' AND provider_status='FAILURE' AND resolved_at IS NOT NULL))
);
ALTER TABLE pdc_private.t12_r5_mobile_direct_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.t12_r5_mobile_direct_dev FROM
  PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer,pdc_tara_v5c_writer;

-- Atomique : une seule requête fournisseur possible pour une intention R5.
CREATE FUNCTION pdc_private.r5_claim_mobile_direct_t12_dev(
 p_order uuid,p_session_hash text,p_product text,p_phone_hmac text,p_last4 text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;
        i pdc_private.tara_checkout_intents_v5c%ROWTYPE;
BEGIN
 IF p_order IS NULL OR p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$' OR
    p_product IS NULL OR p_product !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
    p_phone_hmac IS NULL OR p_phone_hmac !~ '^[a-f0-9]{64}$' OR
    p_last4 IS NULL OR p_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PDC_T12_INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.intake_session_sha256 IS DISTINCT FROM p_session_hash OR
    o.status<>'submitted_pending_payment' OR o.payment_method<>'mobile' OR
    o.messaging_channel IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_T12_R5_ORDER_NOT_ELIGIBLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM pdc_private.tara_checkout_intents_v5c
  WHERE product_id=p_product AND payment_id=o.payment_id AND quote_id=o.id FOR UPDATE;
 IF NOT FOUND OR i.link_state<>'reserved' OR i.amount_xaf<>o.provider_amount_xaf OR
    i.currency<>'XAF' OR i.idempotency_key<>o.idempotency_key OR
    EXISTS(SELECT 1 FROM pdc_private.t12_r5_mobile_direct_dev d
      WHERE d.order_id=p_order OR d.product_id=p_product) OR
    NOT EXISTS(SELECT 1 FROM pdc_private.payment_attempts p WHERE p.id=o.payment_id AND
      p.status IN ('initiated','pending') AND p.provider='tara' AND p.currency='XAF' AND
      p.amount_minor=o.provider_amount_xaf) THEN
    RETURN false; END IF;
 UPDATE pdc_private.tara_checkout_intents_v5c SET
   link_state='requested', requested_at=now(),
   selected_method='mobile', selected_messaging_channel=NULL
  WHERE product_id=i.product_id AND link_state='reserved';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO pdc_private.t12_r5_mobile_direct_dev
   (product_id,order_id,payment_id,phone_hmac,phone_last4)
 VALUES(i.product_id,o.id,o.payment_id,p_phone_hmac,p_last4);
 RETURN true;
END;$fn$;

CREATE FUNCTION pdc_private.r5_finish_mobile_direct_t12_dev(
 p_order uuid,p_session_hash text,p_product text,p_status text,p_message text,p_vendor text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;
BEGIN
 IF p_status NOT IN ('SUCCESS','FAILURE') OR p_status IS NULL OR
   p_message IS NULL OR p_message !~ '^[A-Za-z0-9_ -]{1,80}$' OR
   (p_vendor IS NOT NULL AND p_vendor !~ '^[A-Z][A-Z0-9_]{1,63}$') THEN
   RAISE EXCEPTION 'PDC_T12_PROVIDER_RESULT_INVALID' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.intake_session_sha256 IS DISTINCT FROM p_session_hash OR
    o.status<>'submitted_pending_payment' OR o.payment_method<>'mobile' THEN
    RAISE EXCEPTION 'PDC_T12_R5_SESSION_INVALID' USING ERRCODE='42501';END IF;
 UPDATE pdc_private.t12_r5_mobile_direct_dev SET
    request_state=CASE WHEN p_status='SUCCESS' THEN 'request_initiated' ELSE 'request_rejected' END,
    provider_status=p_status,provider_message=p_message,vendor=p_vendor,resolved_at=now()
 WHERE order_id=o.id AND product_id=p_product AND payment_id=o.payment_id AND request_state='requested'
   AND EXISTS(SELECT 1 FROM pdc_private.tara_checkout_intents_v5c i WHERE
       i.product_id=p_product AND i.payment_id=o.payment_id AND i.quote_id=o.id
       AND i.link_state='requested');
 RETURN FOUND;
END;$fn$;

CREATE FUNCTION pdc_private.r5_mark_mobile_direct_unknown_t12_dev(
 p_order uuid,p_session_hash text,p_product text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;
BEGIN
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.intake_session_sha256 IS DISTINCT FROM p_session_hash THEN
   RAISE EXCEPTION 'PDC_T12_R5_SESSION_INVALID' USING ERRCODE='42501';END IF;
 UPDATE pdc_private.t12_r5_mobile_direct_dev SET request_state='unknown'
  WHERE order_id=o.id AND product_id=p_product AND payment_id=o.payment_id AND request_state='requested';
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='unknown'
  WHERE product_id=p_product AND payment_id=o.payment_id AND quote_id=o.id AND link_state='requested';
 IF NOT FOUND THEN RAISE EXCEPTION 'PDC_T12_INCONSISTENT_UNKNOWN_STATE';END IF;
 RETURN true;
END;$fn$;

REVOKE ALL ON FUNCTION pdc_private.r5_claim_mobile_direct_t12_dev(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_r5_photo_writer,pdc_tara_v5c_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_finish_mobile_direct_t12_dev(uuid,text,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_r5_photo_writer,pdc_tara_v5c_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_mark_mobile_direct_unknown_t12_dev(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_r5_photo_writer,pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_claim_mobile_direct_t12_dev(uuid,text,text,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_finish_mobile_direct_t12_dev(uuid,text,text,text,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_mark_mobile_direct_unknown_t12_dev(uuid,text,text) TO pdc_r5_intake_writer;

-- Rapprochement manuel spécifique : les liens classiques R5 restent inchangés.
-- Un lancement SUCCESS ou un timeout ne prouve jamais une transaction payée.
CREATE FUNCTION pdc_private.r5_record_mobile_direct_evidence_t12_dev(
 p_order uuid,p_product text,p_transaction text,p_status text,
 p_gross bigint,p_net bigint,p_fees bigint,p_evidence text,p_operator text,
 p_merchant_paid_at timestamptz,p_references_verified boolean)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;
        i pdc_private.tara_checkout_intents_v5c%ROWTYPE;
        d pdc_private.t12_r5_mobile_direct_dev%ROWTYPE;v_id uuid;
BEGIN
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 SELECT * INTO i FROM pdc_private.tara_checkout_intents_v5c WHERE product_id=p_product FOR UPDATE;
 SELECT * INTO d FROM pdc_private.t12_r5_mobile_direct_dev WHERE product_id=p_product FOR UPDATE;
 IF o.id IS NULL OR i.product_id IS NULL OR d.product_id IS NULL OR
    o.status<>'submitted_pending_payment' OR o.payment_id<>i.payment_id OR
    o.payment_id<>d.payment_id OR o.id<>d.order_id OR
    i.link_state NOT IN ('requested','unknown') OR
    d.request_state NOT IN ('request_initiated','unknown') OR
    i.amount_xaf<>o.provider_amount_xaf OR p_gross<>o.provider_amount_xaf OR
    p_gross<>p_net+p_fees OR p_status NOT IN ('PAID','PENDING','FAILED','DISPUTED') OR
    p_transaction IS NULL OR length(p_transaction) NOT BETWEEN 8 AND 150 OR
    p_evidence IS NULL OR length(p_evidence) NOT BETWEEN 8 AND 300 OR
    p_operator IS NULL OR length(p_operator) NOT BETWEEN 3 AND 150 OR
    p_merchant_paid_at IS NULL OR p_merchant_paid_at>now()+INTERVAL '1 hour' OR
    p_references_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PDC_T12_DIRECT_EVIDENCE_INVALID';END IF;
 INSERT INTO pdc_private.r5_financial_reconciliations
   (order_id,product_id,merchant_transaction_id,observed_status,gross_xaf,net_xaf,fees_xaf,
    evidence_origin,evidence_reference,operator_label,merchant_paid_at,references_verified)
 VALUES(o.id,p_product,p_transaction,p_status,p_gross,p_net,p_fees,
    'merchant_dashboard',p_evidence,p_operator,p_merchant_paid_at,true)
 RETURNING id INTO v_id;
 RETURN v_id;
END;$fn$;

CREATE FUNCTION pdc_private.r5_confirm_mobile_direct_fx_t12_dev(p_evidence uuid,p_phrase text)
RETURNS TABLE(confirmed_payment_id uuid,confirmation text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE e pdc_private.r5_financial_reconciliations%ROWTYPE;
        o pdc_private.r5_diaspora_orders%ROWTYPE;
        p pdc_private.payment_attempts%ROWTYPE;
BEGIN
 IF p_phrase IS DISTINCT FROM 'JE_CONFIRME_LE_RAPPROCHEMENT_MOBILE_DIRECT_DEV' THEN
   RAISE EXCEPTION 'PDC_T12_EXPLICIT_CONFIRMATION_REQUIRED';END IF;
 SELECT * INTO e FROM pdc_private.r5_financial_reconciliations WHERE id=p_evidence FOR UPDATE;
 IF NOT FOUND OR e.verified_at IS NOT NULL OR e.observed_status<>'PAID' OR
    e.evidence_origin<>'merchant_dashboard' OR e.references_verified IS DISTINCT FROM true OR
    e.merchant_paid_at IS NULL OR e.gross_xaf<>e.net_xaf+e.fees_xaf THEN
   RAISE EXCEPTION 'PDC_T12_SETTLEMENT_NOT_ELIGIBLE';END IF;
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=e.order_id FOR UPDATE;
 SELECT * INTO p FROM pdc_private.payment_attempts WHERE id=o.payment_id FOR UPDATE;
 IF p.id IS NULL OR o.status<>'submitted_pending_payment' OR
    p.status NOT IN ('initiated','pending') OR p.provider<>'tara' OR p.currency<>'XAF' OR
    p.amount_minor<>e.gross_xaf OR p.provider_payment_id IS NOT NULL OR
    o.provider_amount_xaf<>e.gross_xaf OR
    NOT EXISTS(SELECT 1 FROM pdc_private.t12_r5_mobile_direct_dev d
      JOIN pdc_private.tara_checkout_intents_v5c i ON i.product_id=d.product_id
      WHERE d.order_id=o.id AND d.payment_id=p.id AND i.payment_id=p.id AND
        i.quote_id=o.id AND i.product_id=e.product_id AND
        d.request_state IN ('request_initiated','unknown') AND i.link_state IN ('requested','unknown')) OR
    (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=o.id)<>
      (1 + COALESCE((o.formula='couple')::integer,0)) THEN
   RAISE EXCEPTION 'PDC_T12_PAYMENT_CONTEXT_INVALID';END IF;
 UPDATE pdc_private.payment_attempts SET status='confirmed',confirmed_at=now(),
   provider_payment_id=e.merchant_transaction_id
 WHERE id=p.id AND status IN ('initiated','pending');
 IF NOT FOUND THEN RAISE EXCEPTION 'PDC_T12_CONCURRENT_CONFIRMATION';END IF;
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('tara','r5-manual-direct:'||e.merchant_transaction_id,p.id,'manual_dashboard_confirmation_dev',now());
 UPDATE pdc_private.r5_financial_reconciliations SET verified_at=now() WHERE id=e.id;
 UPDATE pdc_private.r5_diaspora_orders SET status='payment_verified',reconciled_at=now() WHERE id=o.id;
 INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
 VALUES(NULL,'r5.mobile_direct_dashboard_confirmed_dev','payment_attempts',p.id,
   jsonb_build_object('evidence_id',e.id,'operator',e.operator_label,
   'gross_xaf',e.gross_xaf,'net_xaf',e.net_xaf,'fees_xaf',e.fees_xaf,
   'merchant_paid_at',e.merchant_paid_at,'references_verified',e.references_verified,
   'provider_method','mobile_direct','product_id',e.product_id));
 RETURN QUERY SELECT p.id,'confirmed_dev_no_admission'::text;
END;$fn$;
-- Aucun accès depuis le navigateur, l'API publique, le writer R5 ou service_role.
REVOKE ALL ON FUNCTION pdc_private.r5_record_mobile_direct_evidence_t12_dev(
  uuid,text,text,text,bigint,bigint,bigint,text,text,timestamptz,boolean)
  FROM PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer,pdc_tara_v5c_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_confirm_mobile_direct_fx_t12_dev(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer,pdc_tara_v5c_writer;
COMMIT;
