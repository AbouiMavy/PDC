-- PDC / V5-B: schema PREPARATOIRE. Ne pas appliquer sur une base existante de production.
-- Aucune donnée réelle, aucun paiement, aucun accès anonyme.
-- Tester et auditer d'abord dans un NOUVEAU projet Supabase de developpement.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pdc_private;
REVOKE ALL ON SCHEMA pdc_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA pdc_private TO service_role;

CREATE TABLE pdc_private.territorial_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code char(2) NOT NULL,
    unit_kind text NOT NULL CHECK (unit_kind IN ('region','department','commune','state','province','district')),
    unit_code text NOT NULL,
    label_fr text NOT NULL,
    label_en text,
    parent_id uuid REFERENCES pdc_private.territorial_units(id),
    enabled boolean NOT NULL DEFAULT true,
    UNIQUE (country_code, unit_kind, unit_code)
);
CREATE INDEX territorial_units_parent_idx ON pdc_private.territorial_units(parent_id);

CREATE TABLE pdc_private.people (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    civility text CHECK (civility IN ('Madame','Monsieur') OR civility IS NULL),
    last_name text NOT NULL CHECK(length(trim(last_name)) > 0),
    first_name text NOT NULL CHECK(length(trim(first_name)) > 0),
    date_of_birth date,
    occupation text,
    country_of_residence char(2) NOT NULL,
    email text,
    phone_e164 text,
    postal_code text,
    residence_address text,
    residence_region text,
    residence_department text,
    residence_city text,
    home_region_id uuid REFERENCES pdc_private.territorial_units(id),
    home_department_id uuid REFERENCES pdc_private.territorial_units(id),
    home_commune_id uuid REFERENCES pdc_private.territorial_units(id),
    home_commune_free_text text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX people_email_idx ON pdc_private.people(lower(email));
-- Ne pas exposer people via API publique : l'appartenance politique est sensible.

CREATE TABLE pdc_private.memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL UNIQUE REFERENCES pdc_private.people(id),
    member_number text UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','ended')),
    joined_at timestamptz,
    verified_at timestamptz,
    ended_at timestamptz,
    CHECK (status <> 'active' OR (member_number IS NOT NULL AND joined_at IS NOT NULL))
);
-- Les numéros ne sont attribués qu'après validation administrative,
-- jamais générés dans le navigateur et jamais utilisés comme secret d'accès.

CREATE TABLE pdc_private.member_auth_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
    membership_id uuid NOT NULL UNIQUE REFERENCES pdc_private.memberships(id),
    verified_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Liaison future Auth <-> militant, sans création automatique de compte.

CREATE TABLE pdc_private.membership_applications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text NOT NULL UNIQUE,
    person_id uuid NOT NULL REFERENCES pdc_private.people(id),
    membership_id uuid REFERENCES pdc_private.memberships(id),
    application_type text NOT NULL CHECK (application_type IN ('initial','renewal')),
    residence_group text NOT NULL CHECK (residence_group IN ('cameroon','diaspora')),
    category_code text NOT NULL,
    submission_status text NOT NULL DEFAULT 'draft' CHECK (submission_status IN ('draft','submitted','under_review','accepted','refused','cancelled')),
    policy_accepted_at timestamptz,
    policy_version text,
    data_notice_accepted_at timestamptz,
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (submission_status IN ('draft','cancelled') OR
           (policy_accepted_at IS NOT NULL AND policy_version IS NOT NULL AND submitted_at IS NOT NULL))
);
CREATE INDEX membership_applications_person_idx ON pdc_private.membership_applications(person_id);

CREATE TABLE pdc_private.dues_obligations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL REFERENCES pdc_private.people(id),
    membership_id uuid REFERENCES pdc_private.memberships(id),
    application_id uuid REFERENCES pdc_private.membership_applications(id),
    kind text NOT NULL CHECK (kind IN ('initial_membership_fee','annual_dues')),
    fiscal_year integer CHECK (fiscal_year BETWEEN 2000 AND 2200),
    category_code text NOT NULL,
    amount_due_minor bigint NOT NULL CHECK (amount_due_minor > 0),
    currency char(3) NOT NULL CHECK (currency IN ('XAF','EUR')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','void')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((kind = 'initial_membership_fee' AND fiscal_year IS NULL) OR
           (kind = 'annual_dues' AND fiscal_year IS NOT NULL))
);
-- Une seule ligne de frais initiaux non annulée par personne.
CREATE UNIQUE INDEX one_initial_fee_per_person ON pdc_private.dues_obligations(person_id)
  WHERE kind = 'initial_membership_fee' AND status = 'open';
-- Une seule obligation annuelle active par personne et exercice.
CREATE UNIQUE INDEX one_dues_per_year ON pdc_private.dues_obligations(person_id, fiscal_year)
  WHERE kind = 'annual_dues' AND status = 'open';
CREATE INDEX dues_person_idx ON pdc_private.dues_obligations(person_id, fiscal_year);

CREATE TABLE pdc_private.donations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text NOT NULL UNIQUE,
    person_id uuid NOT NULL REFERENCES pdc_private.people(id),
    currency char(3) NOT NULL CHECK (currency IN ('XAF','EUR')),
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    frequency text NOT NULL CHECK (frequency IN ('once','monthly_intent')),
    anonymous_publicly boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_payment','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);
-- monthly_intent n'est PAS un abonnement de prélèvement automatique.
CREATE TABLE pdc_private.donation_designations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    donation_id uuid NOT NULL REFERENCES pdc_private.donations(id),
    purpose text NOT NULL CHECK (purpose IN ('scrutateurs','cautionnements','campagne','autres','libre')),
    percent numeric(5,2) NOT NULL CHECK (percent > 0 AND percent <= 100),
    UNIQUE(donation_id, purpose)
);
-- Le serveur vérifiera que la somme des pourcentages = 100 avant paiement.

CREATE TABLE pdc_private.payment_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference text NOT NULL UNIQUE,
    payer_id uuid NOT NULL REFERENCES pdc_private.people(id),
    provider text NOT NULL CHECK (provider IN ('tara','stripe','bank_transfer','manual')),
    provider_payment_id text,
    currency char(3) NOT NULL CHECK (currency IN ('XAF','EUR')),
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','pending','confirmed','failed','cancelled','refunded')),
    confirmed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'confirmed' AND confirmed_at IS NOT NULL) OR status <> 'confirmed')
);
CREATE UNIQUE INDEX payment_provider_reference ON pdc_private.payment_attempts(provider, provider_payment_id)
 WHERE provider_payment_id IS NOT NULL;
CREATE INDEX payment_attempts_payer_idx ON pdc_private.payment_attempts(payer_id);

CREATE TABLE pdc_private.payment_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    payment_id uuid REFERENCES pdc_private.payment_attempts(id),
    event_type text NOT NULL,
    verified_at timestamptz,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(provider, provider_event_id)
);
-- Cette unicité ne remplace PAS la vérification cryptographique des webhooks.

CREATE TABLE pdc_private.payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES pdc_private.payment_attempts(id),
    obligation_id uuid REFERENCES pdc_private.dues_obligations(id),
    donation_id uuid REFERENCES pdc_private.donations(id),
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((obligation_id IS NOT NULL) <> (donation_id IS NOT NULL))
);
CREATE UNIQUE INDEX payment_to_obligation_unique ON pdc_private.payment_allocations(payment_id, obligation_id)
 WHERE obligation_id IS NOT NULL;
CREATE UNIQUE INDEX payment_to_donation_unique ON pdc_private.payment_allocations(payment_id, donation_id)
 WHERE donation_id IS NOT NULL;
CREATE INDEX allocations_obligation_idx ON pdc_private.payment_allocations(obligation_id);
CREATE INDEX allocations_donation_idx ON pdc_private.payment_allocations(donation_id);

CREATE TABLE pdc_private.role_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid NOT NULL REFERENCES auth.users(id),
    role_code text NOT NULL CHECK (role_code IN ('national_admin','national_treasury','regional_admin','department_admin','commune_admin','member')),
    scope_territory_id uuid REFERENCES pdc_private.territorial_units(id),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    CHECK (valid_until IS NULL OR valid_until > valid_from),
    CHECK (role_code IN ('national_admin','national_treasury','member') OR scope_territory_id IS NOT NULL)
);
CREATE INDEX role_assignments_user_idx ON pdc_private.role_assignments(auth_user_id);
-- Présence des rôles = anticipation technique, PAS permission active d'accès.

CREATE TABLE pdc_private.audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id uuid,
    action text NOT NULL,
    target_table text NOT NULL,
    target_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Vue interne : seules les affectations rattachées à un paiement CONFIRME comptent.
-- Aucun accès public, pas de lecture directe depuis React.
CREATE VIEW pdc_private.obligation_balances
WITH (security_invoker = true) AS
SELECT o.id AS obligation_id, o.person_id, o.kind, o.fiscal_year,
       o.currency, o.amount_due_minor,
       COALESCE(SUM(a.amount_minor) FILTER (WHERE p.status = 'confirmed'),0)::bigint AS amount_paid_minor,
       (o.amount_due_minor - COALESCE(SUM(a.amount_minor) FILTER (WHERE p.status = 'confirmed'),0))::bigint AS balance_minor
FROM pdc_private.dues_obligations o
LEFT JOIN pdc_private.payment_allocations a ON a.obligation_id = o.id
LEFT JOIN pdc_private.payment_attempts p ON p.id = a.payment_id
WHERE o.status = 'open'
GROUP BY o.id;

-- Vérifications au niveau base : même personne, même devise, plafonds d'affectation.
-- Incluent les paiements en attente : ils réservent le montant pendant leur préparation.
-- En phase V5-B, tous les enregistrements sont effectués uniquement par un service serveur contrôlé.
CREATE FUNCTION pdc_private.validate_payment_allocation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  p record;
  target_person uuid;
  target_currency char(3);
  target_max bigint;
  used_payment bigint;
  used_target bigint;
BEGIN
  SELECT * INTO p FROM pdc_private.payment_attempts WHERE id = NEW.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.status IN ('failed','cancelled','refunded') THEN RAISE EXCEPTION 'Payment cannot be allocated'; END IF;
  IF NEW.obligation_id IS NOT NULL THEN
     SELECT person_id, currency, amount_due_minor INTO target_person,target_currency,target_max
       FROM pdc_private.dues_obligations WHERE id=NEW.obligation_id AND status='open' FOR UPDATE;
  ELSE
     SELECT person_id, currency, amount_minor INTO target_person,target_currency,target_max
       FROM pdc_private.donations WHERE id=NEW.donation_id AND status <> 'cancelled' FOR UPDATE;
  END IF;
  IF target_person IS NULL THEN RAISE EXCEPTION 'Target not found'; END IF;
  IF target_person <> p.payer_id OR target_currency <> p.currency THEN
    RAISE EXCEPTION 'Payer/currency mismatch';
  END IF;
  SELECT COALESCE(SUM(amount_minor),0) INTO used_payment
    FROM pdc_private.payment_allocations WHERE payment_id=NEW.payment_id AND id<>NEW.id;
  IF used_payment + NEW.amount_minor > p.amount_minor THEN RAISE EXCEPTION 'Payment overallocation'; END IF;
  IF NEW.obligation_id IS NOT NULL THEN
    SELECT COALESCE(SUM(a.amount_minor),0) INTO used_target
      FROM pdc_private.payment_allocations a
      JOIN pdc_private.payment_attempts x ON x.id=a.payment_id
      WHERE a.obligation_id=NEW.obligation_id AND a.id<>NEW.id AND x.status NOT IN ('failed','cancelled','refunded');
  ELSE
    SELECT COALESCE(SUM(a.amount_minor),0) INTO used_target
      FROM pdc_private.payment_allocations a
      JOIN pdc_private.payment_attempts x ON x.id=a.payment_id
      WHERE a.donation_id=NEW.donation_id AND a.id<>NEW.id AND x.status NOT IN ('failed','cancelled','refunded');
  END IF;
  IF used_target + NEW.amount_minor > target_max THEN RAISE EXCEPTION 'Target overallocation'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocation_validate
  BEFORE INSERT OR UPDATE ON pdc_private.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION pdc_private.validate_payment_allocation();

-- Un paiement en attente ne doit pas devenir confirmé sans contrôle d'affectation.
-- IMPORTANT: la signature du prestataire est vérifiée côté serveur (hors SQL).
-- Autorisations : aucun accès anon/authenticated aux tables privées.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['territorial_units','people','memberships','membership_applications',
  'member_auth_links','dues_obligations','donations','donation_designations','payment_attempts','payment_events',
  'payment_allocations','role_assignments','audit_log'] LOOP
    EXECUTE format('ALTER TABLE pdc_private.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE pdc_private.%I FROM PUBLIC, anon, authenticated',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE pdc_private.%I TO service_role',t);
  END LOOP;
END $$;
-- Journal d'audit : append-only au niveau des grants du service de l'application.
REVOKE UPDATE, DELETE ON TABLE pdc_private.audit_log FROM service_role;
-- Les notifications reçues ne sont pas modifiables ou effaçables par le service.
REVOKE UPDATE, DELETE ON TABLE pdc_private.payment_events FROM service_role;
REVOKE ALL ON pdc_private.obligation_balances FROM PUBLIC, anon, authenticated;
GRANT SELECT ON pdc_private.obligation_balances TO service_role;
REVOKE ALL ON FUNCTION pdc_private.validate_payment_allocation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pdc_private.validate_payment_allocation() TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pdc_private TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA pdc_private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA pdc_private REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
COMMIT;
