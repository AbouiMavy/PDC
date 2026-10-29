-- V5-C.28 / 2 : contrôle de droits APRÈS installation contrôlée des 020/021/023/027.
-- Lecture seule; erreur si exposition aux rôles du navigateur.
BEGIN TRANSACTION READ ONLY;
DO $v5c28$
DECLARE p text; f regprocedure; t text; rel regclass; rls boolean;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_tara_v5c_writer') THEN
    RAISE EXCEPTION 'V5C28_ROLE_WRITER_MISSING';
  END IF;
  FOREACH p IN ARRAY ARRAY[
    'pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)',
    'pdc_private.tara_v5c_claim_link(text)',
    'pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)',
    'pdc_private.tara_v5c_load_issued_channel(text,text)',
    'pdc_private.tara_v5c_create_public_order(jsonb)'
  ] LOOP
    f:=pg_catalog.to_regprocedure(p);
    IF f IS NULL THEN RAISE EXCEPTION 'V5C28_RPC_MISSING: %',p; END IF;
    -- PUBLIC n'est pas un rôle PG ; les privilèges hérités de PUBLIC sont
    -- visibles par les rôles anon/authenticated/service_role ci-dessous.
    IF pg_catalog.has_function_privilege('anon',f,'EXECUTE') OR
       pg_catalog.has_function_privilege('authenticated',f,'EXECUTE') OR
       pg_catalog.has_function_privilege('service_role',f,'EXECUTE') THEN
      RAISE EXCEPTION 'V5C28_PUBLIC_EXECUTE_FORBIDDEN: %',p;
    END IF;
    IF NOT pg_catalog.has_function_privilege('pdc_tara_v5c_writer',f,'EXECUTE') THEN
      RAISE EXCEPTION 'V5C28_WRITER_EXECUTE_MISSING: %',p;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'pdc_private.public_checkout_orders_v5c',
    'pdc_private.tara_checkout_intents_v5c',
    'pdc_private.tara_webhook_inbox_v5c',
    'pdc_private.tara_reconciliation_evidence_v5c'
  ] LOOP
    rel:=pg_catalog.to_regclass(t);
    IF rel IS NULL THEN RAISE EXCEPTION 'V5C28_TABLE_MISSING: %',t; END IF;
    SELECT c.relrowsecurity INTO rls FROM pg_catalog.pg_class c WHERE c.oid=rel;
    IF rls IS DISTINCT FROM true THEN RAISE EXCEPTION 'V5C28_RLS_MISSING: %',t; END IF;
    IF pg_catalog.has_table_privilege('anon',rel,'SELECT') OR
       pg_catalog.has_table_privilege('anon',rel,'INSERT') OR
       pg_catalog.has_table_privilege('authenticated',rel,'SELECT') OR
       pg_catalog.has_table_privilege('service_role',rel,'SELECT') OR
       pg_catalog.has_table_privilege('pdc_tara_v5c_writer',rel,'SELECT') OR
       pg_catalog.has_table_privilege('pdc_tara_v5c_writer',rel,'INSERT') OR
       pg_catalog.has_table_privilege('pdc_tara_v5c_writer',rel,'UPDATE') THEN
      RAISE EXCEPTION 'V5C28_TABLE_PRIVILEGE_FORBIDDEN: %',t;
    END IF;
  END LOOP;
  RAISE NOTICE 'V5-C.28 : privilèges et RLS attendus vérifiés. Aucune écriture.';
END;
$v5c28$;
ROLLBACK;
