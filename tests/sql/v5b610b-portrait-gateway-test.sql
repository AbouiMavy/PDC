-- V5-B.6.10-B — Tests prives et transactionnels. DEV SEULEMENT.
-- A executer dans Supabase SQL Editor apres la douzieme migration.
-- Aucune vraie photo, aucun upload Storage. ROLLBACK integral.
BEGIN;
DO $test$
DECLARE
  v_actor uuid; v_p1 uuid; v_p2 uuid; v_m1 uuid; v_m2 uuid;
  v_a1 uuid; v_a2 uuid; v_c1 uuid; v_c2 uuid;
  v_id1 uuid; v_id2 uuid; v_id3 uuid; v_id4 uuid;
  v_path1 text; v_path2 text; v_path3 text; v_path4 text;
  v_serial integer; v_marker text := 'TEST-V5B610B-' || replace(gen_random_uuid()::text,'-','');
  v_role text; v_ok boolean;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_v5b3','pdc_api_runtime_v5b3'] LOOP
    IF has_function_privilege(v_role,'pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE')
       OR has_function_privilege(v_role,'pdc_private.portrait_confirm_v5b610b(uuid,uuid,integer,text,integer,integer)','EXECUTE')
       OR has_function_privilege(v_role,'pdc_private.portrait_cancel_reservation_v5b610b(uuid,uuid)','EXECUTE')
       OR has_table_privilege(v_role,'pdc_private.card_portrait_assets','UPDATE') THEN
       RAISE EXCEPTION 'Droits directs indus: %',v_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('pdc_portrait_writer_v5b610','pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)','EXECUTE')
     OR (SELECT rolcanlogin FROM pg_roles WHERE rolname='pdc_portrait_writer_v5b610') THEN
    RAISE EXCEPTION 'Role prive non conforme';
  END IF;
  RAISE NOTICE '1/10 : role distinct NOLOGIN; API existante strictement en lecture seule';

  BEGIN
    PERFORM * FROM pdc_private.portrait_reserve_v5b610b(gen_random_uuid(),gen_random_uuid(),'image/jpeg');
    RAISE EXCEPTION 'Usurpation admise';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '2/10 : acces refuse sans habilitation nationale';

  SELECT id INTO v_actor FROM auth.users WHERE email='pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Compte Auth fictif V5B3 manquant'; END IF;
  INSERT INTO pdc_private.role_assignments(auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
  SELECT v_actor,'national_admin',NULL,now(),now()+interval '15 minutes'
  WHERE NOT EXISTS (
    SELECT 1 FROM pdc_private.role_assignments
    WHERE auth_user_id=v_actor AND role_code='national_admin'
      AND scope_territory_id IS NULL AND valid_from<=now()
      AND (valid_until IS NULL OR valid_until>now())
  );

  SELECT GREATEST(
    COALESCE((SELECT last_serial FROM pdc_private.internet_member_counter_v5b62 WHERE singleton),0),
    COALESCE((SELECT max(serial_number) FROM pdc_private.internet_number_reservations),0)
  ) + 1 INTO v_serial;
  IF v_serial > 999998 THEN RAISE EXCEPTION 'Numerotation de test indisponible'; END IF;
  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
    VALUES('Monsieur',v_marker,'TEST1',DATE '1982-01-01','Obala','CM') RETURNING id INTO v_p1;
  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
    VALUES('Madame',v_marker,'TEST2',DATE '1983-02-02','Yaounde','FR') RETURNING id INTO v_p2;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
    VALUES(v_p1,pdc_private.format_internet_member_number('M',v_serial),'active',now()) RETURNING id INTO v_m1;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
    VALUES(v_p2,pdc_private.format_internet_member_number('F',v_serial+1),'active',now()) RETURNING id INTO v_m2;
  INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
    VALUES(v_serial,pdc_private.format_internet_member_number('M',v_serial),v_p1),
          (v_serial+1,pdc_private.format_internet_member_number('F',v_serial+1),v_p2);
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format)
    VALUES(v_marker||'-1',v_p1,v_m1,'initial','cameroon','urbain','accepted',now(),'TEST',now(),now(),true,'digital')
    RETURNING id INTO v_a1;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,membership_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format)
    VALUES(v_marker||'-2',v_p2,v_m2,'initial','diaspora','simple','accepted',now(),'TEST',now(),now(),true,'both')
    RETURNING id INTO v_a2;
  INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format,status)
    VALUES(v_a1,v_p1,'digital','requested') RETURNING id INTO v_c1;
  INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format,status)
    VALUES(v_a2,v_p2,'both','requested') RETURNING id INTO v_c2;
  RAISE NOTICE '3/10 : deux dossiers identitaires fictifs avec demandes separees';

  SELECT asset_id,object_key INTO v_id1,v_path1 FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c1,'image/jpeg');
  SELECT asset_id,object_key INTO v_id2,v_path2 FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c2,'image/jpeg');
  IF v_id1=v_id2 OR v_path1=v_path2 OR position(v_c1::text IN v_path1)=0 OR position(v_c2::text IN v_path2)=0 THEN
    RAISE EXCEPTION 'Association des photos confondue entre membres'; END IF;
  RAISE NOTICE '4/10 : deux demandes, deux chemins opaques distincts';

  BEGIN
    PERFORM * FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c1,'image/jpeg');
    RAISE EXCEPTION 'Reservation simultanee autorisee';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_PORTRAIT_UPLOAD_ALREADY_RESERVED%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '5/10 : pas de doubles reservations en cours';

  BEGIN
    PERFORM pdc_private.portrait_confirm_v5b610b(v_actor,v_id1,100,'INVALID',500,600);
    RAISE EXCEPTION 'Fausse empreinte acceptee';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_PORTRAIT_INVALID_METADATA%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '6/10 : metadonnees incompletes rejetees';

  SELECT pdc_private.portrait_confirm_v5b610b(v_actor,v_id1,145000,repeat('a',64),500,600) INTO v_ok;
  IF NOT v_ok OR (SELECT portrait_storage_key FROM pdc_private.membership_card_requests WHERE id=v_c1)<>v_path1 OR
    (SELECT status FROM pdc_private.card_portrait_assets WHERE id=v_id1)<>'stored' THEN
    RAISE EXCEPTION 'Rattachement individuel non valide'; END IF;
  SELECT pdc_private.portrait_confirm_v5b610b(v_actor,v_id2,146000,repeat('b',64),500,600) INTO v_ok;
  IF NOT v_ok OR (SELECT portrait_storage_key FROM pdc_private.membership_card_requests WHERE id=v_c2)<>v_path2 THEN
    RAISE EXCEPTION 'Rattachement du second membre non valide'; END IF;
  RAISE NOTICE '7/10 : photos associees sans inversion; cartes non delivrees';

  SELECT asset_id,object_key INTO v_id3,v_path3 FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c1,'image/jpeg');
  PERFORM pdc_private.portrait_confirm_v5b610b(v_actor,v_id3,140000,repeat('c',64),520,620);
  IF (SELECT status FROM pdc_private.card_portrait_assets WHERE id=v_id1)<>'retired' OR
     (SELECT status FROM pdc_private.card_portrait_assets WHERE id=v_id3)<>'stored' OR
     (SELECT portrait_storage_key FROM pdc_private.membership_card_requests WHERE id=v_c1)<>v_path3 OR
     (SELECT portrait_storage_key FROM pdc_private.membership_card_requests WHERE id=v_c2)<>v_path2 THEN
    RAISE EXCEPTION 'Remplacement perturbe un autre membre'; END IF;
  RAISE NOTICE '8/10 : remplacement versionne sans modifier le dossier du conjoint';

  SELECT asset_id,object_key INTO v_id4,v_path4 FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c2,'image/jpeg');
  PERFORM pdc_private.portrait_cancel_reservation_v5b610b(v_actor,v_id4);
  IF EXISTS(SELECT 1 FROM pdc_private.card_portrait_assets WHERE id=v_id4) OR
     (SELECT portrait_storage_key FROM pdc_private.membership_card_requests WHERE id=v_c2)<>v_path2 THEN
    RAISE EXCEPTION 'Annulation de reservation incorrecte'; END IF;
  RAISE NOTICE '9/10 : echec du transfert nettoye sans toucher la photo active';

  UPDATE pdc_private.membership_card_requests SET status='invalidated' WHERE id=v_c1;
  BEGIN
    PERFORM * FROM pdc_private.portrait_reserve_v5b610b(v_actor,v_c1,'image/jpeg');
    RAISE EXCEPTION 'Carte invalidee acceptee';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_PORTRAIT_REQUEST_NOT_ELIGIBLE%' THEN RAISE; END IF;
  END;
  IF EXISTS(SELECT 1 FROM pdc_private.membership_card_requests
            WHERE id IN (v_c1,v_c2) AND (issued_at IS NOT NULL OR delivered_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Une carte a ete delivree pendant le test'; END IF;
  RAISE NOTICE '10/10 : carte invalidee refusee; aucune emission ou delivrance';
  RAISE NOTICE 'V5-B.6.10-B OK; toutes les identites fictives et photos simulees sont annulees';
END;
$test$;
ROLLBACK;
