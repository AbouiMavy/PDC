-- Lecture et assertions sans création de données. Exécuter sur pdc-developpement uniquement.
BEGIN;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_api_v5b3' AND rolcanlogin=false) THEN
    RAISE EXCEPTION 'Rôle de groupe privé absent ou avec LOGIN';
  END IF;
  IF pg_catalog.has_table_privilege('pdc_api_v5b3','pdc_private.people','SELECT') OR
     pg_catalog.has_table_privilege('pdc_api_v5b3','pdc_private.people','INSERT') OR
     pg_catalog.has_table_privilege('pdc_api_v5b3','pdc_private.memberships','UPDATE') OR
     pg_catalog.has_table_privilege('pdc_api_v5b3','pdc_private.role_assignments','SELECT') THEN
    RAISE EXCEPTION 'Privilèges directs indus sur des tables sensibles';
  END IF;
  IF NOT pg_catalog.has_function_privilege('pdc_api_v5b3','pdc_private.api_is_national_admin(uuid)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('pdc_api_v5b3','pdc_private.api_national_dashboard(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Fonctions nécessaires inaccessibles';
  END IF;
  IF pg_catalog.has_function_privilege('anon','pdc_private.api_national_dashboard(uuid)','EXECUTE') OR
     pg_catalog.has_function_privilege('authenticated','pdc_private.api_national_dashboard(uuid)','EXECUTE') OR
     pg_catalog.has_function_privilege('anon','pdc_private.api_is_national_admin(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Une fonction d’administration est accessible publiquement';
  END IF;
  IF pdc_private.api_is_national_admin('00000000-0000-4000-8000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Un identifiant inconnu ne doit pas être administrateur';
  END IF;
  BEGIN
    PERFORM * FROM pdc_private.api_national_dashboard('00000000-0000-4000-8000-000000000000'::uuid);
    RAISE EXCEPTION 'Tableau de bord non administrateur accepté';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- Rejet attendu, SQLSTATE 42501
  END;
END;
$test$;
ROLLBACK;
