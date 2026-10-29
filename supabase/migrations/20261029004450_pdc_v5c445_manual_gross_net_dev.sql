-- PDC V5-C.44.5 : compléments BRUT / FRAIS / NET au rapprochement HUMAIN.
-- DEV UNIQUEMENT : projet rvgpnmznhzwlzqyefahd ; APRES migration 04440.
-- Aucune formule de commission intégrée. Aucune ouverture d'API publique.
-- Les pièces Tara restent à vérifier par un opérateur autorisé dans le tableau marchand.
BEGIN;

ALTER TABLE pdc_private.tara_manual_reviews_v5c44
  ADD COLUMN observed_net_xaf bigint,
  ADD COLUMN observed_fee_xaf bigint,
  ADD COLUMN evidence_origin text,
  ADD COLUMN fees_calculation_note text,
  ADD COLUMN merchant_payment_at timestamptz;
ALTER TABLE pdc_private.tara_manual_reviews_v5c44
  ADD CONSTRAINT tara_manual_fee_valid_v5c445 CHECK (
    (observed_net_xaf IS NULL AND observed_fee_xaf IS NULL)
    OR (observed_net_xaf IS NOT NULL AND observed_fee_xaf IS NOT NULL
        AND observed_net_xaf >= 0 AND observed_fee_xaf >= 0
        AND observed_net_xaf + observed_fee_xaf = observed_amount_xaf)),
  ADD CONSTRAINT tara_manual_evidence_origin_v5c445 CHECK (
    evidence_origin IS NULL OR evidence_origin = 'merchant_dashboard'),
  ADD CONSTRAINT tara_manual_fee_note_v5c445 CHECK (
    fees_calculation_note IS NULL OR length(fees_calculation_note) BETWEEN 3 AND 160);

-- Une même transaction marchande ne peut être finalisée dans deux dossiers.
CREATE UNIQUE INDEX tara_manual_final_transaction_once_v5c445
  ON pdc_private.tara_manual_reviews_v5c44(tara_reference)
  WHERE finalized_at IS NOT NULL;

-- La nouvelle RPC ne fait qu'ENREGISTRER les chiffres contrôlés par l'opérateur.
-- Elle ne change ni le statut PDC, ni le dossier membre, ni le solde.
CREATE FUNCTION pdc_private.tara_v5c44_record_settlement_dev(
  p_product_id text,
  p_operator_label text,
  p_evidence_reference text,
  p_tara_transaction_id text,
  p_reference_matches boolean,
  p_observed_gross_xaf bigint,
  p_observed_net_xaf bigint,
  p_observed_fee_xaf bigint,
  p_fees_calculation_note text,
  p_merchant_payment_at timestamptz
) RETURNS TABLE(review_id uuid,decision text,expected_amount_xaf bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_review record;
BEGIN
  IF p_observed_gross_xaf IS NULL OR p_observed_gross_xaf NOT BETWEEN 1 AND 2147483647 OR
     p_observed_net_xaf IS NULL OR p_observed_net_xaf NOT BETWEEN 0 AND 2147483647 OR
     p_observed_fee_xaf IS NULL OR p_observed_fee_xaf NOT BETWEEN 0 AND 2147483647 OR
     p_observed_net_xaf + p_observed_fee_xaf <> p_observed_gross_xaf OR
     p_fees_calculation_note IS NULL OR
       length(btrim(p_fees_calculation_note)) NOT BETWEEN 3 AND 160 OR
     p_merchant_payment_at IS NULL OR p_merchant_payment_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'PDC_MANUAL_SETTLEMENT_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_review FROM pdc_private.tara_v5c44_record_manual_review_dev(
    p_product_id,p_operator_label,p_evidence_reference,p_tara_transaction_id,
    p_reference_matches,'PAID',p_observed_gross_xaf,'XAF');

  UPDATE pdc_private.tara_manual_reviews_v5c44
  SET observed_net_xaf=p_observed_net_xaf,
      observed_fee_xaf=p_observed_fee_xaf,
      evidence_origin='merchant_dashboard',
      fees_calculation_note=btrim(p_fees_calculation_note),
      merchant_payment_at=p_merchant_payment_at
  WHERE id=v_review.review_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MANUAL_REVIEW_UPDATE_FAILED'; END IF;
  RETURN QUERY SELECT v_review.review_id,v_review.decision,v_review.expected_amount_xaf;
END;
$fn$;

-- Remplacement de la phase de confirmation : refuse toute preuve historique
-- dépourvue de brut/net/frais et toute notification sans contrôle du dashboard.
CREATE OR REPLACE FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(
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
     v_review.observed_amount_xaf<>v_review.expected_amount_xaf OR
     v_review.observed_net_xaf IS NULL OR v_review.observed_fee_xaf IS NULL OR
     v_review.observed_net_xaf+v_review.observed_fee_xaf<>v_review.observed_amount_xaf OR
     v_review.evidence_origin IS DISTINCT FROM 'merchant_dashboard' OR
     v_review.fees_calculation_note IS NULL OR v_review.merchant_payment_at IS NULL THEN
    RAISE EXCEPTION 'PDC_MANUAL_PROOF_NOT_ELIGIBLE' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=v_review.product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MANUAL_INTENT_MISSING'; END IF;
  SELECT * INTO v_pay FROM pdc_private.payment_attempts
    WHERE id=v_review.payment_id FOR UPDATE;
  IF NOT FOUND OR v_intent.payment_id IS DISTINCT FROM v_pay.id OR
     v_intent.link_state<>'issued' OR v_pay.provider<>'tara' OR
     v_pay.currency<>'XAF' OR v_intent.amount_xaf<>v_review.expected_amount_xaf OR
     v_pay.amount_minor<>v_review.expected_amount_xaf THEN
    RAISE EXCEPTION 'PDC_MANUAL_PAYMENT_CONTEXT_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_pay.status='confirmed' AND v_pay.provider_payment_id=v_review.tara_reference THEN
    IF v_review.finalized_at IS NULL THEN
      RAISE EXCEPTION 'PDC_MANUAL_PAYMENT_ALREADY_CONFIRMED' USING ERRCODE='22023';
    END IF;
    RETURN QUERY SELECT v_pay.id,'already_confirmed'::text; RETURN;
  END IF;
  IF v_pay.status NOT IN ('initiated','pending') OR v_pay.provider_payment_id IS NOT NULL OR
     v_review.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_MANUAL_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_alloc_count FROM pdc_private.payment_allocations a
    WHERE a.payment_id=v_pay.id;
  SELECT count(*) INTO v_valid_count FROM pdc_private.payment_allocations a
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
  -- Double verrouillage : reference unique et evenement unique.
  UPDATE pdc_private.payment_attempts
  SET status='confirmed',confirmed_at=now(),provider_payment_id=v_review.tara_reference
  WHERE id=v_pay.id AND status IN ('initiated','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MANUAL_CONCURRENT_CHANGE' USING ERRCODE='40001'; END IF;
  INSERT INTO pdc_private.payment_events
    (provider,provider_event_id,payment_id,event_type,verified_at)
  VALUES ('tara','manual:'||v_review.tara_reference,v_pay.id,
    'manual_dashboard_confirmation_dev',now());
  UPDATE pdc_private.tara_manual_reviews_v5c44
  SET finalized_at=now() WHERE id=v_review.id AND finalized_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MANUAL_ALREADY_FINALIZED'; END IF;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES (NULL,'payment.manual_dashboard_confirmed_dev','payment_attempts',v_pay.id,
    jsonb_build_object('manual_review_id',v_review.id,
      'operator_label',v_review.operator_label,'source','TARA_DASHBOARD_MANUAL',
      'gross_xaf',v_review.observed_amount_xaf,
      'net_xaf',v_review.observed_net_xaf,
      'fees_xaf',v_review.observed_fee_xaf,
      'fee_note',v_review.fees_calculation_note));
  RETURN QUERY SELECT v_pay.id,'confirmed_in_dev'::text;
END;
$fn$;

-- Aucune permission de lecture/écriture aux clients Supabase, aux serveurs publics
-- ni au rôle restreint du checkout et aux acteurs financiers du site.
REVOKE ALL ON FUNCTION pdc_private.tara_v5c44_record_settlement_dev(
  text,text,text,text,boolean,bigint,bigint,bigint,text,timestamptz)
FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,
     pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(uuid,text)
FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,
     pdc_api_v5b3,pdc_api_runtime_v5b3;
COMMENT ON FUNCTION pdc_private.tara_v5c44_record_settlement_dev(
  text,text,text,text,boolean,bigint,bigint,bigint,text,timestamptz)
IS 'DEV : contrôle humain BRUT, NET, FRAIS. Ne confirme aucun paiement.';
COMMIT;
