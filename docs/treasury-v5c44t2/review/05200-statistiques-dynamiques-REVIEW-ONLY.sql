-- V5C44-T3 / DEV / REVIEW ONLY / NE PAS EXECUTER
-- Statistiques calculées sur filtered, avant pagination.
-- Aucun changement des données financières.

-- PDC V5C44-T2 / DEV ONLY / DRAFT FOR REVIEW, NOT EXECUTED.
-- Additive read-only treasury registry. No historic rows changed or deleted.
-- Classification is inferred, not verified; accounting eligibility requires separate review.
-- Draft: no production deployment and no database execution before API/ownership audit.
-- Do not deploy before review of role ownership and API database grants.
BEGIN;

CREATE OR REPLACE FUNCTION pdc_private.treasury_v5c44t_register_dev(
  p_actor uuid,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_category text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_total bigint; v_items jsonb; v_statistics jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM pdc_private.role_assignments ra
    WHERE ra.auth_user_id = p_actor
      AND ra.role_code = 'national_treasury'
      AND ra.scope_territory_id IS NULL
      AND ra.valid_from <= pg_catalog.now()
      AND (ra.valid_until IS NULL OR ra.valid_until > pg_catalog.now())
  ) THEN
    RAISE EXCEPTION 'PDC_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
     OR (p_category IS NOT NULL AND p_category NOT IN
        ('adhesion_diaspora','adhesion_cameroun','don','cotisation_annuelle','historique_a_qualifier'))
     OR (p_status IS NOT NULL AND p_status NOT IN
        ('initiated','pending','confirmed','failed','cancelled'))
     OR (p_search IS NOT NULL AND pg_catalog.length(p_search) > 128) THEN
    RAISE EXCEPTION 'PDC_TREASURY_FILTER_INVALID' USING ERRCODE='22023';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      i.product_id, i.payment_id, i.quote_id, i.created_at,
      i.amount_xaf, i.link_state, i.general_link, i.selected_link_url,
      p.status AS payment_status, p.provider_payment_id, p.confirmed_at,
      d.id AS diaspora_order_id, d.formula, d.legal_amount_eur_cents,
      c.id AS public_order_id, c.order_kind,
      a.allocation_count, a.donation_count, a.initial_count, a.annual_count,
      a.allocated_xaf,
      CASE
        WHEN d.id IS NOT NULL THEN 'adhesion_diaspora'
        WHEN c.order_kind='individual_initial' THEN 'adhesion_cameroun'
        WHEN c.order_kind='donation' THEN 'don'
        WHEN a.allocation_count=1 AND a.donation_count=1 THEN 'don'
        WHEN a.allocation_count=1 AND a.initial_count=1 THEN 'adhesion_cameroun'
        WHEN a.allocation_count=1 AND a.annual_count=1 THEN 'cotisation_annuelle'
        ELSE 'historique_a_qualifier'
      END AS category
    FROM pdc_private.tara_checkout_intents_v5c i
    JOIN pdc_private.payment_attempts p ON p.id=i.payment_id
    LEFT JOIN pdc_private.r5_diaspora_orders d
      ON d.payment_id=i.payment_id AND d.id=i.quote_id
    LEFT JOIN pdc_private.public_checkout_orders_v5c c
      ON c.payment_id=i.payment_id
    LEFT JOIN LATERAL (
      SELECT pg_catalog.count(*)::integer AS allocation_count,
        pg_catalog.count(*) FILTER (WHERE pa.donation_id IS NOT NULL)::integer AS donation_count,
        pg_catalog.count(*) FILTER (WHERE o.kind='initial_membership_fee')::integer AS initial_count,
        pg_catalog.count(*) FILTER (WHERE o.kind='annual_dues')::integer AS annual_count,
        COALESCE(pg_catalog.sum(pa.amount_minor),0) AS allocated_xaf
      FROM pdc_private.payment_allocations pa
      LEFT JOIN pdc_private.dues_obligations o ON o.id=pa.obligation_id
      WHERE pa.payment_id=i.payment_id
    ) a ON true
    WHERE i.link_state='issued' AND p.provider='tara'
      AND p.currency='XAF' AND p.amount_minor=i.amount_xaf
  ), filtered AS MATERIALIZED (
    SELECT * FROM base
    WHERE (p_category IS NULL OR category=p_category)
      AND (p_status IS NULL OR payment_status=p_status)
      AND (p_search IS NULL OR p_search=''
           OR pg_catalog.strpos(pg_catalog.lower(product_id),pg_catalog.lower(p_search)) > 0
           OR payment_id::text=p_search OR quote_id::text=p_search)

), statistics AS (
    SELECT pg_catalog.jsonb_build_object(
        'count', pg_catalog.count(*),
        'issuedXaf',
            COALESCE(pg_catalog.sum(amount_xaf), 0)::text,
        'confirmedXaf',
            COALESCE(
                pg_catalog.sum(amount_xaf)
                FILTER (WHERE payment_status = 'confirmed'),
                0
            )::text,
        'minimumXaf',
            pg_catalog.min(amount_xaf)::text,
        'averageXaf',
            pg_catalog.round(
                pg_catalog.avg(amount_xaf::numeric), 2
            )::text,
        'medianXaf',
            pg_catalog.percentile_cont(0.5)
            WITHIN GROUP (
                ORDER BY amount_xaf::double precision
            )::numeric::text,
        'maximumXaf',
            pg_catalog.max(amount_xaf)::text,
        'statusCounts',
            pg_catalog.jsonb_build_object(
                'initiated', pg_catalog.count(*)
                    FILTER (WHERE payment_status='initiated'),
                'pending', pg_catalog.count(*)
                    FILTER (WHERE payment_status='pending'),
                'confirmed', pg_catalog.count(*)
                    FILTER (WHERE payment_status='confirmed'),
                'failed', pg_catalog.count(*)
                    FILTER (WHERE payment_status='failed'),
                'cancelled', pg_catalog.count(*)
                    FILTER (WHERE payment_status='cancelled')
            )
    ) AS result
    FROM filtered
), page AS (

    SELECT * FROM filtered ORDER BY created_at DESC,product_id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT pg_catalog.count(*) FROM filtered),
         (SELECT COALESCE(pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'productId',product_id,'paymentId',payment_id,'quoteId',quote_id,
              'category',category,'donationCount',donation_count,
              'expectedGrossXaf',amount_xaf::text,'currency','XAF',
              'legalAmountEurCents',legal_amount_eur_cents,
              'diasporaFormula',formula,'linkState',link_state,
              'paymentUrl',COALESCE(selected_link_url,general_link),
              'generalLink',general_link,'paymentStatus',payment_status,
              'providerTransactionId',provider_payment_id,
              'confirmedAt',confirmed_at,'createdAt',created_at,
              'allocationCount',allocation_count,
              'allocatedXaf',allocated_xaf::text,
              'paymentConfirmed',payment_status='confirmed',
              'operationalRevenueEligible',false
            ) ORDER BY created_at DESC,product_id DESC
         ),'[]'::jsonb) FROM page)
  ,
         (SELECT result FROM statistics)
  INTO v_total,v_items,v_statistics;
  RETURN pg_catalog.jsonb_build_object('total',v_total,'limit',p_limit,
    'offset',p_offset,'items',v_items,'statistics',v_statistics);
END;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.treasury_v5c44t_register_dev(uuid,integer,integer,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.treasury_v5c44t_register_dev(uuid,integer,integer,text,text,text)
  TO pdc_api_v5b3;
COMMIT;
