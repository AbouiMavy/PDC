// Serveur DEV isolé pour l'intake diaspora et les photos privées avant paiement.
// Les défenses anti-abus et Turnstile utilisent les dépendances V5-C existantes.
import {createServer} from 'node:http';
import {isIP} from 'node:net';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON=14000;
const MAX_PHOTO=5*1024*1024;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const reply=(res,code,data,cors={})=>{
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'",...cors});res.end(JSON.stringify(data));
};
async function read(req,max){
  const len=req.headers['content-length'];
  if(len!=null&&(!/^\d{1,8}$/.test(len)||Number(len)>max))throw Error('REQUEST_TOO_LARGE');
  let total=0;const parts=[];
  for await(const chunk of req){total+=chunk.length;if(total>max)throw Error('REQUEST_TOO_LARGE');parts.push(chunk);}
  if(!total)throw Error('EMPTY_REQUEST');
  return Buffer.concat(parts,total);
}
const parseJson=async req=>{
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))throw Error('INVALID_TYPE');
  return JSON.parse((await read(req,MAX_JSON)).toString('utf8'));
};
export function createDiasporaHttpR5({intake,portraits,tara,partnerEmail,enforceRateLimit,verifyHuman,
  allowedOrigins,resolveClientAddress,enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof intake?.create!=='function'||
    typeof portraits?.issue!=='function'||typeof portraits?.upload!=='function'||
    typeof tara?.create!=='function'||typeof partnerEmail?.send!=='function'||
    typeof partnerEmail?.reply!=='function'||typeof enforceRateLimit!=='function'||
    typeof verifyHuman!=='function'||typeof resolveClientAddress!=='function'||
    !Array.isArray(allowedOrigins)||!allowedOrigins.length||
    allowedOrigins.some(x=>typeof x!=='string'||!/^https:\/\/[^/?#]+$/.test(x)))throw Error('PDC_R5_HTTP_DISABLED');
  return createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(typeof origin!=='string'||!allowedOrigins.includes(origin))return reply(res,403,{error:'ORIGIN_DENIED'});
    const cors={'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Headers':'Content-Type, Authorization',
      'Access-Control-Allow-Methods':'POST, OPTIONS'};
    const url=new URL(req.url??'/', 'http://localhost');
    if(url.search || !['/v1/public/r5/diaspora','/v1/public/r5/portrait-grant','/v1/public/r5/checkout','/v1/public/r5/partner-response'].includes(url.pathname) &&
      !/^\/v1\/public\/r5\/photo\/[0-9a-f-]{36}\/(member|partner)$/.test(url.pathname))
      return reply(res,404,{error:'NOT_FOUND'},cors);
    if(req.method==='OPTIONS'){res.writeHead(204,{'Cache-Control':'no-store',...cors});return res.end();}
    if(req.method!=='POST')return reply(res,405,{error:'METHOD_NOT_ALLOWED'},cors);
    let address;
    try{address=resolveClientAddress(req);}catch{return reply(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);}
    if(typeof address!=='string'||!isIP(address))return reply(res,403,{error:'CLIENT_ADDRESS_UNTRUSTED'},cors);
    try{
      if(await enforceRateLimit({address})!==true)return reply(res,429,{error:'RATE_LIMITED'},cors);
      if(url.pathname==='/v1/public/r5/diaspora'){
        const x=await parseJson(req);
        if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!=='order,verificationToken'||
          typeof x.verificationToken!=='string'||x.verificationToken.length<16||x.verificationToken.length>4096)
          return reply(res,400,{error:'INVALID_REQUEST'},cors);
        if(await verifyHuman({token:x.verificationToken,address})!==true)return reply(res,403,{error:'VERIFICATION_REQUIRED'},cors);
        const r=await intake.create(x.order);
        let emailStatus='not_applicable';
        if(x.order.formula==='couple'&&r.sessionToken){
          try{emailStatus=await partnerEmail.send({orderId:r.orderId,sessionToken:r.sessionToken});}
          catch{emailStatus='delivery_requires_review';}
        }
        return reply(res,201,{...r,partnerEmailStatus:emailStatus},cors);
      }
      if(url.pathname==='/v1/public/r5/partner-response'){
        const x=await parseJson(req);
        if(!x||Object.keys(x).sort().join(',')!=='decision,token'||
           !/^[A-Za-z0-9_-]{43}$/.test(x.token??'')||
           !['confirmed','declined'].includes(x.decision))
           return reply(res,400,{error:'INVALID_REQUEST'},cors);
        const ok=await partnerEmail.reply(x);
        return reply(res,ok?200:410,ok?{status:'recorded'}:{error:'LINK_EXPIRED_OR_USED'},cors);
      }
      if(url.pathname==='/v1/public/r5/portrait-grant'){
        const x=await parseJson(req);
        if(!x||!ID.test(x.orderId??'')||!TOKEN.test(x.sessionToken??'')||
           !['member','partner'].includes(x.slot))return reply(res,400,{error:'INVALID_REQUEST'},cors);
        return reply(res,201,await portraits.issue(x),cors);
      }
      const match=/^\/v1\/public\/r5\/photo\/([0-9a-f-]{36})\/(member|partner)$/.exec(url.pathname);
      if(match){
        if(!ID.test(match[1])||!TOKEN.test(req.headers.authorization?.replace(/^Bearer /,'')??'')||
          !['image/png','image/jpeg'].includes(req.headers['content-type']))return reply(res,400,{error:'INVALID_REQUEST'},cors);
        const bytes=await read(req,MAX_PHOTO);
        const r=await portraits.upload({orderId:match[1],slot:match[2],
          token:req.headers.authorization.slice(7),imageBytes:bytes,mime:req.headers['content-type']});
        return reply(res,201,r,cors);
      }
      const x=await parseJson(req);
      if(!x||!ID.test(x.orderId??'')||!TOKEN.test(x.sessionToken??''))return reply(res,400,{error:'INVALID_REQUEST'},cors);
      return reply(res,200,await tara.create(x),cors);
    }catch(error){
      // Pas de PII, mot de passe, message SQL ni URL Storage dans la réponse.
      return reply(res,error?.message==='REQUEST_TOO_LARGE'?413:503,
        {error:error?.message==='REQUEST_TOO_LARGE'?'REQUEST_TOO_LARGE':'MANUAL_REVIEW_OR_UNAVAILABLE'},cors);
    }
  });
}
