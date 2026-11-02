#!/usr/bin/env python3
"""Patch sûr et idempotent de la migration 023 NON APPLIQUÉE.
Ne lance aucune requête PostgreSQL.
"""
from pathlib import Path

path = Path('supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql')
if not path.is_file():
    raise SystemExit('ARRÊT : migration 023 introuvable à la racine du dépôt')
s = path.read_text()
if 'v_application uuid;' in s and 'application_id,person_id,kind,category_code' in s:
    print('MIGRATION_023_DEJA_CORRIGEE')
    raise SystemExit(0)
old_decl = '  v_person uuid; v_target uuid; v_payment uuid; v_provider text;'
new_decl = '  v_person uuid; v_target uuid; v_payment uuid; v_provider text; v_application uuid;'
old_app = """      VALUES('WEB-ADH-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
             v_person,'initial','cameroon',v_category,'draft');
    -- Textes statutaires toujours provisoires : ne PAS inventer un consentement
    -- juridiquement valide ni placer la candidature en état submitted.
    INSERT INTO pdc_private.dues_obligations(person_id,kind,category_code,amount_due_minor,currency,status)
      VALUES(v_person,'initial_membership_fee',v_category,2000,'XAF','open')
      RETURNING id INTO v_target;"""
new_app = """      VALUES('WEB-ADH-'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),
             v_person,'initial','cameroon',v_category,'draft')
      RETURNING id INTO v_application;
    -- Textes statutaires toujours provisoires : ne PAS inventer un consentement
    -- juridiquement valide ni placer la candidature en état submitted.
    -- Conserver le lien dossier / obligation, indispensable à l'admission après
    -- validation des textes et confirmation indépendante du paiement.
    INSERT INTO pdc_private.dues_obligations(application_id,person_id,kind,category_code,amount_due_minor,currency,status)
      VALUES(v_application,v_person,'initial_membership_fee',v_category,2000,'XAF','open')
      RETURNING id INTO v_target;"""
for old in [old_decl,old_app]:
    if s.count(old)!=1:
        raise SystemExit('ARRÊT : migration 023 différente du lot attendu ; aucune modification')
s=s.replace(old_decl,new_decl).replace(old_app,new_app)
path.write_text(s)
print('MIGRATION_023_LIEN_DOSSIER_CORRIGE')

# Renforcer le test SQL de rollback sans l'exécuter sur la base.
test = Path('tests/sql/v5c-public-orders-rollback.sql')
if not test.is_file():
    print('NOTE : script rollback absent, correction SQL déjà faite')
    raise SystemExit(0)
t = test.read_text()
if 'TEST_PDC_APPLICATION_LINK_FAILED' not in t:
    needle = "  RAISE NOTICE 'OK: don brut, idempotence, allocation, premiere adhesion - ROLLBACK ensuite';"
    replacement = """  -- Une obligation créée pour une première adhésion doit être rattachée
  -- au dossier, sinon le moteur d'admission ne pourra jamais retrouver la dette.
  IF NOT EXISTS (
    SELECT 1 FROM pdc_private.dues_obligations d
    JOIN pdc_private.membership_applications app ON app.id=d.application_id
    JOIN pdc_private.payment_allocations a2 ON a2.obligation_id=d.id
    WHERE d.id=c."quoteId"::uuid AND a2.payment_id=c."paymentId"::uuid
      AND d.person_id=c."payerId"::uuid AND app.person_id=d.person_id
      AND app.submission_status='draft' AND d.amount_due_minor=2000
  ) THEN RAISE EXCEPTION 'TEST_PDC_APPLICATION_LINK_FAILED'; END IF;
  RAISE NOTICE 'OK: don brut, idempotence, allocation, dossier/obligation - ROLLBACK ensuite';"""
    if t.count(needle) != 1: raise SystemExit('ARRÊT : test rollback différent du lot attendu')
    test.write_text(t.replace(needle,replacement))
    print('TEST_ROLLBACK_LIEN_DOSSIER_AJOUTE')
