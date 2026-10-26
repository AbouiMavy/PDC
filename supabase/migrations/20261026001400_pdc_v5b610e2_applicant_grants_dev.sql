-- PDC V5-B.6.10-E2 : registre prive de capacites de depot photo.
-- PROJET DE DEVELOPPEMENT UNIQUEMENT; depend de 00100..01300.
-- N'ACTIVE PAS le paiement, un endpoint public, ni la delivrance de cartes.
-- Le cas couple 40 EUR restera BLOQUE jusqu'au rapprochement explicite du paiement commun.
BEGIN;

CREATE TABLE pdc_private.applicant_portrait_grants_v5b610e2 (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  card_request_id uuid NOT NULL REFERENCES pdc_private.membership_card_requests(id),
  payment_id uuid NOT NULL REFERENCES pdc_private.payment_attempts(id),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  permission text NOT NULL DEFAULT 'portrait:write-once'
    CHECK (permission='portrait:write-once'),
  issued_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + INTERVAL '15 minutes'),
  CHECK (consumed_at IS NULL OR (consumed_at >= issued_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX applicant_portrait_grants_by_card_e2
  ON pdc_private.applicant_portrait_grants_v5b610e2(card_request_id,issued_at DESC);
ALTER TABLE pdc_private.applicant_portrait_grants_v5b610e2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pdc_private.applicant_portrait_grants_v5b610e2 FROM PUBLIC,anon,authenticated,service_role,
  pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;

-- Ce predicat ne valide PAS une notification brute. Il requiert un evenement prestataire
-- verifie par le backend et une affectation financiere du MEME demandeur.
-- Ne couvre volontairement pas encore le paiement unique d'un couple.
CREATE FUNCTION pdc_private.applicant_photo_paid_single_v5b610e2(p_card uuid,p_payment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
SELECT EXISTS (
  SELECT 1
  FROM pdc_private.membership_card_requests c
  JOIN pdc_private.membership_applications a
    ON a.id=c.application_id AND a.person_id=c.person_id
  JOIN pdc_private.memberships m
    ON m.id=a.membership_id AND m.person_id=c.person_id
  JOIN pdc_private.dues_obligations d
    ON d.application_id=a.id AND d.person_id=a.person_id AND d.status='open'
  JOIN pdc_private.payment_allocations allocation
    ON allocation.obligation_id=d.id
  JOIN pdc_private.payment_attempts p
    ON p.id=allocation.payment_id AND p.payer_id=a.person_id AND p.currency=d.currency
  WHERE c.id=p_card AND p.id=p_payment
    AND c.status IN ('requested','reviewed')
    AND c.issued_at IS NULL AND c.delivered_at IS NULL
    AND c.requested_format IN ('digital','physical','both')
    AND a.application_type='initial' AND a.submission_status='accepted'
    AND a.card_requested IS TRUE AND a.category_code <> 'couple'
    AND m.status='active'
    AND p.status='confirmed' AND p.confirmed_at IS NOT NULL
    AND p.provider IN ('tara','stripe') AND p.provider_payment_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM pdc_private.payment_events ev
                WHERE ev.payment_id=p.id AND ev.provider=p.provider
                  AND ev.verified_at IS NOT NULL)
    AND ((a.residence_group='cameroon' AND d.kind='initial_membership_fee'
          AND d.currency='XAF' AND d.amount_due_minor=2000)
      OR (a.residence_group='diaspora' AND d.kind='annual_dues'
          AND d.currency='EUR'
          AND d.fiscal_year=EXTRACT(YEAR FROM CURRENT_DATE)::integer
          AND ((a.category_code='simple' AND d.amount_due_minor=3000)
            OR (a.category_code='reduit' AND d.amount_due_minor=1500))))
    AND (SELECT COALESCE(SUM(alloc.amount_minor),0)::bigint
         FROM pdc_private.payment_allocations alloc
         JOIN pdc_private.payment_attempts pi ON pi.id=alloc.payment_id
         WHERE alloc.obligation_id=d.id AND pi.payer_id=a.person_id
           AND pi.currency=d.currency AND pi.status='confirmed'
           AND pi.confirmed_at IS NOT NULL AND pi.provider IN ('tara','stripe')
           AND pi.provider_payment_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM pdc_private.payment_events ei
                       WHERE ei.payment_id=pi.id AND ei.provider=pi.provider
                         AND ei.verified_at IS NOT NULL)
    )=d.amount_due_minor
)
$fn$;

-- Emetteur volontairement SANS GRANT EXECUTE : uniquement pour preparations
-- SQL de DEV. Un service de checkout devra prouver la possession de la session
-- privee du demandeur avant qu'on lui accorde un role d'emission.
CREATE FUNCTION pdc_private.applicant_photo_issue_dev_v5b610e2(
  p_card uuid,p_payment uuid,p_hash text,p_ttl_seconds integer DEFAULT 600
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_id uuid; v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$'
     OR p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'PDC_APPLICANT_GRANT_INVALID' USING ERRCODE='22023';
  END IF;
  -- Verrouiller la demande avant toute emission concurrente.
  PERFORM 1 FROM pdc_private.membership_card_requests WHERE id=p_card FOR UPDATE;
  IF NOT FOUND OR NOT pdc_private.applicant_photo_paid_single_v5b610e2(p_card,p_payment) THEN
    RAISE EXCEPTION 'PDC_APPLICANT_PAYMENT_NOT_VERIFIED' USING ERRCODE='42501';
  END IF;
  UPDATE pdc_private.applicant_portrait_grants_v5b610e2
     SET revoked_at=v_now
   WHERE card_request_id=p_card AND consumed_at IS NULL AND revoked_at IS NULL;
  INSERT INTO pdc_private.applicant_portrait_grants_v5b610e2
    (card_request_id,payment_id,token_sha256,issued_at,expires_at)
  VALUES(p_card,p_payment,p_hash,v_now,v_now+(p_ttl_seconds * INTERVAL '1 second'))
  RETURNING id INTO v_id;
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
    VALUES('portrait.applicant_grant_issued','applicant_portrait_grants_v5b610e2',v_id,
      pg_catalog.jsonb_build_object('card_request_id',p_card));
  RETURN v_id;
END
$fn$;

-- Consommation atomique avec verrou de ligne, relit l'encaissement et la carte.
-- Ne retourne PAS le jeton ni la cle de l'objet Storage.
CREATE FUNCTION pdc_private.applicant_photo_redeem_v5b610e2(
  p_card uuid,p_hash text
) RETURNS TABLE(authorization_id uuid,card_request_id uuid,permission text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_grant pdc_private.applicant_portrait_grants_v5b610e2%ROWTYPE;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_card IS NULL THEN
    RAISE EXCEPTION 'PDC_APPLICANT_GRANT_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_grant FROM pdc_private.applicant_portrait_grants_v5b610e2 g
  WHERE g.card_request_id=p_card AND g.token_sha256=p_hash FOR UPDATE;
  IF NOT FOUND OR v_grant.revoked_at IS NOT NULL OR v_grant.consumed_at IS NOT NULL
     OR v_grant.expires_at <= pg_catalog.clock_timestamp()
     OR NOT pdc_private.applicant_photo_paid_single_v5b610e2(p_card,v_grant.payment_id)
  THEN RAISE EXCEPTION 'PDC_APPLICANT_GRANT_DENIED' USING ERRCODE='42501';
  END IF;
  UPDATE pdc_private.applicant_portrait_grants_v5b610e2
  SET consumed_at=pg_catalog.clock_timestamp() WHERE id=v_grant.id;
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
    VALUES('portrait.applicant_grant_redeemed','applicant_portrait_grants_v5b610e2',v_grant.id,
      pg_catalog.jsonb_build_object('card_request_id',p_card));
  RETURN QUERY SELECT v_grant.id,p_card,'portrait:write-once'::text;
END
$fn$;

-- Pas de privilèges pour un visiteur, ni pour la cle API publique, ni pour
-- l'API readonly. Le role du depot prive ne peut CONSOMMER que les jetons deja emis.
REVOKE ALL ON FUNCTION pdc_private.applicant_photo_paid_single_v5b610e2(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.applicant_photo_issue_dev_v5b610e2(uuid,uuid,text,integer)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.applicant_photo_redeem_v5b610e2(uuid,text)
  FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3;
GRANT EXECUTE ON FUNCTION pdc_private.applicant_photo_redeem_v5b610e2(uuid,text)
  TO pdc_portrait_upload_runtime_v5b610c;
COMMENT ON TABLE pdc_private.applicant_portrait_grants_v5b610e2 IS
 'DEV. Autorisations photo a usage unique liees a un paiement verifie. Aucun endpoint public. Ne pas activer pour couple sans modele paiement commun.';
COMMIT;
