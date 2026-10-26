-- Test de V5-B.6.8, base DEV uniquement.
-- Concerne des identites fictives. ROLLBACK annule TOUTES les insertions.
BEGIN;
DO $test$
DECLARE
  v_actor uuid; v_person uuid; v_member uuid; v_app uuid; v_card uuid; v_batch uuid;
  v_serial integer; v_number text; v_count bigint;
  v_marker text := 'TEST-V5B68-' || replace(gen_random_uuid()::text, '-', '');
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role,'pdc_private.api_card_preparation_queue(uuid,integer)','EXECUTE') THEN
      RAISE EXCEPTION 'Fonction publiquement accessible pour %', v_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('pdc_api_runtime_v5b3',
       'pdc_private.api_card_preparation_queue(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Role API ne peut executer la fonction de lecture';
  END IF;
  IF has_table_privilege('pdc_api_runtime_v5b3','pdc_private.membership_card_requests','SELECT')
     OR has_table_privilege('pdc_api_runtime_v5b3','pdc_private.people','SELECT')
     OR has_table_privilege('pdc_api_runtime_v5b3','pdc_private.membership_card_requests','UPDATE') THEN
    RAISE EXCEPTION 'Privileges directs trop larges';
  END IF;
  RAISE NOTICE '1/8 : fonction privee et role API lecture ciblee';

  BEGIN
    PERFORM * FROM pdc_private.api_card_preparation_queue('00000000-0000-4000-8000-000000000000', 0);
    RAISE EXCEPTION 'Fuite sans habilitation';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE '2/8 : pas de liste sans habilitation nationale';

  SELECT id INTO v_actor FROM auth.users WHERE email = 'pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Compte de test Auth fictif requis'; END IF;
  INSERT INTO pdc_private.role_assignments(auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
  VALUES(v_actor,'national_admin',NULL,now(),now()+interval '15 minutes');

  SELECT COALESCE(MAX(serial_number),0)+1 INTO v_serial
    FROM pdc_private.internet_number_reservations;
  IF v_serial > 999999 THEN RAISE EXCEPTION 'Compteur test epuise'; END IF;
  v_number := 'M-PDC-I-' || lpad(v_serial::text,6,'0');
  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
  VALUES('Monsieur',v_marker,'FICTIF',date '1992-04-11','Obala','CM') RETURNING id INTO v_person;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
  VALUES(v_person,v_number,'active',now(),now()) RETURNING id INTO v_member;
  INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
  VALUES(v_serial,v_number,v_person);
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format,membership_id)
  VALUES(v_marker||'-APP',v_person,'initial','cameroon','urbain',
         'accepted',now(),'TEST',now(),now(),true,'digital',v_member)
  RETURNING id INTO v_app;
  INSERT INTO pdc_private.membership_card_requests
    (application_id,person_id,requested_format,status,portrait_storage_key)
  VALUES(v_app,v_person,'digital','reviewed',NULL) RETURNING id INTO v_card;
  INSERT INTO pdc_private.membership_review_batches
    (status,opened_by,opened_at,closed_by,closed_at)
  VALUES('closed',v_actor,now(),v_actor,now()) RETURNING id INTO v_batch;
  INSERT INTO pdc_private.membership_review_entries(batch_id,membership_id,outcome)
  VALUES(v_batch,v_member,'cleared');
  RAISE NOTICE '3/8 : dossier fictif et controle clos crees';

  SELECT count(*) INTO v_count FROM pdc_private.api_card_preparation_queue(v_actor,0)
  WHERE card_request_id=v_card AND card_variant='cameroon'
    AND portrait_registered=false AND requested_format='digital';
  IF v_count<>1 THEN RAISE EXCEPTION 'Cameroun admis non remonte en file'; END IF;
  RAISE NOTICE '4/8 : carte Cameroun controlée remontee, photo absente';

  UPDATE pdc_private.membership_applications
     SET residence_group='diaspora', category_code='simple' WHERE id=v_app;
  UPDATE pdc_private.membership_card_requests
     SET portrait_storage_key='test-only/private/portrait-key' WHERE id=v_card;
  SELECT count(*) INTO v_count FROM pdc_private.api_card_preparation_queue(v_actor,0)
  WHERE card_request_id=v_card AND card_variant='diaspora' AND portrait_registered=true;
  IF v_count<>1 THEN RAISE EXCEPTION 'Diaspora/indicateur de photo incorrect'; END IF;
  IF EXISTS (
    SELECT 1 FROM pdc_private.api_card_preparation_queue(v_actor,0) q
    WHERE q.card_request_id=v_card AND to_jsonb(q) ? 'portrait_storage_key'
  ) THEN RAISE EXCEPTION 'Fuite cle photo privee'; END IF;
  RAISE NOTICE '5/8 : variante diaspora et absence de fuite de cle privee';

  UPDATE pdc_private.membership_review_entries SET outcome='pending' WHERE membership_id=v_member;
  IF EXISTS (SELECT 1 FROM pdc_private.api_card_preparation_queue(v_actor,0) WHERE card_request_id=v_card) THEN
    RAISE EXCEPTION 'Carte accessible avant controle favorable'; END IF;
  UPDATE pdc_private.membership_review_entries SET outcome='cleared' WHERE membership_id=v_member;
  PERFORM pg_catalog.set_config('pdc.actor_user_id',v_actor::text,true);
  UPDATE pdc_private.memberships SET status='ended',ended_at=now() WHERE id=v_member;
  PERFORM pg_catalog.set_config('pdc.actor_user_id','',true);
  IF EXISTS (SELECT 1 FROM pdc_private.api_card_preparation_queue(v_actor,0) WHERE card_request_id=v_card) THEN
    RAISE EXCEPTION 'Carte revoquee encore preparee'; END IF;
  RAISE NOTICE '6/8 : sans revue favorable ou apres revocation : exclue';

  BEGIN
    PERFORM * FROM pdc_private.api_card_preparation_queue(v_actor,1);
    RAISE EXCEPTION 'Pagination irreguliere acceptee';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_INVALID_PAGE%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '7/8 : pagination strictement bornee';

  IF EXISTS (SELECT 1 FROM pg_proc
     WHERE oid='pdc_private.api_card_preparation_queue(uuid,integer)'::regprocedure
       AND provolatile <> 's') THEN
    RAISE EXCEPTION 'Fonction inattendue non stable'; END IF;
  RAISE NOTICE '8/8 : lecture seulement, aucun statut de delivrance modifie';
  RAISE NOTICE 'V5-B.6.8 OK : ROLLBACK integral';
END;
$test$;
ROLLBACK;
