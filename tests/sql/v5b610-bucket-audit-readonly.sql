-- PDC V5-B.6.10-A — lecture seule depuis SQL Editor Supabase.
-- Ce contrôle n'active aucune permission sur storage.objects.
DO $check$
DECLARE
  v_public boolean;
  v_limit bigint;
  v_mimes text[];
BEGIN
  SELECT b.public,b.file_size_limit,b.allowed_mime_types
    INTO v_public,v_limit,v_mimes
    FROM storage.buckets b WHERE b.id='pdc-member-portraits-dev';
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_BUCKET_MISSING'; END IF;
  IF v_public IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'PDC_BUCKET_NOT_PRIVATE'; END IF;
  IF v_limit IS NULL OR v_limit < 1 OR v_limit > 5242880 THEN
    RAISE EXCEPTION 'PDC_BUCKET_MAX_BYTES_INCORRECT';
  END IF;
  IF v_mimes IS NULL OR array_length(v_mimes,1)<>2 OR
      NOT(v_mimes @> ARRAY['image/jpeg','image/png']::text[]) THEN
    RAISE EXCEPTION 'PDC_BUCKET_MIME_INCORRECT';
  END IF;
  RAISE NOTICE 'V5-B.6.10-A: bucket privé, limite 5 Mio et formats stricts conformes';
END;
$check$;
-- Vérifier également manuellement les politiques éventuelles trop larges
-- dans Supabase Storage > Policies; aucun GRANT n'est ajouté ici.
