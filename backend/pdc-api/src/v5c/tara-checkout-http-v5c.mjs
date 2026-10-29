// V5-C — endpoint checkout de développement uniquement ; aucune comptabilisation.
// Le chargeur privé doit authentifier l'appartenance du paiement à l'utilisateur.
import { createServer } from 'node:http';
import { bearerToken, AuthError } from '../auth.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9:_-]{16,128}$/;
const MAX_BODY_BYTES = 2048;

function respond(res, status, data, cors = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...cors,
  });
  res.end(JSON.stringify(data));
}

async function readCheckoutRequest(req) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) {
    return null;
  }
  const advertised = Number(req.headers['content-length']);
  if (req.headers['content-length'] !== undefined &&
      (!Number.isSafeInteger(advertised) || advertised < 0 || advertised > MAX_BODY_BYTES)) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return null; }
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 2 || !Object.hasOwn(body, 'paymentId') ||
      !Object.hasOwn(body, 'idempotencyKey') ||
      typeof body.paymentId !== 'string' || !UUID.test(body.paymentId) ||
      typeof body.idempotencyKey !== 'string' || !KEY.test(body.idempotencyKey)) return null;
  return {paymentId:body.paymentId.toLowerCase(),idempotencyKey:body.idempotencyKey};
}

/** Aucun montage dans l'app d'administration V5-B.
 * loadAuthorizedCheckout({userId,paymentId}) DOIT consulter la DB privée,
 * contrôler l'appartenance au payeur, et retourner {quote, paymentId}.
 * La quote doit être produite par quoteFromPrivateDb ; elle est ensuite
 * revalidée par makeTaraDevService avant toute réservation ou émission de lien.
 */
export function createTaraCheckoutHttpApp({verifyUser,loadAuthorizedCheckout,service,
  allowedOrigins=[],enabled=false,environment='disabled'}={}) {
  if (enabled !== true || environment !== 'sandbox') throw new Error('PDC_TARA_HTTP_DISABLED');
  if (typeof verifyUser !== 'function' || typeof loadAuthorizedCheckout !== 'function' ||
      typeof service?.initiate !== 'function' || !Array.isArray(allowedOrigins) ||
      !allowedOrigins.length || allowedOrigins.some(x=>typeof x !== 'string' ||
        !/^https:\/\/[^/?#]+$/.test(x))) throw new Error('PDC_TARA_HTTP_DEPENDENCY_INVALID');

  return createServer(async (req,res)=>{
    const origin = req.headers.origin;
    const allowed = typeof origin === 'string' && allowedOrigins.includes(origin);
    const cors = allowed ? {
      'Access-Control-Allow-Origin':origin,
      Vary:'Origin',
      'Access-Control-Allow-Headers':'Authorization, Content-Type',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
    } : {};
    let target;
    try { target = new URL(req.url ?? '/', 'http://localhost'); }
    catch { return respond(res,400,{error:'INVALID_REQUEST_URL'}); }
    if (target.pathname !== '/v1/tara/checkouts' || target.search) {
      return respond(res,404,{error:'NOT_FOUND'});
    }
    if (!allowed) return respond(res,403,{error:'ORIGIN_DENIED'});
    if (req.method === 'OPTIONS') {
      res.writeHead(204,{'Cache-Control':'no-store',...cors});
      return res.end();
    }
    if (req.method !== 'POST') return respond(res,405,{error:'METHOD_NOT_ALLOWED'},cors);
    const token = bearerToken(req.headers.authorization);
    if (!token) return respond(res,401,{error:'AUTH_REQUIRED'},cors);
    try {
      const user = await verifyUser(token);
      if (!user || typeof user.id !== 'string' || !UUID.test(user.id)) {
        return respond(res,401,{error:'INVALID_SESSION'},cors);
      }
      const request = await readCheckoutRequest(req);
      if (!request) return respond(res,400,{error:'INVALID_CHECKOUT_REQUEST'},cors);
      // Le corps ne transporte ni montant, ni devise, ni payeur, ni devis.
      const authorized = await loadAuthorizedCheckout({userId:user.id,paymentId:request.paymentId});
      if (!authorized || authorized.paymentId !== request.paymentId || !authorized.quote) {
        return respond(res,404,{error:'PAYMENT_NOT_FOUND'},cors);
      }
      const result = await service.initiate({quote:authorized.quote,
        paymentId:request.paymentId,idempotencyKey:request.idempotencyKey});
      if (result?.status === 'issued' && typeof result.generalLink === 'string') {
        return respond(res,200,{status:'issued',productId:result.productId,
          paymentUrl:result.generalLink,paymentConfirmed:false},cors);
      }
      if (result?.status === 'manual_review') return respond(res,202,{
        status:'manual_review',productId:result.productId,paymentConfirmed:false},cors);
      return respond(res,503,{error:'CHECKOUT_UNAVAILABLE'},cors);
    } catch (error) {
      if (error instanceof AuthError) return respond(res,error.status,{error:error.code},cors);
      // Aucun corps Tara, aucune clé, aucune information privée retournée.
      return respond(res,503,{error:'CHECKOUT_UNAVAILABLE'},cors);
    }
  });
}
