-- PDC V5-C.44.4 : rapprochement MANUEL des paiements TaraMoney, DEV UNIQUEMENT.
-- A executer APRES revue sur Supabase DEV (ref rvgpnmznhzwlzqyefahd).
-- Aucun endpoint public, aucune signature webhook prétendue, aucune admission.
-- Les fonctions SECURITY INVOKER ne sont exécutables qu'avec les droits
-- privilégiés du SQL Editor ; aucun GRANT au rôle du serveur web.
BEGIN;
CREATE TABLE pdc_private.tara_manual_reviews_v5c44 (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  product_id text NOT NULL REFERENCES pdc_private.tara_checkout_intents_v5c(product_id),
  payment_id uuid NOT NULL REFERENCES pdc_private.payment_attempts(id),
  operator_label text NOT NULL CHECK (pg_catalog.length(operator_label) BETWEEN 3 AND 80),
  evidence_reference text NOT NULL CHECK (pg_catalog.length(evidence_reference) BETWEEN 8 AND 180),
  tara_reference text NOT NULL CHECK (pg_catalog.length(tara_reference) BETWEEN 8 AND 200),
  reference_matches boolean NOT NULL,
  observed_status text NOT NULL CHECK (observed_status IN ('PAID','PENDING','FAILED','CANCELLED','UNKNOWN')),
  observed_amount_xaf bigint NOT NULL CHECK (observed_amount_xaf BETWEEN 0 AND 2147483647),
  observed_currency text NOT NULL CHECK (observed_currency IN ('XAF','EUR')),
  expected_amount_xaf bigint NOT NULL CHECK (expected_amount_xaf BETWEEN 1 AND 2147483647),
  decision text NOT NULL CHECK (decision IN ('matched_for_operator_confirmation','disputed','awaiting_payment')),
  checked_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  finalized_at timestamptz,
  CHECK (finalized_at IS NULL OR decision='matched_for_operator_confirmation')
);
CREATE INDEX tara_manual_reviews_v5c44_product ON
  pdc_private.tara_manual_reviews_v5c44(product_id,checked_at DESC);
ALTER TABLE pdc_private.tara_manual_reviews_v5c44 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.tara_manual_reviews_v5c44
  FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,
       pdc_api_v5b3,pdc_api_runtime_v5b3;
COMMENT ON TABLE pdc_private.tara_manual_reviews_v5c44 IS
  'DEV: journal privé de constats humains; ne prouve pas à lui seul un paiement.';

-- Phase 1: saisie d'un CONSTAT du tableau de bord Tara.
-- L'agent doit comparer la référence PDC, le statut, le montant et la devise.
CREATE FUNCTION pdc_private.tara_v5c44_record_manual_review_dev(
  p_product_id text,p_operator_label text,p_evidence_reference text,
  p_tara_reference text,p_reference_matches boolean,p_observed_status text,
  p_observed_amount_xaf bigint,p_observed_currency text
) RETURNS TABLE(review_id uuid,decision text,expected_amount_xaf bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;
  v_pay pdc_private.payment_attempts%ROWTYPE;
  v_decision text;
  v_review uuid;
BEGIN
  IF p_product_id IS NULL OR p_product_id !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
     p_operator_label IS NULL OR pg_catalog.length(pg_catalog.btrim(p_operator_label)) NOT BETWEEN 3 AND 80 OR
     p_evidence_reference IS NULL OR pg_catalog.length(pg_catalog.btrim(p_evidence_reference)) NOT BETWEEN 8 AND 180 OR
     p_tara_reference IS NULL OR pg_catalog.length(pg_catalog.btrim(p_tara_reference)) NOT BETWEEN 8 AND 200 OR
     p_reference_matches IS NULL OR
     p_observed_status IS NULL OR p_observed_status NOT IN ('PAID','PENDING','FAILED','CANCELLED','UNKNOWN') OR
     p_observed_amount_xaf IS NULL OR p_observed_amount_xaf NOT BETWEEN 0 AND 2147483647 OR
     p_observed_currency IS NULL OR p_observed_currency NOT IN ('XAF','EUR') THEN
    RAISE EXCEPTION 'PDC_MANUAL_REVIEW_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MANUAL_PRODUCT_NOT_FOUND' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_pay FROM pdc_private.payment_attempts WHERE id=v_intent.payment_id;
  IF NOT FOUND OR v_pay.provider<>'tara' OR v_pay.currency<>'XAF' OR
    v_pay.amount_minor<>v_intent.amount_xaf OR v_intent.link_state<>'issued' THEN
    RAISE EXCEPTION 'PDC_MANUAL_CONTEXT_INVALID' USING ERRCODE='22023';
  END IF;
  v_decision := CASE
    WHEN p_observed_status<>'PAID' THEN 'awaiting_payment'
    WHEN p_reference_matches IS TRUE AND
         p_observed_amount_xaf=v_intent.amount_xaf AND p_observed_currency='XAF'
         THEN 'matched_for_operator_confirmation'
    ELSE 'disputed' END;
  INSERT INTO pdc_private.tara_manual_reviews_v5c44
   (product_id,payment_id,operator_label,evidence_reference,tara_reference,
    reference_matches,observed_status,observed_amount_xaf,observed_currency,
    expected_amount_xaf,decision)
  VALUES (p_product_id,v_pay.id,pg_catalog.btrim(p_operator_label),
          pg_catalog.btrim(p_evidence_reference),pg_catalog.btrim(p_tara_reference),
          p_reference_matches,p_observed_status,p_observed_amount_xaf,
          p_observed_currency,v_intent.amount_xaf,v_decision)
  RETURNING id INTO v_review;
  RETURN QUERY SELECT v_review,v_decision,v_intent.amount_xaf;
END;
$fn$;

-- Phase 2: décision HUMAINE explicite. Une seule transition SQL atomique.
-- Cette RPC reste à utiliser via SQL Editor DEV après contrôle visuel
-- des pièces et de la référence Tara, jamais depuis le navigateur.
CREATE FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(
  p_review_id uuid,p_explicit_confirmation text
) RETURNS TABLE(payment_id uuid,action text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_review pdc_private.tara_manual_reviews_v5c44%ROWTYPE;
  v_pay pdc_private.payment_attempts%ROWTYPE;
  v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;
  v_alloc_count bigint;
  v_valid_count bigint;
BEGIN
  IF p_review_id IS NULL OR p_explicit_confirmation IS DISTINCT FROM
     'JE_CONFIRME_APRES_CONTROLE_TARAMONEY' THEN
     RAISE EXCEPTION 'PDC_MANUAL_CONFIRMATION_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_review FROM pdc_private.tara_manual_reviews_v5c44
    WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND OR v_review.decision<>'matched_for_operator_confirmation' OR
     v_review.observed_status<>'PAID' OR v_review.observed_currency<>'XAF' OR
     v_review.reference_matches IS DISTINCT FROM true OR
     v_review.observed_amount_xaf<>v_review.expected_amount_xaf THEN
     RAISE EXCEPTION 'PDC_MANUAL_PROOF_NOT_ELIGIBLE' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=v_review.product_id FOR UPDATE;
  SELECT * INTO v_pay FROM pdc_private.payment_attempts
    WHERE id=v_review.payment_id FOR UPDATE;
  IF NOT FOUND OR v_intent.payment_id IS DISTINCT FROM v_pay.id OR
     v_intent.link_state<>'issued' OR v_pay.provider<>'tara' OR
     v_pay.currency<>'XAF' OR
     v_intent.amount_xaf<>v_review.expected_amount_xaf OR
     v_pay.amount_minor<>v_review.expected_amount_xaf THEN
     RAISE EXCEPTION 'PDC_MANUAL_PAYMENT_CONTEXT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_pay.status='confirmed' AND v_pay.provider_payment_id=v_review.tara_reference THEN
    RETURN QUERY SELECT v_pay.id,'already_confirmed'::text; RETURN;
  END IF;
  IF v_pay.status NOT IN ('initiated','pending') OR v_pay.provider_payment_id IS NOT NULL OR
     v_review.finalized_at IS NOT NULL THEN
     RAISE EXCEPTION 'PDC_MANUAL_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='22023';
  END IF;
  SELECT pg_catalog.count(*) INTO v_alloc_count FROM pdc_private.payment_allocations a
    WHERE a.payment_id=v_pay.id;
  SELECT pg_catalog.count(*) INTO v_valid_count
  FROM pdc_private.payment_allocations a
  LEFT JOIN pdc_private.donations d ON d.id=a.donation_id
  LEFT JOIN pdc_private.dues_obligations o ON o.id=a.obligation_id
  WHERE a.payment_id=v_pay.id AND a.amount_minor=v_pay.amount_minor AND
    ((d.id IS NOT NULL AND d.person_id=v_pay.payer_id AND d.currency=v_pay.currency
       AND d.amount_minor=v_pay.amount_minor AND d.status='awaiting_payment')
     OR (o.id IS NOT NULL AND o.person_id=v_pay.payer_id AND o.currency=v_pay.currency
       AND o.amount_due_minor>=v_pay.amount_minor AND o.status='open'));
  IF v_alloc_count<>1 OR v_valid_count<>1 THEN
    RAISE EXCEPTION 'PDC_MANUAL_ALLOCATION_INVALID' USING ERRCODE='22023';
  END IF;
  -- La contrainte unique (provider,provider_payment_id) interdit le double comptage.
  UPDATE pdc_private.payment_attempts
    SET status='confirmed',confirmed_at=pg_catalog.now(),
        provider_payment_id=v_review.tara_reference
    WHERE id=v_pay.id AND status IN ('initiated','pending');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDC_MANUAL_CONCURRENT_CHANGE' USING ERRCODE='40001';
  END IF;
  INSERT INTO pdc_private.payment_events
    (provider,provider_event_id,payment_id,event_type,verified_at)
    VALUES ('tara','manual:'||v_review.tara_reference,v_pay.id,
      'manual_dashboard_confirmation_dev',pg_catalog.now());
  UPDATE pdc_private.tara_manual_reviews_v5c44
    SET finalized_at=pg_catalog.now() WHERE id=v_review.id;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
    VALUES (NULL,'payment.manual_dashboard_confirmed_dev','payment_attempts',v_pay.id,
      pg_catalog.jsonb_build_object('manual_review_id',v_review.id,
        'operator_label',v_review.operator_label,
        'source','TARA_DASHBOARD_MANUAL',
        'observed_amount_xaf',v_review.observed_amount_xaf));
  RETURN QUERY SELECT v_pay.id,'confirmed_in_dev'::text;
END;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.tara_v5c44_record_manual_review_dev(
 text,text,text,text,boolean,text,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_api_v5b3,pdc_api_runtime_v5b3;
-- AUCUN GRANT : exclusivement SQL Editor privilégié sur Supabase DEV.
COMMIT;
