-- PDC V5-B.6.9: 8 controles transactionnels (DEV uniquement).
-- Aucun fichier Storage n'est cree, aucune donnee ne subsiste apres ROLLBACK.
BEGIN;
DO $test$
DECLARE
  v_person uuid; v_app uuid; v_request uuid;
  v_asset_a uuid := gen_random_uuid();
  v_asset_b uuid := gen_random_uuid();
  v_key_a text; v_key_b text; v_count int;
  v_marker text := 'TEST-V5B69-' || replace(gen_random_uuid()::text,'-','');
  v_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='pdc_private' AND c.relname='card_portrait_assets' AND c.relrowsecurity) THEN
     RAISE EXCEPTION 'RLS non activee pour le registre prive';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','pdc_api_v5b3','pdc_api_runtime_v5b3'] LOOP
     IF has_table_privilege(v_role,'pdc_private.card_portrait_assets','SELECT') OR
        has_table_privilege(v_role,'pdc_private.card_portrait_assets','INSERT') OR
        has_table_privilege(v_role,'pdc_private.card_portrait_assets','UPDATE') OR
        has_table_privilege(v_role,'pdc_private.card_portrait_assets','DELETE') THEN
        RAISE EXCEPTION 'Droit indu: %',v_role;
     END IF;
  END LOOP;
  RAISE NOTICE '1/8 : RLS activee; aucun droit direct aux roles client/API';

  INSERT INTO pdc_private.people(civility,last_name,first_name,date_of_birth,birth_place,country_of_residence)
    VALUES('Madame',v_marker,'FICTIVE',date '1990-08-02','Douala','CM') RETURNING id INTO v_person;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,
     submitted_at,card_requested,card_format)
    VALUES(v_marker||'-APP',v_person,'initial','cameroon','urbain',
      'submitted',now(),'TEST',now(),now(),true,'digital') RETURNING id INTO v_app;
  INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format,status)
    VALUES(v_app,v_person,'digital','requested') RETURNING id INTO v_request;
  v_key_a := 'card-requests/' || v_request::text || '/' || v_asset_a::text || '.jpg';
  v_key_b := 'card-requests/' || v_request::text || '/' || v_asset_b::text || '.png';
  RAISE NOTICE '2/8 : demande de carte fictive, sans numero reel';

  INSERT INTO pdc_private.card_portrait_assets(id,card_request_id,content_type,object_key)
    VALUES(v_asset_a,v_request,'image/jpeg',v_key_a);
  SELECT count(*) INTO v_count FROM pdc_private.card_portrait_assets
    WHERE card_request_id=v_request AND status='reserved' AND file_bytes IS NULL;
  IF v_count<>1 THEN RAISE EXCEPTION 'Etat reserved manquant'; END IF;
  RAISE NOTICE '3/8 : reservation privee sans fausse photo stockee';

  BEGIN
    INSERT INTO pdc_private.card_portrait_assets(id,card_request_id,content_type,object_key)
      VALUES(gen_random_uuid(),v_request,'image/png','card-requests/another-person/guess.png');
    RAISE EXCEPTION 'Chemin non lie a la demande accepte';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '4/8 : chemin arbitraire refuse';

  BEGIN
    UPDATE pdc_private.card_portrait_assets SET status='stored' WHERE id=v_asset_a;
    RAISE EXCEPTION 'Stockage sans preuve accepte';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '5/8 : impossible de declarer stored sans metadonnees';

  UPDATE pdc_private.card_portrait_assets SET
    status='stored',stored_at=now(),file_bytes=246000,
    sha256_hex=repeat('a',64),pixel_width=480,pixel_height=600
    WHERE id=v_asset_a;
  SELECT count(*) INTO v_count FROM pdc_private.card_portrait_assets
    WHERE id=v_asset_a AND status='stored' AND bucket_id='pdc-member-portraits-dev';
  IF v_count<>1 THEN RAISE EXCEPTION 'Etat stored incorrect'; END IF;
  RAISE NOTICE '6/8 : metadonnees fictives completes en registre prive';

  INSERT INTO pdc_private.card_portrait_assets(id,card_request_id,content_type,object_key)
    VALUES(v_asset_b,v_request,'image/png',v_key_b);
  BEGIN
    UPDATE pdc_private.card_portrait_assets SET
      status='stored',stored_at=now(),file_bytes=120000,
      sha256_hex=repeat('b',64),pixel_width=500,pixel_height=500
      WHERE id=v_asset_b;
    RAISE EXCEPTION 'Deux photos courantes acceptees pour une seule carte';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE '7/8 : unicite de la photographie courante';

  UPDATE pdc_private.card_portrait_assets SET
      status='retired',retired_at=now() WHERE id=v_asset_a;
  UPDATE pdc_private.card_portrait_assets SET
      status='stored',stored_at=now(),file_bytes=120000,
      sha256_hex=repeat('b',64),pixel_width=500,pixel_height=500
      WHERE id=v_asset_b;
  SELECT count(*) INTO v_count FROM pdc_private.card_portrait_assets
    WHERE card_request_id=v_request AND status='stored';
  IF v_count<>1 THEN RAISE EXCEPTION 'Remplacement de photo incorrect'; END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.membership_card_requests
        WHERE id=v_request AND status <> 'requested') THEN
    RAISE EXCEPTION 'La procedure a change le statut de la carte'; END IF;
  BEGIN
    UPDATE pdc_private.card_portrait_assets SET status='reserved',
      stored_at=NULL,file_bytes=NULL,sha256_hex=NULL,pixel_width=NULL,pixel_height=NULL
      WHERE id=v_asset_b;
    RAISE EXCEPTION 'Transition arriere acceptee';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%PDC_PORTRAIT_INVALID_TRANSITION%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '8/8 : remplacement possible, retour arriere interdit, carte non delivree';
  RAISE NOTICE 'V5-B.6.9 OK; toutes les lignes fictives seront annulees';
END;
$test$;
ROLLBACK;
