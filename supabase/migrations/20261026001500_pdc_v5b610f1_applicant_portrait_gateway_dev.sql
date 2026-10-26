-- PDC V5-B.6.10-F1 — liaison atomique jeton E2 -> reservation photographique.
-- DEV SEULEMENT. Prerequis exact : migrations 00100 ... 01400.
-- AUCUNE emission de jeton, aucun checkout, aucun acces public aux tables,
-- aucune carte delivree. Les dossiers de couples restent refuses par E2.
BEGIN;

ALTER TABLE pdc_private.card_portrait_assets
  ADD COLUMN applicant_grant_id uuid
  REFERENCES pdc_private.applicant_portrait_grants_v5b610e2(id);
CREATE UNIQUE INDEX card_portrait_grant_once_v5b610f1
  ON pdc_private.card_portrait_assets(applicant_grant_id)
  WHERE applicant_grant_id IS NOT NULL;

-- L'ancienne fonction admin reserve/confirm/cancel NE DOIT PAS etre utilisee
-- pour les depots des demandeurs. Ici le jeton E2 est consomme DANS LA MEME
-- TRANSACTION que la reservation : un echec annule les deux operations.
CREATE FUNCTION pdc_private.applicant_portrait_reserve_v5b610f1(
  p_card uuid,p_token_hash text,p_mime text
) RETURNS TABLE(asset_id uuid, object_key text, authorization_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_auth uuid; v_asset uuid; v_key text;
BEGIN
  IF p_card IS NULL OR p_token_hash IS NULL OR
     p_token_hash !~ '^[0-9a-f]{64}$' OR p_mime <> 'image/jpeg' OR p_mime IS NULL THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  -- Verrou commun aux fonctions E2 issue/redeem et aux procedures carte.
  PERFORM 1 FROM pdc_private.membership_card_requests c
   WHERE c.id=p_card FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  -- La personne n'a droit qu'a son premier depot, sans remplacer le portrait
  -- admin, sans contourner l'index UNIQUE sur les reservations.
  IF EXISTS (SELECT 1 FROM pdc_private.card_portrait_assets p
             WHERE p.card_request_id=p_card AND p.status IN ('reserved','stored')) OR
     EXISTS (SELECT 1 FROM pdc_private.membership_card_requests c
             WHERE c.id=p_card AND c.portrait_storage_key IS NOT NULL) THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_ALREADY_EXISTS' USING ERRCODE='42501';
  END IF;

  SELECT g.authorization_id INTO v_auth
    FROM pdc_private.applicant_photo_redeem_v5b610e2(p_card,p_token_hash) g;
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  v_asset := pg_catalog.gen_random_uuid();
  v_key := 'card-requests/'||p_card::text||'/'||v_asset::text||'.jpg';
  INSERT INTO pdc_private.card_portrait_assets
    (id,card_request_id,content_type,object_key,applicant_grant_id,status)
  VALUES(v_asset,p_card,'image/jpeg',v_key,v_auth,'reserved');
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
  VALUES('portrait.applicant_reserved','card_portrait_assets',v_asset,
         pg_catalog.jsonb_build_object('card_request_id',p_card,'grant_id',v_auth));
  RETURN QUERY SELECT v_asset,v_key,v_auth;
END;
$fn$;

CREATE FUNCTION pdc_private.applicant_portrait_confirm_v5b610f1(
  p_auth uuid,p_asset uuid,p_bytes integer,p_sha text,p_width integer,p_height integer
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_row pdc_private.card_portrait_assets%ROWTYPE;
        v_grant pdc_private.applicant_portrait_grants_v5b610e2%ROWTYPE;
BEGIN
  IF p_asset IS NULL OR p_auth IS NULL THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  -- Recuperer l'identifiant immutable, puis prendre les verrous dans l'ordre
  -- carte -> asset. Aucune confirmation admin par usurpation d'UUID.
  SELECT * INTO v_row FROM pdc_private.card_portrait_assets WHERE id=p_asset;
  IF NOT FOUND OR v_row.applicant_grant_id IS DISTINCT FROM p_auth THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM pdc_private.membership_card_requests
     WHERE id=v_row.card_request_id FOR UPDATE;
  SELECT * INTO v_row FROM pdc_private.card_portrait_assets WHERE id=p_asset FOR UPDATE;
  SELECT * INTO v_grant FROM pdc_private.applicant_portrait_grants_v5b610e2
     WHERE id=p_auth;
  IF v_row.status <> 'reserved' OR v_row.applicant_grant_id IS DISTINCT FROM p_auth OR
     v_grant.id IS NULL OR v_grant.card_request_id IS DISTINCT FROM v_row.card_request_id OR
     v_grant.consumed_at IS NULL OR v_grant.revoked_at IS NOT NULL OR
     NOT pdc_private.applicant_photo_paid_single_v5b610e2(v_grant.card_request_id,v_grant.payment_id) OR
     EXISTS(SELECT 1 FROM pdc_private.card_portrait_assets a
            WHERE a.card_request_id=v_row.card_request_id AND a.status='stored') THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 5242880 OR
     p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' OR
     p_width IS NULL OR p_width NOT BETWEEN 240 AND 4096 OR
     p_height IS NULL OR p_height NOT BETWEEN 240 AND 4096 THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_METADATA_INVALID' USING ERRCODE='22023';
  END IF;
  -- Le SHA / dimensions ont ete verifies par le serveur apres relecture Storage.
  UPDATE pdc_private.card_portrait_assets SET
    status='stored',stored_at=pg_catalog.clock_timestamp(),file_bytes=p_bytes,
    sha256_hex=p_sha,pixel_width=p_width,pixel_height=p_height
    WHERE id=p_asset;
  UPDATE pdc_private.membership_card_requests
    SET portrait_storage_key=v_row.object_key WHERE id=v_row.card_request_id;
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
  VALUES('portrait.applicant_stored','card_portrait_assets',p_asset,
         pg_catalog.jsonb_build_object('card_request_id',v_row.card_request_id,'grant_id',p_auth));
  RETURN true;
END;
$fn$;

CREATE FUNCTION pdc_private.applicant_portrait_cancel_v5b610f1(
  p_auth uuid,p_asset uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_row pdc_private.card_portrait_assets%ROWTYPE;
BEGIN
  IF p_auth IS NULL OR p_asset IS NULL THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_row FROM pdc_private.card_portrait_assets WHERE id=p_asset;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_row.applicant_grant_id IS DISTINCT FROM p_auth THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_DENIED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM pdc_private.membership_card_requests
    WHERE id=v_row.card_request_id FOR UPDATE;
  DELETE FROM pdc_private.card_portrait_assets
    WHERE id=p_asset AND status='reserved' AND applicant_grant_id=p_auth;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PORTRAIT_NOT_RESERVED' USING ERRCODE='42501';
  END IF;
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
  VALUES('portrait.applicant_reservation_cancelled','card_portrait_assets',p_asset,
         pg_catalog.jsonb_build_object('card_request_id',v_row.card_request_id,'grant_id',p_auth));
  -- Ne restitue pas le jeton deja consomme. Une nouvelle emission reste
  -- reservee au futur service de checkout authentifie.
  RETURN true;
END;
$fn$;

-- Defense en profondeur : seules les nouvelles fonctions, pas les tables.
REVOKE ALL ON FUNCTION pdc_private.applicant_portrait_reserve_v5b610f1(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.applicant_portrait_confirm_v5b610f1(uuid,uuid,integer,text,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.applicant_portrait_cancel_v5b610f1(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.applicant_portrait_reserve_v5b610f1(uuid,text,text)
  TO pdc_portrait_upload_runtime_v5b610c;
GRANT EXECUTE ON FUNCTION pdc_private.applicant_portrait_confirm_v5b610f1(uuid,uuid,integer,text,integer,integer)
  TO pdc_portrait_upload_runtime_v5b610c;
GRANT EXECUTE ON FUNCTION pdc_private.applicant_portrait_cancel_v5b610f1(uuid,uuid)
  TO pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON TABLE pdc_private.card_portrait_assets
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
COMMENT ON COLUMN pdc_private.card_portrait_assets.applicant_grant_id IS
 'F1 DEV : jeton E2 consomme atomiquement avec la reservation; NULL pour le parcours administratif.';
COMMIT;
