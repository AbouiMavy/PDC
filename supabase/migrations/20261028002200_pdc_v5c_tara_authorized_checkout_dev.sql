-- V5-C lot VI — devis de paiement privé, en lecture seule, pour MEMBRES AUTHENTIFIES.
-- ADDITIF ; à examiner AVANT toute application au projet Supabase.
-- IMPORTANT : ne couvre PAS les donateurs non authentifiés ni les nouveaux adhérents.
BEGIN;

-- Le rôle writer reçoit UNE RPC de lecture strictement liée à l'identité vérifiée
-- par le serveur. Aucun droit direct sur les tables, aucun droit de confirmation.
CREATE FUNCTION pdc_private.tara_v5c_authorized_checkout(
  p_auth_user_id uuid, p_payment_id uuid
) RETURNS TABLE (
  payment_id uuid,
  quote_id uuid,
  payer_id uuid,
  kind text,
  amount_minor text,
  currency text,
  beneficiary_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
WITH permitted_payment AS (
  SELECT p.id, p.payer_id, p.amount_minor, p.currency
  FROM pdc_private.payment_attempts p
  JOIN pdc_private.memberships m ON m.person_id = p.payer_id
  JOIN pdc_private.member_auth_links l
    ON l.membership_id = m.id AND l.auth_user_id = p_auth_user_id
  WHERE p.id = p_payment_id
    AND p.provider = 'tara' AND p.currency = 'XAF'
    AND p.status IN ('initiated','pending')
    AND p.provider_payment_id IS NULL
    AND m.status = 'active' AND l.verified_at IS NOT NULL
    AND (SELECT pg_catalog.count(*)
         FROM pdc_private.payment_allocations a WHERE a.payment_id = p.id) = 1
), payable AS (
  SELECT p.*, a.obligation_id, a.donation_id
  FROM permitted_payment p
  JOIN pdc_private.payment_allocations a ON a.payment_id = p.id
     AND a.amount_minor = p.amount_minor
)
SELECT p.id, d.id, p.payer_id,
  CASE WHEN d.kind = 'initial_membership_fee'
       THEN 'individual_initial' ELSE 'renewal' END,
  p.amount_minor::text, p.currency::text, ARRAY[p.payer_id]::uuid[]
FROM payable p
JOIN pdc_private.dues_obligations d ON d.id = p.obligation_id
  AND d.person_id = p.payer_id AND d.currency = p.currency
  AND d.status = 'open' AND d.amount_due_minor >= p.amount_minor
WHERE p.donation_id IS NULL
UNION ALL
SELECT p.id, d.id, p.payer_id, 'donation'::text,
  p.amount_minor::text, p.currency::text, ARRAY[]::uuid[]
FROM payable p
JOIN pdc_private.donations d ON d.id = p.donation_id
  AND d.person_id = p.payer_id AND d.currency = p.currency
  AND d.status = 'awaiting_payment' AND d.amount_minor = p.amount_minor
WHERE p.obligation_id IS NULL
  AND (SELECT COALESCE(pg_catalog.sum(z.percent),0)
       FROM pdc_private.donation_designations z WHERE z.donation_id = d.id) = 100;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.tara_v5c_authorized_checkout(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_authorized_checkout(uuid,uuid)
  TO pdc_tara_v5c_writer;
COMMENT ON FUNCTION pdc_private.tara_v5c_authorized_checkout(uuid,uuid) IS
  'DEV only. Read-only quote for verified existing member; only trusted HTTP service may supply an authenticated user UUID.';
COMMIT;
