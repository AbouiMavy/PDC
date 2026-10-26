-- PDC V5-B.6.9 : preparation du registre prive des photographies.
-- DEV UNIQUEMENT, projet rvgpnmznhzwlzqyefahd. Prerequis : migrations 00100 .. 01000.
-- Ce script NE cree PAS de fichiers Storage, NE modifie PAS storage.objects,
-- N'AUTORISE AUCUN televersement, NE publie PAS de photo et NE delivre aucune carte.
BEGIN;

CREATE TABLE pdc_private.card_portrait_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_request_id uuid NOT NULL REFERENCES pdc_private.membership_card_requests(id),
  bucket_id text NOT NULL DEFAULT 'pdc-member-portraits-dev'
    CHECK (bucket_id = 'pdc-member-portraits-dev'),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  object_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','stored','retired')),
  file_bytes integer CHECK (file_bytes IS NULL OR file_bytes BETWEEN 1 AND 5242880),
  sha256_hex text CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[0-9a-f]{64}$'),
  pixel_width integer CHECK (pixel_width IS NULL OR pixel_width BETWEEN 240 AND 4096),
  pixel_height integer CHECK (pixel_height IS NULL OR pixel_height BETWEEN 240 AND 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  stored_at timestamptz,
  retired_at timestamptz,
  -- An opaque object path is tied to one card-request and one asset ID.
  -- No name, email, membership number or birth date in the path.
  CONSTRAINT card_portrait_key_v5b69 CHECK (
    object_key = 'card-requests/' || card_request_id::text || '/' || id::text ||
      CASE content_type WHEN 'image/jpeg' THEN '.jpg' ELSE '.png' END
  ),
  CONSTRAINT card_portrait_lifecycle_v5b69 CHECK (
    (status='reserved' AND stored_at IS NULL AND retired_at IS NULL
       AND file_bytes IS NULL AND sha256_hex IS NULL
       AND pixel_width IS NULL AND pixel_height IS NULL)
    OR
    (status='stored' AND stored_at IS NOT NULL AND retired_at IS NULL
       AND file_bytes IS NOT NULL AND sha256_hex IS NOT NULL
       AND pixel_width IS NOT NULL AND pixel_height IS NOT NULL)
    OR
    (status='retired' AND stored_at IS NOT NULL AND retired_at IS NOT NULL
       AND file_bytes IS NOT NULL AND sha256_hex IS NOT NULL
       AND pixel_width IS NOT NULL AND pixel_height IS NOT NULL)
  )
);

-- Only one active photo can be associated with each person's card request.
-- Different partners in a couple have different card_request_id values.
CREATE UNIQUE INDEX card_portrait_one_stored_per_request_v5b69
 ON pdc_private.card_portrait_assets(card_request_id)
 WHERE status='stored';
CREATE INDEX card_portrait_by_request_v5b69
 ON pdc_private.card_portrait_assets(card_request_id,created_at DESC);

-- Basic integrity: association and object identity cannot be changed after creation;
-- allowed lifecycle: reserved -> stored -> retired, never backwards.
CREATE FUNCTION pdc_private.card_portrait_lifecycle_guard_v5b69()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
  IF (NEW.id,NEW.card_request_id,NEW.bucket_id,NEW.content_type,NEW.object_key,NEW.created_at)
       IS DISTINCT FROM
     (OLD.id,OLD.card_request_id,OLD.bucket_id,OLD.content_type,OLD.object_key,OLD.created_at)
  THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_LINK_IMMUTABLE';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
      (OLD.status='reserved' AND NEW.status='stored') OR
      (OLD.status='stored' AND NEW.status='retired')
  ) THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_INVALID_TRANSITION';
  END IF;
  IF OLD.status IN ('stored','retired') AND
     (NEW.file_bytes,NEW.sha256_hex,NEW.pixel_width,NEW.pixel_height,NEW.stored_at)
       IS DISTINCT FROM
     (OLD.file_bytes,OLD.sha256_hex,OLD.pixel_width,OLD.pixel_height,OLD.stored_at)
  THEN
    RAISE EXCEPTION 'PDC_PORTRAIT_METADATA_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$guard$;
CREATE TRIGGER card_portrait_lifecycle_guard_trigger_v5b69
BEFORE UPDATE ON pdc_private.card_portrait_assets
FOR EACH ROW EXECUTE FUNCTION pdc_private.card_portrait_lifecycle_guard_v5b69();
REVOKE ALL ON FUNCTION pdc_private.card_portrait_lifecycle_guard_v5b69()
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;

ALTER TABLE pdc_private.card_portrait_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.card_portrait_assets
 FROM PUBLIC, anon, authenticated, service_role,
      pdc_api_v5b3, pdc_api_runtime_v5b3;

COMMENT ON TABLE pdc_private.card_portrait_assets IS
 'DEV seulement : registre prive de photos liees aux demandes de carte. Aucune URL, aucun octet stocke en SQL. Ecritures reservees a la future API privilegiee et auditee.';
COMMENT ON COLUMN pdc_private.card_portrait_assets.status IS
 'reserved=emplacement alloue mais pas de preuve de fichier; stored=upload verifie par le futur serveur; retired=ancien objet a supprimer via Storage API apres audit.';
COMMENT ON COLUMN pdc_private.card_portrait_assets.object_key IS
 'Chemin opaque prive; une cle enregistree ne prouve jamais que le fichier existe dans Storage.';

COMMIT;
