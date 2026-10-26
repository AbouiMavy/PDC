-- V5-B.3 : endpoints ADMIN EN LECTURE SEULE ; développement uniquement.
-- Prérequis : migrations V5-B.1 et V5-B.2 appliquées.
-- AUCUN COMPTE AVEC LOGIN NI MOT DE PASSE n'est créé ici.
BEGIN;

-- Groupe technique sans LOGIN et sans privilège direct sur les tables.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pdc_api_v5b3') THEN
    CREATE ROLE pdc_api_v5b3 NOLOGIN;
  END IF;
END;
$role$;
GRANT USAGE ON SCHEMA pdc_private TO pdc_api_v5b3;

-- Fonction privée : aucune identité personnelle retournée, uniquement un booléen.
CREATE FUNCTION pdc_private.api_is_national_admin(p_actor_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM pdc_private.role_assignments r
    WHERE r.auth_user_id = p_actor_user_id
      AND r.role_code = 'national_admin'
      AND r.scope_territory_id IS NULL
      AND r.valid_from <= pg_catalog.now()
      AND (r.valid_until IS NULL OR r.valid_until > pg_catalog.now())
  );
$fn$;

-- Statistiques agrégées uniquement. Contrôle des droits répété EN BASE.
CREATE FUNCTION pdc_private.api_national_dashboard(p_actor_user_id uuid)
RETURNS TABLE(applications_to_review bigint, active_memberships bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF NOT pdc_private.api_is_national_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT
      (SELECT pg_catalog.count(*) FROM pdc_private.membership_applications a
        WHERE a.submission_status IN ('submitted','under_review')),
      (SELECT pg_catalog.count(*) FROM pdc_private.memberships m
        WHERE m.status = 'active');
END;
$fn$;

-- SECURITY DEFINER : un EXECUTE accordé à PUBLIC serait dangereux.
REVOKE ALL ON FUNCTION pdc_private.api_is_national_admin(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION pdc_private.api_national_dashboard(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pdc_private.api_is_national_admin(uuid) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.api_national_dashboard(uuid) TO pdc_api_v5b3;

-- Aucune habilitation de lecture/écriture directe : seules les fonctions ci-dessus sont accessibles.
REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_api_v5b3;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pdc_private FROM pdc_api_v5b3;
COMMIT;
