-- PDC F2 : TEST DEV UNIQUEMENT, exécuter le script ENTIER après migration 01600.
-- Les personnes, dossiers, paiements et événements fictifs sont annulés par ROLLBACK.
BEGIN;
DO $test$
DECLARE v_prefix text := 'TEST-F2-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 v_payer uuid; v_partner uuid; v_extra uuid;
 v_app1 uuid; v_app2 uuid; v_app3 uuid; v_app4 uuid;
 v_order uuid; v_order_partial uuid; v_payment uuid; v_bad_payment uuid;
 v_failed boolean; v_role text;
BEGIN
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_runtime_v5b3','pdc_portrait_upload_runtime_v5b610c'] LOOP
   IF pg_catalog.has_table_privilege(v_role,'pdc_private.couple_checkout_orders_v5b610f2','SELECT') OR
      pg_catalog.has_table_privilege(v_role,'pdc_private.couple_checkout_beneficiaries_v5b610f2','INSERT') OR
      pg_catalog.has_function_privilege(v_role,'pdc_private.couple_payment_verified_dev_v5b610f2(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'F2 : droits non autorisés pour %',v_role;
   END IF;
 END LOOP;
 RAISE NOTICE '1/10 : tables et lecture financière privées';

 INSERT INTO pdc_private.people (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
 VALUES ('Monsieur',v_prefix,'Payeur',DATE '1988-05-03','Ville fictive','FR',v_prefix||'-1@example.invalid') RETURNING id INTO v_payer;
 INSERT INTO pdc_private.people (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
 VALUES ('Madame',v_prefix,'Partenaire',DATE '1991-02-03','Ville fictive','FR',v_prefix||'-2@example.invalid') RETURNING id INTO v_partner;
 INSERT INTO pdc_private.people (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
 VALUES ('Madame',v_prefix,'Tiers',DATE '1992-01-01','Ville fictive','FR',v_prefix||'-3@example.invalid') RETURNING id INTO v_extra;
 INSERT INTO pdc_private.membership_applications
   (reference,person_id,application_type,residence_group,category_code,submission_status,
    policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES (v_prefix||'-APP-1',v_payer,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now()) RETURNING id INTO v_app1;
 INSERT INTO pdc_private.membership_applications
   (reference,person_id,application_type,residence_group,category_code,submission_status,
    policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES (v_prefix||'-APP-2',v_partner,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now()) RETURNING id INTO v_app2;
 INSERT INTO pdc_private.membership_applications
   (reference,person_id,application_type,residence_group,category_code,submission_status,
    policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES (v_prefix||'-APP-3',v_extra,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now()) RETURNING id INTO v_app3;
 INSERT INTO pdc_private.membership_applications
   (reference,person_id,application_type,residence_group,category_code,submission_status,
    policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
 VALUES (v_prefix||'-APP-4',v_payer,'initial','diaspora','couple','submitted',now(),'FICTIF',now(),now()) RETURNING id INTO v_app4;

 INSERT INTO pdc_private.couple_checkout_orders_v5b610f2(reference,payer_person_id)
 VALUES(v_prefix||'-ORDER',v_payer) RETURNING id INTO v_order;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order,'member',v_payer,v_app1);
 IF pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F2 : paiement présumé avec un seul membre'; END IF;
 RAISE NOTICE '2/10 : un bénéficiaire insuffisant';

 v_failed:=false;
 BEGIN
   INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
   VALUES(v_order,'partner',v_payer,v_app2);
 EXCEPTION WHEN SQLSTATE '23514' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F2 : partenaire = payeur admis'; END IF;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order,'partner',v_partner,v_app2);
 IF (SELECT count(*) FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 WHERE order_id=v_order)<>2 THEN
   RAISE EXCEPTION 'F2 : deux dossiers distincts attendus'; END IF;
 RAISE NOTICE '3/10 : couple formé de deux dossiers distincts';

 v_failed:=false;
 BEGIN
   UPDATE pdc_private.couple_checkout_beneficiaries_v5b610f2 SET person_id=v_extra
     WHERE order_id=v_order AND slot='partner';
 EXCEPTION WHEN SQLSTATE '23514' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F2 : altération dossier admise'; END IF;
 RAISE NOTICE '4/10 : bénéficiaires immuables';

 INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,provider_payment_id,currency,amount_minor,status)
 VALUES(v_prefix||'-PAY-WRONG',v_payer,'stripe',v_prefix||'-PROVIDER-WRONG','EUR',2000,'pending')
 RETURNING id INTO v_bad_payment;
 v_failed:=false;
 BEGIN
   UPDATE pdc_private.couple_checkout_orders_v5b610f2
    SET payment_id=v_bad_payment,status='awaiting_payment' WHERE id=v_order;
 EXCEPTION WHEN SQLSTATE '23514' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F2 : paiement 20 EUR admis pour couple'; END IF;
 RAISE NOTICE '5/10 : 20 EUR refusés, montant entier 40 EUR exigé';

 INSERT INTO pdc_private.payment_attempts(reference,payer_id,provider,provider_payment_id,currency,amount_minor,status)
 VALUES(v_prefix||'-PAY',v_payer,'stripe',v_prefix||'-PROVIDER','EUR',4000,'pending')
 RETURNING id INTO v_payment;
 UPDATE pdc_private.couple_checkout_orders_v5b610f2
   SET payment_id=v_payment,status='awaiting_payment' WHERE id=v_order;
 IF pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F2 : paiement en attente reconnu'; END IF;
 RAISE NOTICE '6/10 : un paiement en attente ne valide rien';

 v_failed:=false;
 BEGIN
   INSERT INTO pdc_private.payment_allocations(payment_id,donation_id,amount_minor)
   VALUES(v_payment,pg_catalog.gen_random_uuid(),100);
 EXCEPTION WHEN SQLSTATE '23514' THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F2 : double affectation couple/don autorisée'; END IF;
 RAISE NOTICE '7/10 : allocation concurrente bloquée';

 UPDATE pdc_private.payment_attempts SET status='confirmed',confirmed_at=now() WHERE id=v_payment;
 IF pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F2 : paiement confirmé sans webhook vérifié'; END IF;
 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_prefix||'-WEBHOOK-1',v_payment,'payment.succeeded',now());
 IF NOT pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F2 : paiement vérifié refusé'; END IF;
 RAISE NOTICE '8/10 : paiement authentifié fictif admissible une seule fois';

 -- Deuxième commande ne peut exploiter le même paiement : UNIQUE(payment_id).
 INSERT INTO pdc_private.couple_checkout_orders_v5b610f2(reference,payer_person_id)
 VALUES(v_prefix||'-ORDER-PARTIAL',v_payer) RETURNING id INTO v_order_partial;
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order_partial,'member',v_payer,v_app4);
 INSERT INTO pdc_private.couple_checkout_beneficiaries_v5b610f2(order_id,slot,person_id,application_id)
 VALUES(v_order_partial,'partner',v_extra,v_app3);
 v_failed:=false;
 BEGIN
   UPDATE pdc_private.couple_checkout_orders_v5b610f2
    SET payment_id=v_payment,status='awaiting_payment' WHERE id=v_order_partial;
 EXCEPTION WHEN unique_violation THEN v_failed:=true;
 END;
 IF NOT v_failed THEN RAISE EXCEPTION 'F2 : même paiement pour deux commandes'; END IF;
 RAISE NOTICE '9/10 : paiement non réutilisable sur une autre commande';

 INSERT INTO pdc_private.payment_events(provider,provider_event_id,payment_id,event_type,verified_at)
 VALUES('stripe',v_prefix||'-REFUND',v_payment,'payment.refunded',now());
 IF pdc_private.couple_payment_verified_dev_v5b610f2(v_order) THEN
   RAISE EXCEPTION 'F2 : remboursement ignoré'; END IF;
 RAISE NOTICE '10/10 : remboursement vérifié invalide le paiement';
 RAISE NOTICE 'V5B610F2 : tests concluants, transaction annulée par ROLLBACK';
END;
$test$;
ROLLBACK;
