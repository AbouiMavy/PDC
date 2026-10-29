-- V5-C.45 / R4 : premier versement de cotisation dans la commande initiale.
-- A REVIEWER; Supabase DEV uniquement; ne pas déployer en production par db push.
-- Requires V5-C.23 and V5-C.21 installed. Changes existing protected functions in place.
BEGIN;
ALTER TABLE pdc_private.public_checkout_orders_v5c
 ADD COLUMN annual_paid_xaf bigint NOT NULL DEFAULT 0
 CHECK (annual_paid_xaf BETWEEN 0 AND 25000);
-- Conservation historique : les commandes déjà présentes ont annual_paid_xaf=0.
CREATE OR REPLACE FUNCTION pdc_private.tara_v5c_create_public_order(p_order jsonb)
RETURNS TABLE("paymentId" text,"quoteId" text,"payerId" text,
              "kind" text,"amountMinor" text,"currency" text,"beneficiaryIds" uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_idem text; v_digest text; v_kind text; v_method text; v_channel text;
  v_amount bigint; v_country text; v_first text; v_last text; v_email text; v_phone text;
  v_existing pdc_private.public_checkout_orders_v5c%ROWTYPE;
  v_person uuid; v_target uuid; v_payment uuid; v_provider text; v_application uuid;
  v_member jsonb; v_designations jsonb; v_bps integer; v_design_count integer;
  v_annual_paid bigint := 0; v_annual_due bigint := 0; v_annual_id uuid;
  v_birth text; v_civility text; v_category text; v_dob date;
BEGIN
  IF p_order IS NULL OR pg_catalog.jsonb_typeof(p_order)<>'object' OR
     EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_order) AS k
       WHERE k NOT IN ('kind','idempotencyKey','requestDigest','firstName','lastName',
        'email','phoneE164','country','method','messagingChannel','grossAmountXaf',
        'designations','membership')) THEN
    RAISE EXCEPTION 'PDC_PUBLIC_ORDER_INVALID' USING ERRCODE='22023';
  END IF;
  v_idem := p_order->>'idempotencyKey';
  v_digest := p_order->>'requestDigest';
  v_kind := p_order->>'kind';
  v_method := p_order->>'method';
  v_channel := p_order->>'messagingChannel';
  v_country := p_order->>'country';
  v_first := pg_catalog.btrim(p_order->>'firstName');
  v_last := pg_catalog.btrim(p_order->>'lastName');
  v_email := pg_catalog.lower(pg_catalog.btrim(p_order->>'email'));
  v_phone := p_order->>'phoneE164';
  IF v_idem IS NULL OR v_idem !~ '^[A-Za-z0-9:_-]{16,128}$' OR
     v_digest IS NULL OR v_digest !~ '^[a-f0-9]{64}$' OR
     v_kind NOT IN ('donation','individual_initial') OR v_kind IS NULL OR
     v_method NOT IN ('mobile','tara','carte','virement') OR v_method IS NULL OR
     (v_method='tara' AND v_channel NOT IN ('whatsapp','telegram','dikalo')) OR
     (v_method<>'tara' AND v_channel IS NOT NULL) OR
     (v_method='tara' AND v_channel IS NULL) OR
     v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR
     v_first IS NULL OR pg_catalog.length(v_first) NOT BETWEEN 1 AND 100 OR
     v_last IS NULL OR pg_catalog.length(v_last) NOT BETWEEN 1 AND 100 OR
     v_email IS NULL OR pg_catalog.length(v_email) NOT BETWEEN 3 AND 254 OR
     v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
     v_phone IS NULL OR v_phone !~ '^\+[1-9][0-9]{6,14}$' OR
     (p_order->>'grossAmountXaf') IS NULL OR
     (p_order->>'grossAmountXaf') !~ '^[1-9][0-9]{0,8}$' THEN
    RAISE EXCEPTION 'PDC_PUBLIC_ORDER_INVALID' USING ERRCODE='22023';
  END IF;
  v_amount := (p_order->>'grossAmountXaf')::bigint;
  IF v_amount NOT BETWEEN 100 AND 100000000 THEN
    RAISE EXCEPTION 'PDC_PUBLIC_AMOUNT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Deux requêtes concurrentes portant la même clé ne créent qu'une commande.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_idem,0));
  SELECT * INTO v_existing FROM pdc_private.public_checkout_orders_v5c
    WHERE idempotency_key=v_idem FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_digest<>v_digest THEN
      RAISE EXCEPTION 'PDC_PUBLIC_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.payment_id::text,v_existing.target_id::text,
      v_existing.payer_id::text,v_existing.order_kind,
      v_existing.gross_amount_xaf::text,'XAF'::text,
      CASE WHEN v_existing.order_kind='individual_initial'
        THEN ARRAY[v_existing.payer_id]::uuid[] ELSE ARRAY[]::uuid[] END;
    RETURN;
  END IF;

  v_member := p_order->'membership';
  v_designations := p_order->'designations';
  IF v_kind='individual_initial' THEN
    IF v_country<>'CM' OR
       pg_catalog.jsonb_typeof(v_member)<>'object' OR
       v_designations IS NOT NULL AND v_designations<>'null'::jsonb THEN
      RAISE EXCEPTION 'PDC_PUBLIC_MEMBERSHIP_INVALID' USING ERRCODE='22023';
    END IF;
    v_civility := v_member->>'civility';
    v_birth := v_member->>'birthPlace';
    v_category := v_member->>'category';
    IF v_civility NOT IN ('Madame','Monsieur') OR v_civility IS NULL OR
       v_birth IS NULL OR pg_catalog.length(pg_catalog.btrim(v_birth)) NOT BETWEEN 1 AND 160 OR
       v_category NOT IN ('rural_etudiant','urbain','conseil_national','ben') OR v_category IS NULL OR
       (v_member->>'dateOfBirth') IS NULL OR
       (v_member->>'dateOfBirth') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'PDC_PUBLIC_MEMBERSHIP_INVALID' USING ERRCODE='22023';
    END IF;
    -- La base recalcule la quote, aucun prix libre ni un 'mode' non autorisé.
    IF (v_member->>'annualPaymentXaf') IS NULL OR
       (v_member->>'annualPaymentXaf') !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'PDC_PUBLIC_ANNUAL_INVALID' USING ERRCODE='22023';
    END IF;
    v_annual_paid := (v_member->>'annualPaymentXaf')::bigint;
    v_annual_due := CASE v_category
      WHEN 'rural_etudiant' THEN 5000 WHEN 'urbain' THEN 12000
      WHEN 'conseil_national' THEN 20000 WHEN 'ben' THEN 25000 ELSE 0 END;
    IF v_annual_due=0 OR v_annual_paid>v_annual_due OR
       v_amount <> 2000+v_annual_paid THEN
      RAISE EXCEPTION 'PDC_PUBLIC_ANNUAL_INVALID' USING ERRCODE='22023';
    END IF;
    v_dob := (v_member->>'dateOfBirth')::date;
    IF v_dob >= CURRENT_DATE THEN
      RAISE EXCEPTION 'PDC_PUBLIC_MEMBERSHIP_INVALID' USING ERRCODE='22023';
    END IF;
  ELSE
    IF v_member IS NOT NULL AND v_member<>'null'::jsonb THEN
      RAISE EXCEPTION 'PDC_PUBLIC_DONATION_INVALID' USING ERRCODE='22023';
    END IF;
    IF pg_catalog.jsonb_typeof(v_designations)<>'array' OR
       pg_catalog.jsonb_array_length(v_designations) NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'PDC_PUBLIC_DESIGNATION_INVALID' USING ERRCODE='22023';
    END IF;
    SELECT pg_catalog.count(*),COALESCE(pg_catalog.sum((x->>'percentBps')::integer),0)
      INTO v_design_count,v_bps
      FROM pg_catalog.jsonb_array_elements(v_designations) AS x
      WHERE x->>'purpose' IN ('libre','scrutateurs','cautionnements','campagne','autres')
        AND x->>'percentBps' ~ '^[1-9][0-9]{0,4}$'
        AND (x->>'percentBps')::integer<=10000;
    IF v_design_count <> pg_catalog.jsonb_array_length(v_designations) OR v_bps<>10000 OR
       EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_designations) x
         GROUP BY x->>'purpose' HAVING pg_catalog.count(*)>1) OR
       (pg_catalog.jsonb_array_length(v_designations)>1 AND
         EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_designations) x WHERE x->>'purpose'='libre')) THEN
      RAISE EXCEPTION 'PDC_PUBLIC_DESIGNATION_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

  -- Aucune tentative de fusion par e-mail : les doublons d'identité seront
  -- examinés administrativement, pas résolus par une comparaison fragile.
  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,
                                  country_of_residence,email,phone_e164)
  VALUES(CASE WHEN v_kind='individual_initial' THEN v_civility ELSE NULL END,
         v_last,v_first,CASE WHEN v_kind='individual_initial' THEN v_dob ELSE NULL END,
         CASE WHEN v_kind='individual_initial' THEN v_birth ELSE NULL END,
         v_country,v_email,v_phone)
  RETURNING id INTO v_person;

  IF v_kind='donation' THEN
    INSERT INTO pdc_private.donations(reference,person_id,currency,amount_minor,frequency,status)
      VALUES('WEB-DON-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
             v_person,'XAF',v_amount,'once','awaiting_payment')
      RETURNING id INTO v_target;
    INSERT INTO pdc_private.donation_designations(donation_id,purpose,percent)
      SELECT v_target,x->>'purpose',((x->>'percentBps')::integer/100.0)::numeric(5,2)
        FROM pg_catalog.jsonb_array_elements(v_designations) x;
  ELSE
    INSERT INTO pdc_private.membership_applications(reference,person_id,application_type,
      residence_group,category_code,submission_status)
      VALUES('WEB-ADH-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
             v_person,'initial','cameroon',v_category,'draft')
      RETURNING id INTO v_application;
    -- Textes statutaires toujours provisoires : ne PAS inventer un consentement
    -- juridiquement valide ni placer la candidature en état submitted.
    -- Conserver le lien dossier / obligation, indispensable à l'admission après
    -- validation des textes et confirmation indépendante du paiement.
    INSERT INTO pdc_private.dues_obligations(application_id,person_id,kind,category_code,amount_due_minor,currency,status)
      VALUES(v_application,v_person,'initial_membership_fee',v_category,2000,'XAF','open')
      RETURNING id INTO v_target;
    IF v_annual_due>0 THEN
      INSERT INTO pdc_private.dues_obligations(application_id,person_id,kind,
        category_code,fiscal_year,amount_due_minor,currency,status)
      VALUES(v_application,v_person,'annual_dues',v_category,
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,v_annual_due,'XAF','open')
      RETURNING id INTO v_annual_id;
    END IF;
  END IF;
  v_provider := CASE v_method WHEN 'virement' THEN 'bank_transfer' ELSE 'tara' END;
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status)
    VALUES('WEB-PAY-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
           v_person,v_provider,'XAF',v_amount,'initiated')
    RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,donation_id,amount_minor)
    VALUES(v_payment,CASE WHEN v_kind='individual_initial' THEN v_target ELSE NULL END,
           CASE WHEN v_kind='donation' THEN v_target ELSE NULL END,
            CASE WHEN v_kind='individual_initial' THEN 2000 ELSE v_amount END);
  IF v_annual_paid>0 AND v_annual_id IS NOT NULL THEN
    INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
      VALUES(v_payment,v_annual_id,v_annual_paid);
  END IF;
  INSERT INTO pdc_private.public_checkout_orders_v5c
    (idempotency_key,request_digest,order_kind,payment_method,messaging_channel,
     payer_id,target_id,payment_id,gross_amount_xaf,annual_paid_xaf)
    VALUES(v_idem,v_digest,v_kind,v_method,v_channel,v_person,v_target,v_payment,v_amount,v_annual_paid);
  RETURN QUERY SELECT v_payment::text,v_target::text,v_person::text,v_kind,
        v_amount::text,'XAF'::text,
        CASE WHEN v_kind='individual_initial' THEN ARRAY[v_person]::uuid[] ELSE ARRAY[]::uuid[] END;
END;
$fn$;

CREATE OR REPLACE FUNCTION pdc_private.tara_v5c_reserve_intent(
  p_product_id text,p_payment_id uuid,p_quote_id uuid,p_payer_id uuid,
  p_idempotency_key text,p_amount_xaf bigint
) RETURNS TABLE(
  "productId" text,"paymentId" text,"quoteId" text,"payerId" text,
  "idempotencyKey" text,"amountXaf" text,currency char(3),
  "linkState" text,"generalLink" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_payment pdc_private.payment_attempts%ROWTYPE;
        v_target record;
        v_row pdc_private.tara_checkout_intents_v5c%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_product_id !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
     p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9:_-]{16,128}$' OR
     p_amount_xaf IS NULL OR p_amount_xaf<=0 OR p_amount_xaf>2147483647 OR
     p_payment_id IS NULL OR p_quote_id IS NULL OR p_payer_id IS NULL THEN
    RAISE EXCEPTION 'PDC_TARA_INTENT_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_payment FROM pdc_private.payment_attempts
    WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.payer_id<>p_payer_id OR v_payment.provider<>'tara' OR
     v_payment.currency<>'XAF' OR v_payment.amount_minor<>p_amount_xaf OR
     v_payment.status NOT IN ('initiated','pending') OR
     v_payment.provider_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_TARA_PAYMENT_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT pg_catalog.count(*) AS n,
    COALESCE(pg_catalog.sum(a.amount_minor),0) AS total,
    COALESCE(pg_catalog.bool_and(COALESCE(
      (a.obligation_id=p_quote_id AND EXISTS (
        SELECT 1 FROM pdc_private.dues_obligations d
        WHERE d.id=p_quote_id AND d.person_id=p_payer_id AND d.currency='XAF'
          AND d.kind='initial_membership_fee' AND d.status='open'
          AND d.amount_due_minor>=a.amount_minor
      )) OR
      (a.obligation_id IS NOT NULL AND a.obligation_id<>p_quote_id AND EXISTS (
        SELECT 1 FROM pdc_private.dues_obligations d
        JOIN pdc_private.dues_obligations origin ON origin.id=p_quote_id
        WHERE d.id=a.obligation_id AND d.person_id=p_payer_id
          AND origin.person_id=p_payer_id AND origin.application_id=d.application_id
          AND d.kind='annual_dues' AND d.currency='XAF' AND d.status='open'
          AND d.amount_due_minor>=a.amount_minor
      )) OR
      (a.donation_id=p_quote_id AND EXISTS (
        SELECT 1 FROM pdc_private.donations d
        WHERE d.id=p_quote_id AND d.person_id=p_payer_id AND d.currency='XAF'
          AND d.status='awaiting_payment' AND d.amount_minor=p_amount_xaf
          AND (SELECT COALESCE(pg_catalog.sum(z.percent),0)
               FROM pdc_private.donation_designations z WHERE z.donation_id=d.id)=100
      )),false)),false) AS target_ok
    INTO v_target FROM pdc_private.payment_allocations a
    WHERE a.payment_id=p_payment_id;
  IF v_target.n NOT IN (1,2) OR v_target.total<>p_amount_xaf OR NOT v_target.target_ok OR
     NOT EXISTS (SELECT 1 FROM pdc_private.payment_allocations a
       WHERE a.payment_id=p_payment_id
         AND (a.obligation_id=p_quote_id OR a.donation_id=p_quote_id)) THEN
    RAISE EXCEPTION 'PDC_TARA_QUOTE_NOT_SUPPORTED' USING ERRCODE='23514';
  END IF;
  INSERT INTO pdc_private.tara_checkout_intents_v5c
    (product_id,payment_id,quote_id,payer_id,idempotency_key,amount_xaf,currency)
  VALUES(p_product_id,p_payment_id,p_quote_id,p_payer_id,p_idempotency_key,p_amount_xaf,'XAF')
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO v_row FROM pdc_private.tara_checkout_intents_v5c c
    WHERE c.idempotency_key=p_idempotency_key FOR UPDATE;
  IF NOT FOUND OR (v_row.payment_id,v_row.quote_id,v_row.payer_id,v_row.amount_xaf)
        IS DISTINCT FROM (p_payment_id,p_quote_id,p_payer_id,p_amount_xaf) THEN
    RAISE EXCEPTION 'PDC_TARA_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT v_row.product_id,v_row.payment_id::text,v_row.quote_id::text,
    v_row.payer_id::text,v_row.idempotency_key,v_row.amount_xaf::text,
    v_row.currency,v_row.link_state,v_row.general_link;
END;
$fn$;

CREATE OR REPLACE FUNCTION pdc_private.tara_v5c44_confirm_manual_payment_dev(
  p_review_id uuid,p_explicit_confirmation text
) RETURNS TABLE(payment_id uuid,action text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE
  v_review pdc_private.tara_manual_reviews_v5c44%ROWTYPE;
  v_pay pdc_private.payment_attempts%ROWTYPE;
  v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;
  v_alloc_count bigint;
  v_alloc_sum bigint;
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
  SELECT pg_catalog.count(*),COALESCE(pg_catalog.sum(a.amount_minor),0)
    INTO v_alloc_count,v_alloc_sum
  FROM pdc_private.payment_allocations a WHERE a.payment_id=v_pay.id;
  SELECT pg_catalog.count(*) INTO v_valid_count FROM pdc_private.payment_allocations a
  LEFT JOIN pdc_private.donations d ON d.id=a.donation_id
  LEFT JOIN pdc_private.dues_obligations o ON o.id=a.obligation_id
  WHERE a.payment_id=v_pay.id AND a.amount_minor>0 AND
    ((d.id IS NOT NULL AND d.person_id=v_pay.payer_id AND d.currency=v_pay.currency
       AND d.amount_minor=a.amount_minor AND d.status='awaiting_payment')
     OR (o.id IS NOT NULL AND o.person_id=v_pay.payer_id AND o.currency=v_pay.currency
       AND o.amount_due_minor>=a.amount_minor AND o.status='open'));
  IF v_alloc_count NOT IN (1,2) OR v_valid_count<>v_alloc_count OR
     v_alloc_sum<>v_pay.amount_minor OR
     (v_alloc_count=2 AND NOT EXISTS (
       SELECT 1 FROM pdc_private.payment_allocations a0
       JOIN pdc_private.dues_obligations init ON init.id=a0.obligation_id
       JOIN pdc_private.payment_allocations a1
         ON a1.payment_id=a0.payment_id AND a1.id<>a0.id
       JOIN pdc_private.dues_obligations annual ON annual.id=a1.obligation_id
       WHERE a0.payment_id=v_pay.id AND a0.amount_minor=2000
         AND init.kind='initial_membership_fee'
         AND annual.kind='annual_dues' AND annual.fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::integer
         AND init.application_id=annual.application_id AND init.person_id=v_pay.payer_id
         AND annual.person_id=v_pay.payer_id AND a1.amount_minor<=annual.amount_due_minor
     )) THEN
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


REVOKE ALL ON FUNCTION pdc_private.tara_v5c_create_public_order(jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_create_public_order(jsonb)
 TO pdc_tara_v5c_writer;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)
 TO pdc_tara_v5c_writer;
COMMIT;
