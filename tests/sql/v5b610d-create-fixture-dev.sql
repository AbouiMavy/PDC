-- PDC V5-B.6.10-D -- Creer UN dossier photo fictif PERSISTANT en DEV.
-- A executer une seule fois dans le SQL Editor du projet rvgpnmznhzwlzqyefahd.
-- Ce jeu de test n'a PAS de paiement et n'est PAS une adhesion authentique.
-- IMPORTANT: ne jamais executer dans une base de production.
BEGIN;
DO $fixture$
DECLARE
  v_ref text := 'TEST-V5B610D-' || pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,10);
  v_actor uuid;
  v_person uuid;
  v_member uuid;
  v_app uuid;
  v_request uuid;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'PDC_DATABASE_INATTENDUE';
  END IF;
  SELECT id INTO v_actor FROM auth.users WHERE email='pdc-v5b3-test@example.invalid';
  IF v_actor IS NULL THEN RAISE EXCEPTION 'PDC_TEST_AUTH_USER_MISSING'; END IF;
  -- Habilitation DEV a duree limitee. Les droits seront verifies de nouveau
  -- par l'application avec le jeton Supabase Auth reel.
  INSERT INTO pdc_private.role_assignments
      (auth_user_id,role_code,scope_territory_id,valid_from,valid_until)
  SELECT v_actor,'national_admin',NULL,now(),now()+interval '45 minutes'
  WHERE NOT EXISTS (
    SELECT 1 FROM pdc_private.role_assignments r
    WHERE r.auth_user_id=v_actor AND r.role_code='national_admin'
      AND r.scope_territory_id IS NULL AND r.valid_from<=now()
      AND (r.valid_until IS NULL OR r.valid_until>now())
  );
  INSERT INTO pdc_private.people
      (civility,last_name,first_name,date_of_birth,birth_place,country_of_residence,email)
  VALUES ('Madame',v_ref,'PORTRAIT-FICTIF',DATE '1990-06-15',
          'Ville fictive','FR',lower(v_ref)||'@example.invalid')
  RETURNING id INTO v_person;
  -- Numero marque TEST et non une immatriculation militante; aucune reservation
  -- dans le compteur national ni consommation du stock des numeros Internet.
  INSERT INTO pdc_private.memberships(person_id,member_number,status,joined_at)
  VALUES(v_person,v_ref,'active',now()) RETURNING id INTO v_member;
  INSERT INTO pdc_private.membership_applications
      (reference,person_id,membership_id,application_type,residence_group,
       category_code,submission_status,policy_accepted_at,policy_version,
       data_notice_accepted_at,submitted_at,card_requested,card_format)
  VALUES(v_ref,v_person,v_member,'initial','diaspora','simple','accepted',
         now(),'TEST-DEV',now(),now(),true,'digital')
  RETURNING id INTO v_app;
  INSERT INTO pdc_private.membership_card_requests
      (application_id,person_id,requested_format,status)
  VALUES(v_app,v_person,'digital','requested') RETURNING id INTO v_request;
  RAISE NOTICE 'Dossier fictif cree : % ; card_request_id=%',v_ref,v_request;
END;
$fixture$;
COMMIT;
-- COPIER UNIQUEMENT card_request_id dans la commande de test, pas un numero reel.
SELECT a.reference AS fictive_reference,c.id AS card_request_id,c.status
FROM pdc_private.membership_applications a
JOIN pdc_private.membership_card_requests c ON c.application_id=a.id
WHERE a.reference LIKE 'TEST-V5B610D-%'
ORDER BY a.submitted_at DESC LIMIT 5;
