#!/usr/bin/env python3
"""Ajoute un contrôle transactionnel create_public_order → reserve_intent.
Ne se connecte pas à Supabase. Script SQL à exécuter uniquement après audit DEV.
"""
from pathlib import Path
p=Path('tests/sql/v5c-public-orders-rollback.sql')
if not p.is_file():raise SystemExit('ARRÊT : test SQL 023 introuvable')
s=p.read_text()
if 'TEST_PDC_TARA_RESERVATION_FAILED' in s:
    print('TEST_SQL_RESERVATION_DEJA_PRESENT')
    raise SystemExit(0)
old='DECLARE a record; b record; c record; existing_count bigint;'
new='DECLARE a record; b record; c record; d record; e record; f record; existing_count bigint;'
if s.count(old)!=1:raise SystemExit('ARRÊT : déclaration SQL différente du lot 023/024')
s=s.replace(old,new)
marker="  RAISE NOTICE 'OK: don brut, idempotence, allocation, dossier/obligation - ROLLBACK ensuite';"
replacement="""  -- C.25 : réserver la référence Tara APRES la création atomique de chaque
  -- paiement ; aucun lien ni confirmation ne sont créés par cette procédure.
  SELECT * INTO d FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('a',24),a.\"paymentId\"::uuid,
    a.\"quoteId\"::uuid,a.\"payerId\"::uuid,
    'sql-test-don-v5c-20261028',500);
  -- Une reprise avec la même clé ne produit pas une nouvelle réservation.
  SELECT * INTO e FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('b',24),a.\"paymentId\"::uuid,
    a.\"quoteId\"::uuid,a.\"payerId\"::uuid,
    'sql-test-don-v5c-20261028',500);
  SELECT * INTO f FROM pdc_private.tara_v5c_reserve_intent(
    'PDC_' || pg_catalog.repeat('c',24),c.\"paymentId\"::uuid,
    c.\"quoteId\"::uuid,c.\"payerId\"::uuid,
    'sql-test-adh-v5c-20261028',2000);
  IF d.\"productId\" IS DISTINCT FROM e.\"productId\" OR
     d.\"productId\" IS DISTINCT FROM 'PDC_'||pg_catalog.repeat('a',24) OR
     d.\"linkState\" IS DISTINCT FROM 'reserved' OR
     d.\"generalLink\" IS NOT NULL OR
     d.\"amountXaf\" IS DISTINCT FROM '500' OR
     f.\"linkState\" IS DISTINCT FROM 'reserved' OR
     f.\"amountXaf\" IS DISTINCT FROM '2000' OR
     f.\"generalLink\" IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_PDC_TARA_RESERVATION_FAILED';
  END IF;
  RAISE NOTICE 'OK: commandes brutes, dossier/obligation, réservations Tara sans lien, idempotence - ROLLBACK ensuite';"""
if s.count(marker)!=1:
    raise SystemExit('ARRÊT : test de liaison V5-C.24 absent ou inattendu')
p.write_text(s.replace(marker,replacement))
print('TEST_SQL_RESERVATION_AJOUTE')
