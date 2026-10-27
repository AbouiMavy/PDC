-- PDC V5-C.2 — inbox Tara et intentions XAF, environnement DEV UNIQUEMENT.
-- ADDITIF aux migrations V5-B. La base réelle ne doit PAS être modifiée sans
-- audit SQL et validation du projet de développement Supabase.
-- Aucun GRANT runtime : les nouvelles tables restent inaccessibles aux clients.
BEGIN;

CREATE TABLE pdc_private.tara_checkout_intents_v5c (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  product_id text NOT NULL UNIQUE
    CHECK (product_id ~ '^PDC_[A-Za-z0-9_-]{24}$'),
  payment_id uuid NOT NULL UNIQUE REFERENCES pdc_private.payment_attempts(id),
  quote_id uuid NOT NULL,
  payer_id uuid NOT NULL REFERENCES pdc_private.people(id),
  idempotency_key text NOT NULL UNIQUE
    CHECK (pg_catalog.length(idempotency_key) BETWEEN 16 AND 128),
  amount_xaf bigint NOT NULL CHECK (amount_xaf > 0 AND amount_xaf <= 2147483647),
  currency char(3) NOT NULL DEFAULT 'XAF' CHECK (currency = 'XAF'),
  link_state text NOT NULL DEFAULT 'reserved'
    CHECK (link_state IN ('reserved','requested','issued','unknown','cancelled')),
  general_link text CHECK (general_link IS NULL OR
    (pg_catalog.length(general_link) BETWEEN 15 AND 2048
      AND (general_link LIKE 'https://taramoney.com/pay/%' OR
           general_link LIKE 'https://www.taramoney.com/pay/%'))),
  requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((link_state = 'issued' AND general_link IS NOT NULL) OR
         (link_state <> 'issued' AND general_link IS NULL)),
  CHECK ((link_state = 'reserved' AND requested_at IS NULL) OR
         (link_state <> 'reserved' AND requested_at IS NOT NULL))
);
CREATE INDEX tara_checkout_link_state_v5c
  ON pdc_private.tara_checkout_intents_v5c(link_state,created_at);
COMMENT ON TABLE pdc_private.tara_checkout_intents_v5c IS
  'DEV seulement. Correspondance produit Tara = commande interne; aucun paiement confirmé ici.';

-- Ne pas accepter une intention sur un paiement inexistant, appartenant à un
-- autre payeur, d'une autre devise ou déjà confirmé.
CREATE FUNCTION pdc_private.tara_intent_guard_v5c()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE p pdc_private.payment_attempts%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id,NEW.product_id,NEW.payment_id,NEW.quote_id,NEW.payer_id,
        NEW.idempotency_key,NEW.amount_xaf,NEW.currency,NEW.created_at)
       IS DISTINCT FROM
       (OLD.id,OLD.product_id,OLD.payment_id,OLD.quote_id,OLD.payer_id,
        OLD.idempotency_key,OLD.amount_xaf,OLD.currency,OLD.created_at) THEN
      RAISE EXCEPTION 'PDC_TARA_INTENT_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF (OLD.link_state,NEW.link_state) NOT IN
       (('reserved','requested'),('requested','issued'),
        ('requested','unknown'),('issued','issued'),
        ('unknown','unknown'),('cancelled','cancelled'))
       AND OLD.link_state <> NEW.link_state THEN
      RAISE EXCEPTION 'PDC_TARA_LINK_TRANSITION_INVALID' USING ERRCODE='23514';
    END IF;
    -- Après une tentative réseau ambiguë, il est interdit de réémettre
    -- automatiquement le lien. Reprise uniquement après arbitrage humain.
    IF NEW.link_state='issued' AND OLD.link_state<>'requested' THEN
      RAISE EXCEPTION 'PDC_TARA_LINK_ORIGIN_INVALID' USING ERRCODE='23514';
    END IF;
    NEW.updated_at := pg_catalog.now();
  END IF;
  SELECT * INTO p FROM pdc_private.payment_attempts
    WHERE id=NEW.payment_id FOR UPDATE;
  IF NOT FOUND OR p.provider<>'tara' OR p.payer_id<>NEW.payer_id OR
     p.currency<>'XAF' OR p.amount_minor<>NEW.amount_xaf OR
     p.status NOT IN ('initiated','pending') THEN
    RAISE EXCEPTION 'PDC_TARA_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER tara_intent_guard_v5c
 BEFORE INSERT OR UPDATE ON pdc_private.tara_checkout_intents_v5c
 FOR EACH ROW EXECUTE FUNCTION pdc_private.tara_intent_guard_v5c();

-- Un webhook est NON FIABLE : on journalise seulement un indice, jamais un
-- evenement verifie dans payment_events, ni une admission, ni un remboursement.
CREATE TABLE pdc_private.tara_webhook_inbox_v5c (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  fingerprint char(64) NOT NULL UNIQUE CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  product_id text NOT NULL CHECK (pg_catalog.length(product_id) BETWEEN 8 AND 128),
  provider_payment_id text NOT NULL CHECK (pg_catalog.length(provider_payment_id) BETWEEN 1 AND 200),
  amount_claimed_xaf bigint NOT NULL CHECK (amount_claimed_xaf >= 0),
  status_claimed text NOT NULL CHECK (status_claimed ~ '^[A-Z_]{3,50}$'),
  untrusted boolean NOT NULL DEFAULT true CHECK (untrusted = true),
  received_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX tara_webhook_inbox_product_v5c
 ON pdc_private.tara_webhook_inbox_v5c(product_id, received_at);

-- Une verification obtenue par des appels SERVEUR ne devient pas directement
-- une ligne 'confirmed' : le passage dans payment_attempts attend un role DB
-- et un protocole de validation atomique audites et autorises separement.
CREATE TABLE pdc_private.tara_reconciliation_evidence_v5c (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  product_id text NOT NULL REFERENCES pdc_private.tara_checkout_intents_v5c(product_id),
  decision text NOT NULL CHECK (decision IN ('corroborated','not_verified','manual_review')),
  reason text CHECK (reason IS NULL OR pg_catalog.length(reason) <= 100),
  expected_amount_xaf bigint NOT NULL CHECK (expected_amount_xaf > 0),
  payment_channel text NOT NULL CHECK (payment_channel IN ('mobile','card','unknown')),
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX tara_reconciliation_evidence_product_v5c
 ON pdc_private.tara_reconciliation_evidence_v5c(product_id,recorded_at DESC);

-- Aucune de ces tables ne peut être lue ou écrite par les clients Web, la
-- service_role Supabase ou les API nationales existantes. Leur propriétaire
-- SQL Editor DEV peut y accéder lors des essais après audit.
DO $fn$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tara_checkout_intents_v5c',
    'tara_webhook_inbox_v5c',
    'tara_reconciliation_evidence_v5c'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE pdc_private.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON TABLE pdc_private.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION pdc_private.tara_intent_guard_v5c()
 FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE pdc_private.tara_webhook_inbox_v5c IS
  'Indicateurs non authentifies seulement. Aucun SUCCESS ne donne droit a admission.';
COMMENT ON TABLE pdc_private.tara_reconciliation_evidence_v5c IS
  'Preuves corroborees sous reserve de verification transactionnelle finale; zero octroi automatique.';
COMMIT;
