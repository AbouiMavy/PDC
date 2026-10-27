-- PDC V5-B.5 : agrégats financiers nationaux, LECTURE SEULE, DEVELOPPEMENT.
-- Prérequis : V5-B.1, V5-B.2, V5-B.3 et V5-B.3.1.
-- Deux devises séparées ; aucun taux de conversion, aucune identité personnelle.
-- Les montants ne reflètent que les affectations de paiements CONFIRMÉS.
BEGIN;
CREATE FUNCTION pdc_private.api_finance_overview(p_actor_user_id uuid)
RETURNS TABLE (
  currency text,
  initial_fee_due_minor bigint,
  initial_fee_paid_minor bigint,
  annual_dues_due_minor bigint,
  annual_dues_paid_minor bigint,
  donations_confirmed_minor bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $pdc_fn$
BEGIN
  IF NOT pdc_private.api_is_national_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH supported_currencies AS (
    SELECT 'XAF'::text AS currency
    UNION ALL SELECT 'EUR'::text
  ),
  obligations AS (
    SELECT o.currency::text AS currency,
      COALESCE(SUM(o.amount_due_minor) FILTER (WHERE o.kind = 'initial_membership_fee'), 0)::bigint AS init_due,
      COALESCE(SUM(o.amount_due_minor) FILTER (WHERE o.kind = 'annual_dues'), 0)::bigint AS annual_due
    FROM pdc_private.dues_obligations o
    WHERE o.status = 'open'
    GROUP BY o.currency
  ),
  confirmed_obligations AS (
    SELECT o.currency::text AS currency,
      COALESCE(SUM(a.amount_minor) FILTER (WHERE o.kind = 'initial_membership_fee'), 0)::bigint AS init_paid,
      COALESCE(SUM(a.amount_minor) FILTER (WHERE o.kind = 'annual_dues'), 0)::bigint AS annual_paid
    FROM pdc_private.payment_allocations a
    JOIN pdc_private.payment_attempts p ON p.id = a.payment_id
    JOIN pdc_private.dues_obligations o ON o.id = a.obligation_id
    WHERE p.status = 'confirmed' AND o.status = 'open'
    GROUP BY o.currency
  ),
  confirmed_donations AS (
    SELECT d.currency::text AS currency,
      COALESCE(SUM(a.amount_minor), 0)::bigint AS donated
    FROM pdc_private.payment_allocations a
    JOIN pdc_private.payment_attempts p ON p.id = a.payment_id
    JOIN pdc_private.donations d ON d.id = a.donation_id
    WHERE p.status = 'confirmed' AND d.status <> 'cancelled'
    GROUP BY d.currency
  )
  SELECT c.currency,
    COALESCE(o.init_due, 0)::bigint,
    COALESCE(co.init_paid, 0)::bigint,
    COALESCE(o.annual_due, 0)::bigint,
    COALESCE(co.annual_paid, 0)::bigint,
    COALESCE(cd.donated, 0)::bigint
  FROM supported_currencies c
  LEFT JOIN obligations o ON o.currency = c.currency
  LEFT JOIN confirmed_obligations co ON co.currency = c.currency
  LEFT JOIN confirmed_donations cd ON cd.currency = c.currency
  ORDER BY c.currency;
END;
$pdc_fn$;

REVOKE ALL ON FUNCTION pdc_private.api_finance_overview(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pdc_private.api_finance_overview(uuid) TO pdc_api_v5b3;
-- Les tables personnelles ne sont pas directement accessibles au rôle applicatif.
COMMIT;
