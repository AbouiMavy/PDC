// V5-C.27 : assemblage inerte tant qu'un serveur DEV n'appelle pas listen().
// Les trois dépôts SQL doivent être construits avec le rôle restreint dédié.
// Aucun mot de passe Supabase ou token Tara n'est lu ici.
import {V5CError} from './contracts.mjs';
import {makeTaraPublicIssuerV5C} from './tara-public-issuer-v5c.mjs';
import {makePublicCheckoutCoordinatorV5C} from './tara-public-checkout-coordinator-v5c.mjs';
import {createPublicOrderHttpV5C} from './tara-public-order-http-v5c.mjs';
const fail=code=>{throw new V5CError(code);};
export function composePublicTaraSandboxV5C({orders,taraReservations,channelStore,taraClient,
  returnUrl,webHookUrl,enforceRateLimit,verifyHuman,allowedOrigins=[],
  resolveClientAddress,issueLinks=false,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox' || typeof issueLinks!=='boolean')
    fail('PDC_PUBLIC_COMPOSITION_DISABLED');
  if (issueLinks===true && !channelStore)
    fail('PDC_PUBLIC_COMPOSITION_CHANNEL_STORE_REQUIRED');
  const issuer=issueLinks?makeTaraPublicIssuerV5C({taraReservations,channelStore,
    taraClient,returnUrl,webHookUrl,enabled:true,environment:'sandbox'}):null;
  const service=makePublicCheckoutCoordinatorV5C({orders,taraReservations,
    taraIssuer:issuer,issueLinks,enabled:true,environment:'sandbox'});
  const server=createPublicOrderHttpV5C({repository:service,enforceRateLimit,verifyHuman,
    allowedOrigins,resolveClientAddress,enabled:true,environment:'sandbox'});
  // Retourner le serveur NON démarré. Le montage réseau exige un choix humain.
  return Object.freeze({server,service,issueLinks});
}
