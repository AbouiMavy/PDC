-- PDC V5-C.27 — persistance atomique du lien de canal sélectionné, DEV seulement.
-- À appliquer UNIQUEMENT APRÈS les migrations 020, 021 et 023 contrôlées en DEV.
-- Aucune fonction accessible à anon / authenticated / service_role. Pas de confirmation de paiement.
BEGIN;

ALTER TABLE pdc_private.tara_checkout_intents_v5c
  ADD COLUMN selected_method text,
  ADD COLUMN selected_messaging_channel text,
  ADD COLUMN selected_link_field text,
  ADD COLUMN selected_link_url text;

ALTER TABLE pdc_private.tara_checkout_intents_v5c
  ADD CONSTRAINT tara_selected_method_v5c_check CHECK (
    selected_method IS NULL OR selected_method IN ('mobile','tara','carte')),
  ADD CONSTRAINT tara_selected_field_v5c_check CHECK (
    selected_link_field IS NULL OR selected_link_field IN
      ('smsLink','whatsappLink','telegramLink','dikaloLink','cardLink')),
  ADD CONSTRAINT tara_selected_url_v5c_check CHECK (
    selected_link_url IS NULL OR
      (link_state='issued' AND pg_catalog.length(selected_link_url) BETWEEN 7 AND 2048)),
  ADD CONSTRAINT tara_selected_pair_v5c_check CHECK (
    (selected_method IS NULL AND selected_messaging_channel IS NULL AND
     selected_link_field IS NULL AND selected_link_url IS NULL)
    OR
    (selected_method IS NOT NULL AND selected_link_field IS NOT NULL AND
     selected_link_url IS NOT NULL)),
  ADD CONSTRAINT tara_selected_channel_v5c_check CHECK (
    selected_messaging_channel IS NULL OR selected_messaging_channel IN
      ('whatsapp','telegram','dikalo'));

-- Ne jamais altérer un lien déjà délivré lors d'un retry, même si la
-- transition issued -> issued est admise par le trigger de la migration 020.
CREATE FUNCTION pdc_private.tara_v5c_issued_channel_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF TG_OP='UPDATE' AND OLD.link_state='issued' AND
    (NEW.selected_method,NEW.selected_messaging_channel,
     NEW.selected_link_field,NEW.selected_link_url)
    IS DISTINCT FROM
    (OLD.selected_method,OLD.selected_messaging_channel,
     OLD.selected_link_field,OLD.selected_link_url) THEN
      RAISE EXCEPTION 'PDC_TARA_ISSUED_CHANNEL_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER tara_issued_channel_immutable_v5c
  BEFORE UPDATE ON pdc_private.tara_checkout_intents_v5c
  FOR EACH ROW EXECUTE FUNCTION pdc_private.tara_v5c_issued_channel_immutable();

CREATE FUNCTION pdc_private.tara_v5c_save_issued_channel(
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
  IF p_field='cardLink' AND
     p_payment_url !~ '^https://(www[.])?taramoney[.]com/card/[^[:space:]@#]+' THEN
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

-- Le lecteur demande conjointement une clé de commande et un productId
-- aléatoire ; il n'expose jamais le generalLink.
CREATE FUNCTION pdc_private.tara_v5c_load_issued_channel(
  p_product_id text,p_idempotency_key text
) RETURNS TABLE("productId" text,"paymentId" text,
    method text,"messagingChannel" text,"linkField" text,"paymentUrl" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
  SELECT c.product_id,c.payment_id::text,c.selected_method,
         c.selected_messaging_channel,c.selected_link_field,c.selected_link_url
  FROM pdc_private.tara_checkout_intents_v5c c
  JOIN pdc_private.public_checkout_orders_v5c o ON o.payment_id=c.payment_id
  WHERE c.product_id=p_product_id AND c.idempotency_key=p_idempotency_key AND
        c.link_state='issued' AND c.selected_link_url IS NOT NULL AND
        c.selected_method=o.payment_method AND
        c.selected_messaging_channel IS NOT DISTINCT FROM o.messaging_channel;
$fn$;

REVOKE ALL ON FUNCTION pdc_private.tara_v5c_issued_channel_immutable()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION pdc_private.tara_v5c_load_issued_channel(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text)
  TO pdc_tara_v5c_writer;
GRANT EXECUTE ON FUNCTION pdc_private.tara_v5c_load_issued_channel(text,text)
  TO pdc_tara_v5c_writer;
COMMENT ON FUNCTION pdc_private.tara_v5c_save_issued_channel(text,uuid,text,text,text,text,text,text) IS
  'DEV: lie atomiquement le mode choisi, le champ Tara et l URL payante au checkout deja reclame; ne confirme rien.';
COMMIT;
