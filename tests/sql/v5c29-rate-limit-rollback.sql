-- Supabase DEV. Exécuter APRÈS la migration 029. Aucun jeton/preuve personnel.
BEGIN;
DO $plpgsql$
DECLARE v_digest text:=repeat('d',64);v_ok boolean;v_i integer;v_count integer;
BEGIN
  IF NOT pg_catalog.has_function_privilege('pdc_tara_v5c_writer',
    'pdc_private.tara_v5c29_limit_public_order(text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'V5C29_WRITER_NOT_GRANTED';
  END IF;
  IF pg_catalog.has_function_privilege('anon',
    'pdc_private.tara_v5c29_limit_public_order(text,integer)','EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated',
    'pdc_private.tara_v5c29_limit_public_order(text,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'V5C29_PUBLIC_GRANT_UNSAFE';
  END IF;
  FOR v_i IN 1..6 LOOP
    v_ok:=pdc_private.tara_v5c29_limit_public_order(v_digest,5);
    IF v_ok IS DISTINCT FROM (v_i<=5) THEN
      RAISE EXCEPTION 'V5C29_RATE_LIMIT_FAILED %',v_i;
    END IF;
  END LOOP;
  SELECT hits INTO v_count FROM pdc_private.public_rate_buckets_v5c29
    WHERE key_digest=v_digest AND window_started=pg_catalog.date_trunc('minute',pg_catalog.now());
  IF v_count IS DISTINCT FROM 6 THEN RAISE EXCEPTION 'V5C29_COUNT_INVALID';END IF;
END $plpgsql$;
ROLLBACK;
