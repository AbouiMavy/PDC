-- R5 audit DEV UNIQUEMENT : lecture et assertions, aucun versement ni admission.
BEGIN;
DO $audit$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','pdc_tara_v5c_writer'] LOOP
    IF has_function_privilege(r,'pdc_private.r5_create_diaspora_dossier_dev(jsonb)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_reserve_tara_intent_dev(uuid,text,text,text,text)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_photo_issue_dev(uuid,text,text,text,integer)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_confirm_verified_fx_dev(uuid,text)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_admit_verified_diaspora_dev(uuid,text,text)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_reply_partner_email_dev(text,text)','EXECUTE') OR
       has_function_privilege(r,'pdc_private.r5_regularize_couple_dev(uuid,text)','EXECUTE') THEN
       RAISE EXCEPTION 'PDC_R5_FUNCTION_ACCESS_EXPOSED_%',r;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_create_diaspora_dossier_dev(jsonb)','EXECUTE') OR
     NOT has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_photo_issue_dev(uuid,text,text,text,integer)','EXECUTE') OR
     NOT has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_reserve_tara_intent_dev(uuid,text,text,text,text)','EXECUTE') OR
     has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_admit_verified_diaspora_dev(uuid,text,text)','EXECUTE') OR
     has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_confirm_verified_fx_dev(uuid,text)','EXECUTE') OR
     has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_regularize_couple_dev(uuid,text)','EXECUTE') OR
     NOT has_function_privilege('pdc_r5_intake_writer','pdc_private.r5_reply_partner_email_dev(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PDC_R5_INTAKE_ROLE_INVALID';
  END IF;
  IF NOT has_function_privilege('pdc_r5_photo_writer','pdc_private.r5_photo_reserve_dev(uuid,text,text)','EXECUTE') OR
     NOT has_function_privilege('pdc_r5_photo_writer','pdc_private.r5_photo_confirm_dev(uuid,integer,text,integer,integer)','EXECUTE') OR
     has_function_privilege('pdc_r5_photo_writer','pdc_private.r5_photo_issue_dev(uuid,text,text,text,integer)','EXECUTE') OR
     has_function_privilege('pdc_r5_photo_writer','pdc_private.r5_confirm_verified_fx_dev(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'PDC_R5_PHOTO_ROLE_INVALID';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','pdc_tara_v5c_writer','pdc_r5_intake_writer','pdc_r5_photo_writer'] LOOP
    IF has_table_privilege(r,'pdc_private.r5_diaspora_orders','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_diaspora_beneficiaries','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_provisional_photos','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_financial_reconciliations','INSERT') OR
       has_table_privilege(r,'pdc_private.r5_diaspora_finance_bridge_admin_dev','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_admissions_dev','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_partner_email_tokens','SELECT') OR
       has_table_privilege(r,'pdc_private.r5_couple_donation_split_dev','INSERT') THEN
      RAISE EXCEPTION 'PDC_R5_PRIVATE_DATA_EXPOSED_%',r;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_orders o
   JOIN pdc_private.payment_attempts p ON p.id=o.payment_id
   WHERE p.currency<>'XAF' OR p.provider<>'tara' OR p.payer_id<>o.payer_id OR
         p.amount_minor<>o.provider_amount_xaf OR o.fx_rate_xaf_per_eur<>656 OR
         o.provider_amount_xaf<>((o.legal_amount_eur_cents*656+999)/1000)*10 OR
         (o.formula='reduit' AND o.legal_amount_eur_cents<>1500) OR
         (o.formula='simple' AND o.legal_amount_eur_cents<>3000) OR
         (o.formula='couple' AND o.legal_amount_eur_cents<>4000)) THEN
    RAISE EXCEPTION 'PDC_R5_CROSS_CURRENCY_CONTEXT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_orders o WHERE
      (SELECT count(*) FROM pdc_private.r5_diaspora_beneficiaries b WHERE b.order_id=o.id)<>
      CASE WHEN o.formula='couple' THEN 2 ELSE 1 END) THEN
    RAISE EXCEPTION 'PDC_R5_BENEFICIARIES_COUNT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.r5_diaspora_orders o
     JOIN pdc_private.r5_diaspora_beneficiaries b ON b.order_id=o.id AND b.slot='partner'
     WHERE o.formula='couple' AND b.consent_at IS NOT NULL AND
       NOT EXISTS(SELECT 1 FROM pdc_private.audit_log l WHERE l.action='r5.partner_email_response'
          AND l.target_id=b.application_id)) THEN
    RAISE EXCEPTION 'PDC_R5_PARTNER_CONSENT_AUDIT_MISSING';
  END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.r5_couple_donation_split_dev d
    JOIN pdc_private.r5_diaspora_orders o ON o.id=d.order_id
    WHERE o.formula<>'couple' OR d.payment_id<>o.payment_id OR
    o.donation_conversion_accepted_at IS NULL OR
    d.member_dues_eur_cents<>3000 OR d.donation_eur_cents<>1000) THEN
      RAISE EXCEPTION 'PDC_R51_DONATION_SPLIT_INVALID';
  END IF;
END $audit$;
SELECT 'R5 DEV privileges, fixed 656 EUR/XAF and records: OK' AS result;
ROLLBACK;
