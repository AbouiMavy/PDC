-- PDC V5-B.6.10-F3.1 : correction additive du code PostgreSQL 42702.
-- DEV SEULEMENT : le fichier 01700 deja applique ne doit pas etre modifie.
-- Corrige exclusivement deux references ambiguës a la colonne b.slot
-- de couple_checkout_beneficiaries_v5b610f2 dans admit_paid_couple_dev_v5b610f3.
-- Aucune nouvelle table, aucun nouveau role, aucune API ni acces public.
BEGIN;

CREATE OR REPLACE FUNCTION pdc_private.admit_paid_couple_dev_v5b610f3(p_order uuid)
RETURNS TABLE(slot text,membership_id uuid,member_number text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
  v_order pdc_private.couple_checkout_orders_v5b610f2%ROWTYPE;
  v_admission pdc_private.couple_admissions_v5b610f3%ROWTYPE;
  v_part record;
  v_app pdc_private.membership_applications%ROWTYPE;
  v_person pdc_private.people%ROWTYPE;
  v_prefix text;
  v_serial integer;
  v_number text;
  v_member uuid;
  v_member_id uuid;
  v_partner_id uuid;
  v_member_number text;
  v_partner_number text;
  v_already_accepted integer;
BEGIN
  IF p_order IS NULL THEN
    RAISE EXCEPTION 'PDC_COUPLE_INVALID_ORDER' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_order FROM pdc_private.couple_checkout_orders_v5b610f2
   WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR v_order.status<>'awaiting_payment' OR v_order.payment_id IS NULL THEN
    RAISE EXCEPTION 'PDC_COUPLE_ORDER_NOT_ELIGIBLE' USING ERRCODE='42501';
  END IF;
  -- Sérialise le paiement avec son statut et avec les affectations classiques.
  PERFORM 1 FROM pdc_private.payment_attempts p
   WHERE p.id=v_order.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PDC_COUPLE_PAYMENT_MISSING'; END IF;

  -- Sérialise contre l'admission individuelle (ordre : applications, personnes).
  PERFORM 1 FROM pdc_private.membership_applications a
    JOIN pdc_private.couple_checkout_beneficiaries_v5b610f2 b ON b.application_id=a.id
   WHERE b.order_id=p_order ORDER BY a.id FOR UPDATE OF a;
  PERFORM 1 FROM pdc_private.people p
    JOIN pdc_private.couple_checkout_beneficiaries_v5b610f2 b ON b.person_id=p.id
   WHERE b.order_id=p_order ORDER BY p.id FOR UPDATE OF p;

  -- La preuve F2 doit être relue, y compris lors d'un retry : un remboursement
  -- interdit la réutilisation d'une preuve, sans révoquer automatiquement un membre.
  IF NOT pdc_private.couple_payment_verified_dev_v5b610f2(p_order) THEN
    RAISE EXCEPTION 'PDC_COUPLE_PAYMENT_NOT_VERIFIED' USING ERRCODE='42501';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pdc_private.couple_checkout_beneficiaries_v5b610f2
      WHERE order_id=p_order) <> 2 OR
     NOT EXISTS (SELECT 1 FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
                 WHERE b.order_id=p_order AND b.slot='member' AND person_id=v_order.payer_person_id) OR
     NOT EXISTS (SELECT 1 FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
                 WHERE b.order_id=p_order AND b.slot='partner' AND person_id<>v_order.payer_person_id) THEN
    RAISE EXCEPTION 'PDC_COUPLE_INCOMPLETE' USING ERRCODE='42501';
  END IF;

  -- Retry idempotent : accepte UNIQUEMENT une admission intégrale déjà journalisée
  -- et toujours cohérente avec les deux dossiers et deux numéros réservés.
  SELECT * INTO v_admission FROM pdc_private.couple_admissions_v5b610f3
   WHERE order_id=p_order FOR UPDATE;
  IF FOUND THEN
    IF (SELECT pg_catalog.count(*) FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
        JOIN pdc_private.membership_applications a ON a.id=b.application_id AND a.person_id=b.person_id
        JOIN pdc_private.memberships m ON m.id=a.membership_id AND m.person_id=b.person_id
        JOIN pdc_private.internet_number_reservations n
          ON n.person_id=b.person_id AND n.member_number=m.member_number
        WHERE b.order_id=p_order AND a.submission_status='accepted' AND m.status='active'
          AND ((b.slot='member' AND m.id=v_admission.member_membership_id) OR
               (b.slot='partner' AND m.id=v_admission.partner_membership_id)))<>2 OR
       EXISTS (SELECT 1 FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
        JOIN pdc_private.membership_applications a ON a.id=b.application_id
        WHERE b.order_id=p_order AND a.card_requested IS TRUE AND NOT EXISTS (
          SELECT 1 FROM pdc_private.membership_card_requests c
          WHERE c.application_id=a.id AND c.person_id=b.person_id
            AND c.requested_format=a.card_format)) THEN
      RAISE EXCEPTION 'PDC_COUPLE_INCONSISTENT_ADMISSION';
    END IF;
    RETURN QUERY SELECT b.slot,m.id,m.member_number
      FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
      JOIN pdc_private.membership_applications a ON a.id=b.application_id
      JOIN pdc_private.memberships m ON m.id=a.membership_id
      WHERE b.order_id=p_order
      ORDER BY CASE WHEN b.slot='member' THEN 0 ELSE 1 END;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO v_already_accepted
    FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
    JOIN pdc_private.membership_applications a ON a.id=b.application_id
   WHERE b.order_id=p_order AND (a.submission_status='accepted' OR a.membership_id IS NOT NULL);
  IF v_already_accepted<>0 THEN
    RAISE EXCEPTION 'PDC_COUPLE_PARTIAL_OR_UNTRACKED_ADMISSION';
  END IF;

  -- Éviter un numéro consommé si l'un des deux dossiers est incomplet.
  FOR v_part IN
    SELECT b.slot,b.person_id,b.application_id
      FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
     WHERE b.order_id=p_order
     ORDER BY CASE WHEN b.slot='member' THEN 0 ELSE 1 END
  LOOP
    SELECT * INTO v_app FROM pdc_private.membership_applications WHERE id=v_part.application_id;
    SELECT * INTO v_person FROM pdc_private.people WHERE id=v_part.person_id;
    IF v_app.id IS NULL OR v_person.id IS NULL OR
       v_app.person_id<>v_part.person_id OR
       v_app.application_type<>'initial' OR v_app.residence_group<>'diaspora' OR
       v_app.category_code<>'couple' OR v_app.submission_status NOT IN ('submitted','under_review') OR
       v_app.membership_id IS NOT NULL OR
       v_app.policy_accepted_at IS NULL OR v_app.policy_version IS NULL OR
       pg_catalog.btrim(v_app.policy_version)='' OR
       v_app.data_notice_accepted_at IS NULL OR v_app.submitted_at IS NULL OR
       v_person.date_of_birth IS NULL OR v_person.date_of_birth> CURRENT_DATE OR
       v_person.birth_place IS NULL OR pg_catalog.btrim(v_person.birth_place)='' OR
       pg_catalog.length(v_person.birth_place)>160 OR
       v_person.civility NOT IN ('Madame','Monsieur') OR v_person.civility IS NULL OR
       (v_person.sex_code IS NOT NULL AND v_person.sex_code <>
         CASE v_person.civility WHEN 'Monsieur' THEN 'M' ELSE 'F' END) OR
       EXISTS (SELECT 1 FROM pdc_private.memberships m WHERE m.person_id=v_person.id) THEN
      RAISE EXCEPTION 'PDC_COUPLE_BENEFICIARY_NOT_ELIGIBLE' USING ERRCODE='42501';
    END IF;
    IF v_app.card_requested AND v_app.card_format NOT IN ('digital','physical','both') THEN
      RAISE EXCEPTION 'PDC_COUPLE_CARD_FORMAT_INVALID';
    END IF;
  END LOOP;

  -- Aucun statut d'adhésion accepté ni numéro définitif avant ce point.
  -- Le compteur transactionnel commun M/F est partagé avec l'admission solo.
  PERFORM pg_catalog.set_config('pdc.actor_user_id','',true);
  FOR v_part IN
    SELECT b.slot,b.person_id,b.application_id
      FROM pdc_private.couple_checkout_beneficiaries_v5b610f2 b
     WHERE b.order_id=p_order
     ORDER BY CASE WHEN b.slot='member' THEN 0 ELSE 1 END
  LOOP
    SELECT * INTO v_person FROM pdc_private.people WHERE id=v_part.person_id;
    SELECT * INTO v_app FROM pdc_private.membership_applications WHERE id=v_part.application_id;
    v_prefix:=CASE v_person.civility WHEN 'Monsieur' THEN 'M' WHEN 'Madame' THEN 'F' ELSE NULL END;
    UPDATE pdc_private.internet_member_counter_v5b62
       SET last_serial=last_serial+1
     WHERE singleton=true AND last_serial<999999
     RETURNING last_serial INTO v_serial;
    IF v_serial IS NULL THEN RAISE EXCEPTION 'PDC_INTERNET_NUMBER_EXHAUSTED'; END IF;
    v_number:=pdc_private.format_internet_member_number(v_prefix,v_serial);
    IF EXISTS (SELECT 1 FROM pdc_private.memberships m WHERE m.member_number=v_number) THEN
      RAISE EXCEPTION 'PDC_INTERNET_NUMBER_COLLISION';
    END IF;
    INSERT INTO pdc_private.internet_number_reservations(serial_number,member_number,person_id)
    VALUES(v_serial,v_number,v_person.id);
    UPDATE pdc_private.people SET sex_code=v_prefix,updated_at=pg_catalog.now()
     WHERE id=v_person.id;
    INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at,verified_at)
    VALUES(v_person.id,v_number,'active',pg_catalog.now(),NULL)
    RETURNING id INTO v_member;
    UPDATE pdc_private.membership_applications
      SET submission_status='accepted',membership_id=v_member
      WHERE id=v_app.id;
    IF v_app.card_requested THEN
      INSERT INTO pdc_private.membership_card_requests(application_id,person_id,requested_format)
      VALUES(v_app.id,v_person.id,v_app.card_format);
    END IF;
    IF v_part.slot='member' THEN
      v_member_id:=v_member;v_member_number:=v_number;
    ELSE
      v_partner_id:=v_member;v_partner_number:=v_number;
    END IF;
  END LOOP;
  IF v_member_id IS NULL OR v_partner_id IS NULL OR v_member_id=v_partner_id THEN
    RAISE EXCEPTION 'PDC_COUPLE_ATOMIC_ADMISSION_FAILED';
  END IF;
  INSERT INTO pdc_private.couple_admissions_v5b610f3
    (order_id,member_membership_id,partner_membership_id)
  VALUES(p_order,v_member_id,v_partner_id);
  INSERT INTO pdc_private.audit_log(action,target_table,target_id,metadata)
  VALUES('couple.admitted','couple_checkout_orders_v5b610f2',p_order,
    pg_catalog.jsonb_build_object('beneficiaries',2,'payment_id',v_order.payment_id));
  RETURN QUERY SELECT 'member'::text,v_member_id,v_member_number
     UNION ALL SELECT 'partner'::text,v_partner_id,v_partner_number;
END;
$fn$;

-- Un CREATE OR REPLACE conserve normalement les droits existants. Ce REVOKE
-- reapplique explicitement la barriere de la migration 01700.
REVOKE ALL ON FUNCTION pdc_private.admit_paid_couple_dev_v5b610f3(uuid)
 FROM PUBLIC,anon,authenticated,service_role,pdc_api_v5b3,pdc_api_runtime_v5b3,
      pdc_portrait_upload_runtime_v5b610c;
COMMENT ON FUNCTION pdc_private.admit_paid_couple_dev_v5b610f3(uuid) IS
 'DEV SQL Editor only. F3.1: correction des references b.slot ambiguës dans la validation du couple ; aucun acces public ni delivrance.';
COMMIT;
