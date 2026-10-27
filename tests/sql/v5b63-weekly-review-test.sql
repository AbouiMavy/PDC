-- V5-B.6.3 : integration SQL; sur rvgpnmznhzwlzqyefahd UNIQUEMENT.
-- Script transactionnel : ROLLBACK integral a la fin. Aucun numero consomme.
-- Prerequis : utilisateur Auth pdc-v5b3-test@example.invalid existant.
BEGIN;
DO $test_v5b63$
DECLARE
  v_actor uuid;
  v_run text := 'TEST-V5B63-' || replace(gen_random_uuid()::text,'-','');
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_m1 uuid; v_m2 uuid; v_m3 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_batch uuid; v_next_batch uuid;
  v_total bigint; v_cleared bigint; v_revoked bigint;
  v_serial integer;
  v_changed boolean;
  v_missing boolean;
  v_role text;
BEGIN
  IF EXISTS (SELECT 1 FROM pdc_private.membership_review_batches WHERE status='open') THEN
    RAISE EXCEPTION 'Un lot de revue est deja ouvert : test exige aucun lot ouvert';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_runtime_v5b3'] LOOP
    IF pg_catalog.has_function_privilege(v_role,'pdc_private.open_weekly_review_dev(uuid)','EXECUTE')
      OR pg_catalog.has_function_privilege(v_role,'pdc_private.list_weekly_review_dev(uuid,uuid)','EXECUTE')
      OR pg_catalog.has_function_privilege(v_role,'pdc_private.revoke_internet_membership_dev(uuid,uuid,text)','EXECUTE')
      OR pg_catalog.has_function_privilege(v_role,'pdc_private.close_weekly_review_dev(uuid,uuid)','EXECUTE')
      OR pg_catalog.has_table_privilege(v_role,'pdc_private.membership_review_entries','SELECT') THEN
      RAISE EXCEPTION 'Permissions indument ouvertes au role %',v_role;
    END IF;
  END LOOP;
  RAISE NOTICE '1/10 : fonctions et donnees protegees';

  BEGIN
    PERFORM * FROM pdc_private.open_weekly_review_dev('00000000-0000-4000-8000-000000000000');
    RAISE EXCEPTION 'Usurpation admin autorisee';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '2/10 : refus sans role national_admin';

  SELECT id INTO v_actor FROM auth.users WHERE email='pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Utilisateur Auth fictif requis : pdc-v5b3-test@example.invalid'; END IF;
  INSERT INTO pdc_private.role_assignments
     (auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
  VALUES (v_actor,'national_admin',NULL,now(),now()+interval '20 minutes');

  SELECT last_serial INTO v_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true;
  IF v_serial IS NULL OR v_serial > 999996 THEN
    RAISE EXCEPTION 'Compteur impossible a tester : %',v_serial;
  END IF;
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
  VALUES ('Monsieur',v_run,'M-AVEC-CARTE',DATE '1985-01-01','Obala','CM') RETURNING id INTO v_p1;
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
  VALUES ('Madame',v_run,'F-SANS-CARTE',DATE '1990-02-02','Douala','FR') RETURNING id INTO v_p2;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
  VALUES(v_p1,pdc_private.format_internet_member_number('M',v_serial+1),'active',now()) RETURNING id INTO v_m1;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
  VALUES(v_p2,pdc_private.format_internet_member_number('F',v_serial+2),'active',now()) RETURNING id INTO v_m2;
  INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
  VALUES (v_serial+1,pdc_private.format_internet_member_number('M',v_serial+1),v_p1),
         (v_serial+2,pdc_private.format_internet_member_number('F',v_serial+2),v_p2);
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,
     category_code,submission_status,policy_accepted_at,policy_version,
     data_notice_accepted_at,submitted_at,card_requested,card_format)
  VALUES(v_run||'-A1',v_p1,v_m1,'initial','cameroon','urbain','accepted',now(),'TEST',now(),now(),true,'digital')
    RETURNING id INTO v_a1;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,
     category_code,submission_status,policy_accepted_at,policy_version,
     data_notice_accepted_at,submitted_at,card_requested,card_format)
  VALUES(v_run||'-A2',v_p2,v_m2,'initial','diaspora','simple','accepted',now(),'TEST',now(),now(),false,NULL)
    RETURNING id INTO v_a2;
  INSERT INTO pdc_private.membership_card_requests
    (application_id,person_id,requested_format,status)
  VALUES(v_a1,v_p1,'digital','requested');

  SELECT batch_id,members_in_batch INTO v_batch,v_total
   FROM pdc_private.open_weekly_review_dev(v_actor);
  IF v_batch IS NULL OR v_total < 2 OR
    (SELECT count(*) FROM pdc_private.membership_review_entries e
       WHERE e.batch_id=v_batch AND e.membership_id IN (v_m1,v_m2))<>2 THEN
    RAISE EXCEPTION 'Lot incorrect';
  END IF;
  RAISE NOTICE '3/10 : lot ouvert et membres presents';

  IF (SELECT count(*) FROM pdc_private.list_weekly_review_dev(v_actor,v_batch) l
      WHERE l.membership_id IN (v_m1,v_m2))<>2 THEN
    RAISE EXCEPTION 'Liste revue invalide';
  END IF;
  BEGIN
    PERFORM * FROM pdc_private.open_weekly_review_dev(v_actor);
    RAISE EXCEPTION 'Deux lots ouverts simultanement';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_REVIEW_BATCH_ALREADY_OPEN%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '4/10 : liste disponible et deuxieme ouverture refusee';

  -- Arrivee d'une nouvelle inscription APRES capture du premier lot.
  INSERT INTO pdc_private.people
    (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
  VALUES ('Madame',v_run,'F-ARRIVEE-APRES',DATE '1992-03-03','Yaounde','CM') RETURNING id INTO v_p3;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
  VALUES (v_p3,pdc_private.format_internet_member_number('F',v_serial+3),'active',now())
  RETURNING id INTO v_m3;
  INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
  VALUES(v_serial+3,pdc_private.format_internet_member_number('F',v_serial+3),v_p3);
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,
     category_code,submission_status,policy_accepted_at,policy_version,
     data_notice_accepted_at,submitted_at)
  VALUES(v_run||'-A3',v_p3,v_m3,'initial','cameroon','urbain','accepted',now(),'TEST',now(),now())
  RETURNING id INTO v_a3;
  IF EXISTS(SELECT 1 FROM pdc_private.membership_review_entries WHERE membership_id=v_m3) THEN
    RAISE EXCEPTION 'Nouvel adherent inclus dans lot deja ouvert';
  END IF;
  RAISE NOTICE '5/10 : inscription arrivee apres ouverture exclue du premier lot';

  BEGIN
    PERFORM pdc_private.revoke_internet_membership_dev(v_actor,v_m1,'court');
    RAISE EXCEPTION 'Motif trop court accepte';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_REVOCATION_REASON_REQUIRED%' THEN RAISE; END IF;
  END;
  v_changed := pdc_private.revoke_internet_membership_dev(
    v_actor,v_m1,'Revocation fictive pour test V5-B.6.3');
  IF NOT v_changed OR
     (SELECT status FROM pdc_private.memberships WHERE id=v_m1)<>'ended' OR
     (SELECT status FROM pdc_private.membership_card_requests WHERE application_id=v_a1)<>'invalidated' OR
     (SELECT outcome FROM pdc_private.membership_review_entries WHERE membership_id=v_m1)<>'revoked' THEN
    RAISE EXCEPTION 'Revocation incoherente';
  END IF;
  RAISE NOTICE '6/10 : revocation + carte invalidee + raison requise';

  v_changed := pdc_private.revoke_internet_membership_dev(v_actor,v_m1,'Repete sans effet V5B63');
  IF v_changed OR NOT EXISTS(SELECT 1 FROM pdc_private.internet_number_reservations WHERE person_id=v_p1) THEN
    RAISE EXCEPTION 'Revocation non idempotente ou numero reutilise'; END IF;
  RAISE NOTICE '7/10 : retry sans effet, numero conserve';

  SELECT reviewed,revoked INTO v_cleared,v_revoked
  FROM pdc_private.close_weekly_review_dev(v_actor,v_batch);
  IF v_cleared<1 OR v_revoked<1 OR
     (SELECT verified_at FROM pdc_private.memberships WHERE id=v_m2) IS NULL OR
     (SELECT verified_at FROM pdc_private.memberships WHERE id=v_m1) IS NOT NULL OR
     (SELECT verified_at FROM pdc_private.memberships WHERE id=v_m3) IS NOT NULL OR
     (SELECT status FROM pdc_private.membership_review_batches WHERE id=v_batch)<>'closed' THEN
    RAISE EXCEPTION 'Cloture incorrecte';
  END IF;
  RAISE NOTICE '8/10 : cloture groupee, sans delivrer une carte';

  SELECT batch_id INTO v_next_batch FROM pdc_private.open_weekly_review_dev(v_actor);
  IF NOT EXISTS(SELECT 1 FROM pdc_private.membership_review_entries e
    WHERE e.batch_id=v_next_batch AND e.membership_id=v_m3)
    OR EXISTS(SELECT 1 FROM pdc_private.membership_review_entries e
    WHERE e.batch_id=v_next_batch AND e.membership_id IN(v_m1,v_m2)) THEN
    RAISE EXCEPTION 'Second lot incoherent';
  END IF;
  RAISE NOTICE '9/10 : nouveaux adherents reportes au prochain lot';

  IF NOT EXISTS (SELECT 1 FROM pdc_private.audit_log
      WHERE action='membership.revoked' AND target_id=v_m1 AND actor_user_id=v_actor)
     OR NOT EXISTS (SELECT 1 FROM pdc_private.audit_log
      WHERE action='review.batch_closed' AND target_id=v_batch AND actor_user_id=v_actor)
     OR (SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton=true)<>v_serial THEN
    RAISE EXCEPTION 'Audit absent ou compteur modifie';
  END IF;
  RAISE NOTICE '10/10 : audit conserve, compteur inchange';
  RAISE NOTICE 'V5-B.6.3 OK -- ROLLBACK integral en suivant';
END;
$test_v5b63$;
ROLLBACK;
