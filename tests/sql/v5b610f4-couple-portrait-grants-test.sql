-- PDC F4 : tests SQL DEV transactionnels, à exécuter après migration 01900.
-- Aucun paiement réel, aucune photo réelle, aucun numéro de test conservé.
BEGIN;
DO $tests$
DECLARE
 v_ref text := 'TEST-F4-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 v_payer uuid; v_partner uuid; v_app1 uuid; v_app2 uuid;
 v_order uuid; v_pay uuid; v_card_m uuid; v_card_p uuid;
 v_rec record; v_id_m uuid; v_id_p uuid; v_grant_m uuid; v_grant_p uuid;
 v_asset_m uuid; v_asset_p uuid; v_key text; v_auth uuid;
 v_failed boolean; v_role text;
BEGIN
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_v5b3',
  'pdc_api_runtime_v5b3','pdc_portrait_upload_runtime_v5b610c'] LOOP
  IF pg_catalog.has_function_privilege(v_role,
   'pdc_private.couple_photo_issue_pair_dev_v5b610f4(uuid,text,text,integer)','EXECUTE') OR
   pg_catalog.has_function_privilege(v_role,
   'pdc_private.couple_photo_paid_v5b610f4(uuid,uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'F4: fonction exposee a %',v_role;
  END IF;
 END LOOP;
 RAISE NOTICE '1/12 : aucune permission publique d emission de jetons couple';
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
 VALUES('Monsieur',v_ref,'Membre',DATE '1987-05-10','Ville fictive','FR') RETURNING id INTO v_payer;
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
 VALUES('Madame',v_ref,'Partenaire',DATE '1990-07-11','Ville fictive','FR') RETURNING id INTO v_partner;
 INSERT INTO pdc_private.membership_applications
 (reference,person_id,application_type,residence_group,category_code,submission_status,
  policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at,card_requested,card_format)
 VALUES(v_ref||'-APP1',v_payer,'initial','diaspora','couple','submitted',now(),'TEST',now(),now(),true,'digital')
 RETURNING id INTO v_app1;
 INSERT INTO pdc_private.membership_applications
 (reference,person_id,application_type,residence_group,category_code,submission_status,
  policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at,card_requested,card_format)
 VALUES(v_ref||'-APP2',v_partner,'initial','diaspora','couple','submitted',now(),'TEST',now(),now(),true,'both')
 RETURNING id INTO v_app2;
 INSERT INTO pdc_private.couple_checkout_orders_v5b610f2(reference,payer_person_id)
 VALUES(v_ref||'-ORDER',v_payer) RETURNING id INTO v_order;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order,'member',v_payer,v_app1),(v_order,'partner',v_partner,v_app2);
 RAISE NOTICE '2/12 : deux dossiers fictifs sans paiement';
 v_failed:=false;
 BEGIN
  PERFORM * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4(v_order,repeat('a',64),repeat('b',64));
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F4: jetons emis sans paiement'; END IF;
 RAISE NOTICE '3/12 : paiement absent refuse';
 INSERT INTO pdc_private.payment_attempts
 (reference,payer_id,provider,provider_payment_id,currency,amount_minor,status)
 VALUES(v_ref||'-PAY',v_payer,'stripe',v_ref||'-PROVIDER','EUR',4000,'pending')
 RETURNING id INTO v_pay;
 UPDATE pdc_private.couple_checkout_orders_v5b610f2
  SET status='awaiting_payment',payment_id=v_pay WHERE id=v_order;
 UPDATE pdc_private.payment_attempts SET status='confirmed',confirmed_at=now() WHERE id=v_pay;
 IF pdc_private.couple_photo_paid_v5b610f4(pg_catalog.gen_random_uuid(),v_pay) THEN
  RAISE EXCEPTION 'F4: carte etrangere acceptee'; END IF;
 v_failed:=false;
 BEGIN
  PERFORM * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4(v_order,repeat('a',64),repeat('b',64));
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F4: confirmation sans evenement acceptee'; END IF;
 RAISE NOTICE '4/12 : paiement sans evenement verifie refuse';
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_ref||'-CONFIRM',v_pay,'payment.succeeded',now());
 v_failed:=false;
 BEGIN
  PERFORM * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4(v_order,repeat('a',64),repeat('b',64));
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F4: sans admission jetons emis'; END IF;
 RAISE NOTICE '5/12 : aucune emission avant admission complete';
 PERFORM * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order);
 SELECT c.id INTO v_card_m FROM pdc_private.membership_card_requests c WHERE c.application_id=v_app1;
 SELECT c.id INTO v_card_p FROM pdc_private.membership_card_requests c WHERE c.application_id=v_app2;
 IF v_card_m IS NULL OR v_card_p IS NULL OR v_card_m=v_card_p OR
    NOT pdc_private.couple_photo_paid_v5b610f4(v_card_m,v_pay) OR
    NOT pdc_private.couple_photo_paid_v5b610f4(v_card_p,v_pay) OR
    NOT pdc_private.applicant_photo_paid_single_v5b610e2(v_card_m,v_pay) OR
    pdc_private.couple_photo_paid_v5b610f4(v_card_m,pg_catalog.gen_random_uuid()) THEN
  RAISE EXCEPTION 'F4: rattachement conjoint/paiement invalide'; END IF;
 RAISE NOTICE '6/12 : deux cartes admissibles via la meme transaction et les bonnes admissions';
 v_failed:=false;
 BEGIN
  PERFORM * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4(v_order,repeat('a',64),repeat('a',64));
 EXCEPTION WHEN SQLSTATE '22023' THEN v_failed:=true;
 END;
 IF NOT v_failed OR EXISTS(SELECT 1 FROM pdc_private.applicant_portrait_grants_v5b610e2
  WHERE card_request_id IN (v_card_m,v_card_p)) THEN
  RAISE EXCEPTION 'F4: hash identique accepte ou mutation partielle'; END IF;
 RAISE NOTICE '7/12 : empreintes identiques interdites et aucune mutation';
 FOR v_rec IN SELECT * FROM pdc_private.couple_photo_issue_pair_dev_v5b610f4(
    v_order,repeat('a',64),repeat('b',64),600) LOOP
  IF v_rec.beneficiary_slot='member' THEN v_id_m:=v_rec.card_request_id;v_grant_m:=v_rec.grant_id;
  ELSIF v_rec.beneficiary_slot='partner' THEN v_id_p:=v_rec.card_request_id;v_grant_p:=v_rec.grant_id;
  ELSE RAISE EXCEPTION 'F4: slot inconnu'; END IF;
  IF v_rec.expires_at <= pg_catalog.now() OR v_rec.expires_at > pg_catalog.now()+INTERVAL '15 minutes' THEN
   RAISE EXCEPTION 'F4: expiration invalide'; END IF;
 END LOOP;
 IF v_id_m<>v_card_m OR v_id_p<>v_card_p OR v_grant_m=v_grant_p OR
    (SELECT pg_catalog.count(*) FROM pdc_private.applicant_portrait_grants_v5b610e2
     WHERE id IN (v_grant_m,v_grant_p) AND payment_id=v_pay)=0 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.applicant_portrait_grants_v5b610e2
     WHERE id IN (v_grant_m,v_grant_p) AND payment_id=v_pay)<>2 THEN
  RAISE EXCEPTION 'F4: emission de deux jetons individuels invalide'; END IF;
 RAISE NOTICE '8/12 : deux autorisations distinctes et liees au paiement unique';
 v_failed:=false;
 BEGIN
  PERFORM * FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card_m,repeat('b',64),'image/jpeg');
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F4: jeton conjoint croise accepte'; END IF;
 RAISE NOTICE '9/12 : jetons non interchangeables entre conjoints';
 SELECT asset_id,object_key,authorization_id INTO v_asset_m,v_key,v_auth
 FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card_m,repeat('a',64),'image/jpeg');
 IF v_auth<>v_grant_m OR v_key NOT LIKE 'card-requests/'||v_card_m::text||'/%' THEN
  RAISE EXCEPTION 'F4: reservation membre invalide'; END IF;
 SELECT asset_id,object_key,authorization_id INTO v_asset_p,v_key,v_auth
 FROM pdc_private.applicant_portrait_reserve_v5b610f1(v_card_p,repeat('b',64),'image/jpeg');
 IF v_auth<>v_grant_p OR v_asset_m=v_asset_p OR
    v_key NOT LIKE 'card-requests/'||v_card_p::text||'/%' THEN
  RAISE EXCEPTION 'F4: reservation partenaire invalide'; END IF;
 RAISE NOTICE '10/12 : deux reservations isolees, jetons consommes';
 IF NOT pdc_private.applicant_portrait_confirm_v5b610f1(v_grant_m,v_asset_m,1200,repeat('c',64),300,400) OR
    NOT pdc_private.applicant_portrait_confirm_v5b610f1(v_grant_p,v_asset_p,1300,repeat('d',64),300,400) THEN
  RAISE EXCEPTION 'F4: confirmation refusee'; END IF;
 IF (SELECT pg_catalog.count(*) FROM pdc_private.membership_card_requests
      WHERE id IN (v_card_m,v_card_p) AND portrait_storage_key IS NOT NULL
        AND issued_at IS NULL AND delivered_at IS NULL)=0 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.membership_card_requests
      WHERE id IN (v_card_m,v_card_p) AND portrait_storage_key IS NOT NULL
        AND issued_at IS NULL AND delivered_at IS NULL)<>2 THEN
  RAISE EXCEPTION 'F4: cartes ou liens incorrects'; END IF;
 RAISE NOTICE '11/12 : deux objets lies, aucune carte delivree';
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_ref||'-REFUND',v_pay,'payment.refunded',now());
 IF pdc_private.couple_photo_paid_v5b610f4(v_card_m,v_pay)
    OR pdc_private.couple_photo_paid_v5b610f4(v_card_p,v_pay)
    OR pdc_private.applicant_photo_paid_single_v5b610e2(v_card_m,v_pay) THEN
  RAISE EXCEPTION 'F4: remboursement ignore'; END IF;
 RAISE NOTICE '12/12 : remboursement bloque toute preuve ulterieure';
 RAISE NOTICE 'F4 : succes du jeu SQL fictif ; ROLLBACK complet';
END;
$tests$;
ROLLBACK;
