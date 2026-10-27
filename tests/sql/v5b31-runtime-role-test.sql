-- À exécuter uniquement dans pdc-developpement avec le SQL Editor Supabase.
-- Tests réversibles : aucun changement persistant ni donnée de militant.
BEGIN;

DO $preflight$
DECLARE
  r record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
         rolbypassrls, rolconnlimit
    INTO r
  FROM pg_catalog.pg_roles
  WHERE rolname = 'pdc_api_runtime_v5b3';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;
  IF NOT r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR
     r.rolcreaterole OR r.rolreplication OR r.rolbypassrls OR
     r.rolconnlimit <> 3 THEN
    RAISE EXCEPTION 'RUNTIME_ROLE_CONFIG_INCORRECT';
  END IF;
  IF NOT pg_catalog.pg_has_role('pdc_api_runtime_v5b3','pdc_api_v5b3','member') THEN
    RAISE EXCEPTION 'GROUP_MEMBERSHIP_MISSING';
  END IF;
  RAISE NOTICE '01/03: rôle LOGIN restreint : OK (absence de mot de passe fixée par la migration)';
END;
$preflight$;

-- Le SQL Editor s'exécute habituellement avec un rôle privilégié ; on vérifie ici
-- les droits effectifs du rôle applicatif sans lui ouvrir une véritable session.
-- Ceci évite une dépendance à la possibilité du SQL Editor de SET ROLE.
DO $privileges$
DECLARE
  a boolean;
BEGIN
  IF NOT pg_catalog.has_schema_privilege('pdc_api_runtime_v5b3','pdc_private','USAGE') THEN
    RAISE EXCEPTION 'PRIVATE_SCHEMA_NOT_USABLE';
  END IF;
  IF pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.people','SELECT') OR
     pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.people','INSERT') OR
     pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.memberships','UPDATE') OR
     pg_catalog.has_table_privilege('pdc_api_runtime_v5b3','pdc_private.role_assignments','SELECT') THEN
    RAISE EXCEPTION 'DIRECT_PRIVATE_TABLE_ACCESS_DETECTED';
  END IF;
  IF NOT pg_catalog.has_function_privilege('pdc_api_runtime_v5b3','pdc_private.api_is_national_admin(uuid)','EXECUTE') OR
     NOT pg_catalog.has_function_privilege('pdc_api_runtime_v5b3','pdc_private.api_national_dashboard(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'AUTHORIZED_FUNCTIONS_NOT_EXECUTABLE';
  END IF;
  RAISE NOTICE '02/03: fonctions autorisées, accès direct aux tables refusé : OK';
  a := pdc_private.api_is_national_admin('00000000-0000-4000-8000-000000000000'::uuid);
  IF a IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'UNKNOWN_USER_AUTHORIZED';
  END IF;
  BEGIN
    PERFORM * FROM pdc_private.api_national_dashboard('00000000-0000-4000-8000-000000000000'::uuid);
    RAISE EXCEPTION 'UNAUTHORIZED_DASHBOARD_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '03/03: dashboard refusé pour utilisateur non habilité : OK';
  END;
END;
$privileges$;

ROLLBACK;
