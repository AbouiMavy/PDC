// V5-C.24 — frontière HTTP d'une commande PUBLIQUE, DEV uniquement.
// Authentification militant NON requise. Défenses anti-abus injectées obligatoires.
// Ne crée aucun lien, ne confirme aucun paiement et n'expose aucune clé privée.
import { createServer } from 'node:http';
import {isIP} from 'node:net';
// V5C30: adresse client vérifiée avant les protections anti-abus.
import { V5CError } from './contracts.mjs';
import { validateStoredTaraChannelLink } from './tara-channel-links-v5c.mjs';

// V5C27: le HTTP ne révèle que le canal validé, jamais generalLink.
const MAX_BODY_BYTES = 12000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF = /^[\x21-\x7e]{16,4096}$/;
const err = code => { throw new V5CError(code); };
function respond(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(JSON.stringify(data));
}
async function parseBody(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || ''))
    err('PDC_PUBLIC_CONTENT_TYPE_INVALID');
  const rawLength = req.headers['content-length'];
  if (rawLength != null && (!/^\d{1,6}$/.test(rawLength) || Number(rawLength)>MAX_BODY_BYTES))
    err('PDC_PUBLIC_BODY_INVALID');
  let size=0, parts=[];
  for await (const chunk of req) {
    size+=chunk.length;
    if (size>MAX_BODY_BYTES) err('PDC_PUBLIC_BODY_INVALID');
    parts.push(chunk);
  }
  let body;
  try {body=JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch {err('PDC_PUBLIC_BODY_INVALID');}
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length!==2 || typeof body.verificationToken!=='string' ||
      !REF.test(body.verificationToken) || !body.order ||
      Array.isArray(body.order) || typeof body.order!=='object') err('PDC_PUBLIC_BODY_INVALID');
  return body;
}

/**
 * Dépendances requises au montage :
 *   repository.create(rawOrder) -> devis privé / paymentId, XAF brut,
 *   enforceRateLimit({address}) -> true, limite durable partagée entre instances,
 *   verifyHuman({token,address}) -> true, vérification prestataire SERVEUR.
 * Le serveur existant en lecture seule n'est pas modifié.
 */
export function createPublicOrderHttpV5C({repository,enforceRateLimit,verifyHuman,
  allowedOrigins=[],resolveClientAddress=(req)=>req.socket.remoteAddress,
  enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox') err('PDC_PUBLIC_HTTP_DISABLED');
  if (typeof repository?.create!=='function' || typeof enforceRateLimit!=='function' ||
      typeof verifyHuman!=='function' || typeof resolveClientAddress!=='function' ||
      !Array.isArray(allowedOrigins) ||
      allowedOrigins.length<1 || allowedOrigins.some(o=>typeof o!=='string' ||
        !/^https:\/\/[^/?#]+$/.test(o))) err('PDC_PUBLIC_HTTP_DEPENDENCY_INVALID');
  return createServer(async (req,res)=>{
    const origin=req.headers.origin;
    const allowed=typeof origin==='string' && allowedOrigins.includes(origin);
    const cors=allowed ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Allow-Methods':'POST, OPTIONS'} : {};
    const url=new URL(req.url??'/', 'http://localhost');
    if (url.pathname!=='/v1/public/orders' || url.search)
      return respond(res,404,{error:'NOT_FOUND'});
    if (!allowed) return respond(res,403,{error:'ORIGIN_DENIED'});
    if (req.method==='OPTIONS') {
      res.writeHead(204,{'Cache-Control':'no-store',...cors});return res.end();
    }
    if (req.method!=='POST')return respond(res,405,{error:'METHOD_NOT_ALLOWED'},cors);
    try {
      let address;
      try {address=resolveClientAddress(req);}
      catch {return respond(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);}
      if (typeof address!=='string' || !isIP(address))
        return respond(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);
      if (await enforceRateLimit({address})!==true)
        return respond(res,429,{error:'RATE_LIMITED'},cors);
      const body=await parseBody(req);
      if (await verifyHuman({token:body.verificationToken,address})!==true)
        return respond(res,403,{error:'VERIFICATION_REQUIRED'},cors);
      // create() revalide le tarif, la devise, le justificatif et l'idempotence
      // AVANT tout appel SQL. Le frontend ne peut pas inventer le prix d'adhésion.
      const result=await repository.create(body.order);
      if (!result || !UUID.test(result.paymentId) || result.currency!=='XAF' ||
          !/^\d{1,9}$/.test(result.grossAmountXaf) ||
          result.paymentConfirmed!==false || result.membershipGranted!==false)
        err('PDC_PUBLIC_HTTP_RESULT_INVALID');
      // Un état de réservation n'est ni une preuve de paiement ni une URL Tara.
      // La page générale multi-moyens est volontairement interdite ici.
      const status=result.status??'pending_payment_setup';
      if (!['pending_payment_setup','reserved_channel_pending',
             'pending_external_payment','manual_review','issued'].includes(status))
        err('PDC_PUBLIC_HTTP_RESULT_INVALID');
      const publicResult={status,paymentId:result.paymentId,
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
      return respond(res,status==='manual_review'?202:status==='issued'?200:201,publicResult,cors);
    } catch (error) {
      const badInput=error instanceof V5CError && (
        /^PDC_PUBLIC_(CONTENT_TYPE|BODY|ORDER|DONATION|MEMBERSHIP|PAYMENT_CHANNEL|DESIGNATION|AMOUNT)_INVALID$/.test(error.code) ||
        error.code==='PDC_DONATION_DESIGNATION_INVALID');
      return respond(res,badInput?400:503,
        {error:badInput?'INVALID_ORDER':'TEMPORARILY_UNAVAILABLE'},cors);
    }
  });
}
