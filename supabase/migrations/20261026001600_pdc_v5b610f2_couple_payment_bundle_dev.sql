-- PDC V5-B.6.10-F2 — unité financière de couple, développement UNIQUEMENT.
-- Prérequis: migrations 00100 ... 01500. ADDITIF; aucune carte, aucun webhook,
-- aucun dépôt public, aucun passage en production. Ne modifie pas l'admission V5B62.
-- 40 EUR = 4 000 centimes, PAS deux cotisations arbitraires de 20 EUR.
BEGIN;

CREATE TABLE pdc_private.couple_checkout_orders_v5b610f2 (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  reference text NOT NULL UNIQUE CHECK (pg_catalog.length(reference) BETWEEN 8 AND 120),
  payer_person_id uuid NOT NULL REFERENCES pdc_private.people(id),
  payment_id uuid UNIQUE REFERENCES pdc_private.payment_attempts(id),
  currency char(3) NOT NULL DEFAULT 'EUR' CHECK (currency='EUR'),
  amount_minor bigint NOT NULL DEFAULT 4000 CHECK (amount_minor=4000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_payment','cancelled')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((status='draft' AND payment_id IS NULL) OR
         (status='awaiting_payment' AND payment_id IS NOT NULL) OR
         status='cancelled')
);

CREATE TABLE pdc_private.couple_checkout_beneficiaries_v5b610f2 (
  order_id uuid NOT NULL REFERENCES pdc_private.couple_checkout_orders_v5b610f2(id),
  slot text NOT NULL CHECK (slot IN ('member','partner')),
  person_id uuid NOT NULL REFERENCES pdc_private.people(id),
  application_id uuid NOT NULL UNIQUE REFERENCES pdc_private.membership_applications(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (order_id,slot),
  UNIQUE (order_id,person_id)
);
CREATE INDEX couple_checkout_beneficiaries_person_v5b610f2
  ON pdc_private.couple_checkout_beneficiaries_v5b610f2(person_id);

-- Le rattachement d'un dossier requiert deux demandes distinctes soumises,
-- avec acceptation des textes. Cette vérification n'authentifie pas une personne
-- et ne remplace pas la preuve du consentement propre à chaque bénéficiaire.
CREATE FUNCTION pdc_private.couple_beneficiary_guard_v5b610f2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_order pdc_private.couple_checkout_orders_v5b610f2%ROWTYPE;
        v_app pdc_private.membership_applications%ROWTYPE;
BEGIN
  IF TG_OP='UPDATE' THEN
    RAISE EXCEPTION 'PDC_COUPLE_BENEFICIARY_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_order FROM pdc_private.couple_checkout_orders_v5b610f2
   WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END FOR UPDATE;
  IF NOT FOUND OR v_order.status<>'draft' THEN
    RAISE EXCEPTION 'PDC_COUPLE_ORDER_LOCKED' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT * INTO v_app FROM pdc_private.membership_applications
    WHERE id=NEW.application_id FOR UPDATE;
  IF NOT FOUND OR v_app.person_id<>NEW.person_id OR
     v_app.application_type<>'initial' OR v_app.residence_group<>'diaspora' OR
     v_app.category_code<>'couple' OR
     v_app.submission_status NOT IN ('submitted','under_review') OR
     v_app.policy_accepted_at IS NULL OR v_app.policy_version IS NULL OR
     v_app.data_notice_accepted_at IS NULL OR v_app.submitted_at IS NULL OR
     (NEW.slot='member' AND NEW.person_id<>v_order.payer_person_id) OR
     (NEW.slot='partner' AND NEW.person_id=v_order.payer_person_id) THEN
    RAISE EXCEPTION 'PDC_COUPLE_BENEFICIARY_INVALID' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER couple_beneficiary_guard_v5b610f2
 BEFORE INSERT OR UPDATE OR DELETE ON pdc_private.couple_checkout_beneficiaries_v5b610f2
 FOR EACH ROW EXECUTE FUNCTION pdc_private.couple_beneficiary_guard_v5b610f2();

-- Une commande ne peut être liée qu'une fois à UN paiement propre au payeur.
-- Le verrou sur le paiement sérialise la liaison avec les allocations classiques.
CREATE FUNCTION pdc_private.couple_order_guard_v5b610f2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE v_payment pdc_private.payment_attempts%ROWTYPE;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'PDC_COUPLE_INITIAL_STATE_INVALID' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id,NEW.reference,NEW.payer_person_id,NEW.currency,NEW.amount_minor,NEW.created_at)
       IS DISTINCT FROM
     (OLD.id,OLD.reference,OLD.payer_person_id,OLD.currency,OLD.amount_minor,OLD.created_at) OR
     (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id) OR
     (OLD.status='cancelled' AND NEW.status<>'cancelled') OR
     (OLD.status='awaiting_payment' AND NEW.status='draft') THEN
    RAISE EXCEPTION 'PDC_COUPLE_ORDER_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF NEW.status='awaiting_payment' THEN
    IF NEW.payment_id IS NULL OR
      (SELECT pg_catalog.count(*) FROM pdc_private.couple_checkout_beneficiaries_v5b610f2
        WHERE order_id=NEW.id)<>2 THEN
      RAISE EXCEPTION 'PDC_COUPLE_INCOMPLETE' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_payment FROM pdc_private.payment_attempts
      WHERE id=NEW.payment_id FOR UPDATE;
    IF NOT FOUND OR v_payment.payer_id<>NEW.payer_person_id OR
       v_payment.currency<>'EUR' OR v_payment.amount_minor<>4000 OR
       v_payment.provider NOT IN ('tara','stripe') OR
       v_payment.status IN ('failed','cancelled','refunded') OR
       EXISTS (SELECT 1 FROM pdc_private.payment_allocations
                WHERE payment_id=NEW.payment_id) THEN
      RAISE EXCEPTION 'PDC_COUPLE_PAYMENT_NOT_ELIGIBLE' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.status='cancelled' AND NEW.payment_id IS NOT NULL THEN
    SELECT * INTO v_payment FROM pdc_private.payment_attempts
      WHERE id=NEW.payment_id FOR UPDATE;
    IF v_payment.status='confirmed' THEN
      RAISE EXCEPTION 'PDC_COUPLE_REFUND_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER couple_order_guard_v5b610f2
 BEFORE INSERT OR UPDATE ON pdc_private.couple_checkout_orders_v5b610f2
 FOR EACH ROW EXECUTE FUNCTION pdc_private.couple_order_guard_v5b610f2();

-- Empêche qu'un paiement réservé à un couple soit ensuite crédité
-- une deuxième fois dans payment_allocations (dons ou cotisations individuelles).
-- SECURITY DEFINER est indispensable ici : l’ancien service_role a INSERT sur
-- payment_allocations mais ne peut pas lire les nouvelles tables privées.
CREATE FUNCTION pdc_private.couple_no_double_allocation_v5b610f2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
BEGIN
  PERFORM 1 FROM pdc_private.payment_attempts WHERE id=NEW.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM pdc_private.couple_checkout_orders_v5b610f2 o
             WHERE o.payment_id=NEW.payment_id) THEN
    RAISE EXCEPTION 'PDC_COUPLE_PAYMENT_ALREADY_RESERVED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER couple_no_double_allocation_v5b610f2
 BEFORE INSERT OR UPDATE OF payment_id ON pdc_private.payment_allocations
 FOR EACH ROW EXECUTE FUNCTION pdc_private.couple_no_double_allocation_v5b610f2();

-- Contrôle RELECTURE : paiement unique 4 000 centimes, évènement vérifié,
-- aucun remboursement/chargeback connu, exactement deux dossiers qualifiés.
-- N'ADMET PAS les militants et NE CALCULE PAS deux cotisations de 20 EUR.
CREATE FUNCTION pdc_private.couple_payment_verified_dev_v5b610f2(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
SELECT EXISTS (
 SELECT 1 FROM pdc_private.couple_checkout_orders_v5b610f2 o
 JOIN pdc_private.payment_attempts p ON p.id=o.payment_id
 WHERE o.id=p_order AND o.status='awaiting_payment'
   AND o.currency='EUR' AND o.amount_minor=4000
   AND p.payer_id=o.payer_person_id AND p.currency='EUR'
   AND p.amount_minor=4000 AND p.status='confirmed' AND p.confirmed_at IS NOT NULL
   AND p.provider IN ('tara','stripe') AND p.provider_payment_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM pdc_private.payment_events e
     WHERE e.payment_id=p.id AND e.provider=p.provider AND e.verified_at IS NOT NULL
       AND e.event_type IN ('payment.confirmed','payment.success','payment.succeeded')
   )
   AND NOT EXISTS (
     SELECT 1 FROM pdc_private.payment_events e
     WHERE e.payment_id=p.id AND e.provider=p.provider AND e.verified_at IS NOT NULL
       AND (pg_catalog.lower(e.event_type) LIKE '%refund%' OR
            pg_catalog.lower(e.event_type) LIKE '%chargeback%' OR
            pg_catalog.lower(e.event_type) LIKE '%disput%')
   )
   AND NOT EXISTS (SELECT 1 FROM pdc_private.payment_allocations a WHERE a.payment_id=p.id)
   AND (SELECT pg_catalog.count(*) FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
      JOIN pdc_private.membership_applications a ON a.id=b.application_id
       AND a.person_id=b.person_id
      WHERE b.order_id=o.id AND a.application_type='initial'
        AND a.residence_group='diaspora' AND a.category_code='couple'
        AND a.submission_status IN ('submitted','under_review','accepted')
        AND a.policy_accepted_at IS NOT NULL AND a.policy_version IS NOT NULL
        AND a.data_notice_accepted_at IS NOT NULL AND a.submitted_at IS NOT NULL)=2
   AND EXISTS (SELECT 1 FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
               WHERE b.order_id=o.id AND b.slot='member' AND b.person_id=o.payer_person_id)
   AND EXISTS (SELECT 1 FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
               WHERE b.order_id=o.id AND b.slot='partner' AND b.person_id<>o.payer_person_id)
);
$fn$;

-- Aucun GRANT pour créer, payer, confirmer ou consulter cette commande depuis
-- React, anon, authenticated ou l'API nationale. SQL Editor DEV uniquement.
ALTER TABLE pdc_private.couple_checkout_orders_v5b610f2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdc_private.couple_checkout_beneficiaries_v5b610f2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.couple_checkout_orders_v5b610f2
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON TABLE pdc_private.couple_checkout_beneficiaries_v5b610f2
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.couple_payment_verified_dev_v5b610f2(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.couple_beneficiary_guard_v5b610f2()
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.couple_order_guard_v5b610f2()
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.couple_no_double_allocation_v5b610f2()
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
COMMENT ON TABLE pdc_private.couple_checkout_orders_v5b610f2 IS
 'DEV F2. Commande indivisible de couple = 4 000 centimes EUR; pas deux allocations de 20 EUR. Aucun checkout actif.';
COMMENT ON FUNCTION pdc_private.couple_payment_verified_dev_v5b610f2(uuid) IS
 'Contrôle financier interne uniquement; ne déclenche ni admission ni attribution de carte.';
COMMIT;
