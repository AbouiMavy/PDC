-- PDC V5-B.6.3 : revues hebdomadaires et revocations -- DEV UNIQUEMENT.
-- Prerequis : migrations 00100 ... 00700 sur projet rvgpnmznhzwlzqyefahd.
-- Aucune carte produite, aucun statut « definitif » cree, aucune API ecriture.
BEGIN;

-- Un seul lot ouvert a la fois. Les membres arrivant apres l'ouverture
-- ne font PAS partie du lot et seront examines au cycle suivant.
CREATE TABLE pdc_private.membership_review_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  reviewed_count integer NOT NULL DEFAULT 0 CHECK (reviewed_count >= 0),
  revoked_count integer NOT NULL DEFAULT 0 CHECK (revoked_count >= 0),
  CHECK ((status = 'open' AND closed_by IS NULL AND closed_at IS NULL)
     OR (status = 'closed' AND closed_by IS NOT NULL AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX membership_review_only_one_open_v5b63
  ON pdc_private.membership_review_batches ((true)) WHERE status='open';

CREATE TABLE pdc_private.membership_review_entries (
  batch_id uuid NOT NULL REFERENCES pdc_private.membership_review_batches(id),
  membership_id uuid NOT NULL UNIQUE REFERENCES pdc_private.memberships(id),
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','cleared','revoked')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(batch_id, membership_id)
);
CREATE INDEX membership_review_entries_batch_v5b63
  ON pdc_private.membership_review_entries(batch_id,outcome);

ALTER TABLE pdc_private.membership_review_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdc_private.membership_review_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pdc_private.membership_review_batches
  FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;
REVOKE ALL ON pdc_private.membership_review_entries
  FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;

-- Les ecritures sont reservees au SQL Editor de developpement pour l'instant.
-- Chaque fonction verifie aussi qu'il s'agit d'un administrateur national actif.
-- Les parametres p_actor proviendront plus tard d'un JWT authentifie cote serveur.
CREATE FUNCTION pdc_private.open_weekly_review_dev(p_actor uuid)
RETURNS TABLE(batch_id uuid, members_in_batch bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_batch uuid;
  v_count bigint;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  -- Serialiser ouvertures simultanees et gestion du lot ouvert.
  PERFORM pg_catalog.pg_advisory_xact_lock(56300063);
  IF EXISTS (SELECT 1 FROM pdc_private.membership_review_batches b WHERE b.status='open') THEN
    RAISE EXCEPTION 'PDC_REVIEW_BATCH_ALREADY_OPEN';
  END IF;
  INSERT INTO pdc_private.membership_review_batches(opened_by)
  VALUES (p_actor) RETURNING id INTO v_batch;
  -- Inclure uniquement la serie Internet enregistree, non deja examinee.
  INSERT INTO pdc_private.membership_review_entries(batch_id,membership_id)
  SELECT v_batch,m.id FROM pdc_private.memberships m
  JOIN pdc_private.internet_number_reservations r
    ON r.person_id=m.person_id AND r.member_number=m.member_number
  WHERE m.status='active' AND m.verified_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM pdc_private.membership_review_entries e
                    WHERE e.membership_id=m.id)
  ORDER BY m.joined_at, m.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES (p_actor,'review.batch_opened','membership_review_batches',v_batch,
          pg_catalog.jsonb_build_object('members',v_count));
  RETURN QUERY SELECT v_batch,v_count;
END;
$fn$;

-- Consultation d'une liste deja figee, uniquement depuis le SQL Editor de dev.
-- Donnees personnelles restreintes au strict besoin du controle d'identite.
CREATE FUNCTION pdc_private.list_weekly_review_dev(p_actor uuid,p_batch uuid)
RETURNS TABLE(membership_id uuid,member_number text,civility text,last_name text,
  first_name text,date_of_birth date,birth_place text,country_of_residence char(2),
  card_requested boolean,card_format text,joined_at timestamptz,outcome text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pdc_private.membership_review_batches WHERE id=p_batch) THEN
    RAISE EXCEPTION 'PDC_REVIEW_BATCH_NOT_FOUND';
  END IF;
  RETURN QUERY
  SELECT m.id,m.member_number,p.civility,p.last_name,p.first_name,
         p.date_of_birth,p.birth_place,p.country_of_residence,
         COALESCE(a.card_requested,false),a.card_format,m.joined_at,e.outcome
  FROM pdc_private.membership_review_entries e
  JOIN pdc_private.memberships m ON m.id=e.membership_id
  JOIN pdc_private.people p ON p.id=m.person_id
  LEFT JOIN pdc_private.membership_applications a
    ON a.membership_id=m.id AND a.application_type='initial'
      AND a.submission_status='accepted'
  WHERE e.batch_id=p_batch
  ORDER BY m.joined_at,m.id;
END;
$fn$;

-- Revocation par decision administrative, avec motif et auteur; conserve le
-- numero et les pieces comptables. Une carte deja emise est invalidable.
CREATE FUNCTION pdc_private.revoke_internet_membership_dev(
  p_actor uuid,p_membership uuid,p_reason text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_member pdc_private.memberships%ROWTYPE;
  v_reason text;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_reason := pg_catalog.btrim(COALESCE(p_reason,''));
  IF length(v_reason) < 10 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'PDC_REVOCATION_REASON_REQUIRED';
  END IF;
  SELECT * INTO v_member FROM pdc_private.memberships
    WHERE id=p_membership FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_MEMBERSHIP_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pdc_private.internet_number_reservations r
                 WHERE r.person_id=v_member.person_id AND r.member_number=v_member.member_number) THEN
    RAISE EXCEPTION 'PDC_NOT_AN_INTERNET_MEMBERSHIP';
  END IF;
  IF v_member.status='ended' THEN RETURN false; END IF; -- retry idempotent
  IF v_member.status <> 'active' THEN RAISE EXCEPTION 'PDC_MEMBERSHIP_NOT_ACTIVE'; END IF;
  PERFORM pg_catalog.set_config('pdc.actor_user_id',p_actor::text,true);
  UPDATE pdc_private.memberships SET status='ended',ended_at=pg_catalog.now()
   WHERE id=p_membership;
  UPDATE pdc_private.membership_card_requests
     SET status='invalidated'
   WHERE person_id=v_member.person_id AND status <> 'invalidated';
  UPDATE pdc_private.membership_review_entries
     SET outcome='revoked' WHERE membership_id=p_membership AND outcome='pending';
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES(p_actor,'membership.revoked','memberships',p_membership,
         pg_catalog.jsonb_build_object('reason',v_reason,
            'prior_reviewed',v_member.verified_at IS NOT NULL));
  PERFORM pg_catalog.set_config('pdc.actor_user_id','',true);
  RETURN true;
END;
$fn$;

-- Une seule validation de lot, sans approuver manuellement chaque dossier.
CREATE FUNCTION pdc_private.close_weekly_review_dev(p_actor uuid,p_batch uuid)
RETURNS TABLE(reviewed bigint,revoked bigint)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_reviewed bigint;
  v_revoked bigint;
BEGIN
  IF p_actor IS NULL OR NOT pdc_private.api_is_national_admin(p_actor) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM pdc_private.membership_review_batches b
   WHERE b.id=p_batch AND b.status='open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_REVIEW_BATCH_NOT_OPEN'; END IF;
  -- Les membres revoques entre l'ouverture et la cloture sont exclus.
  UPDATE pdc_private.memberships m
     SET verified_at=pg_catalog.now()
   FROM pdc_private.membership_review_entries e
   WHERE e.batch_id=p_batch AND e.membership_id=m.id
     AND e.outcome='pending' AND m.status='active' AND m.verified_at IS NULL;
  GET DIAGNOSTICS v_reviewed = ROW_COUNT;
  UPDATE pdc_private.membership_review_entries e
     SET outcome='cleared'
   FROM pdc_private.memberships m
   WHERE e.batch_id=p_batch AND e.membership_id=m.id
     AND e.outcome='pending' AND m.status='active' AND m.verified_at IS NOT NULL;
  IF EXISTS(SELECT 1 FROM pdc_private.membership_review_entries e
            WHERE e.batch_id=p_batch AND e.outcome='pending') THEN
    RAISE EXCEPTION 'PDC_REVIEW_BATCH_INCONSISTENT';
  END IF;
  -- Autorisation de PREPARATION des cartes seulement, jamais emission/delivrance.
  UPDATE pdc_private.membership_card_requests c
     SET status='reviewed'
   FROM pdc_private.memberships m
   JOIN pdc_private.membership_review_entries e ON e.membership_id=m.id
   WHERE e.batch_id=p_batch AND e.outcome='cleared'
     AND m.person_id=c.person_id AND c.status='requested';
  SELECT count(*) INTO v_revoked FROM pdc_private.membership_review_entries e
    WHERE e.batch_id=p_batch AND e.outcome='revoked';
  UPDATE pdc_private.membership_review_batches
     SET status='closed',closed_by=p_actor,closed_at=pg_catalog.now(),
         reviewed_count=v_reviewed::integer,revoked_count=v_revoked::integer
   WHERE id=p_batch;
  INSERT INTO pdc_private.audit_log(actor_user_id,action,target_table,target_id,metadata)
  VALUES(p_actor,'review.batch_closed','membership_review_batches',p_batch,
         pg_catalog.jsonb_build_object('reviewed',v_reviewed,'revoked',v_revoked));
  RETURN QUERY SELECT v_reviewed,v_revoked;
END;
$fn$;

-- EXPLICITEM pas d'EXECUTE pour le navigateur, service_role ou API v5b3.
REVOKE ALL ON FUNCTION pdc_private.open_weekly_review_dev(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.list_weekly_review_dev(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.revoke_internet_membership_dev(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
REVOKE ALL ON FUNCTION pdc_private.close_weekly_review_dev(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
COMMIT;
