-- PDC V5-B.6.10-F4 — autorisations de portraits pour deux conjoints, DEV UNIQUEMENT.
-- Migration ADDITIVE 01900 : les 18 migrations historiques restent inchangées.
-- Ne crée aucun endpoint, secret, paiement réel ni délivrance de carte.
-- Issuance uniquement via SQL Editor de développement sous rôle privilégié.
BEGIN;

-- Le prédicat spécifique couple exige la COMMANDE et les DEUX ADMISSIONS F3,
-- le MEME paiement F2 vérifié et une demande de carte appartenant au bon bénéficiaire.
CREATE FUNCTION pdc_private.couple_photo_paid_v5b610f4(p_card uuid,p_payment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
SELECT EXISTS (
 SELECT 1
 FROM pdc_private.membership_card_requests c
 JOIN pdc_private.membership_applications a
   ON a.id=c.application_id AND a.person_id=c.person_id
 JOIN pdc_private.memberships m
   ON m.id=a.membership_id AND m.person_id=c.person_id
 JOIN pdc_private.couple_checkout_beneficiaries_v5b610f2 b
   ON b.application_id=a.id AND b.person_id=a.person_id
 JOIN pdc_private.couple_checkout_orders_v5b610f2 o ON o.id=b.order_id
 JOIN pdc_private.couple_admissions_v5b610f3 admission ON admission.order_id=o.id
 WHERE c.id=p_card AND o.payment_id=p_payment
   AND c.status IN ('requested','reviewed')
   AND c.issued_at IS NULL AND c.delivered_at IS NULL
   AND c.portrait_storage_key IS NULL
   AND c.requested_format IN ('digital','physical','both')
   AND a.application_type='initial' AND a.residence_group='diaspora'
   AND a.category_code='couple' AND a.submission_status='accepted'
   AND a.card_requested IS TRUE AND m.status='active'
   AND ((b.slot='member' AND b.person_id=o.payer_person_id
         AND admission.member_membership_id=m.id)
      OR (b.slot='partner' AND b.person_id<>o.payer_person_id
          AND admission.partner_membership_id=m.id))
   AND (SELECT pg_catalog.count(*)
        FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b2
        WHERE b2.order_id=o.id)=2
   AND pdc_private.couple_payment_verified_dev_v5b610f2(o.id)
)
$fn$;

-- Conserver exactement le contrat existant de E2, auquel on ajoute F4.
-- Renforcer la voie individuelle : un événement de remboursement/chargeback
-- vérifié interdit désormais l'émission/la consommation ultérieure d'un jeton.
CREATE OR REPLACE FUNCTION pdc_private.applicant_photo_paid_single_v5b610e2(p_card uuid,p_payment uuid)
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
    AND NOT EXISTS (
      SELECT 1 FROM pdc_private.payment_events bad
       WHERE bad.payment_id=p.id AND bad.provider=p.provider
        AND bad.verified_at IS NOT NULL
        AND (pg_catalog.lower(bad.event_type) LIKE '%refund%'
             OR pg_catalog.lower(bad.event_type) LIKE '%chargeback%'
             OR pg_catalog.lower(bad.event_type) LIKE '%disput%')
    )
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
           AND NOT EXISTS (
             SELECT 1 FROM pdc_private.payment_events bi
              WHERE bi.payment_id=pi.id AND bi.provider=pi.provider
               AND bi.verified_at IS NOT NULL
               AND (pg_catalog.lower(bi.event_type) LIKE '%refund%'
                    OR pg_catalog.lower(bi.event_type) LIKE '%chargeback%'
                    OR pg_catalog.lower(bi.event_type) LIKE '%disput%')
           )
    )=d.amount_due_minor
)
OR pdc_private.couple_photo_paid_v5b610f4(p_card,p_payment)
$fn$;

-- Emission PAIRE atomique : tout échec annule les DEUX jetons et leurs revocations.
-- Requires 2 demandes de carte ; si un seul membre demande une carte,
-- seule l'émission E2 individuelle (en SQL Editor DEV) est utilisable.
-- Ne prouve PAS la possession d'une session checkout par un visiteur.
CREATE FUNCTION pdc_private.couple_photo_issue_pair_dev_v5b610f4(
 p_order uuid,p_member_hash text,p_partner_hash text,p_ttl_seconds integer DEFAULT 600)
RETURNS TABLE(beneficiary_slot text,card_request_id uuid,grant_id uuid,expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
 v_order pdc_private.couple_checkout_orders_v5b610f2%ROWTYPE;
 v_card_m uuid; v_card_p uuid;
 v_grant_m uuid; v_grant_p uuid;
BEGIN
 IF p_order IS NULL OR p_member_hash IS NULL OR p_partner_hash IS NULL
   OR p_member_hash !~ '^[0-9a-f]{64}$' OR p_partner_hash !~ '^[0-9a-f]{64}$'
   OR p_member_hash=p_partner_hash OR p_ttl_seconds IS NULL
   OR p_ttl_seconds NOT BETWEEN 60 AND 900 THEN
  RAISE EXCEPTION 'PDC_COUPLE_GRANT_INVALID' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_order FROM pdc_private.couple_checkout_orders_v5b610f2
  WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR v_order.payment_id IS NULL OR
    NOT pdc_private.couple_payment_verified_dev_v5b610f2(p_order) THEN
  RAISE EXCEPTION 'PDC_COUPLE_GRANT_PAYMENT_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM pdc_private.payment_attempts p
   WHERE p.id=v_order.payment_id FOR UPDATE;
 IF NOT FOUND OR NOT pdc_private.couple_payment_verified_dev_v5b610f2(p_order) THEN
  RAISE EXCEPTION 'PDC_COUPLE_GRANT_PAYMENT_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT c.id INTO v_card_m
  FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
  JOIN pdc_private.membership_card_requests c ON c.application_id=b.application_id AND c.person_id=b.person_id
  WHERE b.order_id=p_order AND b.slot='member';
 SELECT c.id INTO v_card_p
  FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
  JOIN pdc_private.membership_card_requests c ON c.application_id=b.application_id AND c.person_id=b.person_id
  WHERE b.order_id=p_order AND b.slot='partner';
 IF v_card_m IS NULL OR v_card_p IS NULL OR v_card_m=v_card_p THEN
  RAISE EXCEPTION 'PDC_COUPLE_GRANT_TWO_CARDS_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Verrouiller les deux demandes dans un ordre fixe indépendamment des rôles.
 PERFORM 1 FROM pdc_private.membership_card_requests c
  WHERE c.id IN (v_card_m,v_card_p) ORDER BY c.id FOR UPDATE;
 IF NOT pdc_private.couple_photo_paid_v5b610f4(v_card_m,v_order.payment_id)
    OR NOT pdc_private.couple_photo_paid_v5b610f4(v_card_p,v_order.payment_id)
    OR EXISTS (SELECT 1 FROM pdc_private.card_portrait_assets x
               WHERE x.card_request_id IN (v_card_m,v_card_p)
                 AND x.status IN ('reserved','stored')) THEN
  RAISE EXCEPTION 'PDC_COUPLE_GRANT_CARD_DENIED' USING ERRCODE='42501';
 END IF;
 v_grant_m:=pdc_private.applicant_photo_issue_dev_v5b610e2(
    v_card_m,v_order.payment_id,p_member_hash,p_ttl_seconds);
 v_grant_p:=pdc_private.applicant_photo_issue_dev_v5b610e2(
    v_card_p,v_order.payment_id,p_partner_hash,p_ttl_seconds);
 RETURN QUERY
 SELECT 'member'::text,v_card_m,v_grant_m,g.expires_at
  FROM pdc_private.applicant_portrait_grants_v5b610e2 g WHERE g.id=v_grant_m
 UNION ALL
 SELECT 'partner'::text,v_card_p,v_grant_p,g.expires_at
  FROM pdc_private.applicant_portrait_grants_v5b610e2 g WHERE g.id=v_grant_p;
END;
$fn$;

-- Explicitement non accessible par navigateur, API lecture, dépôt ou service_role.
REVOKE ALL ON FUNCTION pdc_private.couple_photo_paid_v5b610f4(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.applicant_photo_paid_single_v5b610e2(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
REVOKE ALL ON FUNCTION pdc_private.couple_photo_issue_pair_dev_v5b610f4(uuid,text,text,integer)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,pdc_portrait_upload_runtime_v5b610c;
COMMENT ON FUNCTION pdc_private.couple_photo_issue_pair_dev_v5b610f4(uuid,text,text,integer) IS
 'DEV SQL Editor seulement. Emission atomique de deux empreintes de jetons, sans les communiquer. Aucune API publique ni paiement reel.';
COMMENT ON FUNCTION pdc_private.applicant_photo_paid_single_v5b610e2(uuid,uuid) IS
 'DEV F4. Predicat E2 compatible individu et couple F3; rejette les evenements verifies de remboursement/chargeback.';
COMMIT;
