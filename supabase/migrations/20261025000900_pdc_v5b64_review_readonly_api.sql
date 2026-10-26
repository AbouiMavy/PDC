-- V5-B.6.4 : affichage des revues dans l'administration nationale (LECTURE SEULE).
-- Développement, projet rvgpnmznhzwlzqyefahd ; prérequis : 8 migrations.
-- Le rôle API n'obtient AUCUN droit de lecture directe des tables ni d'écriture.
BEGIN;

CREATE FUNCTION pdc_private.api_review_batches(p_actor uuid)
RETURNS TABLE(batch_id uuid, status text, opened_at timestamptz,
  closed_at timestamptz, members_in_batch bigint, members_cleared bigint,
  members_revoked bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT b.id,b.status,b.opened_at,b.closed_at,
      pg_catalog.count(e.membership_id),
      pg_catalog.count(e.membership_id) FILTER (WHERE e.outcome='cleared'),
      pg_catalog.count(e.membership_id) FILTER (WHERE e.outcome='revoked')
  FROM pdc_private.membership_review_batches b
  LEFT JOIN pdc_private.membership_review_entries e ON e.batch_id=b.id
  GROUP BY b.id,b.status,b.opened_at,b.closed_at
  ORDER BY b.opened_at DESC,b.id DESC
  LIMIT 20;
END;
$fn$;

CREATE FUNCTION pdc_private.api_review_members(p_actor uuid,p_batch uuid,p_offset integer DEFAULT 0)
RETURNS TABLE(membership_id uuid,member_number text,civility text,last_name text,
  first_name text,date_of_birth date,birth_place text,country_code character(2),
  card_requested boolean,card_format text,joined_at timestamptz,outcome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_batch IS NULL OR NOT EXISTS
    (SELECT 1 FROM pdc_private.membership_review_batches b WHERE b.id=p_batch) THEN
    RAISE EXCEPTION 'PDC_BATCH_NOT_FOUND';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 OR p_offset % 50 <> 0 THEN
    RAISE EXCEPTION 'PDC_INVALID_PAGE';
  END IF;
  RETURN QUERY
  SELECT m.id,m.member_number,p.civility,p.last_name,p.first_name,
    p.date_of_birth,p.birth_place,p.country_of_residence,
    COALESCE(a.card_requested,false),a.card_format,m.joined_at,e.outcome
  FROM pdc_private.membership_review_entries e
  JOIN pdc_private.memberships m ON m.id=e.membership_id
  JOIN pdc_private.people p ON p.id=m.person_id
  LEFT JOIN LATERAL (
    SELECT a.card_requested,a.card_format
    FROM pdc_private.membership_applications a
    WHERE a.membership_id=m.id AND a.application_type='initial'
      AND a.submission_status='accepted'
    ORDER BY a.created_at DESC,a.id DESC LIMIT 1
  ) a ON true
  WHERE e.batch_id=p_batch
  ORDER BY m.joined_at,m.id
  LIMIT 50 OFFSET p_offset;
END;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.api_review_batches(uuid)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.api_review_members(uuid,uuid,integer)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_runtime_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.api_review_batches(uuid) TO pdc_api_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.api_review_members(uuid,uuid,integer) TO pdc_api_v5b3;
COMMIT;
