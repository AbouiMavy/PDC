-- V5-C.28 / 1 : ÉTAT RÉEL DU PROJET SUPABASE DEV
-- À copier dans SQL Editor du SEUL projet DEV après vérification de son URL.
-- 100 % lecture seule. Aucun mot de passe ni identifiant personnel affiché.
BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS executing_role,
  EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_tara_v5c_writer') AS writer_role_exists,
  pg_catalog.to_regclass('pdc_private.payment_attempts') IS NOT NULL AS base_v5b_present,
  pg_catalog.to_regclass('pdc_private.tara_checkout_intents_v5c') IS NOT NULL AS migration_020_present,
  pg_catalog.to_regprocedure('pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint)') IS NOT NULL AS migration_021_present,
  pg_catalog.to_regclass('pdc_private.public_checkout_orders_v5c') IS NOT NULL AS migration_023_present,
  pg_catalog.to_regprocedure('pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)') IS NOT NULL AS migration_027_present;

-- Exécutable même si toutes les migrations n'existent pas encore.
WITH objects AS (
  SELECT '020 checkout intentions' AS element, 'pdc_private.tara_checkout_intents_v5c'::text AS object_name
  UNION ALL SELECT '020 preuves', 'pdc_private.tara_reconciliation_evidence_v5c'
  UNION ALL SELECT '023 commandes', 'pdc_private.public_checkout_orders_v5c'
)
SELECT element, object_name, pg_catalog.to_regclass(object_name) IS NOT NULL AS exists_in_dev
FROM objects ORDER BY element;

-- Ne jamais confondre existence du fichier Git et migration installée.
-- Si un des résultats attendus est false, STOP : audit et ordre des migrations.
ROLLBACK;
