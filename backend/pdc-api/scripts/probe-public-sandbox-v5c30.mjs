// V5-C.30 : uniquement des essais négatifs, AUCUNE commande / réservation / paiement.
// Usage : PDC_V5C30_PROBE_ORIGIN=https://dev.example.test node .../probe...
const origin=process.env.PDC_V5C30_PROBE_ORIGIN;
const port=Number(process.env.PDC_V5C30_PORT??8788);
if (!/^https:\/\/[^/?#]+$/.test(origin??'') || !Number.isInteger(port) || port<1024 || port>65535)
  throw new Error('PDC_V5C30_PROBE_CONFIG_INVALID');
const url=`http://127.0.0.1:${port}/v1/public/orders`;
const request=async headers=>{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',origin,...headers},
    body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)});
  return r.status;
};
const spoof=await request({'x-forwarded-for':'198.51.100.2, 198.51.100.3'});
if(spoof!==403)throw new Error('PDC_V5C30_PROBE_SPOOF_NOT_BLOCKED');
const wrongOrigin=await fetch(url,{method:'OPTIONS',headers:{origin:'https://forbidden.invalid'},
  redirect:'error',signal:AbortSignal.timeout(5000)});
if(wrongOrigin.status!==403)throw new Error('PDC_V5C30_PROBE_ORIGIN_NOT_BLOCKED');
console.log('PDC V5-C.30: proxy spoof et origine inconnue refusés ; aucun paiement ou ordre demandé.');
