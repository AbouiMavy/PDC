-- V5-B.6.4 -- TEST SQL DEV, aucune donnée réelle, ROLLBACK obligatoire.
-- Utilisateur de test fictif Supabase Auth : pdc-v5b3-test@example.invalid
BEGIN;
DO $test$
DECLARE
  v_actor uuid; v_person uuid; v_member uuid; v_batch uuid;
  v_mark text := 'TEST-V5B64-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  v_count bigint;
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF pg_catalog.has_function_privilege(v_role,'pdc_private.api_review_batches(uuid)','EXECUTE')
      OR pg_catalog.has_function_privilege(v_role,'pdc_private.api_review_members(uuid,uuid,integer)','EXECUTE') THEN
      RAISE EXCEPTION 'EXECUTE impropre pour %',v_role;
    END IF;
  END LOOP;
  RAISE NOTICE '1/8 : aucun EXECUTE public/authenticated/service_role';

  IF NOT pg_catalog.has_function_privilege('pdc_api_runtime_v5b3','pdc_private.api_review_batches(uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('pdc_api_runtime_v5b3','pdc_private.api_review_members(uuid,uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Le role API technique ne peut pas executer les fonctions';
  END IF;
  IF pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.people','SELECT')
    OR pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.membership_review_entries','SELECT')
    OR pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.membership_review_entries','UPDATE') THEN
    RAISE EXCEPTION 'Lecture ou ecriture directe indument accordee';
  END IF;
  RAISE NOTICE '2/8 : API seulement fonctions ciblees, aucun droit direct';

  BEGIN
    PERFORM * FROM pdc_private.api_review_batches('00000000-0000-4000-8000-000000000000');
    RAISE EXCEPTION 'Acces sans admin possible';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '3/8 : blocage si absence de role national';

  SELECT id INTO v_actor FROM auth.users WHERE email='pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Le compte Auth fictif pdc-v5b3-test@example.invalid est requis';
  END IF;
  INSERT INTO pdc_private.role_assignments(auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
  VALUES(v_actor,'national_admin',NULL,pg_catalog.now(),pg_catalog.now()+interval '20 minutes');
  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
  VALUES('Monsieur',v_mark,'FICTIF',date '1986-02-03','Yaounde','CM') RETURNING id INTO v_person;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
  VALUES(v_person,v_mark,'active',pg_catalog.now(),NULL) RETURNING id INTO v_member;
  INSERT INTO pdc_private.membership_review_batches(status,opened_by,opened_at,closed_by,closed_at)
  VALUES('closed',v_actor,pg_catalog.now(),v_actor,pg_catalog.now()) RETURNING id INTO v_batch;
  INSERT INTO pdc_private.membership_review_entries(batch_id,membership_id,outcome)
  VALUES(v_batch,v_member,'cleared');
  RAISE NOTICE '4/8 : donnees et role fictifs prets';

  SELECT pg_catalog.count(*) INTO v_count
  FROM pdc_private.api_review_batches(v_actor) b
  WHERE b.batch_id=v_batch AND b.members_in_batch=1
    AND b.members_cleared=1 AND b.members_revoked=0;
  IF v_count<>1 THEN RAISE EXCEPTION 'Liste lots incorrecte'; END IF;
  RAISE NOTICE '5/8 : synthese du lot correcte';

  SELECT pg_catalog.count(*) INTO v_count
  FROM pdc_private.api_review_members(v_actor,v_batch,0) m
  WHERE m.membership_id=v_member AND m.last_name=v_mark
    AND m.birth_place='Yaounde' AND m.card_requested=false;
  IF v_count<>1 THEN RAISE EXCEPTION 'Detail membre incorrect'; END IF;
  RAISE NOTICE '6/8 : detail membre exact, aucune carte demandee';

  BEGIN
    PERFORM * FROM pdc_private.api_review_members(v_actor,v_batch,1);
    RAISE EXCEPTION 'Pagination non restreinte';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_INVALID_PAGE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '7/8 : pagination controlee';

  BEGIN
    PERFORM * FROM pdc_private.api_review_members('00000000-0000-4000-8000-000000000000',v_batch,0);
    RAISE EXCEPTION 'Fuite des donnees nominatives';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '8/8 : identite protegee contre consultation non autorisee';
  RAISE NOTICE 'V5-B.6.4 OK -- ROLLBACK integral';
END;
$test$;
ROLLBACK;
