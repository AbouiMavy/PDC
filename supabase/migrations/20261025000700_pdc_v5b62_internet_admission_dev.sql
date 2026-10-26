-- PDC V5-B.6.2 -- admission Internet transactionnelle en DEVELOPPEMENT SEULEMENT.
-- Ne cree aucun paiement. Ne connecte aucun webhook. Aucun acces depuis React ou l'API actuelle.
-- Prerequis : migrations 00100 ... 00600 validees dans rvgpnmznhzwlzqyefahd.
BEGIN;

-- La sequence de V5-B.6.1 reste privee mais n'est PAS utilisee ici :
-- contrairement a nextval, ce compteur est transactionnel (les tests ROLLBACK
-- n'epuisent aucun numero). Il serialise egalement les inscriptions simultanees.
CREATE TABLE pdc_private.internet_member_counter_v5b62 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_serial integer NOT NULL DEFAULT 0 CHECK (last_serial BETWEEN 0 AND 999999)
);
INSERT INTO pdc_private.internet_member_counter_v5b62(singleton,last_serial)
SELECT true, GREATEST(
  COALESCE((SELECT max(serial_number) FROM pdc_private.internet_number_reservations),0),
  COALESCE((SELECT max(pg_catalog.right(member_number,6)::integer)
            FROM pdc_private.memberships
            WHERE member_number ~ '^[MF]-PDC-I-[0-9]{6}$'),0)
);
ALTER TABLE pdc_private.internet_member_counter_v5b62 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.internet_member_counter_v5b62
 FROM PUBLIC, anon, authenticated, service_role, pdc_api_v5b3, pdc_api_runtime_v5b3;
COMMENT ON TABLE pdc_private.internet_member_counter_v5b62 IS
 'Compteur Internet national transactionnel; conserve son nombre lors des ROLLBACK de test.';
COMMENT ON SEQUENCE pdc_private.internet_member_number_seq IS
 'Sequence preparatoire V5-B.6.1 NON UTILISEE : le compteur transactionnel V5-B.6.2 fait foi.';

-- Uniquement pour execution explicite depuis SQL Editor de developpement
-- jusqu'a mise en place d'une API/Webhook avec verification cryptographique.
CREATE FUNCTION pdc_private.admit_paid_internet_dev(p_application_id uuid)
RETURNS TABLE(membership_id uuid, member_number text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $admit_v5b62$
DECLARE
  v_application pdc_private.membership_applications%ROWTYPE;
  v_person pdc_private.people%ROWTYPE;
  v_prefix text;
  v_number text;
  v_serial integer;
  v_member uuid;
  v_fee_kind text;
  v_due bigint;
  v_currency char(3);
  v_paid boolean;
BEGIN
  IF p_application_id IS NULL THEN
    RAISE EXCEPTION 'PDC_INVALID_REQUEST';
  END IF;

  SELECT a.* INTO v_application
    FROM pdc_private.membership_applications a
    WHERE a.id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_APPLICATION_NOT_FOUND'; END IF;

  -- Un verrou par personne rend les retries et doubles demandes seriels.
  SELECT p.* INTO v_person FROM pdc_private.people p
    WHERE p.id=v_application.person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_PERSON_NOT_FOUND'; END IF;

  -- Retry strictement idempotent; jamais reactiver un membre revoque/suspendu.
  IF v_application.submission_status='accepted' AND v_application.membership_id IS NOT NULL THEN
    SELECT m.id,m.member_number INTO v_member,v_number
      FROM pdc_private.memberships m
      JOIN pdc_private.internet_number_reservations r
        ON r.person_id=m.person_id AND r.member_number=m.member_number
      WHERE m.id=v_application.membership_id
        AND m.person_id=v_application.person_id
        AND m.status='active';
    IF v_member IS NULL THEN RAISE EXCEPTION 'PDC_ADMISSION_ALREADY_CLOSED'; END IF;
    RETURN QUERY SELECT v_member,v_number;
    RETURN;
  END IF;

  IF v_application.application_type <> 'initial'
     OR v_application.submission_status NOT IN ('submitted','under_review')
     OR v_application.membership_id IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_APPLICATION_NOT_ELIGIBLE';
  END IF;
  IF v_application.policy_accepted_at IS NULL OR v_application.policy_version IS NULL
     OR v_application.data_notice_accepted_at IS NULL OR v_application.submitted_at IS NULL THEN
    RAISE EXCEPTION 'PDC_CONSENT_INCOMPLETE';
  END IF;
  IF v_person.date_of_birth IS NULL OR v_person.date_of_birth > CURRENT_DATE
     OR v_person.birth_place IS NULL OR length(pg_catalog.btrim(v_person.birth_place))=0 THEN
    RAISE EXCEPTION 'PDC_BIRTH_IDENTITY_INCOMPLETE';
  END IF;
  -- Pas de champ « sexe » supplementaire sur le site : M/F vient de la civilite.
  v_prefix := CASE v_person.civility
    WHEN 'Monsieur' THEN 'M'
    WHEN 'Madame' THEN 'F'
    ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'PDC_CIVILITY_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.memberships m WHERE m.person_id=v_person.id) THEN
    RAISE EXCEPTION 'PDC_MEMBER_ALREADY_EXISTS';
  END IF;

  -- Conditions actuelles : Cameroun 2000 XAF ou diaspora individuelle
  -- (30/15 EUR). L'offre couple 40 EUR implique DEUX personnes et reste
  -- interdite ici jusqu'au rapprochement bancaire commun des 2 dossiers.
  IF v_application.residence_group='cameroon' THEN
    v_fee_kind := 'initial_membership_fee';
    v_currency := 'XAF';
    v_due := 2000;
  ELSIF v_application.residence_group='diaspora' THEN
    IF v_application.category_code='couple' THEN
      RAISE EXCEPTION 'PDC_COUPLE_PAYMENT_MODEL_PENDING';
    ELSIF v_application.category_code='simple' THEN
      v_due := 3000; -- centimes EUR : 30 euros
    ELSIF v_application.category_code='reduit' THEN
      v_due := 1500; -- centimes EUR : 15 euros
    ELSE
      RAISE EXCEPTION 'PDC_DIASPORA_CATEGORY_UNKNOWN';
    END IF;
    v_fee_kind := 'annual_dues';
    v_currency := 'EUR';
  ELSE
    RAISE EXCEPTION 'PDC_RESIDENCE_GROUP_INVALID';
  END IF;

  -- Paiement eligible = obligation du dossier reglee en entier par des
  -- affectations de prestataires Tara/Stripe CONFIRMEES et associees a au
  -- moins un evenement valide par le serveur (verified_at non null).
  -- Ce controle SQL ne remplace PAS la verification du webhook cote serveur.
  SELECT EXISTS (
    SELECT 1 FROM pdc_private.dues_obligations d
    WHERE d.application_id=v_application.id
      AND d.person_id=v_application.person_id
      AND d.status='open' AND d.kind=v_fee_kind
      AND d.currency=v_currency AND d.amount_due_minor=v_due
      AND (v_fee_kind <> 'annual_dues'
           OR d.fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::integer)
      AND (
        SELECT COALESCE(SUM(a.amount_minor),0)::bigint
        FROM pdc_private.payment_allocations a
        JOIN pdc_private.payment_attempts p ON p.id=a.payment_id
        WHERE a.obligation_id=d.id AND p.payer_id=v_application.person_id
          AND p.currency=v_currency AND p.status='confirmed'
          AND p.confirmed_at IS NOT NULL
          AND p.provider IN ('tara','stripe')
          AND p.provider_payment_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM pdc_private.payment_events e
            WHERE e.payment_id=p.id AND e.provider=p.provider
              AND e.verified_at IS NOT NULL
          )
      )=d.amount_due_minor
  ) INTO v_paid;
  IF NOT v_paid THEN RAISE EXCEPTION 'PDC_PAYMENT_NOT_VERIFIED'; END IF;

  -- Compteur transactionnel, verrouille par UPDATE. ROLLBACK annule son
  -- avancement; 2 transactions concurrentes ne peuvent recevoir le meme rang.
  UPDATE pdc_private.internet_member_counter_v5b62
     SET last_serial=last_serial+1
   WHERE singleton=true AND last_serial < 999999
   RETURNING last_serial INTO v_serial;
  IF v_serial IS NULL THEN RAISE EXCEPTION 'PDC_INTERNET_NUMBER_EXHAUSTED'; END IF;
  v_number := pdc_private.format_internet_member_number(v_prefix,v_serial);
  IF EXISTS (SELECT 1 FROM pdc_private.memberships m WHERE m.member_number=v_number) THEN
    RAISE EXCEPTION 'PDC_INTERNET_NUMBER_COLLISION';
  END IF;

  -- Trace sans reattribution, y compris apres revocation future.
  INSERT INTO pdc_private.internet_number_reservations
    (serial_number,member_number,person_id)
  VALUES(v_serial,v_number,v_person.id);

  -- La qualite 'active' signifie ici inscription enregistree; verified_at
  -- demeure NULL jusqu'a la revue hebdomadaire : pas de carte definitive.
  PERFORM pg_catalog.set_config('pdc.actor_user_id','',true);
  UPDATE pdc_private.people SET sex_code=v_prefix,updated_at=pg_catalog.now()
    WHERE id=v_person.id;
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
  VALUES(v_person.id,v_number,'active',pg_catalog.now(),NULL)
  RETURNING id INTO v_member;
  UPDATE pdc_private.membership_applications
     SET submission_status='accepted',membership_id=v_member
   WHERE id=v_application.id;

  -- Enregistrer le souhait de carte, sans fabriquer de carte ni stocker de photo.
  IF v_application.card_requested THEN
    INSERT INTO pdc_private.membership_card_requests
      (application_id,person_id,requested_format)
    VALUES(v_application.id,v_person.id,v_application.card_format);
  END IF;
  RETURN QUERY SELECT v_member,v_number;
END;
$admit_v5b62$;

-- Pas d'activation de l'API actuelle, qui doit rester LECTURE SEULE.
REVOKE ALL ON FUNCTION pdc_private.admit_paid_internet_dev(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
COMMIT;
