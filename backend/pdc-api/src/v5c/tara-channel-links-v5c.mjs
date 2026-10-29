// V5-C.26 — sélection strictement par canal depuis la réponse VALIDÉE de Tara.
// Jamais de généralisation silencieuse vers generalLink.
import { parseTaraLinkResponse } from './tara-server-client-v5c.mjs';
import { V5CError } from './contracts.mjs';

const fail = code => { throw new V5CError(code); };
export const TARA_LINK_FIELDS = Object.freeze({
  mobile: 'smsLink',
  whatsapp: 'whatsappLink',
  telegram: 'telegramLink',
  dikalo: 'dikaloLink',
  carte: 'cardLink',
  general: 'generalLink',
});

export function selectTaraPaymentLink(links, {method, messagingChannel = null} = {}) {
  let field;
  if (method === 'mobile' && messagingChannel == null) field = TARA_LINK_FIELDS.mobile;
  else if (method === 'carte' && messagingChannel == null) field = TARA_LINK_FIELDS.carte;
  else if (method === 'tara' && ['general','whatsapp','telegram','dikalo'].includes(messagingChannel))
    field = TARA_LINK_FIELDS[messagingChannel];
  else fail('PDC_TARA_CHANNEL_INVALID');
  if (!links || typeof links !== 'object' || Array.isArray(links) ||
      (Object.hasOwn(links,'status') && !['success','SUCCESS'].includes(links.status)))
    fail('PDC_TARA_LINK_NOT_CREATED');
  // Revalidation indépendante : les URL ne doivent jamais être prises telles quelles
  // depuis une requête HTTP, un webhook ou une ligne fournisseur corrompue.
  const safe = parseTaraLinkResponse({
    status:'SUCCESS',
    generalLink:links.generalLink,
    [field]:links[field]
  });
  if (typeof safe[field] !== 'string' || safe[field].length === 0)
    fail('PDC_TARA_CHANNEL_LINK_UNAVAILABLE');
  return Object.freeze({field, paymentUrl:safe[field]});
}

/** V5C27: Contrôle du lien de canal déjà persisté en base privée. */
export function validateStoredTaraChannelLink(paymentUrl,{method,messagingChannel=null}={}) {
  let field;
  if (method==='mobile' && messagingChannel==null) field='smsLink';
  else if (method==='carte' && messagingChannel==null) field='cardLink';
  else if (method==='tara' && ['general','whatsapp','telegram','dikalo'].includes(messagingChannel))
    field=TARA_LINK_FIELDS[messagingChannel];
  else fail('PDC_TARA_CHANNEL_INVALID');
  return selectTaraPaymentLink({status:'SUCCESS',
    generalLink:'https://taramoney.com/pay/validation-only',
    [field]:paymentUrl},{method,messagingChannel});
}
