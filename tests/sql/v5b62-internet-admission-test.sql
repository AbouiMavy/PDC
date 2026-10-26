-- TEST SQL INTEGRATION V5-B.6.2. Dev SEULEMENT. Execution complete.
-- Tout ce script est annule, y compris le compteur transactionnel.
BEGIN;
DO $test_v5b62$
DECLARE
  v_prefix text := 'TEST-V5B62-' || replace(gen_random_uuid()::text,'-','');
  v_person uuid;
  v_app uuid;
  v_fee uuid;
  v_payment uuid;
  v_member uuid;
  v_member_retry uuid;
  v_number text;
  v_number_retry text;
  v_initial_serial integer;
  v_person_f uuid;
  v_app_f uuid;
  v_fee_f uuid;
  v_payment_f uuid;
  v_member_f uuid;
  v_number_f text;
  v_blocked boolean;
BEGIN
  IF has_function_privilege('anon','pdc_private.admit_paid_internet_dev(uuid)','EXECUTE')
     OR has_function_privilege('authenticated','pdc_private.admit_paid_internet_dev(uuid)','EXECUTE')
     OR has_function_privilege('service_role','pdc_private.admit_paid_internet_dev(uuid)','EXECUTE')
     OR has_function_privilege('pdc_api_runtime_v5b3','pdc_private.admit_paid_internet_dev(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'SECURITE : admission accessible a un role non autorise';
  END IF;
  RAISE NOTICE '1/10 : fonction privee, API inchangee';

  SELECT last_serial INTO v_initial_serial
    FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true;
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
  VALUES('Monsieur','PDC-TEST','WEB-TEST',DATE '1991-05-14','Obala','CM',v_prefix||'@example.invalid')
  RETURNING id INTO v_person;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format)
  VALUES(v_prefix||'-APP',v_person,'initial','cameroon','urbain',
        'submitted',now(),'TEST',now(),now(),true,'digital')
  RETURNING id INTO v_app;

  v_blocked:=false;
  BEGIN
    PERFORM * FROM pdc_private.admit_paid_internet_dev(v_app);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%PDC_PAYMENT_NOT_VERIFIED%' THEN v_blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Adhesion sans paiement permise'; END IF;
  RAISE NOTICE '2/10 : pas d admission sans paiement';

  INSERT INTO pdc_private.dues_obligations
    (person_id,application_id,kind,category_code,amount_due_minor,currency)
  VALUES(v_person,v_app,'initial_membership_fee','urbain',2000,'XAF')
  RETURNING id INTO v_fee;
  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,provider_payment_id,currency,amount_minor,status,confirmed_at)
  VALUES(v_prefix||'-PAY',v_person,'tara',v_prefix||'-PROVIDER','XAF',2000,'confirmed',now())
  RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
  VALUES(v_payment,v_fee,2000);

  v_blocked:=false;
  BEGIN
    PERFORM * FROM pdc_private.admit_paid_internet_dev(v_app);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%PDC_PAYMENT_NOT_VERIFIED%' THEN v_blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Paiement sans evenement verifie accepte'; END IF;
  RAISE NOTICE '3/10 : paiement sans evenement verifie refuse';

  INSERT INTO pdc_private.payment_events
    (provider,provider_event_id,payment_id,event_type,verified_at)
  VALUES('tara',v_prefix||'-EVENT',v_payment,'payment.confirmed',now());
  SELECT membership_id,member_number INTO v_member,v_number
    FROM pdc_private.admit_paid_internet_dev(v_app);
  IF v_member IS NULL OR v_number !~ '^M-PDC-I-[0-9]{6}$' THEN
    RAISE EXCEPTION 'Admission/numero invalide : %',v_number;
  END IF;
  IF (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)
     <> v_initial_serial+1 THEN RAISE EXCEPTION 'Compteur incoherent'; END IF;
  IF (SELECT sex_code FROM pdc_private.people WHERE id=v_person) <> 'M' THEN
    RAISE EXCEPTION 'Pref M non deduit de Monsieur'; END IF;
  RAISE NOTICE '4/10 : admission+prefix+compteur OK';

  SELECT membership_id,member_number INTO v_member_retry,v_number_retry
    FROM pdc_private.admit_paid_internet_dev(v_app);
  IF v_member_retry<>v_member OR v_number_retry<>v_number THEN
    RAISE EXCEPTION 'Non idempotent'; END IF;
  IF (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)
     <> v_initial_serial+1 THEN RAISE EXCEPTION 'Retry consomme un numero'; END IF;
  RAISE NOTICE '5/10 : retry idempotent sans allocation';

  IF NOT EXISTS (SELECT 1 FROM pdc_private.internet_number_reservations
                 WHERE person_id=v_person AND member_number=v_number)
     OR NOT EXISTS (SELECT 1 FROM pdc_private.membership_card_requests
                    WHERE person_id=v_person AND requested_format='digital') THEN
    RAISE EXCEPTION 'Reservation ou demande de carte manquante'; END IF;
  RAISE NOTICE '6/10 : numero reserve et demande de carte enregistree';

  IF NOT EXISTS (SELECT 1 FROM pdc_private.memberships
                 WHERE id=v_member AND status='active' AND verified_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM pdc_private.membership_applications
                    WHERE id=v_app AND submission_status='accepted' AND membership_id=v_member) THEN
    RAISE EXCEPTION 'Statut d inscription incoherent'; END IF;
  RAISE NOTICE '7/10 : statut actif mais non encore verifie';

  IF NOT EXISTS (SELECT 1 FROM pdc_private.audit_log
                 WHERE target_id=v_member AND action='membership.created') THEN
    RAISE EXCEPTION 'Audit manquant'; END IF;
  RAISE NOTICE '8/10 : audit present';

  -- 9. Cas femme dans la diaspora, tarif reduit : 15 EUR = 1500 centimes.
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
  VALUES('Madame','PDC-TEST','DIASPORA-F',DATE '1993-02-17','Yaounde','FR',v_prefix||'-f@example.invalid')
  RETURNING id INTO v_person_f;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
  VALUES(v_prefix||'-APP-F',v_person_f,'initial','diaspora','reduit',
        'submitted',now(),'TEST',now(),now())
  RETURNING id INTO v_app_f;
  INSERT INTO pdc_private.dues_obligations
    (person_id,application_id,kind,fiscal_year,category_code,amount_due_minor,currency)
  VALUES(v_person_f,v_app_f,'annual_dues',EXTRACT(YEAR FROM CURRENT_DATE)::integer,'reduit',1500,'EUR')
  RETURNING id INTO v_fee_f;
  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,provider_payment_id,currency,amount_minor,status,confirmed_at)
  VALUES(v_prefix||'-PAY-F',v_person_f,'stripe',v_prefix||'-PROVIDER-F','EUR',1500,'confirmed',now())
  RETURNING id INTO v_payment_f;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
  VALUES(v_payment_f,v_fee_f,1500);
  INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
  VALUES('stripe',v_prefix||'-EVENT-F',v_payment_f,'payment.confirmed',now());
  SELECT membership_id,member_number INTO v_member_f,v_number_f
    FROM pdc_private.admit_paid_internet_dev(v_app_f);
  IF v_number_f !~ '^F-PDC-I-[0-9]{6}$'
     OR v_member_f IS NULL
     OR (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)
         <> v_initial_serial+2 THEN
    RAISE EXCEPTION 'Diaspora/F : admission, prefixe ou compteur invalide';
  END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.membership_card_requests WHERE person_id=v_person_f) THEN
    RAISE EXCEPTION 'Demande de carte ajoutee sans option'; END IF;
  RAISE NOTICE '9/10 : diaspora reduit EUR, prefixe F, carte facultative';

  -- 10. Une categorie couple ne doit pas admettre artificiellement une seule personne.
  -- Tester le refus du couple sur un nouveau dossier distinct.
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
  VALUES('Madame','PDC-TEST','COUPLE-DEV',DATE '1987-03-21','Obala','FR',v_prefix||'-couple@example.invalid')
  RETURNING id INTO v_person_f;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
  VALUES(v_prefix||'-APP-C',v_person_f,'initial','diaspora','couple',
        'submitted',now(),'TEST',now(),now())
  RETURNING id INTO v_app_f;
  v_blocked:=false;
  BEGIN
    PERFORM * FROM pdc_private.admit_paid_internet_dev(v_app_f);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%PDC_COUPLE_PAYMENT_MODEL_PENDING%' THEN v_blocked:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Couple admis sans rapprochement commun'; END IF;
  RAISE NOTICE '10/10 : couple non pris en charge par erreur';
  RAISE NOTICE 'V5-B.6.2 : rollback integral, compteur initial=%',v_initial_serial;
END;
$test_v5b62$;
ROLLBACK;
