-- V5-C.28 / 3 — CINQ CANAUX TARA, SQL TRANSACTIONNEL À ANNULATION INTÉGRALE.
-- À exécuter UNIQUEMENT sur un projet DEV ISOLÉ, après contrôle des 020/021/023/027.
-- Ne fait AUCUN appel à Tara, ne crée PAS de paiement extérieur.
-- Tous les noms, coordonnées, URL et identifiants ci-dessous sont FICTIFS.
-- Si une assertion échoue, PostgreSQL annule la transaction.
BEGIN;
SET LOCAL statement_timeout = '25s';
DO $test$
DECLARE
  i integer; v_key text; v_digest text; v_product text;
  v_method text; v_channel text; v_field text; v_url text;
  v_order record; v_retry record; v_intent record; v_loaded record;
  v_count integer; v_ok boolean; v_bank record; v_general text := 'https://taramoney.com/pay/v5c28-fiction';
BEGIN
  FOR i IN 1..5 LOOP
    v_key := pg_catalog.format('sql-v5c28-test-channel-%s-20261028',i);
    v_digest := pg_catalog.repeat(i::text,64);
    v_product := 'PDC_' || pg_catalog.lpad(i::text,24,'0');
    v_method := CASE WHEN i=1 THEN 'mobile' WHEN i=5 THEN 'carte' ELSE 'tara' END;
    v_channel := CASE i WHEN 2 THEN 'whatsapp' WHEN 3 THEN 'telegram' WHEN 4 THEN 'dikalo' ELSE NULL END;
    v_field := CASE i WHEN 1 THEN 'smsLink' WHEN 2 THEN 'whatsappLink' WHEN 3 THEN 'telegramLink'
      WHEN 4 THEN 'dikaloLink' ELSE 'cardLink' END;
    v_url := CASE i
      WHEN 1 THEN 'sms:+237699000000?body=PDC%20test%20fictif'
      WHEN 2 THEN 'https://wa.me/237699000000?text=V5C28-test'
      WHEN 3 THEN 'https://t.me/share/url?url=https%3A%2F%2Fexample.org'
      WHEN 4 THEN 'https://dklo.co/fiction-v5c28'
      ELSE 'https://taramoney.com/card/v5c28-fiction' END;

    SELECT * INTO v_order FROM pdc_private.tara_v5c_create_public_order(
      pg_catalog.jsonb_build_object(
        'kind','donation','idempotencyKey',v_key,'requestDigest',v_digest,
        'firstName','Fictif','lastName',pg_catalog.format('TestCanal%s',i),
        'email',pg_catalog.format('v5c28-test-%s@example.invalid',i),
        'phoneE164','+237699123456','country','CM',
        'method',v_method,'messagingChannel',v_channel,
        'grossAmountXaf','500',
        'designations',pg_catalog.jsonb_build_array(
           pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))
      ));
    IF v_order."amountMinor" IS DISTINCT FROM '500' OR v_order.currency IS DISTINCT FROM 'XAF' THEN
      RAISE EXCEPTION 'V5C28_AMOUNT_CHANGED: %',i;
    END IF;
    -- Même clé + même requête : un SEUL paiement SQL.
    SELECT * INTO v_retry FROM pdc_private.tara_v5c_create_public_order(
      pg_catalog.jsonb_build_object(
        'kind','donation','idempotencyKey',v_key,'requestDigest',v_digest,
        'firstName','Fictif','lastName',pg_catalog.format('TestCanal%s',i),
        'email',pg_catalog.format('v5c28-test-%s@example.invalid',i),
        'phoneE164','+237699123456','country','CM',
        'method',v_method,'messagingChannel',v_channel,
        'grossAmountXaf','500',
        'designations',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))
      ));
    IF v_retry."paymentId" IS DISTINCT FROM v_order."paymentId" THEN
      RAISE EXCEPTION 'V5C28_ORDER_RETRY_DUPLICATED: %',i;
    END IF;
    -- Une clé réutilisée pour un contenu différent est TOUJOURS refusée.
    IF i=1 THEN
      BEGIN
        PERFORM 1 FROM pdc_private.tara_v5c_create_public_order(
          pg_catalog.jsonb_build_object(
            'kind','donation','idempotencyKey',v_key,
            'requestDigest',pg_catalog.repeat('f',64),
            'firstName','Fictif','lastName','Collision',
            'email','collision-v5c28@example.invalid','phoneE164','+237699123456',
            'country','CM','method','mobile','grossAmountXaf','500',
            'designations',pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))
          ));
        RAISE EXCEPTION 'V5C28_CHANGED_PAYLOAD_ACCEPTED';
      EXCEPTION WHEN SQLSTATE '23505' THEN NULL; -- refus attendu
      END;
    END IF;
    -- Deuxième référence productId avec la même clé : l'existant est retrouvé.
    SELECT * INTO v_intent FROM pdc_private.tara_v5c_reserve_intent(
      v_product,v_order."paymentId"::uuid,v_order."quoteId"::uuid,
      v_order."payerId"::uuid,v_key,500);
    IF v_intent."productId" IS DISTINCT FROM v_product OR
       v_intent."linkState" IS DISTINCT FROM 'reserved' THEN
      RAISE EXCEPTION 'V5C28_RESERVE_FAILURE: %',i;
    END IF;
    SELECT * INTO v_retry FROM pdc_private.tara_v5c_reserve_intent(
      'PDC_'||pg_catalog.lpad((i+10)::text,24,'0'),v_order."paymentId"::uuid,
      v_order."quoteId"::uuid,v_order."payerId"::uuid,v_key,500);
    IF v_retry."productId" IS DISTINCT FROM v_product THEN
      RAISE EXCEPTION 'V5C28_RESERVE_RETRY_DUPLICATED: %',i;
    END IF;

    v_ok := pdc_private.tara_v5c_claim_link(v_product);
    IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'V5C28_CLAIM_FAILED: %',i; END IF;

    -- Un mauvais champ / mauvais canal est refusé par SQL, et non remplacé.
    BEGIN
      PERFORM pdc_private.tara_v5c_save_issued_channel(
        v_product,v_order."paymentId"::uuid,v_key,
        v_method,v_channel,'generalLink',v_general,v_general);
      RAISE EXCEPTION 'V5C28_WRONG_CHANNEL_ACCEPTED: %',i;
    EXCEPTION WHEN SQLSTATE '23514' THEN
      NULL; -- Rejet attendu et annulé dans la sous-transaction.
    END;

    v_ok := pdc_private.tara_v5c_save_issued_channel(
      v_product,v_order."paymentId"::uuid,v_key,
      v_method,v_channel,v_field,v_url,v_general);
    IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'V5C28_CHANNEL_SAVE_FAILED: %',i; END IF;
    SELECT * INTO v_loaded FROM pdc_private.tara_v5c_load_issued_channel(v_product,v_key);
    IF NOT FOUND OR v_loaded."productId" IS DISTINCT FROM v_product OR
       v_loaded."paymentId" IS DISTINCT FROM v_order."paymentId" OR
       v_loaded."linkField" IS DISTINCT FROM v_field OR
       v_loaded."paymentUrl" IS DISTINCT FROM v_url OR
       v_loaded.method IS DISTINCT FROM v_method OR
       v_loaded."messagingChannel" IS DISTINCT FROM v_channel OR
       v_loaded."paymentUrl" = v_general THEN
      RAISE EXCEPTION 'V5C28_CHANNEL_READBACK_FAILED: %',i;
    END IF;
    -- Impossible de sauvegarder deux fois le même lien.
    v_ok := pdc_private.tara_v5c_save_issued_channel(
      v_product,v_order."paymentId"::uuid,v_key,
      v_method,v_channel,v_field,v_url,v_general);
    IF v_ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'V5C28_DOUBLE_ISSUE_ACCEPTED: %',i; END IF;
    SELECT pg_catalog.count(*) INTO v_count FROM pdc_private.payment_attempts p
      WHERE p.id=v_order."paymentId"::uuid AND p.status='initiated' AND p.confirmed_at IS NULL;
    IF v_count<>1 THEN RAISE EXCEPTION 'V5C28_PAYMENT_WAS_CONFIRMED: %',i; END IF;
    RAISE NOTICE 'OK: canal % (%, %) : brut, réservation, lien, reprise et aucun encaissement',i,v_method,v_field;
  END LOOP;
  -- Virement bancaire : commande sans création d'une intention Tara.
  SELECT * INTO v_bank FROM pdc_private.tara_v5c_create_public_order(
    pg_catalog.jsonb_build_object('kind','donation',
      'idempotencyKey','sql-v5c28-virement-test-20261028',
      'requestDigest',pg_catalog.repeat('a',64),
      'firstName','Fictif','lastName','Virement',
      'email','virement-v5c28@example.invalid',
      'phoneE164','+237699123456','country','CM',
      'method','virement','grossAmountXaf','500',
      'designations',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))));
  IF NOT EXISTS (
    SELECT 1 FROM pdc_private.payment_attempts
    WHERE id=v_bank."paymentId"::uuid AND provider='bank_transfer' AND amount_minor=500
      AND status='initiated'
  ) OR EXISTS (
    SELECT 1 FROM pdc_private.tara_checkout_intents_v5c
    WHERE payment_id=v_bank."paymentId"::uuid
  ) THEN RAISE EXCEPTION 'V5C28_BANK_TRANSFER_INVALID'; END IF;
  RAISE NOTICE 'OK : virement bancaire indépendant du prestataire Tara';
  RAISE NOTICE 'V5-C.28 : cinq parcours Tara + virement vérifiés. Toutes les écritures seront ANNULÉES.';
END;
$test$;
ROLLBACK;
