// V5-C.29 — assemble les briques EXISTANTES avec protections réelles.
// NE DÉMARRE JAMAIS de listener: l'API readonly existante est séparée.
// Toutes les dépendances SQL doivent employer le login writer privé, non service_role.
import {makePublicOrderPgV5C} from './tara-public-order-pg-v5c.mjs';
import {makeTaraDevPgRepository} from './tara-dev-pg-repository-v5c.mjs';
import {makeTaraSelectedChannelPgV5C} from './tara-selected-channel-pg-v5c.mjs';
import {composePublicTaraSandboxV5C} from './tara-public-sandbox-app-v5c.mjs';
import {makePgPublicRateLimiterV5C29} from './public-rate-limit-v5c29.mjs';
import {makeTurnstileVerifierV5C29} from './turnstile-verifier-v5c29.mjs';

export async function composeProtectedPublicSandboxV5C29({pool,hmacSecret,turnstileSecret,
  expectedHostname,allowedOrigins,issueLinks=false,taraClient=null,returnUrl,webHookUrl,
  resolveClientAddress,enabled=false,environment='disabled'}={}){
  if (enabled!==true || environment!=='sandbox' || !Array.isArray(allowedOrigins) ||
      allowedOrigins.length<1)throw new Error('PUBLIC_SANDBOX_29_DISABLED');
  const orders=await makePublicOrderPgV5C({pool,enabled:true,environment:'sandbox'});
  const taraReservations=await makeTaraDevPgRepository({pool,enabled:true,environment:'sandbox'});
  const channelStore=issueLinks?await makeTaraSelectedChannelPgV5C({pool,enabled:true,environment:'sandbox'}):null;
  const enforceRateLimit=await makePgPublicRateLimiterV5C29({pool,hmacSecret,
    enabled:true,environment:'sandbox'});
  const verifyHuman=makeTurnstileVerifierV5C29({secret:turnstileSecret,expectedHostname,
    enabled:true,environment:'sandbox'});
  // issueLinks doit être explicite et seulement après vérification des vraies URLs Tara.
  const app=composePublicTaraSandboxV5C({orders,taraReservations,channelStore,taraClient,
    returnUrl,webHookUrl,enforceRateLimit,verifyHuman,
    allowedOrigins,resolveClientAddress,issueLinks,enabled:true,environment:'sandbox'});
  return Object.freeze({...app,protectorsReady:true});
}
