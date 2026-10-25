-- PDC V5-B.5 : tests d'intégration PostgreSQL.
-- ATTENTION : uniquement pdc-developpement. Transaction ROLLBACK en fin de script.
-- Nécessite l'utilisateur de test Auth pdc-v5b3-test@example.invalid (sans habilitation persistante).
BEGIN;
DO $test$
DECLARE
  v_actor uuid;
  v_person uuid;
  v_person_eur uuid;
  v_init uuid;
  v_annual uuid;
  v_donation uuid;
  v_donation_eur uuid;
  v_payment uuid;
  v_payment2 uuid;
  v_pending uuid;
  v_donpay uuid;
  v_donpay_eur uuid;
  v_before_xaf record;
  v_after_xaf record;
  v_before_eur record;
  v_after_eur record;
BEGIN
  IF has_function_privilege('anon','pdc_private.api_finance_overview(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','pdc_private.api_finance_overview(uuid)','EXECUTE')
    OR has_function_privilege('service_role','pdc_private.api_finance_overview(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Function is exposed to API roles';
  END IF;
  IF NOT has_function_privilege('pdc_api_runtime_v5b3','pdc_private.api_finance_overview(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Runtime role missing EXECUTE';
  END IF;
  IF has_table_privilege('pdc_api_runtime_v5b3','pdc_private.people','SELECT') THEN
    RAISE EXCEPTION 'Runtime role has direct access to people';
  END IF;

  BEGIN
    PERFORM * FROM pdc_private.api_finance_overview('00000000-0000-4000-8000-000000000000');
    RAISE EXCEPTION 'Non-admin unexpectedly authorized';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;

  SELECT id INTO v_actor FROM auth.users WHERE email='pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Create test Supabase Auth account first'; END IF;
  INSERT INTO pdc_private.role_assignments(auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
   VALUES(v_actor,'national_admin',NULL,now(),now()+interval '20 minutes');

  SELECT * INTO v_before_xaf FROM pdc_private.api_finance_overview(v_actor) WHERE currency='XAF';
  SELECT * INTO v_before_eur FROM pdc_private.api_finance_overview(v_actor) WHERE currency='EUR';

  INSERT INTO pdc_private.people(last_name,first_name,country_of_residence)
    VALUES('TEST-V5B5','FINANCE-XAF','CM') RETURNING id INTO v_person;
  INSERT INTO pdc_private.people(last_name,first_name,country_of_residence)
    VALUES('TEST-V5B5','FINANCE-EUR','FR') RETURNING id INTO v_person_eur;

  INSERT INTO pdc_private.dues_obligations(person_id,kind,category_code,amount_due_minor,currency)
    VALUES(v_person,'initial_membership_fee','urban',2000,'XAF') RETURNING id INTO v_init;
  INSERT INTO pdc_private.dues_obligations(person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
    VALUES(v_person,'annual_dues',2026,'urban',12000,'XAF') RETURNING id INTO v_annual;

  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
    VALUES('TEST-V5B5-PAY-1',v_person,'manual','XAF',4000,'confirmed',now()) RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES(v_payment,v_init,2000),(v_payment,v_annual,2000);
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
    VALUES('TEST-V5B5-PAY-2',v_person,'manual','XAF',1000,'confirmed',now()) RETURNING id INTO v_payment2;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES(v_payment2,v_annual,1000);
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status)
    VALUES('TEST-V5B5-PENDING',v_person,'manual','XAF',1500,'pending') RETURNING id INTO v_pending;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES(v_pending,v_annual,1500);

  INSERT INTO pdc_private.donations(reference,person_id,currency,amount_minor,frequency,status)
    VALUES('TEST-V5B5-DON-XAF',v_person,'XAF',500,'once','awaiting_payment') RETURNING id INTO v_donation;
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
    VALUES('TEST-V5B5-DONPAY-XAF',v_person,'manual','XAF',500,'confirmed',now()) RETURNING id INTO v_donpay;
  INSERT INTO pdc_private.payment_allocations(payment_id,donation_id,amount_minor)
    VALUES(v_donpay,v_donation,500);

  INSERT INTO pdc_private.donations(reference,person_id,currency,amount_minor,frequency,status)
    VALUES('TEST-V5B5-DON-EUR',v_person_eur,'EUR',1500,'once','awaiting_payment') RETURNING id INTO v_donation_eur;
  INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
    VALUES('TEST-V5B5-DONPAY-EUR',v_person_eur,'manual','EUR',1500,'confirmed',now()) RETURNING id INTO v_donpay_eur;
  INSERT INTO pdc_private.payment_allocations(payment_id,donation_id,amount_minor)
    VALUES(v_donpay_eur,v_donation_eur,1500);

  SELECT * INTO v_after_xaf FROM pdc_private.api_finance_overview(v_actor) WHERE currency='XAF';
  SELECT * INTO v_after_eur FROM pdc_private.api_finance_overview(v_actor) WHERE currency='EUR';

  IF v_after_xaf.initial_fee_due_minor - v_before_xaf.initial_fee_due_minor <> 2000
    OR v_after_xaf.initial_fee_paid_minor - v_before_xaf.initial_fee_paid_minor <> 2000
    OR v_after_xaf.annual_dues_due_minor - v_before_xaf.annual_dues_due_minor <> 12000
    OR v_after_xaf.annual_dues_paid_minor - v_before_xaf.annual_dues_paid_minor <> 3000
    OR v_after_xaf.donations_confirmed_minor - v_before_xaf.donations_confirmed_minor <> 500 THEN
    RAISE EXCEPTION 'XAF finance totals invalid';
  END IF;
  IF v_after_eur.donations_confirmed_minor - v_before_eur.donations_confirmed_minor <> 1500 THEN
    RAISE EXCEPTION 'EUR finance totals invalid';
  END IF;
END;
$test$;
ROLLBACK;
