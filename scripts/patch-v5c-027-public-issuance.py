#!/usr/bin/env python3
"""V5-C.27: patch à ancres strictes ; une seconde exécution reste idempotente."""
from pathlib import Path

BASE=Path('backend/pdc-api/src/v5c')

def patch(path, operations, marker):
    original=path.read_text()
    if marker in original:
        print(f'OK déjà appliqué : {path}')
        return
    result=original
    for before,after in operations:
        n=result.count(before)
        if n!=1:
            raise SystemExit(f'ARRÊT SANS ÉCRITURE : {path} ancre {before[:90]!r} trouvée {n} fois')
        result=result.replace(before,after,1)
    path.write_text(result)
    print(f'PATCH : {path}')

coordinator=BASE/'tara-public-checkout-coordinator-v5c.mjs'
patch(coordinator, [
 ("import { preparePrivateCheckout, V5CError } from './contracts.mjs';",
  "import { preparePrivateCheckout, V5CError } from './contracts.mjs';\nimport { validateStoredTaraChannelLink, TARA_LINK_FIELDS } from './tara-channel-links-v5c.mjs';\n// V5C27: public channel issuance is explicitly opt-in."),
 ("  enabled=false,environment='disabled'}={}) {",
  "  taraIssuer=null,issueLinks=false,enabled=false,environment='disabled'}={}) {"),
 ("      typeof createProductId!=='function') fail('PDC_PUBLIC_COORDINATOR_DEPENDENCY_INVALID');",
  "      typeof createProductId!=='function' ||\n      (issueLinks!==false && (issueLinks!==true || typeof taraIssuer?.issue!=='function')))\n    fail('PDC_PUBLIC_COORDINATOR_DEPENDENCY_INVALID');"),
 ("    // Une requête existante « requested », « issued » ou « unknown » ne doit\n    // JAMAIS aboutir à un second appel Tara ou à un lien généraliste.\n    const status=row.linkState==='reserved'?PENDING:'manual_review';",
  """    // Émission DEV explicitement activée ; sinon comportement historique sûr.
    if (issueLinks===true) {
      const out=await taraIssuer.issue({order,row,idempotencyKey:checkout.idempotencyKey});
      if (!out || !['issued','manual_review'].includes(out.status))
        fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');
      if (out.status==='issued') {
        const expectedField=order.method==='tara'?TARA_LINK_FIELDS[order.messagingChannel]:
          TARA_LINK_FIELDS[order.method];
        if (!expectedField || out.productId!==row.productId || out.linkField!==expectedField ||
            typeof out.paymentUrl!=='string') fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');
        let safe;
        try {safe=validateStoredTaraChannelLink(out.paymentUrl,{method:order.method,
          messagingChannel:order.messagingChannel});}
        catch {fail('PDC_PUBLIC_COORDINATOR_ISSUER_INVALID');}
        return Object.freeze({status:'issued',paymentId:checkout.paymentId,
          productId:row.productId,linkField:expectedField,paymentUrl:safe.paymentUrl,
          grossAmountXaf:checkout.amountMinor,currency:'XAF',
          paymentConfirmed:false,membershipGranted:false});
      }
      return Object.freeze({status:'manual_review',paymentId:checkout.paymentId,
        grossAmountXaf:checkout.amountMinor,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false});
    }
    // Une requête existante « requested », « issued » ou « unknown » ne doit
    // JAMAIS aboutir à un second appel Tara ou à un lien généraliste.
    const status=row.linkState==='reserved'?PENDING:'manual_review';"""),
], 'V5C27: public channel issuance is explicitly opt-in.')

http=BASE/'tara-public-order-http-v5c.mjs'
patch(http, [
 ("import { V5CError } from './contracts.mjs';",
  "import { V5CError } from './contracts.mjs';\nimport { validateStoredTaraChannelLink } from './tara-channel-links-v5c.mjs';"),
 ("const MAX_BODY_BYTES = 12000;",
  "// V5C27: le HTTP ne révèle que le canal validé, jamais generalLink.\nconst MAX_BODY_BYTES = 12000;"),
 ("             'pending_external_payment','manual_review'].includes(status))",
  "             'pending_external_payment','manual_review','issued'].includes(status))"),
 ("      return respond(res,status==='manual_review'?202:201,{status,paymentId:result.paymentId,\n        grossAmountXaf:result.grossAmountXaf,currency:'XAF',\n        paymentConfirmed:false,membershipGranted:false},cors);",
  """      const publicResult={status,paymentId:result.paymentId,
        grossAmountXaf:result.grossAmountXaf,currency:'XAF',
        paymentConfirmed:false,membershipGranted:false};
      if (status==='issued') {
        if (!['smsLink','whatsappLink','telegramLink','dikaloLink','cardLink'].includes(result.linkField) ||
            typeof result.paymentUrl!=='string' || result.paymentUrl.length<7 ||
            typeof result.productId!=='string' || !/^PDC_[A-Za-z0-9_-]{24}$/.test(result.productId))
          err('PDC_PUBLIC_HTTP_RESULT_INVALID');
        const route=result.linkField==='smsLink'?{method:'mobile'}:
          result.linkField==='cardLink'?{method:'carte'}:
          {method:'tara',messagingChannel:result.linkField.slice(0,-4)};
        try {
          const safe=validateStoredTaraChannelLink(result.paymentUrl,route);
          if (safe.field!==result.linkField || safe.paymentUrl!==result.paymentUrl)
            err('PDC_PUBLIC_HTTP_RESULT_INVALID');
        } catch {err('PDC_PUBLIC_HTTP_RESULT_INVALID');}
        publicResult.productId=result.productId;
        publicResult.linkField=result.linkField;
        publicResult.paymentUrl=result.paymentUrl;
      }
      return respond(res,status==='manual_review'?202:status==='issued'?200:201,publicResult,cors);"""),
], 'V5C27: le HTTP ne révèle que le canal validé, jamais generalLink.')

channel=BASE/'tara-channel-links-v5c.mjs'
patch(channel, [
 ("  return Object.freeze({field, paymentUrl:safe[field]});\n}",
  """  return Object.freeze({field, paymentUrl:safe[field]});
}

/** V5C27: Contrôle du lien de canal déjà persisté en base privée. */
export function validateStoredTaraChannelLink(paymentUrl,{method,messagingChannel=null}={}) {
  let field;
  if (method==='mobile' && messagingChannel==null) field='smsLink';
  else if (method==='carte' && messagingChannel==null) field='cardLink';
  else if (method==='tara' && ['whatsapp','telegram','dikalo'].includes(messagingChannel))
    field=TARA_LINK_FIELDS[messagingChannel];
  else fail('PDC_TARA_CHANNEL_INVALID');
  return selectTaraPaymentLink({status:'SUCCESS',
    generalLink:'https://taramoney.com/pay/validation-only',
    [field]:paymentUrl},{method,messagingChannel});
}"""),
], 'V5C27: Contrôle du lien de canal déjà persisté en base privée.')
