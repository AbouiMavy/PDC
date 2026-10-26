-- V5-B.6.10-F1 — tests SQL sur pdc-developpement seulement.
-- Lancer APRES application de 01500. Transaction entiere annulee.
BEGIN;
DO $test$
DECLARE v_person uuid; v_member uuid; v_application uuid; v_card uuid;
 v_obligation uuid; v_payment uuid; v_grant uuid;
 v_asset uuid; v_key text; v_auth uuid;
 v_ref text := 'TEST-V5B610F1-' || replace(pg_catalog.gen_random_uuid()::text,'-','');
 v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_runtime_v5b3'] LOOP
    IF pg_catalog.has_function_privilege(v_role,
      'pdc_private.applicant_portrait_reserve_v5b610f1(uuid,text,text)','EXECUTE') OR
       pg_catalog.has_function_privilege(v_role,
      'pdc_private.applicant_portrait_confirm_v5b610f1(uuid,uuid,integer,text,integer,integer)','EXECUTE') OR
       pg_catalog.has_function_privilege(v_role,
      'pdc_private.applicant_portrait_cancel_v5b610f1(uuid,uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'F1 : execution induement accordee a %',v_role;
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('pdc_portrait_upload_runtime_v5b610c',
         'pdc_private.applicant_portrait_reserve_v5b610f1(uuid,text,text)','EXECUTE') OR
     pg_catalog.has_table_privilege('pdc_portrait_upload_runtime_v5b610c',
         'pdc_private.card_portrait_assets','SELECT') THEN
    RAISE EXCEPTION 'F1 : droit runtime invalide';
  END IF;
  RAISE NOTICE '1/7 : fonctions privees; aucune lecture directe du registre';

  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
    VALUES('Madame',v_ref,'TEST',DATE '1990-01-01','Obala','CM') RETURNING id INTO v_person;
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
    VALUES(v_person,v_application,'initial_membership_fee','urbain',2000,'XAF','open') RETURNING id INTO v_obligation;

  BEGIN
    PERFORM * FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card,repeat('a',64),'image/jpeg');
    RAISE EXCEPTION 'F1 a permis un depot sans paiement';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '2/7 : refus sans autorisation et sans paiement';

  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,provider_payment_id,currency,amount_minor,status,confirmed_at)
    VALUES(v_ref,v_person,'tara',v_ref,'XAF',2000,'confirmed',now()) RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
    VALUES(v_payment,v_obligation,2000);
  INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
    VALUES('tara',v_ref,v_payment,'payment.success',now());
  v_grant:=pdc_private.applicant_photo_issue_dev_v5b610e2(v_card,v_payment,repeat('a',64),600);
  BEGIN
    PERFORM * FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card,repeat('b',64),'image/jpeg');
    RAISE EXCEPTION 'F1 a accepte une fausse empreinte';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  BEGIN
    PERFORM * FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card,repeat('a',64),'image/png');
    RAISE EXCEPTION 'F1 a accepte un MIME non normalise';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  IF (SELECT consumed_at FROM pdc_private.applicant_portrait_grants_v5b610e2 WHERE id=v_grant) IS NOT NULL THEN
    RAISE EXCEPTION 'F1 a consomme un token pendant une transaction invalide';
  END IF;
  SELECT * INTO v_asset,v_key,v_auth
    FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card,repeat('a',64),'image/jpeg');
  IF v_auth<>v_grant OR v_key<>'card-requests/'||v_card::text||'/'||v_asset::text||'.jpg' OR
     NOT EXISTS(SELECT 1 FROM pdc_private.applicant_portrait_grants_v5b610e2
                WHERE id=v_grant AND consumed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'F1 : reservation / consommation non coherentes';
  END IF;
  RAISE NOTICE '3/7 : jeton consomme et chemin opaque reserve atomiquement';

  BEGIN
    PERFORM * FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card,repeat('a',64),'image/jpeg');
    RAISE EXCEPTION 'F1 a autorise le rejeu';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '4/7 : deuxieme depot / rejeu refuses';

  BEGIN
    PERFORM pdc_private.applicant_portrait_confirm_v5b610f1(pg_catalog.gen_random_uuid(),v_asset,1000,repeat('b',64),300,400);
    RAISE EXCEPTION 'F1 a confirme une photo avec un autre grant';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '5/7 : confirmation avec mauvaise autorisation interdite';

  IF NOT pdc_private.applicant_portrait_confirm_v5b610f1(v_auth,v_asset,1000,repeat('b',64),300,400) THEN
    RAISE EXCEPTION 'F1 : confirmation refusee';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pdc_private.card_portrait_assets
       WHERE id=v_asset AND status='stored' AND applicant_grant_id=v_grant AND sha256_hex=repeat('b',64)) OR
     NOT EXISTS(SELECT 1 FROM pdc_private.membership_card_requests
       WHERE id=v_card AND portrait_storage_key=v_key) THEN
    RAISE EXCEPTION 'F1 : photo non rattachee au bon dossier';
  END IF;
  RAISE NOTICE '6/7 : objet confirme et lie au seul dossier du demandeur';

  BEGIN
    PERFORM pdc_private.applicant_portrait_cancel_v5b610f1(v_auth,v_asset);
    RAISE EXCEPTION 'F1 a supprime une photo stockee';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '7/7 : photo stockee non effacable par cancel';
  RAISE NOTICE 'V5B610F1 : tous controles SQL reussis ; ROLLBACK';
END
$test$;
ROLLBACK;
