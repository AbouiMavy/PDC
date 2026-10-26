-- Tests V5-B.2, PROJET DE DEVELOPPEMENT UNIQUEMENT.
-- Crée un utilisateur Auth fictif dans une transaction, entièrement annulée.
-- À coller dans Supabase SQL Editor en entier (BEGIN ... ROLLBACK).
-- Ne jamais exécuter en production. AUCUN envoi d'email.
BEGIN;
DO $test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_prefix text := 'pdc-v5b2-' || replace(gen_random_uuid()::text,'-','');
  v_person uuid;
  v_application uuid;
  v_second_application uuid;
  v_fee uuid;
  v_payment uuid;
  v_member uuid;
  v_member_again uuid;
  v_number text;
  v_number_again text;
  v_denied boolean;
BEGIN
  -- 1. Vérifier que les rôles navigateur n'ont pas accès à la fonction.
  IF has_function_privilege('anon','pdc_private.admit_member_dev(uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','pdc_private.admit_member_dev(uuid,uuid)','EXECUTE')
     OR has_schema_privilege('anon','pdc_private','USAGE') THEN
    RAISE EXCEPTION 'SECURITE: fonction admission exposée au navigateur';
  END IF;
  RAISE NOTICE 'OK 1/8 : fonction privée';

  -- Fixture Auth technique fictive, rollback en fin de script.
  INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
  VALUES(v_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
         v_prefix || '@example.invalid',now(),now());
  INSERT INTO pdc_private.role_assignments(auth_user_id,role_code)
  VALUES(v_user,'national_admin');

  INSERT INTO pdc_private.people(last_name,first_name,country_of_residence,email)
  VALUES ('PDC-TEST','ADMISSION-DEV','CM',v_prefix || '-p@example.invalid')
  RETURNING id INTO v_person;
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
  VALUES(v_prefix || '-APP',v_person,'initial','cameroon','urbain',
        'submitted',now(),'TEST-V5B2',now(),now())
  RETURNING id INTO v_application;

  -- 2. Identité ne figurant pas dans les habilitations nationales.
  v_denied := false;
  BEGIN
    PERFORM * FROM pdc_private.admit_member_dev(v_application,gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM LIKE '%PDC_NOT_AUTHORIZED%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ECHEC: acteur non habilité accepté'; END IF;
  RAISE NOTICE 'OK 2/8 : refus sans habilitation';

  -- 3. Aucun paiement confirmé : pas d'admission.
  v_denied := false;
  BEGIN
    PERFORM * FROM pdc_private.admit_member_dev(v_application,v_user);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%PDC_INITIAL_FEE_NOT_CONFIRMED%' THEN v_denied := true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ECHEC: admission sans frais acceptée'; END IF;
  RAISE NOTICE 'OK 3/8 : paiement initial obligatoire';

  INSERT INTO pdc_private.dues_obligations
    (person_id,application_id,kind,category_code,amount_due_minor,currency)
  VALUES(v_person,v_application,'initial_membership_fee','urbain',2000,'XAF')
  RETURNING id INTO v_fee;
  INSERT INTO pdc_private.payment_attempts
    (reference,payer_id,provider,currency,amount_minor,status,confirmed_at)
  VALUES(v_prefix || '-PAY',v_person,'manual','XAF',2000,'confirmed',now())
  RETURNING id INTO v_payment;
  INSERT INTO pdc_private.payment_allocations(payment_id,obligation_id,amount_minor)
  VALUES(v_payment,v_fee,2000);

  -- 4. Admission, numéro provisoire unique et statut.
  SELECT membership_id,member_number INTO v_member,v_number
  FROM pdc_private.admit_member_dev(v_application,v_user);
  IF v_member IS NULL OR v_number !~ '^PDC-DEV-[0-9]{4}-[0-9]{8,}$' THEN
    RAISE EXCEPTION 'ECHEC: numéro ou identifiant militant manquant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pdc_private.memberships m
                 WHERE m.id=v_member AND m.status='active' AND m.person_id=v_person)
     OR NOT EXISTS (SELECT 1 FROM pdc_private.membership_applications a
                    WHERE a.id=v_application AND a.submission_status='accepted'
                    AND a.membership_id=v_member) THEN
    RAISE EXCEPTION 'ECHEC: état admission incohérent';
  END IF;
  RAISE NOTICE 'OK 4/8 : admission active et numéro réservé au serveur';

  -- 5. Audit automatique avec acteur habilité, sans nom/email.
  IF NOT EXISTS (SELECT 1 FROM pdc_private.audit_log l
                 WHERE l.actor_user_id=v_user AND l.target_id=v_member
                   AND l.action='membership.created')
     OR NOT EXISTS (SELECT 1 FROM pdc_private.audit_log l
                    WHERE l.actor_user_id=v_user AND l.target_id=v_application
                      AND l.action='application.status_changed') THEN
    RAISE EXCEPTION 'ECHEC: audit admission absent';
  END IF;
  IF EXISTS (SELECT 1 FROM pdc_private.audit_log l WHERE l.target_id IN (v_member,v_application)
             AND l.metadata::text LIKE '%'||v_prefix||'%') THEN
    RAISE EXCEPTION 'ECHEC: données personnelles dans audit';
  END IF;
  RAISE NOTICE 'OK 5/8 : traces automatiques minimales';

  -- 6. Retry identique : même numéro et même id.
  SELECT membership_id,member_number INTO v_member_again,v_number_again
  FROM pdc_private.admit_member_dev(v_application,v_user);
  IF v_member_again <> v_member OR v_number_again <> v_number THEN
    RAISE EXCEPTION 'ECHEC: réessai non idempotent';
  END IF;
  RAISE NOTICE 'OK 6/8 : répétition idempotente';

  -- 7. Deuxième demande initiale ne doit pas créer un deuxième membre.
  INSERT INTO pdc_private.membership_applications
    (reference,person_id,application_type,residence_group,category_code,
     submission_status,policy_accepted_at,policy_version,data_notice_accepted_at,submitted_at)
  VALUES(v_prefix || '-APP2',v_person,'initial','cameroon','urbain',
        'submitted',now(),'TEST-V5B2',now(),now())
  RETURNING id INTO v_second_application;
  v_denied := false;
  BEGIN
    PERFORM * FROM pdc_private.admit_member_dev(v_second_application,v_user);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%PDC_MEMBER_ALREADY_EXISTS%' THEN v_denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ECHEC: second militant créé'; END IF;
  RAISE NOTICE 'OK 7/8 : deuxième adhésion bloquée';

  -- 8. Contrôle d'unicité effectif de l'identifiant.
  IF (SELECT count(*) FROM pdc_private.memberships WHERE person_id=v_person) <> 1 THEN
    RAISE EXCEPTION 'ECHEC: multiplicité des adhésions';
  END IF;
  RAISE NOTICE 'OK 8/8 : unicité par personne';
  RAISE NOTICE 'V5-B.2 OK : toutes les écritures fictives vont être annulées.';
END;
$test$;
ROLLBACK;
