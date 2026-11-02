#!/usr/bin/env python3
"""Patch strict/idempotent : expose uniquement l'état d'une réservation, sans URL.
Ne monte aucun serveur, n'ouvre aucune connexion et n'émet aucun paiement.
"""
from pathlib import Path
p=Path('backend/pdc-api/src/v5c/tara-public-order-http-v5c.mjs')
if not p.is_file(): raise SystemExit('ARRÊT : HTTP 024 absent')
s=p.read_text()
old="""      return respond(res,201,{status:'pending_payment_setup',paymentId:result.paymentId,
        grossAmountXaf:result.grossAmountXaf,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false},cors);"""
new="""      // Un état de réservation n'est ni une preuve de paiement ni une URL Tara.
      // La page générale multi-moyens est volontairement interdite ici.
      const status=result.status??'pending_payment_setup';
      if (!['pending_payment_setup','reserved_channel_pending',
             'pending_external_payment','manual_review'].includes(status))
        err('PDC_PUBLIC_HTTP_RESULT_INVALID');
      return respond(res,status==='manual_review'?202:201,{status,paymentId:result.paymentId,
        grossAmountXaf:result.grossAmountXaf,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false},cors);"""
if new in s:
    print('HTTP_024_DEJA_CORRIGE')
elif s.count(old)!=1:
    raise SystemExit('ARRÊT : signature HTTP inattendue, aucune modification')
else:
    p.write_text(s.replace(old,new));print('HTTP_024_STATUT_RESERVATION_CORRIGE')
