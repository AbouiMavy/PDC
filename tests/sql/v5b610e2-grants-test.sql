-- V5-B.6.10-E2 : droits, encaissement et unicite, DEV UNIQUEMENT.
-- Test transactionnel : AUCUN nouveau paiement, numero ni jeton apres ROLLBACK.
BEGIN;
DO $test$
DECLARE v_person uuid; v_member uuid; v_application uuid; v_card uuid;
  v_obligation uuid; v_payment uuid; v_grant uuid; v_grant2 uuid;
  v_result record; v_ref text := 'TEST-V5B610E2-' || replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_runtime_v5b3','pdc_portrait_upload_runtime_v5b610c'] LOOP
    IF pg_catalog.has_function_privilege(v_role,'pdc_private.applicant_photo_issue_dev_v5b610e2(uuid,uuid,text,integer)','EXECUTE') OR
       pg_catalog.has_table_privilege(v_role,'pdc_private.applicant_portrait_grants_v5b610e2','SELECT') THEN
      RAISE EXCEPTION 'Acces indu a la creation de jetons ou a leur registre: %',v_role;
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('pdc_portrait_upload_runtime_v5b610c',
    'pdc_private.applicant_photo_redeem_v5b610e2(uuid,text)','EXECUTE') OR
    pg_catalog.has_function_privilege('authenticated',
    'pdc_private.applicant_photo_redeem_v5b610e2(uuid,text)','EXECUTE') THEN
      RAISE EXCEPTION 'Permissions de consommation incorrectes';
  END IF;
  RAISE NOTICE '1/8 : emission privee, consommation serveur uniquement';

  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
    VALUES('Madame',v_ref,'TEST',DATE '1990-01-01','Obala','CM') RETURNING id INTO v_person;
  -- Un numero marque TEST seulement. N'affecte pas le compteur national.
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
    VALUES(v_person,v_ref,'active',now()) RETURNING id INTO v_member;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format)
    VALUES(v_ref,v_person,v_member,'initial','cameroon','urbain','accepted',now(),'TEST',now(),now(),true,'digital')
    RETURNING id INTO v_application;
  INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format,status)
    VALUES(v_application,v_person,'digital','requested') RETURNING id INTO v_card;
  INSERT INTO pdc_private.dues_obligations(person_id,application_id,kind,category_code,amount_due_minor,currency,status)
    VALUES(v_person,v_application,'initial_membership_fee','urbain',2000,'XAF','open')
    RETURNING id INTO v_obligation;

  BEGIN
    PERFORM pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,pg_catalog.gen_random_uuid(),repeat('a',64),600);
    RAISE EXCEPTION 'Emission admise sans paiement';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '2/8 : emission sans paiement interdite';

  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,provider_payment_id,currency,amount_minor,status,confirmed_at)
    VALUES(v_ref,v_person,'tara',v_ref,'XAF',2000,'confirmed',now()) RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES(v_payment,v_obligation,2000);
  BEGIN
    PERFORM pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,v_payment,repeat('a',64),600);
    RAISE EXCEPTION 'Evenement non verifie admis';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '3/8 : evenement prestataire verifie requis';

  INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
    VALUES('tara',v_ref,v_payment,'payment.success',now());
  v_grant:=pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,v_payment,repeat('a',64),600);
  IF v_grant IS NULL THEN RAISE EXCEPTION 'Emission impossible apres paiement'; END IF;
  RAISE NOTICE '4/8 : emission autorisee uniquement pour dossier effectivement paye';

  BEGIN
    PERFORM * FROM pdc_private.applicant_photo_redeem_v5b610e2(v_card,repeat('b',64));
    RAISE EXCEPTION 'Jeton incorrect admis';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '5/8 : jeton incorrect refuse';

  SELECT * INTO v_result FROM pdc_private.applicant_photo_redeem_v5b610e2(v_card,repeat('a',64));
  IF v_result.authorization_id <> v_grant OR v_result.card_request_id <> v_card OR
     v_result.permission <> 'portrait:write-once' THEN RAISE EXCEPTION 'Portee incorrecte'; END IF;
  BEGIN
    PERFORM * FROM pdc_private.applicant_photo_redeem_v5b610e2(v_card,repeat('a',64));
    RAISE EXCEPTION 'Rejeu du jeton accepte';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '6/8 : consommation unique';

  v_grant:=pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,v_payment,repeat('b',64),600);
  v_grant2:=pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,v_payment,repeat('c',64),600);
  IF (SELECT revoked_at FROM pdc_private.applicant_portrait_grants_v5b610e2 WHERE id=v_grant) IS NULL THEN
    RAISE EXCEPTION 'Ancienne autorisation encore active'; END IF;
  BEGIN
    PERFORM * FROM pdc_private.applicant_photo_redeem_v5b610e2(v_card,repeat('b',64));
    RAISE EXCEPTION 'Autorisation revoquee admise';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '7/8 : nouvelle emission revoque lancienne';

  UPDATE pdc_private.payment_attempts SET status='refunded' WHERE id=v_payment;
  BEGIN
    PERFORM * FROM pdc_private.applicant_photo_redeem_v5b610e2(v_card,repeat('c',64));
    RAISE EXCEPTION 'Paiement rembourse autorise';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '8/8 : paiement rembourse refuse lors de la consommation';
  RAISE NOTICE 'V5B610E2 : tests reussis - rollback integral';
END
$test$;
ROLLBACK;
