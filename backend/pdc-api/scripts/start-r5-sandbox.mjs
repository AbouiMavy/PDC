// PDC R5 : API diaspora privée, démarrage volontaire Codespaces + Sandbox uniquement.
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {makeDiasporaR5Repository} from '../src/r5/diaspora-repository.mjs';
import {makeProvisionalPhotoRepositoryR5} from '../src/r5/provisional-portrait-repository.mjs';
import {createProvisionalStorageR5} from '../src/r5/provisional-private-storage.mjs';
import {makeProvisionalPortraitR5} from '../src/r5/portrait-provisional.mjs';
import {makeDiasporaTaraR5} from '../src/r5/tara-diaspora-r5.mjs';
import {makePartnerEmailR51,makeResendSenderR51} from '../src/r5/partner-email-r5.mjs';
import {createDiasporaHttpR5} from '../src/r5/diaspora-http-r5.mjs';
import {openWriterPoolV5C30} from '../src/v5c/public-writer-pool-v5c30.mjs';
import {makePgPublicRateLimiterV5C29} from '../src/v5c/public-rate-limit-v5c29.mjs';
import {makeTurnstileVerifierV5C29} from '../src/v5c/turnstile-verifier-v5c29.mjs';
import {makeTrustedClientAddressV5C30} from '../src/v5c/trusted-client-address-v5c30.mjs';
import {makeTaraServerClient} from '../src/v5c/tara-server-client-v5c.mjs';
const env=process.env;
const REF='rvgpnmznhzwlzqyefahd';
const caPath=env.PDC_V5C30_DB_CA_FILE;
const pools=[];let server;
function check(){
  if(env.CODESPACES!=='true'||env.NODE_ENV==='production'||
    env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN!=='app.github.dev'||
    !/^[a-z0-9-]{5,100}$/.test(env.CODESPACE_NAME??'')||
    env.PDC_R5_ENABLED!=='true'||env.PDC_R5_MODE!=='sandbox'||
    env.PDC_R5_LINKS_ENABLED!=='true'||env.PDC_R5_SANDBOX_KEY_CONFIRMED!=='true'||
    env.PDC_R5_PROJECT_REF!==REF||
    typeof caPath!=='string'||!caPath.startsWith('/')||
    typeof env.PDC_R5_STORAGE_SERVICE_KEY!=='string'||
    typeof env.PDC_R5_TARA_SANDBOX_API_KEY!=='string'||
    typeof env.PDC_R5_TARA_BUSINESS_ID!=='string'||
    typeof env.PDC_R51_RESEND_API_KEY!=='string'||
    typeof env.PDC_R51_EMAIL_FROM!=='string'||
    !/^https:\/\/rvgpnmznhzwlzqyefahd\.supabase\.co\/functions\/v1\/pdc-tara-webhook\?token=[A-Za-z0-9_-]{64}$/.test(env.PDC_R5_WEBHOOK_URL??''))
    throw Error('PDC_R5_START_DENIED');
  const host=`${env.CODESPACE_NAME}-5174.app.github.dev`;
  const origin=`https://${host}`;
  if(env.PDC_R5_ALLOWED_ORIGIN!==origin||env.PDC_R5_TURNSTILE_HOSTNAME!==host)
    throw Error('PDC_R5_ORIGIN_DENIED');
  return {origin,host};
}
async function limitedPool(url,role){
  if(typeof url!=='string'||url.length>4096||!['pdc_r5_intake_writer','pdc_r5_photo_writer'].includes(role))
    throw Error('PDC_R5_DB_CONFIG_DENIED');
  let u;
  try{u=new URL(url);}catch{throw Error('PDC_R5_DB_URL_DENIED');}
  const direct=u.hostname===`db.${REF}.supabase.co`&&u.port==='5432'&&decodeURIComponent(u.username)===role;
  const pooler=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname)&&
    ['5432','6543'].includes(u.port)&&decodeURIComponent(u.username)===`${role}.${REF}`;
  if(!['postgres:','postgresql:'].includes(u.protocol)||u.pathname!=='/postgres'||
     !u.password||u.search||u.hash||!direct&&!pooler)throw Error('PDC_R5_DB_IDENTITY_DENIED');
  const ca=readFileSync(caPath,'utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----'))throw Error('PDC_R5_DB_CA_DENIED');
  const pool=new Pool({connectionString:url,ssl:{ca,rejectUnauthorized:true},max:2,
    idleTimeoutMillis:15000,connectionTimeoutMillis:5000,statement_timeout:5000});
  pools.push(pool);
  const r=await pool.query('SELECT current_user AS role_name');
  if(r.rows?.[0]?.role_name!==role)throw Error('PDC_R5_DB_ROLE_DENIED');
  return pool;
}
try {
  const {origin,host}=check();
  const [intakePool,photoPool]=await Promise.all([
    limitedPool(env.PDC_R5_INTAKE_DATABASE_URL,'pdc_r5_intake_writer'),
    limitedPool(env.PDC_R5_PHOTO_DATABASE_URL,'pdc_r5_photo_writer')]);
  const ratePool=await openWriterPoolV5C30({connectionString:env.PDC_V5C30_DATABASE_URL,
    projectRef:REF,caFile:caPath});pools.push(ratePool);
  const intake=await makeDiasporaR5Repository({pool:intakePool,enabled:true,environment:'sandbox'});
  const photoDb=await makeProvisionalPhotoRepositoryR5({pool:photoPool,enabled:true,environment:'sandbox'});
  const storage=createProvisionalStorageR5({projectRef:REF,serviceKey:env.PDC_R5_STORAGE_SERVICE_KEY});
  const portraits=makeProvisionalPortraitR5({intake,db:photoDb,storage});
  const partnerEmail=await makePartnerEmailR51({pool:intakePool,
    sendEmail:makeResendSenderR51({apiKey:env.PDC_R51_RESEND_API_KEY,from:env.PDC_R51_EMAIL_FROM}),
    siteOrigin:origin,enabled:true,environment:'sandbox'});
  const taraClient=makeTaraServerClient({apiKey:env.PDC_R5_TARA_SANDBOX_API_KEY,
    businessId:env.PDC_R5_TARA_BUSINESS_ID,environment:'sandbox',allowNetwork:true});
  const tara=await makeDiasporaTaraR5({pool:intakePool,taraClient,enabled:true,environment:'sandbox',
    returnUrl:`${origin}/retour-paiement?kind=adhesion`,webHookUrl:env.PDC_R5_WEBHOOK_URL});
  const enforceRateLimit=await makePgPublicRateLimiterV5C29({pool:ratePool,
    hmacSecret:env.PDC_V5C30_RATE_HMAC_SECRET,maxHits:12,enabled:true,environment:'sandbox'});
  const verifyHuman=makeTurnstileVerifierV5C29({secret:env.PDC_R5_TURNSTILE_SECRET,
    expectedHostname:host,enabled:true,environment:'sandbox'});
  server=createDiasporaHttpR5({intake,portraits,tara,partnerEmail,enforceRateLimit,verifyHuman,
    allowedOrigins:[origin],resolveClientAddress:makeTrustedClientAddressV5C30({mode:'direct',trustedPeers:[]}),
    enabled:true,environment:'sandbox'});
  await new Promise((resolve,reject)=>server.listen(8790,'127.0.0.1',e=>e?reject(e):resolve()));
  console.log('PDC R5 SANDBOX uniquement : 127.0.0.1:8790. Pas de paiement confirmé.');
  async function stop(){if(server?.listening)await new Promise(r=>server.close(r));
    await Promise.allSettled(pools.map(p=>p.end()));process.exit(0);}
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(e){
  if(server?.listening)await new Promise(r=>server.close(r));
  await Promise.allSettled(pools.map(p=>p.end()));
  console.error('PDC R5 START REFUSÉ :',/^PDC_R5_[A-Z_]+$/.test(e?.message??'')?e.message:'PDC_R5_START_FAILED');
  process.exitCode=1;
}
