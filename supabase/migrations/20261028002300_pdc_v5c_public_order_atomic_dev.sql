-- V5-C.23 — commandes publiques, DEV uniquement. NE PAS APPLIQUER sur la production.
-- Pré-requis : migrations 001..021, rôle pdc_tara_v5c_writer (PASSWORD NULL).
-- Pas de route ouverte, pas de lien fournisseur, pas d'encaissement et pas d'admission.
BEGIN;
CREATE TABLE pdc_private.public_checkout_orders_v5c (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE
    CHECK (idempotency_key ~ '^[A-Za-z0-9:_-]{16,128}$'),
  request_digest char(64) NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  order_kind text NOT NULL CHECK (order_kind IN ('donation','individual_initial')),
  payment_method text NOT NULL CHECK (payment_method IN ('mobile','tara','carte','virement')),
  messaging_channel text CHECK (messaging_channel IS NULL OR messaging_channel IN ('whatsapp','telegram','dikalo')),
  payer_id uuid NOT NULL REFERENCES pdc_private.people(id),
  target_id uuid NOT NULL,
  payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
  gross_amount_xaf bigint NOT NULL CHECK (gross_amount_xaf BETWEEN 100 AND 100000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((payment_method='tara')=(messaging_channel IS NOT NULL))
);
ALTER TABLE pdc_private.public_checkout_orders_v5c ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.public_checkout_orders_v5c FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE pdc_private.public_checkout_orders_v5c IS
  'DEV uniquement; ordres publics en attente de règlement. Montant brut conservé sans déduction de frais.';

-- Une invocation de cette fonction représente UNE transaction SQL atomique.
-- L'API devra appliquer CAPTCHA, limite de débit et justification de nationalité.
-- L'objet JSON provient uniquement de preparePublicOrderRequest et du dépôt serveur.
CREATE FUNCTION pdc_private.tara_v5c_create_public_order(p_order jsonb)
RETURNS TABLE("paymentId" text,"quoteId" text,"payerId" text,
              "kind" text,"amountMinor" text,"currency" text,"beneficiaryIds" uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_idem text; v_digest text; v_kind text; v_method text; v_channel text;
  v_amount bigint; v_country text; v_first text; v_last text; v_email text; v_phone text;
  v_existing pdc_private.public_checkout_orders_v5c%ROWTYPE;
  v_person uuid; v_target uuid; v_payment uuid; v_provider text; v_application uuid;
  v_member jsonb; v_designations jsonb; v_bps integer; v_design_count integer;
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
    IF v_country<>'CM' OR v_amount<>2000 OR
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
  END IF;
  v_provider := CASE v_method WHEN 'virement' THEN 'bank_transfer' ELSE 'tara' END;
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status)
    VALUES('WEB-PAY-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
           v_person,v_provider,'XAF',v_amount,'initiated')
    RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,donation_id,amount_minor)
    VALUES(v_payment,CASE WHEN v_kind='individual_initial' THEN v_target ELSE NULL END,
           CASE WHEN v_kind='donation' THEN v_target ELSE NULL END,v_amount);
  INSERT INTO pdc_private.public_checkout_orders_v5c
    (idempotency_key,request_digest,order_kind,payment_method,messaging_channel,
     payer_id,target_id,payment_id,gross_amount_xaf)
    VALUES(v_idem,v_digest,v_kind,v_method,v_channel,v_person,v_target,v_payment,v_amount);
  RETURN QUERY SELECT v_payment::text,v_target::text,v_person::text,v_kind,
        v_amount::text,'XAF'::text,
        CASE WHEN v_kind='individual_initial' THEN ARRAY[v_person]::uuid[] ELSE ARRAY[]::uuid[] END;
END;
$fn$;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_create_public_order(jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_create_public_order(jsonb)
  TO pdc_tara_v5c_writer;
COMMIT;
