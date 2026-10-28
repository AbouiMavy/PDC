-- V5-C.27 — DIAGNOSTIC APRÈS application sur un projet Supabase DEV.
-- Contrôle de catalogue seulement. Aucune modification ni paiement.
BEGIN;
DO $check$
DECLARE
  r regprocedure;
  c integer;
BEGIN
  r:=pg_catalog.to_regprocedure('pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)');
  IF r IS NULL THEN RAISE EXCEPTION 'V5C27_SAVE_MISSING'; END IF;
  IF pg_catalog.has_function_privilege('anon',r,'EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated',r,'EXECUTE') OR
     pg_catalog.has_function_privilege('service_role',r,'EXECUTE') THEN
    RAISE EXCEPTION 'V5C27_SAVE_PUBLIC_GRANT';
  END IF;
  IF NOT pg_catalog.has_function_privilege('pdc_tara_v5c_writer',r,'EXECUTE') THEN
    RAISE EXCEPTION 'V5C27_WRITER_GRANT_MISSING';
  END IF;
  r:=pg_catalog.to_regprocedure('pdc_private.tara_v5c_load_issued_channel(text,text)');
  IF r IS NULL OR
     pg_catalog.has_function_privilege('anon',r,'EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated',r,'EXECUTE') OR
     pg_catalog.has_function_privilege('service_role',r,'EXECUTE') THEN
    RAISE EXCEPTION 'V5C27_LOAD_PRIVILEGES_INVALID';
  END IF;
  SELECT pg_catalog.count(*) INTO c FROM information_schema.columns
  WHERE table_schema='pdc_private' AND table_name='tara_checkout_intents_v5c'
    AND column_name IN ('selected_method','selected_messaging_channel',
      'selected_link_field','selected_link_url');
  IF c<>4 THEN RAISE EXCEPTION 'V5C27_COLUMNS_MISSING'; END IF;
END $check$;
ROLLBACK;
