-- À exécuter UNIQUEMENT dans SQL Editor du projet de développement,
-- APRÈS audit et installation explicite de la migration 023.
-- Toutes les écritures sont annulées par ROLLBACK.
BEGIN;
DO $test$
DECLARE a record; b record; c record; reservation_don record; e record; f record; existing_count bigint;
BEGIN
  SELECT * INTO a FROM pdc_private.tara_v5c_create_public_order(
    pg_catalog.jsonb_build_object(
      'kind','donation', 'idempotencyKey','sql-test-don-v5c-20261028',
      'requestDigest',pg_catalog.repeat('a',64),
      'firstName','Don', 'lastName','Test', 'email','donateur-test@example.org',
      'phoneE164','+237699123456', 'country','CM', 'method','mobile',
      'grossAmountXaf','500', 'designations',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))
    ));
  SELECT * INTO b FROM pdc_private.tara_v5c_create_public_order(
    pg_catalog.jsonb_build_object(
      'kind','donation', 'idempotencyKey','sql-test-don-v5c-20261028',
      'requestDigest',pg_catalog.repeat('a',64),
      'firstName','Don','lastName','Test','email','donateur-test@example.org',
      'phoneE164','+237699123456','country','CM','method','mobile',
      'grossAmountXaf','500','designations',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('purpose','libre','percentBps',10000))
    ));
  IF a."paymentId" IS DISTINCT FROM b."paymentId" OR
     a."amountMinor" IS DISTINCT FROM '500' OR a.currency IS DISTINCT FROM 'XAF' THEN
    RAISE EXCEPTION 'TEST_PDC_IDEMPOTENCE_BRUT_FAILED';
  END IF;
  SELECT pg_catalog.count(*) INTO existing_count FROM pdc_private.payment_allocations
    WHERE payment_id=a."paymentId"::uuid AND amount_minor=500;
  IF existing_count<>1 THEN RAISE EXCEPTION 'TEST_PDC_ALLOCATION_FAILED'; END IF;
  SELECT * INTO c FROM pdc_private.tara_v5c_create_public_order(
    pg_catalog.jsonb_build_object(
      'kind','individual_initial','idempotencyKey','sql-test-adh-v5c-20261028',
      'requestDigest',pg_catalog.repeat('b',64),
      'firstName','Adhesion','lastName','Test','email','adh-test@example.org',
      'phoneE164','+237699123456','country','CM','method','tara',
      'messagingChannel','whatsapp','grossAmountXaf','2000',
      'membership',pg_catalog.jsonb_build_object(
        'civility','Monsieur','dateOfBirth','1990-01-01',
        'birthPlace','Yaounde','category','urbain')
    ));
  IF c."amountMinor" IS DISTINCT FROM '2000' OR
     pg_catalog.array_length(c."beneficiaryIds",1) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST_PDC_MEMBERSHIP_FAILED';
  END IF;
  -- Une obligation créée pour une première adhésion doit être rattachée
  -- au dossier, sinon le moteur d'admission ne pourra jamais retrouver la dette.
  IF NOT EXISTS (
    SELECT 1 FROM pdc_private.dues_obligations d
    JOIN pdc_private.membership_applications app ON app.id=d.application_id
    JOIN pdc_private.payment_allocations a2 ON a2.obligation_id=d.id
    WHERE d.id=c."quoteId"::uuid AND a2.payment_id=c."paymentId"::uuid
      AND d.person_id=c."payerId"::uuid AND app.person_id=d.person_id
      AND app.submission_status='draft' AND d.amount_due_minor=2000
  ) THEN RAISE EXCEPTION 'TEST_PDC_APPLICATION_LINK_FAILED'; END IF;
  -- C.25 : réserver la référence Tara APRES la création atomique de chaque
  -- paiement ; aucun lien ni confirmation ne sont créés par cette procédure.
  SELECT * INTO reservation_don FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('a',24),a."paymentId"::uuid,
    a."quoteId"::uuid,a."payerId"::uuid,
    'sql-test-don-v5c-20261028',500);
  -- Une reprise avec la même clé ne produit pas une nouvelle réservation.
  SELECT * INTO e FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('b',24),a."paymentId"::uuid,
    a."quoteId"::uuid,a."payerId"::uuid,
    'sql-test-don-v5c-20261028',500);
  SELECT * INTO f FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('c',24),c."paymentId"::uuid,
    c."quoteId"::uuid,c."payerId"::uuid,
    'sql-test-adh-v5c-20261028',2000);
  IF reservation_don."productId" IS DISTINCT FROM e."productId" OR
     reservation_don."productId" IS DISTINCT FROM 'PDC_'||pg_catalog.repeat('a',24) OR
     reservation_don."linkState" IS DISTINCT FROM 'reserved' OR
     reservation_don."generalLink" IS NOT NULL OR
     reservation_don."amountXaf" IS DISTINCT FROM '500' OR
     f."linkState" IS DISTINCT FROM 'reserved' OR
     f."amountXaf" IS DISTINCT FROM '2000' OR
     f."generalLink" IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_PDC_TARA_RESERVATION_FAILED';
  END IF;
  RAISE NOTICE 'OK: commandes brutes, dossier/obligation, réservations Tara sans lien, idempotence - ROLLBACK ensuite';
END;
$test$;
ROLLBACK;
