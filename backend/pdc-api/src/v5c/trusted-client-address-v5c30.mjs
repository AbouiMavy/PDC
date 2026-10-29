// V5-C.30 — adresse client dérivée uniquement de la connexion TCP de confiance.
// Un en-tête X-Forwarded-For envoyé directement par un visiteur est toujours rejeté.
import {isIP} from 'node:net';

const clean = value => {
  if (typeof value !== 'string' || value.length>80 || value!==value.trim() ||
      !isIP(value)) return null;
  return value;
};
const one = value => typeof value==='string' && value.length>0 &&
  !value.includes(',') && !value.includes(' ') && !value.includes('\t');

export function makeTrustedClientAddressV5C30({mode='direct',trustedPeers=[]}={}) {
  if (!['direct','single-proxy'].includes(mode) ||
      !Array.isArray(trustedPeers) ||
      trustedPeers.some(x=>clean(x)!==x) ||
      (mode==='single-proxy' && !trustedPeers.length))
    throw new Error('PDC_V5C30_PROXY_CONFIG_INVALID');
  const peers=new Set(trustedPeers);
  return function resolveClientAddress(req) {
    const socketAddress=clean(req?.socket?.remoteAddress);
    if (!socketAddress) throw new Error('PDC_V5C30_UNTRUSTED_PEER');
    const headers=req.headers??{};
    // Ne jamais mélanger conventions (Forwarded, CF-Connecting-IP, X-Real-IP).
    if (headers.forwarded!==undefined || headers['x-real-ip']!==undefined ||
        headers['cf-connecting-ip']!==undefined)
      throw new Error('PDC_V5C30_UNTRUSTED_FORWARDING');
    if (mode==='direct') {
      if (headers['x-forwarded-for']!==undefined) throw new Error('PDC_V5C30_UNTRUSTED_FORWARDING');
      return socketAddress;
    }
    // Le proxy doit ÊTRE le pair réseau observé ET remplacer tout en-tête entrant.
    if (!peers.has(socketAddress)) throw new Error('PDC_V5C30_UNTRUSTED_PEER');
    const forwarded=headers['x-forwarded-for'];
    if (!one(forwarded) || !clean(forwarded)) throw new Error('PDC_V5C30_UNTRUSTED_FORWARDING');
    return forwarded;
  };
}
