-- V5-B.6.10-B : fonctions privees de liaison de photos, DEV SEULEMENT.
-- Prerequis: onze migrations 00100 a 01100 et bucket prive deja audite.
-- Aucun acces depuis le navigateur, aucune emission de carte, aucun droit pour
-- l'API de consultation actuelle. PAS de service_role dans PostgreSQL.
BEGIN;
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_portrait_writer_v5b610') THEN
    CREATE ROLE pdc_portrait_writer_v5b610 NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $r$;
GRANT USAGE ON SCHEMA pdc_private TO pdc_portrait_writer_v5b610;
REVOKE ALL ON TABLE pdc_private.card_portrait_assets FROM pdc_portrait_writer_v5b610;
REVOKE ALL ON TABLE pdc_private.membership_card_requests FROM pdc_portrait_writer_v5b610;

CREATE UNIQUE INDEX card_portrait_one_reserved_per_request_v5b610b
  ON pdc_private.card_portrait_assets(card_request_id) WHERE status='reserved';

-- Attribution opaque, uniquement si le dossier paye/accepte et la carte demandee
-- appartiennent a la meme personne et que l'adhesion est encore active.
CREATE FUNCTION pdc_private.portrait_reserve_v5b610b(
  p_actor uuid, p_request uuid, p_mime text
) RETURNS TABLE(asset_id uuid, object_key text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_asset uuid := pg_catalog.gen_random_uuid(); v_path text;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_mime NOT IN ('image/jpeg','image/png') OR p_mime IS NULL THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_UNSUPPORTED_TYPE';
  END IF;
  PERFORM 1
  FROM pdc_private.membership_card_requests c
  JOIN pdc_private.membership_applications a
    ON a.id=c.application_id AND a.person_id=c.person_id
  JOIN pdc_private.memberships m
    ON m.id=a.membership_id AND m.person_id=c.person_id
  WHERE c.id=p_request
    AND c.status IN ('requested','reviewed')
    AND c.issued_at IS NULL AND c.delivered_at IS NULL
    AND c.requested_format IN ('digital','physical','both')
    AND a.application_type='initial'
    AND a.submission_status='accepted'
    AND a.card_requested IS TRUE
    AND m.status='active'
  FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_PORTRAIT_REQUEST_NOT_ELIGIBLE'; END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.card_portrait_assets
            WHERE card_request_id=p_request AND status='reserved') THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_UPLOAD_ALREADY_RESERVED';
  END IF;
  v_path := 'card-requests/' || p_request::text || '/' || v_asset::text ||
    CASE WHEN p_mime='image/png' THEN '.png' ELSE '.jpg' END;
  INSERT INTO pdc_private.card_portrait_assets
    (id,card_request_id,bucket_id,content_type,object_key,status)
  VALUES(v_asset,p_request,'pdc-member-portraits-dev',p_mime,v_path,'reserved');
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
    VALUES(p_actor,'portrait.reserved','card_portrait_assets',v_asset,
           pg_catalog.jsonb_build_object('card_request_id',p_request));
  RETURN QUERY SELECT v_asset,v_path;
END;
$fn$;

-- A n'appeler QUE par un serveur ayant verifie le fichier televerse puis relu
-- et compare son SHA-256. La fonction SQL n'accede pas au Storage elle-meme.
CREATE FUNCTION pdc_private.portrait_confirm_v5b610b(
  p_actor uuid, p_asset uuid, p_bytes integer, p_sha text,
  p_width integer, p_height integer
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_asset pdc_private.card_portrait_assets%ROWTYPE; v_request uuid;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT card_request_id INTO v_request FROM pdc_private.card_portrait_assets WHERE id=p_asset;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_PORTRAIT_ASSET_NOT_FOUND'; END IF;
  PERFORM 1 FROM pdc_private.membership_card_requests c
  JOIN pdc_private.membership_applications a ON a.id=c.application_id AND a.person_id=c.person_id
  JOIN pdc_private.memberships m ON m.id=a.membership_id AND m.person_id=c.person_id
  WHERE c.id=v_request AND c.status IN ('requested','reviewed')
    AND c.issued_at IS NULL AND c.delivered_at IS NULL
    AND a.submission_status='accepted' AND m.status='active'
  FOR UPDATE OF c;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_PORTRAIT_REQUEST_NOT_ELIGIBLE'; END IF;
  SELECT * INTO v_asset FROM pdc_private.card_portrait_assets WHERE id=p_asset FOR UPDATE;
  IF v_asset.status <> 'reserved' THEN RAISE EXCEPTION 'PDC_PORTRAIT_NOT_RESERVED'; END IF;
  IF p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 5242880 OR
     p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' OR
     p_width IS NULL OR p_width NOT BETWEEN 240 AND 4096 OR
     p_height IS NULL OR p_height NOT BETWEEN 240 AND 4096 THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_INVALID_METADATA';
  END IF;
  -- Ancien portrait garde dans l'historique SQL; le nettoyage des fichiers
  -- physiques n'est pas confondu avec la transaction de remplacement.
  UPDATE pdc_private.card_portrait_assets SET status='retired',retired_at=pg_catalog.now()
    WHERE card_request_id=v_request AND status='stored';
  UPDATE pdc_private.card_portrait_assets SET
    status='stored',stored_at=pg_catalog.now(),file_bytes=p_bytes,
    sha256_hex=p_sha,pixel_width=p_width,pixel_height=p_height
    WHERE id=p_asset;
  UPDATE pdc_private.membership_card_requests SET portrait_storage_key=v_asset.object_key
    WHERE id=v_request;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
    VALUES(p_actor,'portrait.stored','card_portrait_assets',p_asset,
           pg_catalog.jsonb_build_object('card_request_id',v_request));
  RETURN true;
END;
$fn$;

-- En cas d'echec d'upload : nettoyage du fichier via Storage API d'abord,
-- ensuite retrait de la reservation SQL, sans effacer les photos actives.
CREATE FUNCTION pdc_private.portrait_cancel_reservation_v5b610b(
  p_actor uuid,p_asset uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_request uuid;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT card_request_id INTO v_request FROM pdc_private.card_portrait_assets
    WHERE id=p_asset AND status='reserved';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM pdc_private.membership_card_requests WHERE id=v_request FOR UPDATE;
  DELETE FROM pdc_private.card_portrait_assets WHERE id=p_asset AND status='reserved';
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
    VALUES(p_actor,'portrait.reservation_cancelled','card_portrait_assets',p_asset,
           pg_catalog.jsonb_build_object('card_request_id',v_request));
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.portrait_confirm_v5b610b(uuid,uuid,integer,text,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.portrait_cancel_reservation_v5b610b(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_reserve_v5b610b(uuid,uuid,text)
  TO pdc_portrait_writer_v5b610;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_confirm_v5b610b(uuid,uuid,integer,text,integer,integer)
  TO pdc_portrait_writer_v5b610;
GRANT EXECUTE ON FUNCTION pdc_private.portrait_cancel_reservation_v5b610b(uuid,uuid)
  TO pdc_portrait_writer_v5b610;
COMMENT ON ROLE pdc_portrait_writer_v5b610 IS 'V5B610B DEV; NOLOGIN; futur role distinct du lecteur API. Aucun acces direct aux tables.';
COMMIT;
