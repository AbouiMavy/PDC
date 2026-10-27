-- PDC V5-B.2 — PROTOTYPE d'admission nationale ; DEVELOPPEMENT UNIQUEMENT.
-- Prérequis : migration 20261025000100 appliquée et validée.
-- N'ACCEPTE QUE des dossiers Cameroun dans ce prototype ; règlements diaspora à arbitrer.
-- Aucun navigateur ni rôle anon/authenticated ne peut appeler cette fonction.
-- L'identité de l'agent (p_actor_user_id) doit être authentifiée par une API serveur.
BEGIN;

-- Numérotation provisoire non officielle, non réutilisable, émise par PostgreSQL.
CREATE SEQUENCE pdc_private.member_number_dev_seq AS bigint START WITH 1 INCREMENT BY 1 NO CYCLE;
REVOKE ALL ON SEQUENCE pdc_private.member_number_dev_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE pdc_private.member_number_dev_seq TO service_role;

-- Deux dossiers initiaux ne doivent jamais être admis pour la même personne.
CREATE UNIQUE INDEX one_accepted_initial_application_per_person
  ON pdc_private.membership_applications (person_id)
  WHERE application_type = 'initial' AND submission_status = 'accepted';

-- Journalisation automatique du noyau d'admission ; aucune PII dans les métadonnées.
CREATE FUNCTION pdc_private.audit_admission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $audit$
DECLARE
  v_actor uuid;
  v_action text;
  v_target uuid;
  v_metadata jsonb;
  v_actor_text text;
BEGIN
  v_actor_text := NULLIF(pg_catalog.current_setting('pdc.actor_user_id', true), '');
  v_actor := v_actor_text::uuid;

  IF TG_TABLE_NAME = 'memberships' THEN
    IF TG_OP = 'INSERT' THEN
      v_action := 'membership.created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.status IS NOT DISTINCT FROM OLD.status
         AND NEW.member_number IS NOT DISTINCT FROM OLD.member_number THEN
        RETURN NEW;
      END IF;
      v_action := 'membership.changed';
    ELSE
      v_action := 'membership.deleted';
    END IF;
    v_target := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    v_metadata := CASE WHEN TG_OP = 'DELETE'
      THEN pg_catalog.jsonb_build_object('status',OLD.status)
      ELSE pg_catalog.jsonb_build_object('status',NEW.status, 'number_assigned',NEW.member_number IS NOT NULL)
    END;
  ELSIF TG_TABLE_NAME = 'membership_applications' THEN
    IF TG_OP <> 'UPDATE' OR NEW.submission_status IS NOT DISTINCT FROM OLD.submission_status THEN
      RETURN NEW;
    END IF;
    v_action := 'application.status_changed';
    v_target := NEW.id;
    v_metadata := pg_catalog.jsonb_build_object('from', OLD.submission_status, 'to', NEW.submission_status);
  ELSE
    RAISE EXCEPTION 'Unexpected audit target';
  END IF;

  INSERT INTO pdc_private.audit_log(actor_user_id, action, target_table, target_id, metadata)
  VALUES (v_actor, v_action, TG_TABLE_NAME, v_target, v_metadata);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$audit$;

CREATE TRIGGER audit_memberships_v5b2
  AFTER INSERT OR UPDATE OR DELETE ON pdc_private.memberships
  FOR EACH ROW EXECUTE FUNCTION pdc_private.audit_admission_change();
CREATE TRIGGER audit_application_status_v5b2
  AFTER UPDATE OF submission_status ON pdc_private.membership_applications
  FOR EACH ROW EXECUTE FUNCTION pdc_private.audit_admission_change();

-- Procédure atomique : vérification de l'agent, vérification des frais,
-- immatriculation puis validation de la demande. Transaction gérée par PostgreSQL.
CREATE FUNCTION pdc_private.admit_member_dev(
  p_application_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE(membership_id uuid, member_number text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $admit$
DECLARE
  v_application record;
  v_membership uuid;
  v_number text;
  v_fee_is_paid boolean;
BEGIN
  IF p_application_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'PDC_INVALID_REQUEST';
  END IF;

  -- À ce stade, seuls les administrateurs nationaux actuellement habilités.
  -- L'API devra vérifier le JWT avant de fournir p_actor_user_id.
  IF NOT EXISTS (
    SELECT 1 FROM pdc_private.role_assignments ra
    WHERE ra.auth_user_id = p_actor_user_id
      AND ra.role_code = 'national_admin'
      AND ra.scope_territory_id IS NULL
      AND ra.valid_from <= pg_catalog.now()
      AND (ra.valid_until IS NULL OR ra.valid_until > pg_catalog.now())
  ) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;

  SELECT a.* INTO v_application
  FROM pdc_private.membership_applications a
  WHERE a.id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_APPLICATION_NOT_FOUND'; END IF;

  -- Verrou de personne : sérialise les admissions concurrentes d'une même personne.
  PERFORM 1 FROM pdc_private.people p
  WHERE p.id = v_application.person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_PERSON_NOT_FOUND'; END IF;

  -- Un retry d'une admission déjà accomplie est idempotent.
  IF v_application.submission_status = 'accepted' AND v_application.membership_id IS NOT NULL THEN
    SELECT m.id, m.member_number INTO v_membership, v_number
    FROM pdc_private.memberships m
    WHERE m.id = v_application.membership_id
      AND m.person_id = v_application.person_id AND m.status = 'active';
    IF v_membership IS NULL THEN RAISE EXCEPTION 'PDC_INCONSISTENT_ADMISSION'; END IF;
    RETURN QUERY SELECT v_membership, v_number;
    RETURN;
  END IF;

  IF v_application.application_type <> 'initial'
     OR v_application.residence_group <> 'cameroon'
     OR v_application.submission_status NOT IN ('submitted','under_review') THEN
    RAISE EXCEPTION 'PDC_APPLICATION_NOT_ELIGIBLE_FOR_DEV_ADMISSION';
  END IF;
  IF v_application.policy_accepted_at IS NULL
     OR v_application.policy_version IS NULL
     OR v_application.data_notice_accepted_at IS NULL
     OR v_application.submitted_at IS NULL THEN
    RAISE EXCEPTION 'PDC_CONSENT_INCOMPLETE';
  END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.memberships m WHERE m.person_id = v_application.person_id) THEN
    RAISE EXCEPTION 'PDC_MEMBER_ALREADY_EXISTS';
  END IF;

  -- La preuve de règlement est une affectation vers l'obligation initiale,
  -- issue d'un paiement au statut confirmed. Le backend devra authentifier
  -- le prestataire avant de permettre ce statut.
  SELECT EXISTS (
    SELECT 1 FROM pdc_private.dues_obligations d
    JOIN pdc_private.obligation_balances b ON b.obligation_id = d.id
    WHERE d.person_id = v_application.person_id
      AND d.kind = 'initial_membership_fee'
      AND d.status = 'open' AND d.currency = 'XAF'
      AND d.amount_due_minor = 2000 AND b.balance_minor = 0
  ) INTO v_fee_is_paid;
  IF NOT v_fee_is_paid THEN RAISE EXCEPTION 'PDC_INITIAL_FEE_NOT_CONFIRMED'; END IF;

  v_number := 'PDC-DEV-' || pg_catalog.to_char(pg_catalog.now(),'YYYY') || '-' ||
              pg_catalog.lpad(pg_catalog.nextval('pdc_private.member_number_dev_seq'::regclass)::text,8,'0');

  -- Identité de l'auteur fournie par l'API après authentification.
  PERFORM pg_catalog.set_config('pdc.actor_user_id',p_actor_user_id::text,true);
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
  VALUES(v_application.person_id,v_number,'active',pg_catalog.now(),pg_catalog.now())
  RETURNING id INTO v_membership;

  UPDATE pdc_private.membership_applications
  SET submission_status='accepted',membership_id=v_membership
  WHERE id=p_application_id;

  RETURN QUERY SELECT v_membership, v_number;
END;
$admit$;

-- ATTENTION : nouveau objet, EXECUTE est accordé à PUBLIC par défaut.
REVOKE ALL ON FUNCTION pdc_private.audit_admission_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION pdc_private.admit_member_dev(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pdc_private.audit_admission_change() TO service_role;
GRANT EXECUTE ON FUNCTION pdc_private.admit_member_dev(uuid,uuid) TO service_role;
COMMIT;
