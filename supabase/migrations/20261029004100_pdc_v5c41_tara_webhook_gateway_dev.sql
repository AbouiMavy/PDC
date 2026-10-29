-- V5-C.41 : réception de notifications TaraMoney DEV.
-- Aucun paiement ni aucune adhésion confirmés.
BEGIN;

CREATE FUNCTION public.pdc_v5c41_record_tara_webhook_hint(
  p_fingerprint text,
  p_product_id text,
  p_provider_payment_id text,
  p_amount_claimed_xaf bigint,
  p_status_claimed text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF p_fingerprint IS NULL OR
     p_fingerprint !~ '^[a-f0-9]{64}$' OR
     p_product_id IS NULL OR
     p_product_id !~ '^PDC_[A-Za-z0-9_-]{24}$' OR
     p_provider_payment_id IS NULL OR
     length(p_provider_payment_id) NOT BETWEEN 1 AND 200 OR
     p_amount_claimed_xaf IS NULL OR
     p_amount_claimed_xaf NOT BETWEEN 0 AND 2147483647 OR
     p_status_claimed IS NULL OR
     p_status_claimed !~ '^[A-Z_]{3,50}$'
  THEN
    RAISE EXCEPTION 'PDC_TARA_HINT_INVALID'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id = p_product_id
  ) THEN
    RETURN false;
  END IF;

  -- Fonction privée existante : insertion dédoublonnée.
  PERFORM pdc_private.tara_v5c_record_hint(
    p_fingerprint,
    p_product_id,
    p_provider_payment_id,
    p_amount_claimed_xaf,
    p_status_claimed
  );

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION
  public.pdc_v5c41_record_tara_webhook_hint(
    text,text,text,bigint,text
  )
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.pdc_v5c41_record_tara_webhook_hint(
    text,text,text,bigint,text
  )
TO service_role;

COMMENT ON FUNCTION
  public.pdc_v5c41_record_tara_webhook_hint(
    text,text,text,bigint,text
  )
IS 'DEV: enregistre un indice Tara non fiable, sans confirmer de paiement.';

COMMIT;
