-- Lancer UNIQUEMENT dans SQL Editor du projet Supabase DEV autorisé,
-- après application AUDITÉE des migrations 020 puis 021.
-- Contrôle non destructeur : aucune donnée insérée et ROLLBACK explicite.
BEGIN;
SET LOCAL ROLE pdc_tara_v5c_writer;
DO $check$
BEGIN
  IF current_user <> 'pdc_tara_v5c_writer' THEN
    RAISE EXCEPTION 'PDC_TARA_INCORRECT_ROLE';
  END IF;
  IF pg_catalog.has_table_privilege('pdc_private.payment_attempts','SELECT') OR
     pg_catalog.has_table_privilege('pdc_private.payment_attempts','INSERT') OR
     pg_catalog.has_table_privilege('pdc_private.payment_attempts','UPDATE') OR
     pg_catalog.has_table_privilege('pdc_private.payment_events','INSERT') OR
     pg_catalog.has_table_privilege('pdc_private.tara_checkout_intents_v5c','SELECT') OR
     pg_catalog.has_table_privilege('pdc_private.tara_checkout_intents_v5c','INSERT') OR
     pg_catalog.has_table_privilege('pdc_private.tara_webhook_inbox_v5c','INSERT') OR
     pg_catalog.has_table_privilege('pdc_private.tara_reconciliation_evidence_v5c','INSERT') THEN
    RAISE EXCEPTION 'PDC_TARA_DIRECT_TABLE_PRIVILEGE_DETECTED';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
    'pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('pdc_private.tara_v5c_load_checkout(text)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('pdc_private.tara_v5c_record_evidence(text,text,text,bigint,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PDC_TARA_MISSING_GATEWAY_PRIVILEGE';
  END IF;
END;
$check$;
SELECT 'V5C_TARA_ROLE_PERMISSIONS_PASS' AS audit_result;
ROLLBACK;
