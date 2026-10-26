-- PDC V5-B.6.8 : file de preparation des cartes, LECTURE SEULE, DEV UNIQUEMENT.
-- Prerequis : migrations jusqu'a 20261025000900, projet de developpement.
-- Aucun stockage de photo, aucune emission, aucune carte valide, aucun QR.
BEGIN;

CREATE FUNCTION pdc_private.api_card_preparation_queue(
  p_actor uuid,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  card_request_id uuid,
  membership_id uuid,
  member_number text,
  civility text,
  last_name text,
  first_name text,
  date_of_birth date,
  birth_place text,
  card_variant text,
  requested_format text,
  portrait_registered boolean,
  reviewed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 OR p_offset % 50 <> 0 THEN
    RAISE EXCEPTION 'PDC_INVALID_PAGE';
  END IF;

  RETURN QUERY
  SELECT c.id, m.id, m.member_number, p.civility, p.last_name,
         p.first_name, p.date_of_birth, p.birth_place,
         a.residence_group AS card_variant, c.requested_format,
         (NULLIF(pg_catalog.btrim(c.portrait_storage_key), '') IS NOT NULL),
         b.closed_at
    FROM pdc_private.membership_card_requests c
    JOIN pdc_private.membership_applications a
      ON a.id = c.application_id
       AND a.person_id = c.person_id
       AND a.application_type = 'initial'
       AND a.submission_status = 'accepted'
       AND a.residence_group IN ('cameroon', 'diaspora')
    JOIN pdc_private.memberships m
      ON m.id = a.membership_id
       AND m.person_id = c.person_id
       AND m.status = 'active'
       AND m.verified_at IS NOT NULL
    JOIN pdc_private.internet_number_reservations r
      ON r.person_id = m.person_id AND r.member_number = m.member_number
    JOIN pdc_private.people p ON p.id = m.person_id
    JOIN pdc_private.membership_review_entries e
      ON e.membership_id = m.id AND e.outcome = 'cleared'
    JOIN pdc_private.membership_review_batches b
      ON b.id = e.batch_id AND b.status = 'closed' AND b.closed_at IS NOT NULL
   WHERE c.status = 'reviewed'
     AND c.issued_at IS NULL
     AND c.delivered_at IS NULL
     AND c.requested_format IN ('digital', 'physical', 'both')
   ORDER BY b.closed_at, c.created_at, c.id
   LIMIT 50 OFFSET p_offset;
END;
$fn$;

-- Ne jamais donner au navigateur ni a service_role l'acces direct aux tables
-- ou a la fonction. Le groupe API existant ne peut EXECUTER que cette lecture.
REVOKE ALL ON FUNCTION pdc_private.api_card_preparation_queue(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role, pdc_api_runtime_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.api_card_preparation_queue(uuid, integer)
  TO pdc_api_v5b3;

COMMENT ON FUNCTION pdc_private.api_card_preparation_queue(uuid, integer) IS
  'DEV : file de preparation en lecture seule; portrait_registered indique une cle stockee, pas une photo valide; aucune impression, emission ni delivrance.';
COMMIT;
