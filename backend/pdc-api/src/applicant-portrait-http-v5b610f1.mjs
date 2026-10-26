// Serveur DEV facultatif, jamais monte sur le port de production/portail.
// Un token E2 est une capacite d'ecriture, jamais une identite partageable.
import { createServer } from 'node:http';
import { MAX_PORTRAIT_BYTES } from './portrait-policy.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^Bearer ([A-Za-z0-9_-]{43})$/;
const MAX=MAX_PORTRAIT_BYTES;
function reply(res,code,payload,origin=null) {
  res.writeHead(code,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'",
    ...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),
  });
  res.end(JSON.stringify(payload));
}
async function readLimited(req) {
  const raw=req.headers['content-length'];
  if (raw!==undefined && (!/^(0|[1-9][0-9]*)$/.test(raw)||Number(raw)>MAX))
    throw new Error('PDC_APPLICANT_IMAGE_TOO_LARGE');
  let total=0;const chunks=[];
  for await (const chunk of req) {
    total+=chunk.length;
    if (total>MAX) throw new Error('PDC_APPLICANT_IMAGE_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!total) throw new Error('PDC_APPLICANT_IMAGE_EMPTY');
  return Buffer.concat(chunks,total);
}
export function createApplicantPortraitDevServerV5B610F1({ingest,allowedOrigins=[]}) {
  if(typeof ingest?.submit!=='function' || !Array.isArray(allowedOrigins) ||
     !allowedOrigins.length || allowedOrigins.some(x=>!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(x)))
    throw new Error('PDC_APPLICANT_DEV_HTTP_CONFIG_DENIED');
  return createServer(async(req,res)=>{
    const origin=req.headers.origin;
    const allowed=typeof origin==='string' && allowedOrigins.includes(origin);
    if (!allowed) return reply(res,403,{error:'ORIGIN_DENIED'});
    if (req.method==='OPTIONS') {
      res.writeHead(204,{
        'Cache-Control':'no-store',
        'Access-Control-Allow-Origin':origin,
        'Access-Control-Allow-Methods':'POST, OPTIONS',
        'Access-Control-Allow-Headers':'Authorization, Content-Type, X-PDC-Card-Request-Id',
        'Vary':'Origin',
      }); return res.end();
    }
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    if(pathname!=='/v1/dev/applicant-portrait' || req.method!=='POST')
      return reply(res,404,{error:'NOT_FOUND'},origin);
    const token=TOKEN.exec(req.headers.authorization??'')?.[1];
    const cardRequestId=req.headers['x-pdc-card-request-id'];
    const mime=req.headers['content-type'];
    if (!token || typeof cardRequestId!=='string' || !UUID.test(cardRequestId) ||
        !['image/jpeg','image/png'].includes(mime))
      return reply(res,400,{error:'INVALID_REQUEST'},origin);
    try {
      const imageBytes=await readLimited(req);
      const response=await ingest.submit({cardRequestId,uploadToken:token,imageBytes,declaredMime:mime});
      return reply(res,200,response,origin);
    } catch(error) {
      // Jamais d'exception SQL, hash/token, objet Storage ou adresse de base dans le retour.
      const badBody=error?.message==='PDC_APPLICANT_IMAGE_TOO_LARGE';
      return reply(res,badBody?413:403,
        {error:badBody?'IMAGE_TOO_LARGE':'UPLOAD_DENIED_OR_UNAVAILABLE'},origin);
    }
  });
}
