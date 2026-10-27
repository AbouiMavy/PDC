-- V5-B.6.10-F3 — tests PostgreSQL transactionnels, uniquement pdc-developpement.
-- Exécuter le fichier COMPLET après migration 01700. Aucune donnée n'est conservée.
-- Les notifications prestataires sont FICTIVES et insérées seulement dans ce test.
BEGIN;
DO $test$
DECLARE
 v_ref text := 'TEST-F3-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 v_payer uuid; v_partner uuid; v_app1 uuid; v_app2 uuid;
 v_order uuid; v_payment uuid; v_rec record;
 v_m uuid; v_p uuid; v_num_m text; v_num_p text;
 v_count_before integer; v_count_after integer;
 v_role text; v_failed boolean;
 v_other1 uuid; v_other2 uuid; v_otherapp1 uuid; v_otherapp2 uuid;
 v_otherorder uuid; v_otherpay uuid;
BEGIN
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_v5b3',
     'pdc_api_runtime_v5b3','pdc_portrait_upload_runtime_v5b610c'] LOOP
   IF pg_catalog.has_function_privilege(v_role,
      'pdc_private.admit_paid_couple_dev_v5b610f3(uuid)','EXECUTE') OR
      pg_catalog.has_table_privilege(v_role,
      'pdc_private.couple_admissions_v5b610f3','SELECT') THEN
     RAISE EXCEPTION 'F3 : privilège indu pour %',v_role;
   END IF;
 END LOOP;
 RAISE NOTICE '1/12 : procédure et registre privés';

 SELECT last_serial INTO v_count_before FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true;
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
 VALUES('Monsieur',v_ref,'Membre',DATE '1987-05-10','Ville fictive','FR',v_ref||'-1@example.invalid')
 RETURNING id INTO v_payer;
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
 VALUES('Madame',v_ref,'Partenaire',DATE '1990-07-11','Ville fictive','FR',v_ref||'-2@example.invalid')
 RETURNING id INTO v_partner;
 INSERT INTO pdc_private.membership_applications
 (reference,person_id,application_type,residence_group,category_code,submission_status,
  policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at,card_requested,card_format)
 VALUES(v_ref||'-APP1',v_payer,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now(),true,'digital')
 RETURNING id INTO v_app1;
 INSERT INTO pdc_private.membership_applications
 (reference,person_id,application_type,residence_group,category_code,submission_status,
  policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at,card_requested,card_format)
 VALUES(v_ref||'-APP2',v_partner,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now(),true,'both')
 RETURNING id INTO v_app2;
 INSERT INTO pdc_private.couple_checkout_orders_v5b610f2(reference,payer_person_id)
 VALUES(v_ref||'-ORDER',v_payer) RETURNING id INTO v_order;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order,'member',v_payer,v_app1),(v_order,'partner',v_partner,v_app2);
 RAISE NOTICE '2/12 : deux demandes distinctes, aucun membre encore admis';

 INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,provider_payment_id,currency,amount_minor,status)
 VALUES(v_ref||'-PAY',v_payer,'stripe',v_ref||'-PROVIDER','EUR',4000,'pending')
 RETURNING id INTO v_payment;
 UPDATE pdc_private.couple_checkout_orders_v5b610f2
 SET status='awaiting_payment',payment_id=v_payment WHERE id=v_order;
 v_failed:=false;
 BEGIN
   PERFORM * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed OR EXISTS (SELECT 1 FROM pdc_private.memberships WHERE person_id IN (v_payer,v_partner)) THEN
   RAISE EXCEPTION 'F3 : admission autorisée sur paiement en attente';
 END IF;
 RAISE NOTICE '3/12 : paiement pending refusé';

 UPDATE pdc_private.payment_attempts SET status='confirmed',confirmed_at=now() WHERE id=v_payment;
 v_failed:=false;
 BEGIN
   PERFORM * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F3 : événement vérifié absent'; END IF;
 RAISE NOTICE '4/12 : pas d admission sans événement vérifié';

 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_ref||'-WEBHOOK',v_payment,'payment.succeeded',now());
 IF NOT pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F3 : F2 n accepte pas le paiement fictif'; END IF;
 RAISE NOTICE '5/12 : paiement de 40 EUR vérifié sans affectation individuelle';

 -- Une seule fonction doit créer les DEUX membres (appel SQL comme une instruction).
 FOR v_rec IN SELECT * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order) LOOP
   IF v_rec.slot='member' THEN v_m:=v_rec.membership_id;v_num_m:=v_rec.member_number;
   ELSIF v_rec.slot='partner' THEN v_p:=v_rec.membership_id;v_num_p:=v_rec.member_number;
   ELSE RAISE EXCEPTION 'F3 : slot inconnu'; END IF;
 END LOOP;
 IF v_m IS NULL OR v_p IS NULL OR v_m=v_p OR
    v_num_m !~ '^M-PDC-I-[0-9]{6}$' OR v_num_p !~ '^F-PDC-I-[0-9]{6}$' OR
    pg_catalog.right(v_num_m,6)::integer<>v_count_before+1 OR
    pg_catalog.right(v_num_p,6)::integer<>v_count_before+2 OR
    (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)<>v_count_before+2 THEN
   RAISE EXCEPTION 'F3 : deux admissions ou numérotation incorrectes'; END IF;
 RAISE NOTICE '6/12 : deux admissions, deux numéros distincts du compteur national';

 IF (SELECT pg_catalog.count(*) FROM pdc_private.couple_admissions_v5b610f3 WHERE order_id=v_order)<>1 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.memberships WHERE id IN (v_m,v_p) AND status='active' AND verified_at IS NULL)<>2 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.membership_applications WHERE id IN (v_app1,v_app2) AND submission_status='accepted')<>2 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.internet_number_reservations WHERE member_number IN (v_num_m,v_num_p))<>2 THEN
   RAISE EXCEPTION 'F3 : registre et dossiers incohérents'; END IF;
 IF (SELECT sex_code FROM pdc_private.people WHERE id=v_payer)<>'M' OR
    (SELECT sex_code FROM pdc_private.people WHERE id=v_partner)<>'F' THEN
   RAISE EXCEPTION 'F3 : préfixe sex_code incohérent'; END IF;
 RAISE NOTICE '7/12 : registre, dossiers, statuts et réservations cohérents';

 IF (SELECT pg_catalog.count(*) FROM pdc_private.membership_card_requests
      WHERE application_id IN (v_app1,v_app2))<>2 OR
    NOT EXISTS (SELECT 1 FROM pdc_private.membership_card_requests
      WHERE application_id=v_app1 AND person_id=v_payer AND requested_format='digital'
        AND issued_at IS NULL AND delivered_at IS NULL AND portrait_storage_key IS NULL) OR
    NOT EXISTS (SELECT 1 FROM pdc_private.membership_card_requests
      WHERE application_id=v_app2 AND person_id=v_partner AND requested_format='both'
        AND issued_at IS NULL AND delivered_at IS NULL AND portrait_storage_key IS NULL) THEN
   RAISE EXCEPTION 'F3 : demandes de cartes invalides'; END IF;
 RAISE NOTICE '8/12 : demandes de cartes distinctes, aucune délivrance';

 -- Le retry doit retourner les mêmes numéros sans consommer de nouveau rang.
 FOR v_rec IN SELECT * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order) LOOP
   IF (v_rec.slot='member' AND (v_rec.membership_id<>v_m OR v_rec.member_number<>v_num_m)) OR
      (v_rec.slot='partner' AND (v_rec.membership_id<>v_p OR v_rec.member_number<>v_num_p)) THEN
     RAISE EXCEPTION 'F3 : retry non idempotent'; END IF;
 END LOOP;
 IF (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)<>v_count_before+2 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.membership_card_requests WHERE application_id IN (v_app1,v_app2))<>2 THEN
   RAISE EXCEPTION 'F3 : un retry a créé une nouvelle carte / consommé un numéro'; END IF;
 RAISE NOTICE '9/12 : retry idempotent';

 IF (SELECT pg_catalog.count(*) FROM pdc_private.payment_allocations WHERE payment_id=v_payment)<>0 OR
    (SELECT pg_catalog.count(*) FROM pdc_private.audit_log
      WHERE action='couple.admitted' AND target_id=v_order)<>1 THEN
   RAISE EXCEPTION 'F3 : double comptabilisation ou audit absent'; END IF;
 RAISE NOTICE '10/12 : aucun paiement fictif de 20 EUR, audit unique';

 -- Après admission, un remboursement doit empêcher l'utilisation ultérieure
 -- de la preuve F2, sans modifier automatiquement des décisions déjà prises.
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_ref||'-REFUND',v_payment,'payment.refunded',now());
 v_failed:=false;
 BEGIN
   PERFORM * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_order);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F3 : remboursement sans blocage'; END IF;
 RAISE NOTICE '11/12 : remboursement interdit la revalidation du paiement';

 -- Cas rejeté : un bénéficiaire déjà militant ne peut être admis une seconde fois.
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
 VALUES('Monsieur',v_ref,'Autre',DATE '1985-01-01','Ville fictive','FR') RETURNING id INTO v_other1;
 INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
 VALUES('Madame',v_ref,'Autre',DATE '1986-01-01','Ville fictive','FR') RETURNING id INTO v_other2;
 INSERT INTO pdc_private.membership_applications(reference,person_id,application_type,residence_group,category_code,
  submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES(v_ref||'-OTHERAPP1',v_other1,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now())
 RETURNING id INTO v_otherapp1;
 INSERT INTO pdc_private.membership_applications(reference,person_id,application_type,residence_group,category_code,
  submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES(v_ref||'-OTHERAPP2',v_other2,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now())
 RETURNING id INTO v_otherapp2;
 INSERT INTO pdc_private.couple_checkout_orders_v5b610f2(reference,payer_person_id)
 VALUES(v_ref||'-OTHERORDER',v_other1) RETURNING id INTO v_otherorder;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_otherorder,'member',v_other1,v_otherapp1),(v_otherorder,'partner',v_other2,v_otherapp2);
 INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,provider_payment_id,currency,amount_minor,status,confirmed_at)
 VALUES(v_ref||'-OTHERPAY',v_other1,'stripe',v_ref||'-OTHERPROVIDER','EUR',4000,'confirmed',now())
 RETURNING id INTO v_otherpay;
 UPDATE pdc_private.couple_checkout_orders_v5b610f2 SET status='awaiting_payment',payment_id=v_otherpay
  WHERE id=v_otherorder;
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_ref||'-OTHERWEBHOOK',v_otherpay,'payment.succeeded',now());
 INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
 VALUES(v_other2,v_ref||'-EXISTING','active',now());
 SELECT last_serial INTO v_count_after FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true;
 v_failed:=false;
 BEGIN
   PERFORM * FROM pdc_private.admit_paid_couple_dev_v5b610f3(v_otherorder);
 EXCEPTION WHEN SQLSTATE '42501' THEN v_failed:=true;
 END;
 IF NOT v_failed OR
    EXISTS (SELECT 1 FROM pdc_private.memberships WHERE person_id=v_other1) OR
    EXISTS (SELECT 1 FROM pdc_private.couple_admissions_v5b610f3 WHERE order_id=v_otherorder) OR
    (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)<>v_count_after THEN
    RAISE EXCEPTION 'F3 : un conjoint déjà admis a créé une admission partielle'; END IF;
 RAISE NOTICE '12/12 : aucun nouveau membre ni numéro si conjoint déjà militant';
 RAISE NOTICE 'F3 : tests conclusifs, annulation intégrale par ROLLBACK';
END;
$test$;
ROLLBACK;
