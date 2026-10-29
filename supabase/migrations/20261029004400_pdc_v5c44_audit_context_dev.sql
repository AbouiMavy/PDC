-- V5-C.44 DEV uniquement : lecture minimale des paramètres financiers.
-- Aucun DML, changement de statut, admission, ni octroi de droits publics.
BEGIN;

CREATE FUNCTION pdc_private.tara_v5c44_load_audit_context(p_product_id text)
RETURNS TABLE (
  "productId" text, "paymentId" text, "amountXaf" text, currency text,
  "linkState" text, "paymentStatus" text, "selectedMethod" text,
  "selectedLinkField" text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT c.product_id,c.payment_id::text,c.amount_xaf::text,c.currency::text,
    c.link_state,p.status,c.selected_method,c.selected_link_field
  FROM pdc_private.tara_checkout_intents_v5c AS c
  JOIN pdc_private.payment_attempts AS p ON p.id=c.payment_id
  WHERE c.product_id=p_product_id AND p.provider='tara'
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.tara_v5c44_load_audit_context(text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c44_load_audit_context(text)
  TO pdc_tara_v5c_writer;
COMMENT ON FUNCTION pdc_private.tara_v5c44_load_audit_context(text)
  IS 'DEV : lecture privee pour audit financier sans effet de paiement.';
COMMIT;
