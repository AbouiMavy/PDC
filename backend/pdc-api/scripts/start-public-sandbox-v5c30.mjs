// V5-C.30 — listener DEV explicitement activé, sur IPv4 loopback uniquement.
// Aucune émission Tara, aucune admission, aucun paiement confirmé.
import {openWriterPoolV5C30} from '../src/v5c/public-writer-pool-v5c30.mjs';
import {makeTrustedClientAddressV5C30} from '../src/v5c/trusted-client-address-v5c30.mjs';
import {composeProtectedPublicSandboxV5C29} from '../src/v5c/public-sandbox-composition-v5c29.mjs';

const env=process.env;
function config() {
  if (env.PDC_V5C30_ENABLED!=='true' || env.PDC_V5C30_ENV!=='sandbox' ||
      env.PDC_V5C30_ISSUE_LINKS!=='false' || env.NODE_ENV==='production')
    throw new Error('PDC_V5C30_START_DISABLED');
  const port=Number(env.PDC_V5C30_PORT??'8788');
  if (!Number.isInteger(port) || port<1024 || port>65535)
    throw new Error('PDC_V5C30_PORT_INVALID');
  const origin=env.PDC_V5C30_ALLOWED_ORIGIN;
  if (typeof origin!=='string' || !/^https:\/\/[^/?#]+$/.test(origin) ||
      origin.includes('@')) throw new Error('PDC_V5C30_ORIGIN_INVALID');
  const mode=env.PDC_V5C30_PROXY_MODE??'direct';
  const peers=mode==='single-proxy'?(env.PDC_V5C30_TRUSTED_PROXY_PEERS??'')
    .split(',').map(s=>s.trim()).filter(Boolean):[];
  // Pour la configuration proxy, seuls les pairs loopback sont autorisés dans ce lot.
  if (peers.some(x=>!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(x)))
    throw new Error('PDC_V5C30_PROXY_PEER_NOT_LOCAL');
  const resolveClientAddress=makeTrustedClientAddressV5C30({mode,trustedPeers:peers});
  return {port,origin,resolveClientAddress};
}

let pool,server;
try {
  const cfg=config();
  pool=await openWriterPoolV5C30({
    connectionString:env.PDC_V5C30_DATABASE_URL,
    projectRef:env.PDC_V5C30_PROJECT_REF,
    caFile:env.PDC_V5C30_DB_CA_FILE,
  });
  const app=await composeProtectedPublicSandboxV5C29({
    pool,enabled:true,environment:'sandbox',issueLinks:false,
    hmacSecret:env.PDC_V5C30_RATE_HMAC_SECRET,
    turnstileSecret:env.PDC_V5C30_TURNSTILE_SECRET,
    expectedHostname:env.PDC_V5C30_TURNSTILE_HOSTNAME,
    allowedOrigins:[cfg.origin],resolveClientAddress:cfg.resolveClientAddress,
  });
  server=app.server;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(cfg.port,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  // Ne jamais loguer env, URL DB, IP, coordonnées ni token Turnstile.
  console.log('PDC V5-C.30 DEV listening on 127.0.0.1; Tara issuance disabled.');
  const stop=async()=>{
    try{await new Promise(resolve=>server.close(resolve));}catch{/* best effort */}
    try{await pool.end();}catch{/* best effort */}
    process.exit(0);
  };
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}catch{
  if (server?.listening) try{await new Promise(resolve=>server.close(resolve));}catch{}
  if(pool)try{await pool.end();}catch{}
  console.error('PDC V5-C.30 startup blocked: inspect DEV configuration privately.');
  process.exitCode=1;
}
