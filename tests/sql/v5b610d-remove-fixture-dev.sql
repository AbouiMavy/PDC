-- NETTOYAGE, a executer APRES suppression du fichier dans Supabase Storage UI.
-- Remplacer la reference ci-dessous par la reference EXACTE fournie par CREATE.
-- Le test n'est pas une adhesion legitime; ne supprimer AUCUN autre dossier.
BEGIN;
DO $cleanup$
DECLARE v_ref text := 'TEST-V5B610D-795fcb2ac3';
  v_app uuid; v_req uuid; v_person uuid; v_member uuid;
BEGIN
  IF v_ref !~ '^TEST-V5B610D-[0-9a-f]{10}$' THEN
    RAISE EXCEPTION 'PDC_INVALID_FIXTURE_REFERENCE';
  END IF;
  SELECT a.id,a.person_id,a.membership_id,c.id
    INTO v_app,v_person,v_member,v_req
    FROM pdc_private.membership_applications a
    JOIN pdc_private.membership_card_requests c ON c.application_id=a.id
    WHERE a.reference=v_ref;
  IF v_app IS NULL THEN RAISE EXCEPTION 'PDC_FIXTURE_NOT_FOUND'; END IF;
  IF EXISTS(
    SELECT 1 FROM pdc_private.card_portrait_assets p
    JOIN storage.objects so ON so.bucket_id=p.bucket_id AND so.name=p.object_key
    WHERE p.card_request_id=v_req
  ) THEN RAISE EXCEPTION 'PDC_STORAGE_OBJECT_EXISTS_DELETE_USING_STORAGE_UI_FIRST'; END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.payment_attempts WHERE payer_id=v_person) THEN
    RAISE EXCEPTION 'PDC_UNEXPECTED_PAYMENT_ABORT'; END IF;
  IF EXISTS(SELECT 1 FROM pdc_private.internet_number_reservations WHERE person_id=v_person) THEN
    RAISE EXCEPTION 'PDC_UNEXPECTED_OFFICIAL_NUMBER_ABORT'; END IF;
  DELETE FROM pdc_private.card_portrait_assets WHERE card_request_id=v_req;
  DELETE FROM pdc_private.membership_card_requests WHERE id=v_req;
  DELETE FROM pdc_private.membership_applications WHERE id=v_app;
  DELETE FROM pdc_private.memberships WHERE id=v_member AND member_number=v_ref;
  DELETE FROM pdc_private.people WHERE id=v_person AND last_name=v_ref;
  -- L'audit des reservations/confirmations du test est volontairement conserve.
  RAISE NOTICE 'Dossier de test supprime : %',v_ref;
END;
$cleanup$;
COMMIT;
