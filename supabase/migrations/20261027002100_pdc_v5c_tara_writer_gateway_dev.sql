-- PDC V5-C / lot IV — ROLE + passerelles SQL Tara DEV, ADDITIF.
-- NE PAS APPLIQUER avant revue humaine du projet Supabase DEV et des 20 migrations précédentes.
-- Le LOGIN est créé SANS MOT DE PASSE. Aucun accès HTTP ni secret.
-- Les rôles publics et l'API de lecture existante n'obtiennent aucun droit.
BEGIN;

-- Échouer si un rôle préexistant porte déjà ce nom : ne pas hériter d'un compte inconnu.
DO $role$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='pdc_tara_v5c_writer') THEN
    RAISE EXCEPTION 'PDC_TARA_ROLE_ALREADY_EXISTS';
  END IF;
  CREATE ROLE pdc_tara_v5c_writer
    LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
    CONNECTION LIMIT 2 PASSWORD NULL;
END
$role$;
GRANT USAGE ON SCHEMA pdc_private TO pdc_tara_v5c_writer;
-- Aucun droit direct sur les tables, pas de role service_role, et pas de CREATE.
REVOKE ALL ON ALL TABLES IN SCHEMA pdc_private FROM pdc_tara_v5c_writer;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA pdc_private FROM pdc_tara_v5c_writer;
REVOKE ALL ON SCHEMA public FROM pdc_tara_v5c_writer;

-- Tous les accès du runtime passent par des fonctions SECURITY DEFINER,
-- à recherche de schéma vide et SQL totalement paramétré (aucun EXECUTE dynamique).
-- Le compte ne peut PAS inventer un devis : il doit exister un paiement PDC
-- et EXACTEMENT UNE allocation, liée à l'obligation ou au don du devis.
CREATE FUNCTION pdc_private.tara_v5c_reserve_intent(
  p_product_id text,p_payment_id uuid,p_quote_id uuid,p_payer_id uuid,
  p_idempotency_key text,p_amount_xaf bigint
) RETURNS TABLE(
  "productId" text,"paymentId" text,"quoteId" text,"payerId" text,
  "idempotencyKey" text,"amountXaf" text,currency char(3),
  "linkState" text,"generalLink" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_payment pdc_private.payment_attempts%ROWTYPE;
        v_target record;
        v_row pdc_private.tara_checkout_intents_v5c%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_product_id !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
     p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9:_-]{16,128}$' OR
     p_amount_xaf IS NULL OR p_amount_xaf<=0 OR p_amount_xaf>2147483647 OR
     p_payment_id IS NULL OR p_quote_id IS NULL OR p_payer_id IS NULL THEN
    RAISE EXCEPTION 'PDC_TARA_INTENT_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_payment FROM pdc_private.payment_attempts
    WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR v_payment.payer_id<>p_payer_id OR v_payment.provider<>'tara' OR
     v_payment.currency<>'XAF' OR v_payment.amount_minor<>p_amount_xaf OR
     v_payment.status NOT IN ('initiated','pending') OR
     v_payment.provider_payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'PDC_TARA_PAYMENT_INVALID' USING ERRCODE='23514';
  END IF;
  SELECT pg_catalog.count(*) AS n,
    COALESCE(pg_catalog.sum(a.amount_minor),0) AS total,
    COALESCE(pg_catalog.bool_and(COALESCE(
      (a.obligation_id=p_quote_id AND EXISTS (
        SELECT 1 FROM pdc_private.dues_obligations d
        WHERE d.id=p_quote_id AND d.person_id=p_payer_id AND d.currency='XAF'
          AND d.status='open' AND d.amount_due_minor>=p_amount_xaf
      )) OR
      (a.donation_id=p_quote_id AND EXISTS (
        SELECT 1 FROM pdc_private.donations d
        WHERE d.id=p_quote_id AND d.person_id=p_payer_id AND d.currency='XAF'
          AND d.status='awaiting_payment' AND d.amount_minor=p_amount_xaf
          AND (SELECT COALESCE(pg_catalog.sum(z.percent),0)
               FROM pdc_private.donation_designations z WHERE z.donation_id=d.id)=100
      )),false)),false) AS target_ok
    INTO v_target FROM pdc_private.payment_allocations a
    WHERE a.payment_id=p_payment_id;
  IF v_target.n<>1 OR v_target.total<>p_amount_xaf OR NOT v_target.target_ok THEN
    RAISE EXCEPTION 'PDC_TARA_QUOTE_NOT_SUPPORTED' USING ERRCODE='23514';
  END IF;
  INSERT INTO pdc_private.tara_checkout_intents_v5c
    (product_id,payment_id,quote_id,payer_id,idempotency_key,amount_xaf,currency)
  VALUES(p_product_id,p_payment_id,p_quote_id,p_payer_id,p_idempotency_key,p_amount_xaf,'XAF')
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO v_row FROM pdc_private.tara_checkout_intents_v5c c
    WHERE c.idempotency_key=p_idempotency_key FOR UPDATE;
  IF NOT FOUND OR (v_row.payment_id,v_row.quote_id,v_row.payer_id,v_row.amount_xaf)
        IS DISTINCT FROM (p_payment_id,p_quote_id,p_payer_id,p_amount_xaf) THEN
    RAISE EXCEPTION 'PDC_TARA_IDEMPOTENCY_CONFLICT' USING ERRCODE='23514';
  END IF;
  RETURN QUERY SELECT v_row.product_id,v_row.payment_id::text,v_row.quote_id::text,
    v_row.payer_id::text,v_row.idempotency_key,v_row.amount_xaf::text,
    v_row.currency,v_row.link_state,v_row.general_link;
END;
$fn$;

CREATE FUNCTION pdc_private.tara_v5c_claim_link(p_product_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  UPDATE pdc_private.tara_checkout_intents_v5c
    SET link_state='requested',requested_at=pg_catalog.now()
    WHERE product_id=p_product_id AND link_state='reserved';
  RETURN FOUND;
END;
$fn$;

CREATE FUNCTION pdc_private.tara_v5c_save_issued_link(p_product_id text,p_link text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  UPDATE pdc_private.tara_checkout_intents_v5c
    SET link_state='issued',general_link=p_link
    WHERE product_id=p_product_id AND link_state='requested';
  RETURN FOUND;
END;
$fn$;

CREATE FUNCTION pdc_private.tara_v5c_mark_unknown(p_product_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  UPDATE pdc_private.tara_checkout_intents_v5c SET link_state='unknown'
    WHERE product_id=p_product_id AND link_state='requested';
  RETURN FOUND;
END;
$fn$;

CREATE FUNCTION pdc_private.tara_v5c_record_hint(
  p_fingerprint text,p_product_id text,p_provider_payment_id text,
  p_amount_claimed_xaf bigint,p_status_claimed text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  IF p_product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM pdc_private.tara_checkout_intents_v5c c WHERE c.product_id=p_product_id
  ) THEN
    RAISE EXCEPTION 'PDC_TARA_UNKNOWN_PRODUCT' USING ERRCODE='23514';
  END IF;
  INSERT INTO pdc_private.tara_webhook_inbox_v5c
    (fingerprint,product_id,provider_payment_id,amount_claimed_xaf,status_claimed,untrusted)
    VALUES(p_fingerprint,p_product_id,p_provider_payment_id,p_amount_claimed_xaf,
      p_status_claimed,true)
    ON CONFLICT (fingerprint) DO NOTHING;
  RETURN FOUND;
END;
$fn$;

CREATE FUNCTION pdc_private.tara_v5c_load_checkout(p_product_id text)
RETURNS TABLE("productId" text,"amountXaf" text,currency char(3),"linkState" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT c.product_id,c.amount_xaf::text,c.currency,c.link_state
  FROM pdc_private.tara_checkout_intents_v5c c WHERE c.product_id=p_product_id;
$fn$;

-- L'evidence est auxiliaire : ni cette fonction ni le rôle n'ont le droit de
-- mettre à jour payment_attempts/payment_events, allocations ou dossiers.
CREATE FUNCTION pdc_private.tara_v5c_record_evidence(
  p_product_id text,p_decision text,p_reason text,p_amount_xaf bigint,p_channel text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
  INSERT INTO pdc_private.tara_reconciliation_evidence_v5c
    (product_id,decision,reason,expected_amount_xaf,payment_channel)
    VALUES(p_product_id,p_decision,p_reason,p_amount_xaf,p_channel);
  RETURN FOUND;
END;
$fn$;

-- PostgreSQL autorise EXECUTE à PUBLIC par défaut : le retirer explicitement.
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_claim_link(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_save_issued_link(text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_mark_unknown(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_record_hint(text,text,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_load_checkout(text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_record_evidence(text,text,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_reserve_intent(text,uuid,uuid,uuid,text,bigint) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_claim_link(text) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_save_issued_link(text,text) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_mark_unknown(text) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_record_hint(text,text,text,bigint,text) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_load_checkout(text) TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_record_evidence(text,text,text,bigint,text) TO pdc_tara_v5c_writer;

COMMENT ON ROLE pdc_tara_v5c_writer IS
  'DEV ONLY; mot de passe NULL; 7 RPC privees; aucun SELECT/INSERT/UPDATE table, aucun paiement confirme';
COMMIT;
