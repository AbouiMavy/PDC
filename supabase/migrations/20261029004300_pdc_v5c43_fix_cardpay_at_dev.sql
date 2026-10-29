-- V5-C.43 DEV : autoriser @ dans le chemin cardpay.
-- Aucun paiement confirmé, aucune donnée modifiée.
BEGIN;

CREATE OR REPLACE FUNCTION pdc_private.tara_v5c_save_issued_channel(
  p_product_id text,p_payment_id uuid,p_idempotency_key text,
  p_method text,p_messaging_channel text,p_field text,
  p_payment_url text,p_general_link text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  v_intent pdc_private.tara_checkout_intents_v5c%ROWTYPE;
  v_method text; v_channel text; v_expected_field text;
BEGIN
  SELECT * INTO v_intent FROM pdc_private.tara_checkout_intents_v5c
    WHERE product_id=p_product_id AND payment_id=p_payment_id AND
      idempotency_key=p_idempotency_key FOR UPDATE;
  IF NOT FOUND OR v_intent.link_state<>'requested' THEN
    RETURN false;
  END IF;
  SELECT payment_method,messaging_channel INTO v_method,v_channel
    FROM pdc_private.public_checkout_orders_v5c WHERE payment_id=p_payment_id;
  IF NOT FOUND OR v_method IS DISTINCT FROM p_method OR
     v_channel IS DISTINCT FROM p_messaging_channel THEN
    RAISE EXCEPTION 'PDC_TARA_CHANNEL_ORDER_MISMATCH' USING ERRCODE='23514';
  END IF;
  v_expected_field := CASE
    WHEN p_method='mobile' AND p_messaging_channel IS NULL THEN 'smsLink'
    WHEN p_method='carte' AND p_messaging_channel IS NULL THEN 'cardLink'
    WHEN p_method='tara' AND p_messaging_channel='general' THEN 'generalLink'
    WHEN p_method='tara' AND p_messaging_channel='whatsapp' THEN 'whatsappLink'
    WHEN p_method='tara' AND p_messaging_channel='telegram' THEN 'telegramLink'
    WHEN p_method='tara' AND p_messaging_channel='dikalo' THEN 'dikaloLink'
    ELSE NULL END;
  IF v_expected_field IS NULL OR p_field IS DISTINCT FROM v_expected_field OR
     p_payment_url IS NULL OR pg_catalog.length(p_payment_url) NOT BETWEEN 7 AND 2048 OR
     p_payment_url ~ '[[:cntrl:]]' OR
     p_general_link IS NULL OR
     p_general_link !~ '^https://(www[.])?taramoney[.]com/pay/[^[:space:]@#]+' THEN
    RAISE EXCEPTION 'PDC_TARA_CHANNEL_URL_INVALID' USING ERRCODE='23514';
  END IF;
  -- Contre-vérification SQL du domaine, en complément du validateur URL Node.
  IF p_field='generalLink' AND p_payment_url IS DISTINCT FROM p_general_link THEN
    RAISE EXCEPTION 'PDC_TARA_GENERAL_URL_MISMATCH' USING ERRCODE='23514';
  ELSIF p_field='cardLink' AND
     p_payment_url !~ '^https://(www[.])?taramoney[.]com/(card|cardpay)/[^[:space:]#]+$' THEN
    RAISE EXCEPTION 'PDC_TARA_CARD_URL_INVALID' USING ERRCODE='23514';
  ELSIF p_field='smsLink' AND p_payment_url ~ '^sms:' THEN
    IF p_payment_url !~ '^sms:[A-Za-z0-9+%,;?=&._~-]*$' THEN
      RAISE EXCEPTION 'PDC_TARA_SMS_URL_INVALID' USING ERRCODE='23514';
    END IF;
  ELSIF p_field<>'cardLink' AND
    p_payment_url !~ '^https://((www[.])?(taramoney[.]com|dklo[.]co|whatsapp[.]com|dikalo[.]com|dikalo[.]co)|wa[.]me|api[.]whatsapp[.]com|web[.]whatsapp[.]com|t[.]me|(www[.])?telegram[.]me)(/|[?]|$)' THEN
    RAISE EXCEPTION 'PDC_TARA_CHANNEL_HOST_INVALID' USING ERRCODE='23514';
  END IF;
  UPDATE pdc_private.tara_checkout_intents_v5c SET
    general_link=p_general_link,
    selected_method=p_method,
    selected_messaging_channel=p_messaging_channel,
    selected_link_field=p_field,
    selected_link_url=p_payment_url,
    link_state='issued'
  WHERE product_id=p_product_id AND link_state='requested';
  RETURN FOUND;
END;
$fn$;

COMMIT;
