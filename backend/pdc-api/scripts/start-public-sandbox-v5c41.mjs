// PDC V5-C.41 — Emission contrôlée TaraMoney Sandbox.
// Même businessId qu'en production ; clé API Sandbox distincte.
// Le paramètre sandbox est interne au PDC et n'est pas envoyé à Tara.

import {openWriterPoolV5C30}
  from '../src/v5c/public-writer-pool-v5c30.mjs';
import {makeTrustedClientAddressV5C30}
  from '../src/v5c/trusted-client-address-v5c30.mjs';
import {composeProtectedPublicSandboxV5C29}
  from '../src/v5c/public-sandbox-composition-v5c29.mjs';
import {makeTaraServerClient}
  from '../src/v5c/tara-server-client-v5c.mjs';

const env=process.env;

function publicHttps(value) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' &&
      !u.username && !u.password && !u.hash &&
      !['localhost','127.0.0.1','0.0.0.0'].includes(u.hostname) &&
      !u.hostname.endsWith('.app.github.dev') &&
      !u.hostname.endsWith('.example') &&
      !u.hostname.endsWith('.invalid');
  } catch {
    return false;
  }
}

function config() {
  const domain=env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  const codespace=env.CODESPACE_NAME;

  if (
    env.CODESPACES!=='true' ||
    !codespace ||
    domain!=='app.github.dev' ||
    env.NODE_ENV==='production' ||
    env.PDC_V5C41_ENABLED!=='true' ||
    env.PDC_V5C41_MODE!=='sandbox' ||
    env.PDC_V5C41_ISSUE_LINKS!=='true' ||
    env.PDC_V5C41_SANDBOX_KEY_CONFIRMED!=='true'
  ) throw Error('PDC_V5C41_DISABLED');

  const host=`${codespace}-5174.${domain}`;
  const origin=`https://${host}`;

  if (
    env.PDC_V5C30_ALLOWED_ORIGIN!==origin ||
    env.PDC_V5C30_TURNSTILE_HOSTNAME!==host ||
    !publicHttps(env.PDC_V5C41_WEBHOOK_URL)
  ) throw Error('PDC_V5C41_CALLBACK_ORIGIN_INVALID');

  const mode=env.PDC_V5C30_PROXY_MODE??'direct';

  if (mode!=='direct')
    throw Error('PDC_V5C41_PROXY_MODE_INVALID');

  return {
    origin,
    returnUrl:`${origin}/`,
    webHookUrl:env.PDC_V5C41_WEBHOOK_URL,
    resolveClientAddress:makeTrustedClientAddressV5C30({
      mode:'direct',
      trustedPeers:[]
    })
  };
}

let pool;
let server;

try {
  const cfg=config();

  // apiKey = clé Sandbox.
  // businessId = identifiant marchand commun aux deux modes.
  // Aucun champ environment n'est envoyé dans le JSON Tara.
  const taraClient=makeTaraServerClient({
    apiKey:env.PDC_V5C41_TARA_SANDBOX_API_KEY,
    businessId:env.PDC_V5C41_TARA_BUSINESS_ID,
    environment:'sandbox',
    allowNetwork:true
  });

  pool=await openWriterPoolV5C30({
    connectionString:env.PDC_V5C30_DATABASE_URL,
    projectRef:env.PDC_V5C30_PROJECT_REF,
    caFile:env.PDC_V5C30_DB_CA_FILE
  });

  const app=await composeProtectedPublicSandboxV5C29({
    pool,
    enabled:true,
    environment:'sandbox',
    issueLinks:true,
    taraClient,
    returnUrl:cfg.returnUrl,
    webHookUrl:cfg.webHookUrl,
    hmacSecret:env.PDC_V5C30_RATE_HMAC_SECRET,
    turnstileSecret:env.PDC_V5C30_TURNSTILE_SECRET,
    expectedHostname:env.PDC_V5C30_TURNSTILE_HOSTNAME,
    allowedOrigins:[cfg.origin],
    resolveClientAddress:cfg.resolveClientAddress
  });

  server=app.server;

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(8789,'127.0.0.1',()=>{
      server.off('error',reject);
      resolve();
    });
  });

  console.log(
    'PDC V5-C.41 SANDBOX READY — 127.0.0.1:8789'
  );
  console.log(
    'TaraMoney : emission autorisee sur commande valide uniquement.'
  );
  console.log(
    'Aucun paiement confirme automatiquement.'
  );

  async function stop() {
    try {
      await new Promise(resolve=>server.close(resolve));
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(0);
  }

  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);

} catch(error) {
  if(server?.listening) {
    try {
      await new Promise(resolve=>server.close(resolve));
    } catch {}
  }

  if(pool) {
    try {await pool.end();} catch {}
  }

  const message=String(error?.message??'');
  const safe=/^PDC_[A-Z0-9_]+$/.test(message)
    ? message
    : 'PDC_V5C41_STARTUP_FAILED';

  console.error('V5-C.41 REFUSE :',safe);
  process.exitCode=1;
}
