-- PDC R5 consolidé, DEV uniquement. Additif après 04510.
-- AUCUNE commande Tara n'est émise; aucun paiement ni membre n'est confirmé.
-- Appliquer uniquement après vérification de l'historique des migrations DEV.
BEGIN;
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_r5_intake_writer') THEN
    CREATE ROLE pdc_r5_intake_writer NOLOGIN;
  END IF;
END $r$;
GRANT USAGE ON SCHEMA pdc_private TO pdc_r5_intake_writer;
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_r5_photo_writer') THEN
    CREATE ROLE pdc_r5_photo_writer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $r$;
GRANT USAGE ON SCHEMA pdc_private TO pdc_r5_photo_writer;

CREATE TABLE pdc_private.r5_policy_versions (
  version text PRIMARY KEY CHECK (length(version) BETWEEN 8 AND 100),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  active boolean NOT NULL DEFAULT false,
  verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX r5_one_policy_version_active ON pdc_private.r5_policy_versions(active) WHERE active;
-- Doit être renseigné manuellement après vérification des textes réellement présentés.

CREATE TABLE pdc_private.r5_diaspora_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  formula text NOT NULL CHECK (formula IN ('simple','reduit','couple')),
  payer_id uuid NOT NULL REFERENCES pdc_private.people(id),
  payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
  fx_rate_xaf_per_eur bigint NOT NULL DEFAULT 656 CHECK (fx_rate_xaf_per_eur=656),
  fx_round_to_xaf integer NOT NULL DEFAULT 10 CHECK (fx_round_to_xaf=10),
  intake_session_sha256 text NOT NULL CHECK (intake_session_sha256 ~ '^[a-f0-9]{64}$'),
  policy_version text NOT NULL REFERENCES pdc_private.r5_policy_versions(version),
  legal_amount_eur_cents bigint NOT NULL CHECK (legal_amount_eur_cents IN (1500,3000,4000)),
  provider_amount_xaf bigint NOT NULL CHECK (provider_amount_xaf > 0),
  country_code char(2) NOT NULL CHECK (country_code <> 'CM'),
  territory_snapshot jsonb NOT NULL,
  donation_conversion_accepted_at timestamptz,
  donation_clause_version text,
  partner_response_deadline timestamptz,
  partner_response_state text CHECK(partner_response_state IN ('pending','confirmed','declined','expired')),
  CHECK ((formula='couple' AND donation_conversion_accepted_at IS NOT NULL AND donation_clause_version='R5-1-14J-30-10'
    AND partner_response_deadline IS NOT NULL AND partner_response_state IS NOT NULL) OR
    (formula<>'couple' AND donation_conversion_accepted_at IS NULL AND donation_clause_version IS NULL
    AND partner_response_deadline IS NULL AND partner_response_state IS NULL)),
  status text NOT NULL DEFAULT 'submitted_pending_payment' CHECK (status IN
    ('submitted_pending_payment','awaiting_financial_review','payment_verified','under_administrative_review','cancelled')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  payment_method text CHECK(payment_method IN ('mobile','tara','carte')),
  messaging_channel text CHECK(messaging_channel IN ('general','whatsapp','telegram','dikalo')),
  reconciled_at timestamptz,
  CHECK ((payment_method='tara' AND messaging_channel IS NOT NULL) OR
         (payment_method IN ('mobile','carte') AND messaging_channel IS NULL) OR
         (payment_method IS NULL AND messaging_channel IS NULL)),
  CHECK ((formula='simple' AND legal_amount_eur_cents=3000) OR
         (formula='reduit' AND legal_amount_eur_cents=1500) OR
         (formula='couple' AND legal_amount_eur_cents=4000))
);
CREATE TABLE pdc_private.r5_diaspora_beneficiaries (
  order_id uuid NOT NULL REFERENCES pdc_private.r5_diaspora_orders(id),
  slot text NOT NULL CHECK (slot IN ('member','partner')),
  person_id uuid NOT NULL REFERENCES pdc_private.people(id),
  application_id uuid NOT NULL UNIQUE REFERENCES pdc_private.membership_applications(id),
  card_request_id uuid UNIQUE REFERENCES pdc_private.membership_card_requests(id),
  consent_at timestamptz,
  PRIMARY KEY (order_id,slot),
  UNIQUE (order_id,person_id)
);
CREATE TABLE pdc_private.r5_financial_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES pdc_private.r5_diaspora_orders(id),
  product_id text NOT NULL UNIQUE CHECK (product_id ~ '^PDC_[A-Za-z0-9_-]{24}$'),
  merchant_transaction_id text NOT NULL UNIQUE CHECK (length(merchant_transaction_id) BETWEEN 8 AND 150),
  observed_status text NOT NULL CHECK (observed_status IN ('PAID','FAILED','PENDING','DISPUTED')),
  gross_xaf bigint NOT NULL CHECK (gross_xaf > 0),
  net_xaf bigint NOT NULL CHECK (net_xaf >= 0),
  fees_xaf bigint NOT NULL CHECK (fees_xaf >= 0),
  evidence_origin text NOT NULL CHECK (evidence_origin='merchant_dashboard'),
  evidence_reference text NOT NULL CHECK (length(evidence_reference) BETWEEN 8 AND 300),
  merchant_paid_at timestamptz NOT NULL,
  references_verified boolean NOT NULL CHECK (references_verified IS TRUE),
  operator_label text NOT NULL CHECK (length(operator_label) BETWEEN 3 AND 150),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CHECK (gross_xaf=net_xaf+fees_xaf)
);
CREATE UNIQUE INDEX r5_single_verified_settlement_per_order ON pdc_private.r5_financial_reconciliations(order_id) WHERE verified_at IS NOT NULL;

CREATE TABLE pdc_private.r5_provisional_photo_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  slot text NOT NULL,
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (order_id,slot) REFERENCES pdc_private.r5_diaspora_beneficiaries(order_id,slot),
  CHECK (expires_at > issued_at AND expires_at <= issued_at+INTERVAL '15 minutes')
);
CREATE TABLE pdc_private.r5_provisional_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  slot text NOT NULL,
  grant_id uuid NOT NULL UNIQUE REFERENCES pdc_private.r5_provisional_photo_grants(id),
  object_key text NOT NULL UNIQUE,
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  bytes integer CHECK (bytes BETWEEN 1 AND 5242880),
  width integer CHECK (width BETWEEN 1 AND 10000),
  height integer CHECK (height BETWEEN 1 AND 10000),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','stored','purged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  purged_at timestamptz,
  FOREIGN KEY (order_id,slot) REFERENCES pdc_private.r5_diaspora_beneficiaries(order_id,slot)
);
CREATE UNIQUE INDEX r5_one_active_photo_slot ON pdc_private.r5_provisional_photos(order_id,slot) WHERE state IN ('reserved','stored');

DO $r$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['r5_policy_versions','r5_diaspora_orders',
  'r5_diaspora_beneficiaries','r5_financial_reconciliations','r5_provisional_photo_grants','r5_provisional_photos'] LOOP
    EXECUTE format('ALTER TABLE pdc_private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE pdc_private.%I FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer',t);
  END LOOP;
END $r$;

CREATE FUNCTION pdc_private.r5_create_diaspora_dossier_dev(p jsonb)
RETURNS TABLE(order_id uuid,payment_id uuid,provider_amount_xaf text,legal_amount_eur_cents text,beneficiary_count integer,session_valid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_policy text; v_old pdc_private.r5_diaspora_orders%ROWTYPE;
  v_idem text; v_digest text; v_formula text; v_country text;
  v_eur bigint; v_xaf bigint; v_expected bigint; v_session text;
  v_person uuid; v_payer uuid; v_payment uuid; v_order uuid;
  v_app uuid; v_card uuid; v_slot text; v_data jsonb; v_n integer:=0;
  v_request_card boolean; v_format text; v_date date;
BEGIN
  IF p IS NULL OR pg_catalog.jsonb_typeof(p)<>'object' OR
    EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p) k WHERE k NOT IN
     ('idempotencyKey','formula','country','member','partner','requestCard','cardFormat','territory','donationConversionAccepted',
      'intakeSessionSha256','legalAmountEurCents','providerAmountXaf',
      'requestDigest','legalCurrency','providerCurrency','paymentConfirmed','membershipGranted','cardIssued')) THEN
    RAISE EXCEPTION 'PDC_R5_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  v_idem:=p->>'idempotencyKey'; v_digest:=p->>'requestDigest';
  v_session:=p->>'intakeSessionSha256';
  v_formula:=p->>'formula'; v_country:=p->>'country';
  IF v_idem IS NULL OR v_idem !~ '^[A-Za-z0-9:_-]{16,128}$' OR
     v_digest IS NULL OR v_digest !~ '^[a-f0-9]{64}$' OR
     v_country IS NULL OR v_country !~ '^[A-Z]{2}$' OR v_country='CM' OR
     v_formula NOT IN ('simple','reduit','couple') OR v_formula IS NULL OR
     v_session IS NULL OR v_session !~ '^[a-f0-9]{64}$' OR
     p->>'providerCurrency'<>'XAF' OR p->>'legalCurrency'<>'EUR' OR
     p->>'paymentConfirmed'<>'false' OR p->>'membershipGranted'<>'false' OR
     p->>'cardIssued'<>'false' OR
     pg_catalog.jsonb_typeof(p->'donationConversionAccepted')<>'boolean' OR
     (v_formula='couple') IS DISTINCT FROM ((p->>'donationConversionAccepted')='true') OR
     pg_catalog.jsonb_typeof(p->'requestCard')<>'boolean' OR
     pg_catalog.jsonb_typeof(p->'territory')<>'object' OR
     pg_catalog.jsonb_typeof(p->'member')<>'object' OR
     (v_formula='couple') IS DISTINCT FROM (pg_catalog.jsonb_typeof(p->'partner')='object') THEN
    RAISE EXCEPTION 'PDC_R5_ORDER_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('r5:'||v_idem,0));
  SELECT * INTO v_old FROM pdc_private.r5_diaspora_orders WHERE idempotency_key=v_idem FOR UPDATE;
  IF FOUND THEN
    IF v_old.request_digest<>v_digest THEN
      RAISE EXCEPTION 'PDC_R5_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_old.id,v_old.payment_id,v_old.provider_amount_xaf::text,
      v_old.legal_amount_eur_cents::text,
      (SELECT pg_catalog.count(*)::integer FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=v_old.id),
      v_old.intake_session_sha256=v_session;
    RETURN;
  END IF;
  v_request_card:=(p->>'requestCard')::boolean;
  v_format:=p->>'cardFormat';
  IF (v_request_card AND v_format NOT IN ('digital','physical','both')) OR
     (v_request_card AND v_format IS NULL) OR
     (NOT v_request_card AND v_format IS NOT NULL) OR
     (p->>'legalAmountEurCents') IS NULL OR (p->>'legalAmountEurCents') !~ '^[1-9][0-9]{3}$' OR
     (p->>'providerAmountXaf') IS NULL OR (p->>'providerAmountXaf') !~ '^[1-9][0-9]{0,9}$' THEN
    RAISE EXCEPTION 'PDC_R5_PRICE_INVALID' USING ERRCODE='22023';
  END IF;
  v_eur:=(p->>'legalAmountEurCents')::bigint;
  v_xaf:=(p->>'providerAmountXaf')::bigint;
  IF (v_formula='reduit' AND v_eur<>1500) OR (v_formula='simple' AND v_eur<>3000) OR
     (v_formula='couple' AND v_eur<>4000) THEN RAISE EXCEPTION 'PDC_R5_LEGAL_AMOUNT_INVALID'; END IF;
  -- Formule d'arrondi issue du barème PDC, calcul en arithmétique entière :
  -- XAF = ceil((centimes EUR * 656 / 100) / 10) * 10.
  v_expected:=((v_eur*656+999)/1000)*10;
  IF v_xaf<>v_expected OR v_xaf>2147483647 THEN
    RAISE EXCEPTION 'PDC_R5_FX_MISMATCH' USING ERRCODE='22023';
  END IF;
  SELECT version INTO v_policy FROM pdc_private.r5_policy_versions WHERE active=true;
  IF v_policy IS NULL THEN RAISE EXCEPTION 'PDC_R5_POLICY_NOT_VERIFIED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each_text(p->'territory') z WHERE
     z.key NOT IN ('region','department','commune') OR length(z.value) NOT BETWEEN 1 AND 100) OR
     (SELECT count(*) FROM pg_catalog.jsonb_object_keys(p->'territory'))<>3 THEN
    RAISE EXCEPTION 'PDC_R5_TERRITORY_INVALID';
  END IF;
  FOR v_slot IN SELECT unnest(CASE WHEN v_formula='couple' THEN ARRAY['member','partner'] ELSE ARRAY['member'] END) LOOP
    v_data:=p->v_slot;
    IF pg_catalog.jsonb_typeof(v_data)<>'object' OR
       EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_data) k WHERE k NOT IN
         ('civility','firstName','lastName','dob','birthPlace','email','phoneE164','acceptedStatutes','acceptedDataNotice')) OR
       v_data->>'acceptedStatutes'<>'true' OR v_data->>'acceptedDataNotice'<>'true' OR
       v_data->>'civility' NOT IN ('Madame','Monsieur') OR
       length(pg_catalog.btrim(v_data->>'firstName')) NOT BETWEEN 1 AND 100 OR
       length(pg_catalog.btrim(v_data->>'lastName')) NOT BETWEEN 1 AND 100 OR
       length(pg_catalog.btrim(v_data->>'birthPlace')) NOT BETWEEN 1 AND 160 OR
       (v_data->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR
       (v_data->>'phoneE164') !~ '^\+[1-9][0-9]{6,14}$' OR
       (v_data->>'dob') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
       RAISE EXCEPTION 'PDC_R5_PERSON_INVALID' USING ERRCODE='22023';
    END IF;
    v_date:=(v_data->>'dob')::date;
    IF v_date>=CURRENT_DATE THEN RAISE EXCEPTION 'PDC_R5_DOB_INVALID'; END IF;
    IF v_slot='partner' AND EXISTS (SELECT 1 FROM pdc_private.people x WHERE x.id=v_payer AND
      (lower(x.email)=lower(v_data->>'email') OR
       (lower(x.first_name)=lower(v_data->>'firstName') AND lower(x.last_name)=lower(v_data->>'lastName') AND x.date_of_birth=v_date))) THEN
       RAISE EXCEPTION 'PDC_R5_PERSON_DUPLICATE';
    END IF;
    INSERT INTO pdc_private.people(civility,sex_code,first_name,last_name,date_of_birth,birth_place,
      email,phone_e164,country_of_residence,residence_region,residence_department,residence_city,
      home_commune_free_text)
    VALUES(v_data->>'civility',CASE WHEN v_data->>'civility'='Monsieur' THEN 'M' ELSE 'F' END,
      pg_catalog.btrim(v_data->>'firstName'),pg_catalog.btrim(v_data->>'lastName'),v_date,
      pg_catalog.btrim(v_data->>'birthPlace'),lower(v_data->>'email'),v_data->>'phoneE164',v_country,
      p->'territory'->>'region',p->'territory'->>'department',p->'territory'->>'commune',
      p->'territory'->>'commune') RETURNING id INTO v_person;
    IF v_slot='member' THEN v_payer:=v_person;
      INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status)
      VALUES('R5-PAY-'||replace(gen_random_uuid()::text,'-',''),v_payer,'tara','XAF',v_xaf,'initiated') RETURNING id INTO v_payment;
      INSERT INTO pdc_private.r5_diaspora_orders(idempotency_key,request_digest,formula,payer_id,payment_id,
        intake_session_sha256,policy_version,legal_amount_eur_cents,provider_amount_xaf,country_code,territory_snapshot,
        donation_conversion_accepted_at,donation_clause_version,partner_response_deadline,partner_response_state)
      VALUES(v_idem,v_digest,v_formula,v_payer,v_payment,v_session,v_policy,v_eur,v_xaf,v_country,p->'territory',
        CASE WHEN v_formula='couple' THEN now() ELSE NULL END,
        CASE WHEN v_formula='couple' THEN 'R5-1-14J-30-10' ELSE NULL END,
        CASE WHEN v_formula='couple' THEN now()+interval '14 days' ELSE NULL END,
        CASE WHEN v_formula='couple' THEN 'pending' ELSE NULL END)
      RETURNING id INTO v_order;
    END IF;
    INSERT INTO pdc_private.membership_applications(reference,person_id,application_type,
      residence_group,category_code,submission_status,policy_accepted_at,policy_version,
      data_notice_accepted_at,submitted_at,card_requested,card_format)
    VALUES('R5-ADH-'||replace(gen_random_uuid()::text,'-',''),v_person,'initial','diaspora',
      v_formula,CASE WHEN v_slot='member' THEN 'submitted' ELSE 'draft' END,
      CASE WHEN v_slot='member' THEN now() ELSE NULL END,
      CASE WHEN v_slot='member' THEN v_policy ELSE NULL END,
      CASE WHEN v_slot='member' THEN now() ELSE NULL END,
      CASE WHEN v_slot='member' THEN now() ELSE NULL END,v_request_card,v_format) RETURNING id INTO v_app;
    IF v_formula<>'couple' THEN
      INSERT INTO pdc_private.dues_obligations(application_id,person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
      VALUES(v_app,v_person,'annual_dues',EXTRACT(YEAR FROM CURRENT_DATE)::integer,v_formula,v_eur,'EUR');
    END IF;
    v_card:=NULL;
    IF v_request_card THEN
      INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format)
      VALUES(v_app,v_person,v_format) RETURNING id INTO v_card;
    END IF;
    INSERT INTO pdc_private.r5_diaspora_beneficiaries(order_id,slot,person_id,application_id,card_request_id,consent_at)
    VALUES(v_order,v_slot,v_person,v_app,v_card,CASE WHEN v_slot='member' THEN now() ELSE NULL END);
    v_n:=v_n+1;
  END LOOP;
  RETURN QUERY SELECT v_order,v_payment,v_xaf::text,v_eur::text,v_n,true;
END;
$fn$;
REVOKE ALL ON FUNCTION pdc_private.r5_create_diaspora_dossier_dev(jsonb)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_create_diaspora_dossier_dev(jsonb) TO pdc_r5_intake_writer;

-- Emettre des jetons seulement via un service qui a authentifié la session d'intake.
-- Fonction privée SANS GRANT, même pour le writer de commande.
CREATE FUNCTION pdc_private.r5_photo_issue_dev(p_order uuid,p_slot text,p_hash text,p_session_hash text,p_ttl integer DEFAULT 600)
RETURNS TABLE(grant_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid; v_exp timestamptz;
BEGIN
  IF p_order IS NULL OR p_slot NOT IN ('member','partner') OR p_hash IS NULL OR
     p_hash !~ '^[a-f0-9]{64}$' OR p_session_hash IS NULL OR
     p_session_hash !~ '^[a-f0-9]{64}$' OR p_ttl NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'PDC_R5_PHOTO_GRANT_INVALID';
  END IF;
  PERFORM 1 FROM pdc_private.r5_diaspora_beneficiaries b
    JOIN pdc_private.r5_diaspora_orders o ON o.id=b.order_id
    WHERE b.order_id=p_order AND b.slot=p_slot AND b.card_request_id IS NOT NULL
      AND o.status='submitted_pending_payment' AND o.intake_session_sha256=p_session_hash
      FOR UPDATE OF b;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_R5_PHOTO_CARD_REQUEST_MISSING'; END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.r5_provisional_photos
    WHERE order_id=p_order AND slot=p_slot AND state IN ('stored','reserved')) THEN
    RAISE EXCEPTION 'PDC_R5_PHOTO_ALREADY_RESERVED';
  END IF;
  UPDATE pdc_private.r5_provisional_photo_grants SET revoked_at=now()
    WHERE order_id=p_order AND slot=p_slot AND revoked_at IS NULL AND used_at IS NULL;
  v_exp:=now()+make_interval(secs=>p_ttl);
  INSERT INTO pdc_private.r5_provisional_photo_grants(order_id,slot,token_sha256,expires_at)
  VALUES(p_order,p_slot,p_hash,v_exp) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id,v_exp;
END;$fn$;

CREATE FUNCTION pdc_private.r5_photo_reserve_dev(p_order uuid,p_slot text,p_hash text)
RETURNS TABLE(asset_id uuid,object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_grant pdc_private.r5_provisional_photo_grants%ROWTYPE;
  v_id uuid:=gen_random_uuid(); v_path text;
BEGIN
  SELECT * INTO v_grant FROM pdc_private.r5_provisional_photo_grants
   WHERE order_id=p_order AND slot=p_slot AND token_sha256=p_hash FOR UPDATE;
  IF NOT FOUND OR v_grant.used_at IS NOT NULL OR v_grant.revoked_at IS NOT NULL OR
     v_grant.expires_at<=now() THEN RAISE EXCEPTION 'PDC_R5_PHOTO_GRANT_DENIED'; END IF;
  v_path:='provisional-r5/'||p_order::text||'/'||p_slot||'/'||v_id::text||'.jpg';
  INSERT INTO pdc_private.r5_provisional_photos(id,order_id,slot,grant_id,object_key)
    VALUES(v_id,p_order,p_slot,v_grant.id,v_path);
  UPDATE pdc_private.r5_provisional_photo_grants SET used_at=now() WHERE id=v_grant.id;
  RETURN QUERY SELECT v_id,v_path;
END;$fn$;

CREATE FUNCTION pdc_private.r5_photo_confirm_dev(p_asset uuid,p_bytes integer,p_sha text,p_width integer,p_height integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF p_bytes NOT BETWEEN 1 AND 5242880 OR p_sha IS NULL OR p_sha !~ '^[a-f0-9]{64}$' OR
     p_width NOT BETWEEN 240 AND 4096 OR p_height NOT BETWEEN 240 AND 4096 THEN
    RAISE EXCEPTION 'PDC_R5_PHOTO_META_INVALID';
  END IF;
  UPDATE pdc_private.r5_provisional_photos SET
    state='stored',stored_at=now(),bytes=p_bytes,sha256=p_sha,width=p_width,height=p_height
    WHERE id=p_asset AND state='reserved';
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_R5_PHOTO_CONFIRMATION_DENIED'; END IF;
  RETURN true;
END;$fn$;

CREATE FUNCTION pdc_private.r5_photo_cancel_dev(p_asset uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  -- A utiliser seulement lorsque la preuve d'effacement dans Storage est acquise.
  DELETE FROM pdc_private.r5_provisional_photos WHERE id=p_asset AND state='reserved';
  RETURN FOUND;
END;$fn$;

-- Lecture administrative : cartes prêtes uniquement si l'admission existe déjà.
-- Ne court-circuite ni F3 (paiement EUR historique), ni l'émission des numéros V5-B.
CREATE VIEW pdc_private.r5_card_readiness_dev WITH (security_invoker=true) AS
SELECT b.order_id,b.slot,b.application_id,b.card_request_id,
       o.formula,o.legal_amount_eur_cents,o.provider_amount_xaf,
       a.submission_status,m.status AS membership_status,m.member_number,
       c.status AS card_status,photo.state AS provisional_photo_status,
       CASE WHEN o.status IN ('payment_verified','under_administrative_review') AND a.submission_status='accepted' AND
                 m.status='active' AND m.member_number IS NOT NULL AND c.status='reviewed' AND
                 photo.state='stored' THEN true ELSE false END AS eligible_for_separate_card_workflow
FROM pdc_private.r5_diaspora_beneficiaries b
JOIN pdc_private.r5_diaspora_orders o ON o.id=b.order_id
JOIN pdc_private.membership_applications a ON a.id=b.application_id
LEFT JOIN pdc_private.memberships m ON m.id=a.membership_id
LEFT JOIN pdc_private.membership_card_requests c ON c.id=b.card_request_id
LEFT JOIN pdc_private.r5_provisional_photos photo
  ON photo.order_id=b.order_id AND photo.slot=b.slot AND photo.state='stored';

-- Aucun droit de confirmation manuelle, lecture du dossier, vue ou photo
-- pour anon / authenticated / service_role / writer Tara R4.
DO $r$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'r5_photo_issue_dev(uuid,text,text,text,integer)',
    'r5_photo_reserve_dev(uuid,text,text)',
    'r5_photo_confirm_dev(uuid,integer,text,integer,integer)',
    'r5_photo_cancel_dev(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION pdc_private.%s FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer',f);
  END LOOP;
END $r$;
REVOKE ALL ON TABLE pdc_private.r5_card_readiness_dev FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;
-- L'émission Tara R5 utilise l'infrastructure d'intention V5-C, mais un RPC séparé.
-- Le RPC R4 save_issued_channel consulte public_checkout_orders_v5c et ne doit
-- donc PAS être détourné pour les dossiers diaspora.
CREATE FUNCTION pdc_private.r5_reserve_tara_intent_dev(
 p_order uuid,p_product text,p_session_hash text,p_method text,p_channel text
) RETURNS TABLE(product_id text,payment_id uuid,amount_xaf bigint,link_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;
 v_saved pdc_private.tara_checkout_intents_v5c%ROWTYPE;
BEGIN
 IF p_order IS NULL OR p_product IS NULL OR p_product !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
    p_session_hash IS NULL OR p_session_hash !~ '^[a-f0-9]{64}$' OR
    p_method NOT IN ('mobile','tara','carte') OR p_method IS NULL OR
    ((p_method='tara') IS DISTINCT FROM (p_channel IS NOT NULL)) OR
    (p_method='tara' AND p_channel NOT IN ('general','whatsapp','telegram','dikalo')) THEN
    RAISE EXCEPTION 'PDC_R5_TARA_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.intake_session_sha256<>p_session_hash OR
    v_order.status<>'submitted_pending_payment' OR
    (v_order.payment_method IS NOT NULL AND (v_order.payment_method IS DISTINCT FROM p_method OR
       v_order.messaging_channel IS DISTINCT FROM p_channel)) OR
    NOT EXISTS (SELECT 1 FROM pdc_private.payment_attempts p WHERE p.id=v_order.payment_id
       AND p.status IN ('initiated','pending') AND p.currency='XAF'
       AND p.provider='tara' AND p.amount_minor=v_order.provider_amount_xaf) THEN
    RAISE EXCEPTION 'PDC_R5_TARA_ORDER_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 -- Le premier demandeur atteste et consent au don conditionnel : le paiement
 -- peut précéder le consentement PERSONNEL du second bénéficiaire.
 IF v_order.formula='couple' AND
    (v_order.donation_conversion_accepted_at IS NULL OR
     v_order.donation_clause_version<>'R5-1-14J-30-10') THEN
   RAISE EXCEPTION 'PDC_R5_DONATION_CONSENT_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_beneficiaries b
   JOIN pdc_private.membership_applications a ON a.id=b.application_id
   WHERE b.order_id=p_order AND b.slot='member' AND
     (a.submission_status NOT IN ('submitted','under_review') OR
     a.policy_accepted_at IS NULL OR a.data_notice_accepted_at IS NULL OR
     a.policy_version IS NULL OR b.consent_at IS NULL)) THEN
   RAISE EXCEPTION 'PDC_R5_PAYER_CONSENT_MISSING' USING ERRCODE='42501';
 END IF;
 -- Le partenaire reste candidat provisoire, sans admission ni carte.
 IF v_order.formula='couple' AND NOT EXISTS (
   SELECT 1 FROM pdc_private.r5_diaspora_beneficiaries b
   JOIN pdc_private.membership_applications a ON a.id=b.application_id
   WHERE b.order_id=p_order AND b.slot='partner' AND a.submission_status='draft'
     AND b.consent_at IS NULL) AND v_order.partner_response_state='pending' THEN
   RAISE EXCEPTION 'PDC_R5_PARTNER_DRAFT_INVALID' USING ERRCODE='42501';
 END IF;
 -- Le dépôt provisoire doit précéder l'émission du lien si une carte est demandée.
 IF EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_beneficiaries b
   WHERE b.order_id=p_order AND b.card_request_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM pdc_private.r5_provisional_photos f
     WHERE f.order_id=b.order_id AND f.slot=b.slot AND f.state='stored')) THEN
   RAISE EXCEPTION 'PDC_R5_PORTRAIT_PENDING' USING ERRCODE='42501';
 END IF;
 UPDATE pdc_private.r5_diaspora_orders SET payment_method=p_method,messaging_channel=p_channel
   WHERE id=p_order AND payment_method IS NULL;
 INSERT INTO pdc_private.tara_checkout_intents_v5c
   (product_id,payment_id,quote_id,payer_id,idempotency_key,amount_xaf,currency)
 VALUES (p_product,v_order.payment_id,v_order.id,v_order.payer_id,v_order.idempotency_key,
   v_order.provider_amount_xaf,'XAF') ON CONFLICT(idempotency_key) DO NOTHING;
 SELECT * INTO v_saved FROM pdc_private.tara_checkout_intents_v5c
   WHERE idempotency_key=v_order.idempotency_key FOR UPDATE;
 IF NOT FOUND OR v_saved.payment_id<>v_order.payment_id OR v_saved.quote_id<>v_order.id OR
    v_saved.amount_xaf<>v_order.provider_amount_xaf THEN
    RAISE EXCEPTION 'PDC_R5_TARA_IDEMPOTENCY_MISMATCH' USING ERRCODE='23514';
 END IF;
 RETURN QUERY SELECT v_saved.product_id,v_saved.payment_id,v_saved.amount_xaf,v_saved.link_state;
END;$fn$;

CREATE FUNCTION pdc_private.r5_claim_tara_link_dev(p_order uuid,p_session_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;
BEGIN
 SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.intake_session_sha256 IS DISTINCT FROM p_session_hash OR
    v_order.status<>'submitted_pending_payment' OR v_order.payment_method IS NULL THEN
    RAISE EXCEPTION 'PDC_R5_TARA_SESSION_INVALID' USING ERRCODE='42501';
 END IF;
 UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='requested',requested_at=now()
 WHERE payment_id=v_order.payment_id AND quote_id=v_order.id AND link_state='reserved';
 RETURN FOUND;
END;$fn$;

CREATE FUNCTION pdc_private.r5_save_tara_link_dev(
 p_order uuid,p_session_hash text,p_field text,p_link text,p_general text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;
 v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;v_expected text;
BEGIN
 SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.intake_session_sha256 IS DISTINCT FROM p_session_hash OR
    v_order.status<>'submitted_pending_payment' THEN
    RAISE EXCEPTION 'PDC_R5_TARA_SESSION_INVALID' USING ERRCODE='42501';
 END IF;
 v_expected:=CASE WHEN v_order.payment_method='mobile' THEN 'smsLink'
   WHEN v_order.payment_method='carte' THEN 'cardLink'
   WHEN v_order.payment_method='tara' AND v_order.messaging_channel='general' THEN 'generalLink'
   WHEN v_order.payment_method='tara' AND v_order.messaging_channel='whatsapp' THEN 'whatsappLink'
   WHEN v_order.payment_method='tara' AND v_order.messaging_channel='telegram' THEN 'telegramLink'
   WHEN v_order.payment_method='tara' AND v_order.messaging_channel='dikalo' THEN 'dikaloLink'
   ELSE NULL END;
 SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c
   WHERE payment_id=v_order.payment_id AND quote_id=v_order.id FOR UPDATE;
 IF NOT FOUND OR v_intent.link_state<>'requested' OR p_field IS DISTINCT FROM v_expected OR
    p_link IS NULL OR pg_catalog.length(p_link) NOT BETWEEN 7 AND 2048 OR
    p_link ~ '[[:cntrl:]]' OR p_general IS NULL OR
    p_general !~ '^https://(www[.])?taramoney[.]com/pay/[^[:space:]@#]+' THEN
    RAISE EXCEPTION 'PDC_R5_TARA_LINK_INVALID' USING ERRCODE='23514';
 END IF;
 IF (p_field='generalLink' AND p_link<>p_general) OR
    (p_field='cardLink' AND p_link !~ '^https://(www[.])?taramoney[.]com/(card|cardpay)/[^[:space:]@#]+') OR
    (p_field='smsLink' AND p_link !~ '^sms:[A-Za-z0-9+%,;?=&._~-]*$' AND
       p_link !~ '^https://((www[.])?taramoney[.]com|dklo[.]co)/[^[:space:]@#]+') OR
    (p_field IN ('whatsappLink','telegramLink','dikaloLink') AND
       p_link !~ '^https://((www[.])?(taramoney[.]com|dklo[.]co|whatsapp[.]com|dikalo[.]com|dikalo[.]co)|wa[.]me|api[.]whatsapp[.]com|web[.]whatsapp[.]com|t[.]me|(www[.])?telegram[.]me)(/|[?]|$)') THEN
    RAISE EXCEPTION 'PDC_R5_TARA_CHANNEL_INVALID' USING ERRCODE='23514';
 END IF;
 UPDATE pdc_private.tara_checkout_intents_v5c SET
   general_link=p_general,selected_method=v_order.payment_method,
   selected_messaging_channel=v_order.messaging_channel,selected_link_field=p_field,
   selected_link_url=p_link,link_state='issued'
 WHERE id=v_intent.id AND link_state='requested';
 RETURN FOUND;
END;$fn$;

CREATE FUNCTION pdc_private.r5_mark_tara_unknown_dev(p_order uuid,p_session_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;
BEGIN
 SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.intake_session_sha256 IS DISTINCT FROM p_session_hash THEN
    RAISE EXCEPTION 'PDC_R5_TARA_SESSION_INVALID' USING ERRCODE='42501';
 END IF;
 UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='unknown'
   WHERE payment_id=v_order.payment_id AND quote_id=v_order.id AND link_state='requested';
 RETURN FOUND;
END;$fn$;

CREATE FUNCTION pdc_private.r5_load_issued_tara_link_dev(p_order uuid,p_session_hash text)
RETURNS TABLE(product_id text,payment_id uuid,amount_xaf bigint,link_field text,payment_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT i.product_id,i.payment_id,i.amount_xaf,i.selected_link_field,i.selected_link_url
 FROM pdc_private.r5_diaspora_orders o
 JOIN pdc_private.tara_checkout_intents_v5c i ON i.payment_id=o.payment_id AND i.quote_id=o.id
 WHERE o.id=p_order AND o.intake_session_sha256=p_session_hash
   AND i.link_state='issued' AND i.selected_method=o.payment_method AND
   i.selected_messaging_channel IS NOT DISTINCT FROM o.messaging_channel;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.r5_reserve_tara_intent_dev(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_claim_tara_link_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_save_tara_link_dev(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_mark_tara_unknown_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_load_issued_tara_link_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_reserve_tara_intent_dev(uuid,text,text,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_claim_tara_link_dev(uuid,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_save_tara_link_dev(uuid,text,text,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_mark_tara_unknown_dev(uuid,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_load_issued_tara_link_dev(uuid,text) TO pdc_r5_intake_writer;

-- R5.1 : consentement exprès du payeur, réponse personnelle du partenaire PAR COURRIEL.
-- Les jetons ne sont jamais conservés en clair. Aucun droit tables exposé à l'API.
CREATE TABLE pdc_private.r5_partner_email_tokens (
 order_id uuid PRIMARY KEY REFERENCES pdc_private.r5_diaspora_orders(id),
 token_sha256 text NOT NULL UNIQUE CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 provider_message_id text,
 sent_at timestamptz,
 responded_at timestamptz,
 decision text CHECK(decision IN ('confirmed','declined'))
);
ALTER TABLE pdc_private.r5_partner_email_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.r5_partner_email_tokens
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;
CREATE FUNCTION pdc_private.r5_issue_partner_email_dev(p_order uuid,p_session text,p_token_hash text)
RETURNS TABLE(partner_email text, deadline timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;v_email text;
BEGIN
 IF p_order IS NULL OR p_session !~ '^[a-f0-9]{64}$' OR
    p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PDC_R51_TOKEN_INVALID';END IF;
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.intake_session_sha256<>p_session OR o.formula<>'couple' OR
    o.partner_response_state<>'pending' OR now()>o.partner_response_deadline THEN
    RAISE EXCEPTION 'PDC_R51_TOKEN_DENIED' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM pdc_private.r5_partner_email_tokens WHERE order_id=p_order) THEN
    RAISE EXCEPTION 'PDC_R51_TOKEN_ALREADY_CREATED' USING ERRCODE='23505';
 END IF;
 SELECT p.email INTO v_email FROM pdc_private.r5_diaspora_beneficiaries b
 JOIN pdc_private.people p ON p.id=b.person_id
 WHERE b.order_id=p_order AND b.slot='partner';
 IF v_email IS NULL THEN RAISE EXCEPTION 'PDC_R51_EMAIL_MISSING';END IF;
 INSERT INTO pdc_private.r5_partner_email_tokens(order_id,token_sha256,expires_at)
 VALUES(p_order,p_token_hash,o.partner_response_deadline);
 RETURN QUERY SELECT v_email,o.partner_response_deadline;
END;$fn$;
CREATE FUNCTION pdc_private.r5_mark_partner_email_sent_dev(p_order uuid,p_token_hash text,p_provider_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF p_provider_id IS NULL OR length(p_provider_id) NOT BETWEEN 5 AND 200 THEN
   RAISE EXCEPTION 'PDC_R51_EMAIL_PROOF_INVALID';END IF;
 UPDATE pdc_private.r5_partner_email_tokens SET provider_message_id=p_provider_id,sent_at=now()
 WHERE order_id=p_order AND token_sha256=p_token_hash AND sent_at IS NULL;
 RETURN FOUND;
END;$fn$;
CREATE FUNCTION pdc_private.r5_reply_partner_email_dev(p_token_hash text,p_decision text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_t pdc_private.r5_partner_email_tokens%ROWTYPE;
 v_o pdc_private.r5_diaspora_orders%ROWTYPE;v_app uuid;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' OR
    p_decision NOT IN ('confirmed','declined') THEN RETURN false;END IF;
 SELECT * INTO v_t FROM pdc_private.r5_partner_email_tokens
 WHERE token_sha256=p_token_hash FOR UPDATE;
 IF NOT FOUND OR v_t.sent_at IS NULL OR v_t.decision IS NOT NULL OR
    now()>v_t.expires_at THEN RETURN false;END IF;
 SELECT * INTO v_o FROM pdc_private.r5_diaspora_orders WHERE id=v_t.order_id FOR UPDATE;
 IF NOT FOUND OR v_o.partner_response_state<>'pending' OR
    now()>v_o.partner_response_deadline THEN RETURN false;END IF;
 SELECT application_id INTO v_app FROM pdc_private.r5_diaspora_beneficiaries
 WHERE order_id=v_t.order_id AND slot='partner' FOR UPDATE;
 IF v_app IS NULL THEN RETURN false;END IF;
 IF p_decision='confirmed' THEN
   UPDATE pdc_private.membership_applications SET submission_status='submitted',
    policy_accepted_at=now(),policy_version=v_o.policy_version,
    data_notice_accepted_at=now(),submitted_at=now()
   WHERE id=v_app AND submission_status='draft';
   IF NOT FOUND THEN RETURN false;END IF;
   UPDATE pdc_private.r5_diaspora_beneficiaries SET consent_at=now()
   WHERE order_id=v_t.order_id AND slot='partner' AND consent_at IS NULL;
 END IF;
 UPDATE pdc_private.r5_diaspora_orders SET partner_response_state=p_decision
 WHERE id=v_t.order_id AND partner_response_state='pending';
 UPDATE pdc_private.r5_partner_email_tokens SET decision=p_decision,responded_at=now()
 WHERE order_id=v_t.order_id;
 INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
 VALUES('r5.partner_email_response','membership_applications',v_app,
   jsonb_build_object('decision',p_decision,'channel','email','version',v_o.donation_clause_version));
 RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION pdc_private.r5_issue_partner_email_dev(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_mark_partner_email_sent_dev(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_reply_partner_email_dev(text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_photo_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_issue_partner_email_dev(uuid,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_mark_partner_email_sent_dev(uuid,text,text) TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_reply_partner_email_dev(text,text) TO pdc_r5_intake_writer;

-- Enregistrement de preuve : NE CONFIRME PAS le paiement.
CREATE FUNCTION pdc_private.r5_record_fx_evidence_dev(
 p_order uuid,p_product text,p_transaction text,p_status text,
 p_gross bigint,p_net bigint,p_fees bigint,p_evidence text,p_operator text,
 p_merchant_paid_at timestamptz,p_references_verified boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;v_id uuid;
BEGIN
  SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
  SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c WHERE product_id=p_product FOR UPDATE;
  IF NOT FOUND OR v_order.id IS NULL OR v_intent.payment_id<>v_order.payment_id OR
     v_intent.link_state<>'issued' OR v_intent.amount_xaf<>v_order.provider_amount_xaf OR
     p_gross<>v_order.provider_amount_xaf OR p_gross<>p_net+p_fees OR
     p_status NOT IN ('PAID','PENDING','FAILED','DISPUTED') OR
     p_transaction IS NULL OR length(p_transaction) NOT BETWEEN 8 AND 150 OR
     p_evidence IS NULL OR length(p_evidence) NOT BETWEEN 8 AND 300 OR
     p_operator IS NULL OR length(p_operator) NOT BETWEEN 3 AND 150 OR
     p_merchant_paid_at IS NULL OR p_merchant_paid_at>now()+INTERVAL '1 hour' OR
     p_references_verified IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'PDC_R5_FINANCIAL_PROOF_INVALID'; END IF;
  INSERT INTO pdc_private.r5_financial_reconciliations(order_id,product_id,merchant_transaction_id,
    observed_status,gross_xaf,net_xaf,fees_xaf,evidence_origin,evidence_reference,
    operator_label,merchant_paid_at,references_verified)
  VALUES(p_order,p_product,p_transaction,p_status,p_gross,p_net,p_fees,
    'merchant_dashboard',p_evidence,p_operator,p_merchant_paid_at,p_references_verified)
  RETURNING id INTO v_id;
  RETURN v_id;
END;$fn$;

-- Confirmation distincte : seulement SQL Editor DEV / après revue humaine.
CREATE FUNCTION pdc_private.r5_confirm_verified_fx_dev(p_evidence uuid,p_phrase text)
RETURNS TABLE(confirmed_payment_id uuid,confirmation text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_ev pdc_private.r5_financial_reconciliations%ROWTYPE;
 v_order pdc_private.r5_diaspora_orders%ROWTYPE;
 v_pay pdc_private.payment_attempts%ROWTYPE;
BEGIN
  IF p_phrase IS DISTINCT FROM 'JE_CONFIRME_LE_RAPPROCHEMENT_DIASPORA_DEV' THEN
    RAISE EXCEPTION 'PDC_R5_EXPLICIT_CONFIRMATION_REQUIRED'; END IF;
  SELECT * INTO v_ev FROM pdc_private.r5_financial_reconciliations WHERE id=p_evidence FOR UPDATE;
  IF NOT FOUND OR v_ev.verified_at IS NOT NULL OR v_ev.observed_status<>'PAID' OR
     v_ev.evidence_origin<>'merchant_dashboard' OR
     v_ev.references_verified IS DISTINCT FROM true OR v_ev.merchant_paid_at IS NULL OR
     v_ev.gross_xaf<>v_ev.net_xaf+v_ev.fees_xaf THEN
    RAISE EXCEPTION 'PDC_R5_SETTLEMENT_NOT_ELIGIBLE'; END IF;
  SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=v_ev.order_id FOR UPDATE;
  SELECT * INTO v_pay FROM pdc_private.payment_attempts WHERE id=v_order.payment_id FOR UPDATE;
  IF NOT FOUND OR v_order.status<>'submitted_pending_payment' OR v_pay.status NOT IN ('initiated','pending') OR
     v_pay.provider<>'tara' OR v_pay.currency<>'XAF' OR v_pay.amount_minor<>v_ev.gross_xaf OR
     v_pay.provider_payment_id IS NOT NULL OR
     v_order.provider_amount_xaf<>v_ev.gross_xaf OR
     NOT EXISTS (SELECT 1 FROM pdc_private.tara_checkout_intents_v5c c
       WHERE c.product_id=v_ev.product_id AND c.payment_id=v_pay.id AND c.link_state='issued') OR
     (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=v_order.id)<>
       (1 + COALESCE((v_order.formula = 'couple')::integer, 0)) THEN
    RAISE EXCEPTION 'PDC_R5_PAYMENT_CONTEXT_INVALID'; END IF;
  UPDATE pdc_private.payment_attempts SET status='confirmed',confirmed_at=now(),
    provider_payment_id=v_ev.merchant_transaction_id WHERE id=v_pay.id AND status IN ('initiated','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_R5_CONCURRENT_CONFIRMATION'; END IF;
  INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
    VALUES('tara','r5-manual:'||v_ev.merchant_transaction_id,v_pay.id,'manual_dashboard_confirmation_dev',now());
  UPDATE pdc_private.r5_financial_reconciliations SET verified_at=now() WHERE id=v_ev.id;
  UPDATE pdc_private.r5_diaspora_orders SET status='payment_verified',reconciled_at=now() WHERE id=v_order.id;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
   VALUES(NULL,'r5.fx_dashboard_confirmed_dev','payment_attempts',v_pay.id,
      jsonb_build_object('evidence_id',v_ev.id,'operator',v_ev.operator_label,'gross_xaf',v_ev.gross_xaf,
       'net_xaf',v_ev.net_xaf,'fees_xaf',v_ev.fees_xaf,'legal_eur_cents',v_order.legal_amount_eur_cents,
       'fx_rate_xaf_per_eur',v_order.fx_rate_xaf_per_eur,'formula',v_order.formula,
       'merchant_paid_at',v_ev.merchant_paid_at,'references_verified',v_ev.references_verified));
  RETURN QUERY SELECT v_pay.id,'confirmed_dev_no_admission'::text;
END;$fn$;
REVOKE ALL ON FUNCTION pdc_private.r5_record_fx_evidence_dev(uuid,text,text,text,bigint,bigint,bigint,text,text,timestamptz,boolean)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;
REVOKE ALL ON FUNCTION pdc_private.r5_confirm_verified_fx_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer;


-- R5.1 : reclassement contractuellement accepté, sans encaissement fictif ni deuxième paiement.
-- Exécuté uniquement après preuve bancaire confirmée, refus ou 14 jours échus.
CREATE TABLE pdc_private.r5_couple_donation_split_dev (
 order_id uuid PRIMARY KEY REFERENCES pdc_private.r5_diaspora_orders(id),
 payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
 member_dues_eur_cents bigint NOT NULL DEFAULT 3000 CHECK(member_dues_eur_cents=3000),
 donation_eur_cents bigint NOT NULL DEFAULT 1000 CHECK(donation_eur_cents=1000),
 original_total_eur_cents bigint NOT NULL DEFAULT 4000 CHECK(original_total_eur_cents=4000),
 accounting_currency char(3) NOT NULL DEFAULT 'EUR' CHECK(accounting_currency='EUR'),
 posted_at timestamptz NOT NULL DEFAULT now(),
 CHECK(member_dues_eur_cents + donation_eur_cents = original_total_eur_cents)
);
ALTER TABLE pdc_private.r5_couple_donation_split_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.r5_couple_donation_split_dev FROM
 PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;
CREATE FUNCTION pdc_private.r5_regularize_couple_dev(p_order uuid,p_operator text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE o pdc_private.r5_diaspora_orders%ROWTYPE;v_app uuid;v_person uuid;
BEGIN
 IF p_order IS NULL OR p_operator IS NULL OR length(p_operator) NOT BETWEEN 3 AND 150 THEN
  RAISE EXCEPTION 'PDC_R51_OPERATOR_REQUIRED'; END IF;
 SELECT * INTO o FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR o.formula<>'couple' OR o.donation_conversion_accepted_at IS NULL OR
    o.donation_clause_version<>'R5-1-14J-30-10' THEN
  RAISE EXCEPTION 'PDC_R51_CONVERSION_NOT_AUTHORIZED';END IF;
 IF EXISTS(SELECT 1 FROM pdc_private.r5_couple_donation_split_dev WHERE order_id=p_order)
 THEN RETURN 'already_regularized'; END IF;
 IF o.partner_response_state NOT IN ('declined','expired') AND NOT
    (o.partner_response_state='pending' AND now()>o.partner_response_deadline) THEN
  RAISE EXCEPTION 'PDC_R51_PARTNER_STILL_ELIGIBLE';END IF;
 IF NOT EXISTS(SELECT 1 FROM pdc_private.r5_partner_email_tokens t WHERE
     t.order_id=p_order AND t.sent_at IS NOT NULL) THEN
  RAISE EXCEPTION 'PDC_R51_EMAIL_NEVER_SENT' USING ERRCODE='42501';END IF;
 IF o.status NOT IN ('payment_verified','under_administrative_review') OR
    NOT EXISTS(SELECT 1 FROM pdc_private.payment_attempts p WHERE p.id=o.payment_id
       AND p.status='confirmed' AND p.confirmed_at IS NOT NULL AND p.currency='XAF' AND
       p.amount_minor=o.provider_amount_xaf) OR
    NOT EXISTS(SELECT 1 FROM pdc_private.r5_financial_reconciliations r
       WHERE r.order_id=p_order AND r.verified_at IS NOT NULL AND r.observed_status='PAID'
         AND r.gross_xaf=o.provider_amount_xaf) THEN
  RAISE EXCEPTION 'PDC_R51_PAYMENT_NOT_VERIFIED';END IF;
 IF EXISTS(SELECT 1 FROM pdc_private.r5_admissions_dev a WHERE a.order_id=p_order) THEN
  RAISE EXCEPTION 'PDC_R51_ALREADY_ADMITTED';END IF;
 SELECT application_id,person_id INTO v_app,v_person
 FROM pdc_private.r5_diaspora_beneficiaries WHERE order_id=p_order AND slot='member' FOR UPDATE;
 IF v_app IS NULL THEN RAISE EXCEPTION 'PDC_R51_PAYER_MISSING'; END IF;
 -- La case cochée autorise le don uniquement pour l'excédent de 10 EUR, après déclencheur.
 INSERT INTO pdc_private.r5_couple_donation_split_dev(order_id,payment_id)
 VALUES(p_order,o.payment_id);
 UPDATE pdc_private.membership_applications SET category_code='simple'
 WHERE id=v_app AND category_code='couple' AND submission_status IN ('submitted','under_review');
 IF NOT FOUND THEN RAISE EXCEPTION 'PDC_R51_PAYER_APP_INVALID';END IF;
 UPDATE pdc_private.membership_applications SET submission_status='cancelled'
 WHERE id=(SELECT application_id FROM pdc_private.r5_diaspora_beneficiaries
     WHERE order_id=p_order AND slot='partner') AND submission_status='draft';
 INSERT INTO pdc_private.dues_obligations(application_id,person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
 VALUES(v_app,v_person,'annual_dues',EXTRACT(YEAR FROM CURRENT_DATE)::integer,'simple',3000,'EUR');
 IF o.partner_response_state='pending' THEN
   UPDATE pdc_private.r5_diaspora_orders SET partner_response_state='expired'
   WHERE id=p_order;
 END IF;
 INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
 VALUES('r5.couple_expost_30_dues_10_donation','r5_diaspora_orders',p_order,
 jsonb_build_object('operator_label',p_operator,'donation_eur_cents',1000,
 'dues_eur_cents',3000,'provider_gross_xaf',o.provider_amount_xaf,'payment_id',o.payment_id));
 RETURN 'regularized_30_dues_10_donation';
END;$fn$;
REVOKE ALL ON FUNCTION pdc_private.r5_regularize_couple_dev(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;

-- R5 : ADMISSION ADMINISTRATIVE EXPLICITE après confirmation FX ; jamais par webhook.
-- Numérotation F3/V5-B.62 REUTILISÉE. Une seule transaction pour les 2 membres du couple.
CREATE TABLE pdc_private.r5_admissions_dev (
 order_id uuid NOT NULL REFERENCES pdc_private.r5_diaspora_orders(id),
 slot text NOT NULL CHECK(slot IN ('member','partner')),
 membership_id uuid NOT NULL UNIQUE REFERENCES pdc_private.memberships(id),
 member_number text NOT NULL UNIQUE CHECK(member_number ~ '^[MF]-PDC-I-[0-9]{6}$'),
 admitted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,slot)
);
ALTER TABLE pdc_private.r5_admissions_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.r5_admissions_dev
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;

CREATE FUNCTION pdc_private.r5_admit_verified_diaspora_dev(
 p_order uuid,p_confirmation text,p_operator text
) RETURNS TABLE(slot text,membership_id uuid,member_number text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_order pdc_private.r5_diaspora_orders%ROWTYPE;
 v_pay pdc_private.payment_attempts%ROWTYPE;
 v_b record;v_a pdc_private.membership_applications%ROWTYPE;
 v_person pdc_private.people%ROWTYPE;
 v_count integer;v_existing integer;v_serial integer;v_prefix text;
 v_number text;v_membership uuid;
BEGIN
 IF p_confirmation IS DISTINCT FROM 'JE_VALIDE_ADMINISTRATIVEMENT_R5_DEV' OR
    p_operator IS NULL OR length(p_operator) NOT BETWEEN 3 AND 150 THEN
   RAISE EXCEPTION 'PDC_R5_ADMISSION_EXPLICIT_APPROVAL_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_order FROM pdc_private.r5_diaspora_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.status NOT IN ('payment_verified','under_administrative_review') THEN
   RAISE EXCEPTION 'PDC_R5_PAYMENT_NOT_VERIFIED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_pay FROM pdc_private.payment_attempts WHERE id=v_order.payment_id FOR UPDATE;
 IF NOT FOUND OR v_pay.status<>'confirmed' OR v_pay.confirmed_at IS NULL OR
    v_pay.provider<>'tara' OR v_pay.currency<>'XAF' OR
    v_pay.amount_minor<>v_order.provider_amount_xaf OR v_pay.provider_payment_id IS NULL OR
    NOT EXISTS (SELECT 1 FROM pdc_private.r5_financial_reconciliations r
      WHERE r.order_id=p_order AND r.verified_at IS NOT NULL AND r.observed_status='PAID' AND
        r.gross_xaf=v_order.provider_amount_xaf AND r.merchant_transaction_id=v_pay.provider_payment_id) OR
    NOT EXISTS (SELECT 1 FROM pdc_private.payment_events ev
      WHERE ev.payment_id=v_pay.id AND ev.provider='tara' AND ev.verified_at IS NOT NULL
        AND ev.event_type='manual_dashboard_confirmation_dev') OR
    EXISTS (SELECT 1 FROM pdc_private.payment_events ev
      WHERE ev.payment_id=v_pay.id AND ev.provider='tara' AND ev.verified_at IS NOT NULL AND
       (pg_catalog.lower(ev.event_type) LIKE '%refund%' OR
        pg_catalog.lower(ev.event_type) LIKE '%chargeback%' OR
        pg_catalog.lower(ev.event_type) LIKE '%disput%')) THEN
   RAISE EXCEPTION 'PDC_R5_FINANCIAL_CONTEXT_INVALID' USING ERRCODE='42501';
 END IF;
 IF v_order.formula='couple' AND v_order.partner_response_state<>'confirmed' AND
    NOT EXISTS(SELECT 1 FROM pdc_private.r5_couple_donation_split_dev d WHERE d.order_id=p_order) THEN
    RAISE EXCEPTION 'PDC_R51_PARTNER_NOT_CONFIRMED' USING ERRCODE='42501';
 END IF;
 v_count:=CASE WHEN v_order.formula='couple' AND NOT EXISTS(
   SELECT 1 FROM pdc_private.r5_couple_donation_split_dev d WHERE d.order_id=p_order) THEN 2 ELSE 1 END;
 IF (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=p_order AND (v_count=2 OR b.slot='member'))<>v_count OR
    (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b
      JOIN pdc_private.membership_applications a ON a.id=b.application_id
      WHERE b.order_id=p_order AND (v_count=2 OR b.slot='member') AND a.person_id=b.person_id AND b.consent_at IS NOT NULL AND
        a.policy_accepted_at IS NOT NULL AND a.policy_version IS NOT NULL AND
        a.data_notice_accepted_at IS NOT NULL AND a.submitted_at IS NOT NULL)<>v_count THEN
   RAISE EXCEPTION 'PDC_R5_BENEFICIARIES_NOT_ELIGIBLE' USING ERRCODE='42501';
 END IF;
 -- Les demandes de carte existent dès l'intake, mais ne sont jamais délivrées ici.
 -- Lock déterministe, compatible avec le compteur transactionnel V5B.62.
 PERFORM 1 FROM pdc_private.membership_applications a
   JOIN pdc_private.r5_diaspora_beneficiaries b ON b.application_id=a.id
   WHERE b.order_id=p_order ORDER BY a.id FOR UPDATE OF a;
 PERFORM 1 FROM pdc_private.people p
   JOIN pdc_private.r5_diaspora_beneficiaries b ON b.person_id=p.id
   WHERE b.order_id=p_order ORDER BY p.id FOR UPDATE OF p;
 SELECT count(*) INTO v_existing FROM pdc_private.r5_admissions_dev WHERE order_id=p_order;
 IF v_existing>0 THEN
   IF v_existing<>v_count OR
      (SELECT count(*) FROM pdc_private.r5_admissions_dev ad
        JOIN pdc_private.r5_diaspora_beneficiaries b ON b.order_id=ad.order_id AND b.slot=ad.slot
        JOIN pdc_private.membership_applications a ON a.id=b.application_id AND a.person_id=b.person_id
        JOIN pdc_private.memberships m ON m.id=ad.membership_id AND m.id=a.membership_id AND
             m.person_id=b.person_id AND m.member_number=ad.member_number
        JOIN pdc_private.internet_number_reservations n ON n.person_id=m.person_id AND n.member_number=m.member_number
        WHERE ad.order_id=p_order AND a.submission_status='accepted' AND m.status='active')<>v_count THEN
     RAISE EXCEPTION 'PDC_R5_PARTIAL_OR_INCONSISTENT_ADMISSION' USING ERRCODE='23514';
   END IF;
   RETURN QUERY SELECT ad.slot,ad.membership_id,ad.member_number
     FROM pdc_private.r5_admissions_dev ad WHERE ad.order_id=p_order
     ORDER BY CASE WHEN ad.slot='member' THEN 0 ELSE 1 END;
   RETURN;
 END IF;
 -- Précontrôler tous les bénéficiaires pour éviter une première admission partielle.
 FOR v_b IN SELECT b.* FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=p_order AND (v_count=2 OR b.slot='member')
   ORDER BY CASE WHEN b.slot='member' THEN 0 ELSE 1 END LOOP
   SELECT * INTO v_a FROM pdc_private.membership_applications WHERE id=v_b.application_id;
   SELECT * INTO v_person FROM pdc_private.people WHERE id=v_b.person_id;
   IF v_a.submission_status NOT IN ('submitted','under_review') OR
      v_a.membership_id IS NOT NULL OR v_a.application_type<>'initial' OR
      v_a.residence_group<>'diaspora' OR v_a.category_code<>
      ((v_count = 1 AND v_order.formula = 'couple' AND v_a.category_code <> 'simple') OR (NOT (v_count = 1 AND v_order.formula = 'couple') AND v_a.category_code <> v_order.formula)) OR
      v_a.person_id<>v_b.person_id OR v_person.id IS NULL OR
      v_person.civility NOT IN ('Madame','Monsieur') OR
      v_person.date_of_birth IS NULL OR v_person.date_of_birth>=CURRENT_DATE OR
      v_person.birth_place IS NULL OR pg_catalog.btrim(v_person.birth_place)='' OR
      EXISTS (SELECT 1 FROM pdc_private.memberships WHERE person_id=v_b.person_id) OR
      (v_a.card_requested AND (v_b.card_request_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM pdc_private.membership_card_requests c
          WHERE c.id=v_b.card_request_id AND c.application_id=v_a.id AND c.person_id=v_person.id
          AND c.status='requested' AND c.issued_at IS NULL))) THEN
       RAISE EXCEPTION 'PDC_R5_BENEFICIARY_INVALID' USING ERRCODE='42501';
   END IF;
 END LOOP;
 PERFORM pg_catalog.set_config('pdc.actor_user_id','',true);
 FOR v_b IN SELECT b.* FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=p_order AND (v_count=2 OR b.slot='member')
   ORDER BY CASE WHEN b.slot='member' THEN 0 ELSE 1 END LOOP
   SELECT * INTO v_person FROM pdc_private.people WHERE id=v_b.person_id;
   v_prefix:=CASE WHEN v_person.civility='Monsieur' THEN 'M' ELSE 'F' END;
   UPDATE pdc_private.internet_member_counter_v5b62 SET last_serial=last_serial+1
    WHERE singleton=true AND last_serial<999999 RETURNING last_serial INTO v_serial;
   IF v_serial IS NULL THEN RAISE EXCEPTION 'PDC_R5_NUMBER_EXHAUSTED'; END IF;
   v_number:=pdc_private.format_internet_member_number(v_prefix,v_serial);
   INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
     VALUES(v_serial,v_number,v_person.id);
   UPDATE pdc_private.people SET sex_code=v_prefix,updated_at=now() WHERE id=v_person.id;
   INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
     VALUES(v_person.id,v_number,'active',now(),NULL) RETURNING id INTO v_membership;
   UPDATE pdc_private.membership_applications SET submission_status='accepted',membership_id=v_membership
     WHERE id=v_b.application_id;
   INSERT INTO pdc_private.r5_admissions_dev(order_id,slot,membership_id,member_number)
     VALUES(p_order,v_b.slot,v_membership,v_number);
 END LOOP;
 UPDATE pdc_private.r5_diaspora_orders SET status='under_administrative_review'
   WHERE id=p_order AND status='payment_verified';
 INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
 VALUES ('r5.diaspora_admitted_dev','r5_diaspora_orders',p_order,
    jsonb_build_object('operator_label',p_operator,'beneficiary_count',v_count,
       'payment_id',v_pay.id,'currency_paid','XAF','legal_currency','EUR'));
 RETURN QUERY SELECT ad.slot,ad.membership_id,ad.member_number
   FROM pdc_private.r5_admissions_dev ad WHERE ad.order_id=p_order
   ORDER BY CASE WHEN ad.slot='member' THEN 0 ELSE 1 END;
END;$fn$;
REVOKE ALL ON FUNCTION pdc_private.r5_admit_verified_diaspora_dev(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;

-- Vue administrative : facilite le transfert STRICTEMENT privé des portraits provisoires
-- dans l'atelier V5-B existant, uniquement après admission et revue des cartes.
CREATE VIEW pdc_private.r5_card_photo_promotion_admin_dev WITH (security_invoker=true) AS
 SELECT b.order_id,b.slot,b.card_request_id,f.object_key AS provisional_object_key,
   f.sha256,f.bytes,ad.member_number,c.status AS card_status,m.verified_at
 FROM pdc_private.r5_diaspora_beneficiaries b
 JOIN pdc_private.r5_admissions_dev ad ON ad.order_id=b.order_id AND ad.slot=b.slot
 JOIN pdc_private.memberships m ON m.id=ad.membership_id AND m.status='active'
 JOIN pdc_private.membership_card_requests c ON c.id=b.card_request_id AND c.person_id=b.person_id
 JOIN pdc_private.r5_provisional_photos f ON f.order_id=b.order_id AND f.slot=b.slot AND f.state='stored'
 WHERE c.issued_at IS NULL AND c.delivered_at IS NULL AND c.status IN ('requested','reviewed');
REVOKE ALL ON TABLE pdc_private.r5_card_photo_promotion_admin_dev
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;

-- Table de rapprochement multi-devise en LECTURE seule, sans faux versement EUR.
CREATE VIEW pdc_private.r5_diaspora_finance_bridge_admin_dev WITH (security_invoker=true) AS
 SELECT o.id AS order_id,o.formula,o.legal_amount_eur_cents AS legal_due_eur_cents,
   COALESCE(split.member_dues_eur_cents,o.legal_amount_eur_cents) AS effective_dues_eur_cents,
   COALESCE(split.donation_eur_cents,0) AS effective_donation_eur_cents,
   o.provider_amount_xaf AS expected_gross_xaf,o.fx_rate_xaf_per_eur,
   p.id AS payment_id,p.status AS provider_payment_status,
   p.confirmed_at AS provider_confirmed_at,
   e.product_id,e.merchant_transaction_id,e.gross_xaf,e.net_xaf,e.fees_xaf,
   e.verified_at AS reconciliation_verified_at,
   (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=o.id) AS beneficiaries
 FROM pdc_private.r5_diaspora_orders o
 JOIN pdc_private.payment_attempts p ON p.id=o.payment_id
 LEFT JOIN pdc_private.r5_couple_donation_split_dev split ON split.order_id=o.id
 LEFT JOIN LATERAL (
   SELECT r.* FROM pdc_private.r5_financial_reconciliations r
   WHERE r.order_id=o.id ORDER BY r.recorded_at DESC,r.id DESC LIMIT 1
 ) e ON true;
REVOKE ALL ON TABLE pdc_private.r5_diaspora_finance_bridge_admin_dev
 FROM PUBLIC,anon,authenticated,service_role,pdc_tara_v5c_writer,pdc_r5_intake_writer,pdc_r5_photo_writer;

COMMENT ON TABLE pdc_private.r5_diaspora_orders IS 'DEV R5 : obligations EUR et un seul paiement prestataire XAF, avec taux PDC de 656; aucune seconde transaction fictive.';
COMMENT ON TABLE pdc_private.r5_provisional_photos IS 'DEV R5 : portrait avant paiement privé, à promouvoir/copie après admission vérifiée, jamais carte immédiate.';
-- R5.1.1 : permissions minimales des RPC photo, sans accès direct aux tables.
GRANT EXECUTE ON FUNCTION pdc_private.r5_photo_issue_dev(uuid,text,text,text,integer)
 TO pdc_r5_intake_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_photo_reserve_dev(uuid,text,text)
 TO pdc_r5_photo_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_photo_confirm_dev(uuid,integer,text,integer,integer)
 TO pdc_r5_photo_writer;
GRANT EXECUTE ON FUNCTION pdc_private.r5_photo_cancel_dev(uuid)
 TO pdc_r5_photo_writer;

COMMIT;
