-- PDC T12-C / DEV UNIQUEMENT / RÉVISION MANUELLE OBLIGATOIRE
-- Ne pas appliquer sans dry-run, revue et confirmation de l'opérateur.
-- Dépend des tables V5-C et fonctions existantes. Aucun débit Tara émis par ce SQL.
-- Ne change PAS la sémantique des fonctions V5-C de liens existantes.
BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('pdc_private.public_checkout_orders_v5c') IS NULL
     OR to_regclass('pdc_private.tara_checkout_intents_v5c') IS NULL
     OR to_regclass('pdc_private.payment_attempts') IS NULL
     OR to_regclass('pdc_private.payment_events') IS NULL
     OR to_regclass('pdc_private.audit_log') IS NULL
     OR to_regclass('pdc_private.t12_r5_mobile_direct_dev') IS NULL
     OR to_regclass('pdc_private.t12_v5c_mobile_direct_dev') IS NOT NULL
     OR to_regclass('pdc_private.t12_v5c_direct_evidence_dev') IS NOT NULL
     OR to_regrole('pdc_tara_v5c_writer') IS NULL
  THEN
    RAISE EXCEPTION 'PDC_T12C_PREFLIGHT_FAILED';
  END IF;
END;$preflight$;

CREATE TABLE pdc_private.t12_v5c_mobile_direct_dev (
  product_id text PRIMARY KEY REFERENCES pdc_private.tara_checkout_intents_v5c(product_id),
  order_id uuid NOT NULL UNIQUE REFERENCES pdc_private.public_checkout_orders_v5c(id),
  payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
  phone_hmac text NOT NULL CHECK (phone_hmac ~ '^[0-9a-f]{64}$'),
  phone_last4 char(4) NOT NULL CHECK (phone_last4 ~ '^[0-9]{4}$'),
  request_state text NOT NULL DEFAULT 'requested'
    CHECK (request_state IN ('requested','request_initiated','request_rejected','unknown')),
  provider_status text CHECK (provider_status IN ('SUCCESS','FAILURE')),
  provider_message text CHECK (provider_message ~ '^[A-Za-z0-9_ -]{1,80}$'),
  vendor text CHECK (vendor ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  resolved_at timestamptz,
  CHECK (
     (request_state='requested' AND provider_status IS NULL AND resolved_at IS NULL)
     OR (request_state='unknown' AND provider_status IS NULL)
     OR (request_state='request_initiated' AND provider_status='SUCCESS' AND resolved_at IS NOT NULL)
     OR (request_state='request_rejected' AND provider_status='FAILURE' AND resolved_at IS NOT NULL)
  )
);
ALTER TABLE pdc_private.t12_v5c_mobile_direct_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.t12_v5c_mobile_direct_dev FROM
  PUBLIC, anon, authenticated, service_role, pdc_tara_v5c_writer, pdc_r5_intake_writer;

-- Exclusion atomique avec l'émission de lien : une seule transition RESERVED -> REQUESTED.
-- IMPORTANT : selected_method, selected_link_field et selected_link_url restent TOUS NULL
-- pour satisfaire tara_selected_pair_v5c_check et tara_selected_url_v5c_check.
CREATE FUNCTION pdc_private.t12_v5c_claim_mobile_direct_dev(
  p_product text, p_payment uuid, p_quote uuid, p_idem text,
  p_phone_hmac text, p_last4 text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c pdc_private.tara_checkout_intents_v5c%ROWTYPE;
        o pdc_private.public_checkout_orders_v5c%ROWTYPE;
        p pdc_private.payment_attempts%ROWTYPE;
BEGIN
  IF p_product IS NULL OR p_product !~ '^PDC_[A-Za-z0-9_-]{24}$'
     OR p_idem IS NULL OR p_idem !~ '^[A-Za-z0-9:_-]{16,128}$'
     OR p_phone_hmac IS NULL OR p_phone_hmac !~ '^[a-f0-9]{64}$'
     OR p_last4 IS NULL OR p_last4 !~ '^[0-9]{4}$'
     OR p_payment IS NULL OR p_quote IS NULL THEN
    RAISE EXCEPTION 'PDC_T12C_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Ordre des verrous compatible avec tara_v5c_reserve_intent : paiement puis intention.
  SELECT * INTO p FROM pdc_private.payment_attempts
    WHERE id=p_payment FOR UPDATE;
  SELECT * INTO c FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=p_product FOR UPDATE;
  IF NOT FOUND OR c.payment_id IS DISTINCT FROM p_payment
      OR c.quote_id IS DISTINCT FROM p_quote
      OR c.idempotency_key IS DISTINCT FROM p_idem OR c.currency <> 'XAF'
      OR c.link_state <> 'reserved' OR c.selected_method IS NOT NULL
      OR c.selected_link_field IS NOT NULL OR c.selected_link_url IS NOT NULL
      OR EXISTS (SELECT 1 FROM pdc_private.t12_v5c_mobile_direct_dev d
                 WHERE d.product_id=p_product OR d.payment_id=p_payment)
  THEN RETURN false; END IF;
  SELECT * INTO o FROM pdc_private.public_checkout_orders_v5c
    WHERE payment_id=c.payment_id FOR UPDATE;
  IF o.id IS NULL OR p.id IS NULL OR
     o.payment_id<>c.payment_id OR o.target_id<>c.quote_id OR
     o.payer_id<>c.payer_id OR o.idempotency_key<>c.idempotency_key OR
     o.payment_method<>'mobile' OR o.messaging_channel IS NOT NULL OR
     o.order_kind NOT IN ('donation','individual_initial') OR
     o.gross_amount_xaf<>c.amount_xaf OR p.payer_id<>c.payer_id OR
     p.provider<>'tara' OR p.currency<>'XAF' OR p.amount_minor<>c.amount_xaf OR
     p.status NOT IN ('initiated','pending') OR p.provider_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_T12C_ORDER_INVALID' USING ERRCODE='42501';
  END IF;
  UPDATE pdc_private.tara_checkout_intents_v5c
    SET link_state='requested',requested_at=pg_catalog.now()
    WHERE product_id=c.product_id AND link_state='reserved'
      AND selected_method IS NULL AND selected_link_field IS NULL
      AND selected_link_url IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO pdc_private.t12_v5c_mobile_direct_dev
    (product_id,order_id,payment_id,phone_hmac,phone_last4)
    VALUES(c.product_id,o.id,p.id,p_phone_hmac,p_last4);
  RETURN true;
END;$fn$;

CREATE FUNCTION pdc_private.t12_v5c_finish_mobile_direct_dev(
 p_product text,p_payment uuid,p_status text,p_message text,p_vendor text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE d pdc_private.t12_v5c_mobile_direct_dev%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('SUCCESS','FAILURE') OR
    p_message IS NULL OR p_message !~ '^[A-Za-z0-9_ -]{1,80}$' OR
    (p_vendor IS NOT NULL AND p_vendor !~ '^[A-Z][A-Z0-9_]{1,63}$') THEN
    RAISE EXCEPTION 'PDC_T12C_PROVIDER_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO d FROM pdc_private.t12_v5c_mobile_direct_dev
    WHERE product_id=p_product AND payment_id=p_payment FOR UPDATE;
  IF NOT FOUND OR d.request_state<>'requested' OR
    NOT EXISTS (SELECT 1 FROM pdc_private.tara_checkout_intents_v5c i
      WHERE i.product_id=p_product AND i.payment_id=p_payment AND
        i.link_state='requested' AND i.selected_method IS NULL AND i.selected_link_url IS NULL)
  THEN RETURN false; END IF;
  UPDATE pdc_private.t12_v5c_mobile_direct_dev
    SET request_state=CASE WHEN p_status='SUCCESS' THEN 'request_initiated' ELSE 'request_rejected' END,
        provider_status=p_status,provider_message=p_message,vendor=p_vendor,resolved_at=pg_catalog.now()
    WHERE product_id=p_product AND payment_id=p_payment AND request_state='requested';
  RETURN FOUND;
END;$fn$;

CREATE FUNCTION pdc_private.t12_v5c_mark_mobile_unknown_dev(p_product text,p_payment uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE d pdc_private.t12_v5c_mobile_direct_dev%ROWTYPE;
BEGIN
  SELECT * INTO d FROM pdc_private.t12_v5c_mobile_direct_dev
    WHERE product_id=p_product AND payment_id=p_payment FOR UPDATE;
  IF NOT FOUND OR d.request_state<>'requested' THEN RETURN false; END IF;
  UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='unknown'
    WHERE product_id=p_product AND payment_id=p_payment AND link_state='requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_T12C_UNKNOWN_INCONSISTENT'; END IF;
  UPDATE pdc_private.t12_v5c_mobile_direct_dev SET request_state='unknown'
    WHERE product_id=p_product AND payment_id=p_payment AND request_state='requested';
  RETURN FOUND;
END;$fn$;

-- Seconde défense : empêcher un ancien RPC save_issued_channel de convertir
-- un mobile direct REQUESTED en lien SMS ISSUED pour le même productId.
CREATE FUNCTION pdc_private.t12_v5c_guard_direct_no_link_dev()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF NEW.link_state='issued' AND OLD.link_state IS DISTINCT FROM NEW.link_state
     AND EXISTS(SELECT 1 FROM pdc_private.t12_v5c_mobile_direct_dev d
                WHERE d.product_id=NEW.product_id) THEN
    RAISE EXCEPTION 'PDC_T12C_DIRECT_CANNOT_ISSUE_LINK' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;$fn$;
CREATE TRIGGER t12_v5c_direct_no_link_dev
  BEFORE UPDATE OF link_state ON pdc_private.tara_checkout_intents_v5c
  FOR EACH ROW EXECUTE FUNCTION pdc_private.t12_v5c_guard_direct_no_link_dev();

REVOKE ALL ON FUNCTION pdc_private.t12_v5c_claim_mobile_direct_dev(text,uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.t12_v5c_finish_mobile_direct_dev(text,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.t12_v5c_mark_mobile_unknown_dev(text,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pdc_r5_intake_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.t12_v5c_guard_direct_no_link_dev()
  FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.t12_v5c_claim_mobile_direct_dev(text,uuid,uuid,text,text,text)
  TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.t12_v5c_finish_mobile_direct_dev(text,uuid,text,text,text)
  TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.t12_v5c_mark_mobile_unknown_dev(text,uuid)
  TO pdc_tara_v5c_writer;

-- PREUVE FINANCIÈRE : opérateur SQL privilégié uniquement, jamais writer web.
CREATE TABLE pdc_private.t12_v5c_direct_evidence_dev (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  product_id text NOT NULL REFERENCES pdc_private.t12_v5c_mobile_direct_dev(product_id),
  payment_id uuid NOT NULL REFERENCES pdc_private.payment_attempts(id),
  transaction_id text NOT NULL UNIQUE CHECK(length(transaction_id) BETWEEN 8 AND 150),
  observed_status text NOT NULL CHECK(observed_status IN ('PAID','PENDING','FAILED','DISPUTED')),
  gross_xaf bigint NOT NULL CHECK(gross_xaf > 0),
  net_xaf bigint NOT NULL CHECK(net_xaf >= 0),
  fees_xaf bigint NOT NULL CHECK(fees_xaf >= 0),
  evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 8 AND 300),
  operator_label text NOT NULL CHECK(length(operator_label) BETWEEN 3 AND 150),
  merchant_paid_at timestamptz NOT NULL,
  references_verified boolean NOT NULL CHECK(references_verified IS TRUE),
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  verified_at timestamptz,
  CHECK(gross_xaf=net_xaf+fees_xaf)
);
CREATE UNIQUE INDEX t12_v5c_one_confirmed_evidence_dev
  ON pdc_private.t12_v5c_direct_evidence_dev(payment_id) WHERE verified_at IS NOT NULL;
ALTER TABLE pdc_private.t12_v5c_direct_evidence_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.t12_v5c_direct_evidence_dev FROM
  PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;

CREATE FUNCTION pdc_private.t12_v5c_record_direct_evidence_dev(
 p_product text,p_payment uuid,p_transaction text,p_status text,
 p_gross bigint,p_net bigint,p_fees bigint,p_evidence text,p_operator text,
 p_merchant_paid_at timestamptz,p_references_verified boolean)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE d pdc_private.t12_v5c_mobile_direct_dev%ROWTYPE;
        i pdc_private.tara_checkout_intents_v5c%ROWTYPE;
        p pdc_private.payment_attempts%ROWTYPE;
        v_id uuid;
BEGIN
  SELECT * INTO d FROM pdc_private.t12_v5c_mobile_direct_dev
    WHERE product_id=p_product AND payment_id=p_payment FOR UPDATE;
  SELECT * INTO i FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=p_product AND payment_id=p_payment FOR UPDATE;
  SELECT * INTO p FROM pdc_private.payment_attempts WHERE id=p_payment FOR UPDATE;
  IF d.product_id IS NULL OR i.product_id IS NULL OR p.id IS NULL OR
    d.request_state NOT IN ('request_initiated','unknown') OR
    i.link_state NOT IN ('requested','unknown') OR
    p.status NOT IN ('initiated','pending') OR p.provider<>'tara' OR
    p.currency<>'XAF' OR p.amount_minor<>i.amount_xaf OR
    i.selected_method IS NOT NULL OR i.selected_link_url IS NOT NULL OR
    p_gross<>i.amount_xaf OR p_gross<>p_net+p_fees OR
    p_status NOT IN ('PAID','PENDING','FAILED','DISPUTED') OR
    p_transaction IS NULL OR length(p_transaction) NOT BETWEEN 8 AND 150 OR
    p_evidence IS NULL OR length(p_evidence) NOT BETWEEN 8 AND 300 OR
    p_operator IS NULL OR length(p_operator) NOT BETWEEN 3 AND 150 OR
    p_merchant_paid_at IS NULL OR p_merchant_paid_at>pg_catalog.now()+INTERVAL '1 hour' OR
    p_references_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PDC_T12C_EVIDENCE_INVALID';
  END IF;
  INSERT INTO pdc_private.t12_v5c_direct_evidence_dev
    (product_id,payment_id,transaction_id,observed_status,gross_xaf,net_xaf,fees_xaf,
     evidence_reference,operator_label,merchant_paid_at,references_verified)
    VALUES(p_product,p_payment,p_transaction,p_status,p_gross,p_net,p_fees,
      p_evidence,p_operator,p_merchant_paid_at,true)
    RETURNING id INTO v_id;
  RETURN v_id;
END;$fn$;

CREATE FUNCTION pdc_private.t12_v5c_confirm_direct_evidence_dev(p_evidence uuid,p_phrase text)
RETURNS TABLE(confirmed_payment_id uuid,confirmation text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE e pdc_private.t12_v5c_direct_evidence_dev%ROWTYPE;
        d pdc_private.t12_v5c_mobile_direct_dev%ROWTYPE;
        i pdc_private.tara_checkout_intents_v5c%ROWTYPE;
        o pdc_private.public_checkout_orders_v5c%ROWTYPE;
        p pdc_private.payment_attempts%ROWTYPE;
BEGIN
  IF p_phrase IS DISTINCT FROM 'JE_CONFIRME_LE_RAPPROCHEMENT_MOBILE_CAMEROUN_DEV' THEN
    RAISE EXCEPTION 'PDC_T12C_EXPLICIT_CONFIRMATION_REQUIRED'; END IF;
  SELECT * INTO e FROM pdc_private.t12_v5c_direct_evidence_dev WHERE id=p_evidence FOR UPDATE;
  IF e.id IS NULL OR e.verified_at IS NOT NULL OR e.observed_status<>'PAID' OR
     e.references_verified IS DISTINCT FROM true OR e.merchant_paid_at IS NULL OR
     e.gross_xaf<>e.net_xaf+e.fees_xaf THEN
    RAISE EXCEPTION 'PDC_T12C_SETTLEMENT_NOT_ELIGIBLE'; END IF;
  SELECT * INTO d FROM pdc_private.t12_v5c_mobile_direct_dev
    WHERE product_id=e.product_id AND payment_id=e.payment_id FOR UPDATE;
  SELECT * INTO i FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=e.product_id AND payment_id=e.payment_id FOR UPDATE;
  SELECT * INTO o FROM pdc_private.public_checkout_orders_v5c WHERE id=d.order_id FOR UPDATE;
  SELECT * INTO p FROM pdc_private.payment_attempts WHERE id=e.payment_id FOR UPDATE;
  IF d.product_id IS NULL OR i.product_id IS NULL OR o.id IS NULL OR p.id IS NULL OR
     d.request_state NOT IN ('request_initiated','unknown') OR
     i.link_state NOT IN ('requested','unknown') OR
     i.selected_method IS NOT NULL OR i.selected_link_url IS NOT NULL OR
     o.payment_method<>'mobile' OR o.payment_id<>p.id OR o.target_id<>i.quote_id OR
     o.payer_id<>i.payer_id OR o.idempotency_key<>i.idempotency_key OR
     p.status NOT IN ('initiated','pending') OR p.provider<>'tara' OR p.currency<>'XAF' OR
     p.provider_payment_id IS NOT NULL OR p.amount_minor<>e.gross_xaf OR
     o.gross_amount_xaf<>e.gross_xaf OR i.amount_xaf<>e.gross_xaf OR
     (SELECT COALESCE(pg_catalog.sum(a.amount_minor),0)
      FROM pdc_private.payment_allocations a WHERE a.payment_id=p.id) <>e.gross_xaf THEN
    RAISE EXCEPTION 'PDC_T12C_PAYMENT_CONTEXT_INVALID'; END IF;
  UPDATE pdc_private.payment_attempts
    SET status='confirmed',confirmed_at=pg_catalog.now(),provider_payment_id=e.transaction_id
    WHERE id=p.id AND status IN ('initiated','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_T12C_CONCURRENT_CONFIRMATION'; END IF;
  INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
    VALUES('tara','t12c-manual:'||e.transaction_id,p.id,'manual_dashboard_confirmation_dev',pg_catalog.now());
  UPDATE pdc_private.t12_v5c_direct_evidence_dev SET verified_at=pg_catalog.now() WHERE id=e.id;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
    VALUES(NULL,'t12c.mobile_direct_dashboard_confirmed_dev','payment_attempts',p.id,
      pg_catalog.jsonb_build_object('evidence_id',e.id,'operator',e.operator_label,
        'gross_xaf',e.gross_xaf,'net_xaf',e.net_xaf,'fees_xaf',e.fees_xaf,
        'merchant_paid_at',e.merchant_paid_at,'product_id',e.product_id,
        'references_verified',e.references_verified));
  RETURN QUERY SELECT p.id,'confirmed_dev_no_admission'::text;
END;$fn$;
REVOKE ALL ON FUNCTION pdc_private.t12_v5c_record_direct_evidence_dev(
 text,uuid,text,text,bigint,bigint,bigint,text,text,timestamptz,boolean)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;
REVOKE ALL ON FUNCTION pdc_private.t12_v5c_confirm_direct_evidence_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;
COMMIT;
