-- PDC V5-B.1 : tests d'intégration SQL pour une base SUPABASE DE DEVELOPPEMENT UNIQUEMENT.
-- Nécessite que la migration 20261025000100_pdc_v5b_private_schema.sql ait été appliquée.
-- Toutes les écritures sont fictives et annulées en fin de script par ROLLBACK.
-- NE JAMAIS exécuter sur une base de production.
BEGIN;

DO $v5b_test$
DECLARE
  v_prefix text := 'PDC_V5B_TEST_' || substr(gen_random_uuid()::text,1,12);
  v_person uuid;
  v_initial uuid;
  v_year uuid;
  v_payment1 uuid;
  v_payment2 uuid;
  v_payment3 uuid;
  v_eur uuid;
  v_paid bigint;
  v_balance bigint;
  v_rejected boolean;
BEGIN
  -- Accès privé : le navigateur ne doit pas accéder directement au registre.
  IF has_schema_privilege('anon', 'pdc_private', 'USAGE')
     OR has_schema_privilege('authenticated', 'pdc_private', 'USAGE') THEN
    RAISE EXCEPTION 'SECURITE : schema pdc_private visible aux utilisateurs publics';
  END IF;
  IF has_table_privilege('anon', 'pdc_private.people', 'SELECT')
     OR has_table_privilege('authenticated', 'pdc_private.people', 'SELECT') THEN
    RAISE EXCEPTION 'SECURITE : lecture des identites autorisee';
  END IF;
  IF has_table_privilege('service_role', 'pdc_private.audit_log', 'DELETE')
     OR has_table_privilege('service_role', 'pdc_private.payment_events', 'UPDATE') THEN
    RAISE EXCEPTION 'SECURITE : modification de journal ou evenement autorisee';
  END IF;
  RAISE NOTICE 'OK 1/7 : droits d acces aux tables sensibles';

  INSERT INTO pdc_private.people
    (last_name,first_name,country_of_residence,email)
  VALUES
    ('DONNEE-FICTIVE', 'TEST-V5B', 'CM', lower(v_prefix)||'@example.invalid')
  RETURNING id INTO v_person;

  INSERT INTO pdc_private.dues_obligations
    (person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
  VALUES (v_person,'initial_membership_fee',NULL,'urbain',2000,'XAF')
  RETURNING id INTO v_initial;
  INSERT INTO pdc_private.dues_obligations
    (person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
  VALUES (v_person,'annual_dues',2026,'urbain',12000,'XAF')
  RETURNING id INTO v_year;
  RAISE NOTICE 'OK 2/7 : frais initiaux et cotisation annuelle separes';

  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
  VALUES (v_prefix||'_PAY1',v_person,'manual','XAF',5000,'confirmed',now())
  RETURNING id INTO v_payment1;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
  VALUES (v_payment1,v_initial,2000),(v_payment1,v_year,3000);

  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
  VALUES (v_prefix||'_PAY2',v_person,'manual','XAF',4000,'confirmed',now())
  RETURNING id INTO v_payment2;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
  VALUES (v_payment2,v_year,4000);

  SELECT amount_paid_minor,balance_minor INTO v_paid,v_balance
    FROM pdc_private.obligation_balances WHERE obligation_id=v_year;
  IF v_paid IS DISTINCT FROM 7000 OR v_balance IS DISTINCT FROM 5000 THEN
    RAISE EXCEPTION 'SOLDE INCORRECT: paye=%, reste=%',v_paid,v_balance;
  END IF;
  RAISE NOTICE 'OK 3/7 : 7000 XAF payes, solde annuel 5000 XAF';

  -- Doubles frais initiaux interdits.
  v_rejected := false;
  BEGIN
    INSERT INTO pdc_private.dues_obligations
      (person_id,kind,fiscal_year,category_code,amount_due_minor,currency)
    VALUES (v_person,'initial_membership_fee',NULL,'urbain',2000,'XAF');
  EXCEPTION WHEN unique_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'ECHEC: doubles frais initiaux acceptes'; END IF;
  RAISE NOTICE 'OK 4/7 : doublons des frais initiaux rejetes';

  -- Les affectations ne doivent pas depasser le montant annuel.
  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,currency,amount_minor,status)
  VALUES (v_prefix||'_PAY3',v_person,'manual','XAF',6000,'initiated')
  RETURNING id INTO v_payment3;
  v_rejected := false;
  BEGIN
    INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES (v_payment3,v_year,6000);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%Target overallocation%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'ECHEC: depassement de cotisation accepte'; END IF;
  RAISE NOTICE 'OK 5/7 : depassement des plafonds rejete';

  -- Refus d'un paiement en EUR pour une obligation en XAF.
  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,currency,amount_minor,status)
  VALUES (v_prefix||'_EUR',v_person,'manual','EUR',20000,'initiated')
  RETURNING id INTO v_eur;
  v_rejected := false;
  BEGIN
    INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES (v_eur,v_year,100);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%Payer/currency mismatch%' THEN
      v_rejected := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'ECHEC: devises incompatibles acceptees'; END IF;
  RAISE NOTICE 'OK 6/7 : devises incompatibles rejetees';

  INSERT INTO pdc_private.payment_events
    (provider,provider_event_id,event_type,verified_at)
  VALUES ('tara',v_prefix||'_EVENT','test_synthetique',now());
  v_rejected := false;
  BEGIN
    INSERT INTO pdc_private.payment_events
      (provider,provider_event_id,event_type,verified_at)
    VALUES ('tara',v_prefix||'_EVENT','test_synthetique',now());
  EXCEPTION WHEN unique_violation THEN
    v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'ECHEC: webhook duplique accepte'; END IF;
  RAISE NOTICE 'OK 7/7 : identifiants d evenements uniques';

  RAISE NOTICE 'V5-B.1 : 7 tests reussis. Annulation des donnees fictives par ROLLBACK.';
END;
$v5b_test$;

ROLLBACK;
