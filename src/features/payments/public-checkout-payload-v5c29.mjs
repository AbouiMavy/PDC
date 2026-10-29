// V5-C.29 — adaptation locale des deux formulaires vers le contrat public V5-C.23.
// Aucune requête, secret ni autorisation de paiement dans ce fichier.
const METHODS = new Set(['mobile', 'tara', 'carte', 'virement']);
const PURPOSES = ['scrutateurs','cautionnements','campagne','autres'];
const positive = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>=0;
const fail = code => { throw new Error(code); };

function common({firstName,lastName,email,phoneE164,country,method,messagingChannel},idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey)) fail('INVALID_REFERENCE');
  if (!METHODS.has(method) || (method==='tara' && !['general','whatsapp','telegram','dikalo'].includes(messagingChannel)) ||
      (method!=='tara' && messagingChannel!=null)) fail('INVALID_CHANNEL');
  if (![firstName,lastName,email,phoneE164,country].every(x=>typeof x==='string' && x.length>0)) fail('MISSING_IDENTITY');
  return {idempotencyKey,firstName,lastName,email,phoneE164,country,method,
    ...(method==='tara'?{messagingChannel}: {})};
}

/** Répartir exactement 10 000 points de base sans virgules flottantes.
 * Les restes sont attribués à la plus grande fraction (ordre déterministe).
 * Une petite destination non représentable en 0,01 % est REFUSÉE, jamais écartée.
 */
export function allocationInBasisPoints(montant, repartition) {
  if (!positive(montant) || Number(montant)<100 || Number(montant)>100000000) fail('INVALID_AMOUNT');
  if (PURPOSES.some(key=>repartition?.[key]!=null && repartition[key]!=='' && !positive(repartition[key])))
    fail('INVALID_ALLOCATION');
  const active=PURPOSES.filter(key=>positive(repartition?.[key]) && Number(repartition[key])>0)
    .map(key=>({purpose:key,amount:BigInt(repartition[key])}));
  const total=active.reduce((s,x)=>s+x.amount,0n);
  if (!active.length || total!==BigInt(montant)) fail('INVALID_ALLOCATION');
  const results=active.map((x,i)=>{
    const scaled=x.amount*10000n;
    return {...x,i,bps:Number(scaled/total),remainder:scaled%total};
  });
  let rest=10000-results.reduce((s,x)=>s+x.bps,0);
  const byRemainder=[...results].sort((a,b)=> a.remainder===b.remainder?a.i-b.i:(a.remainder>b.remainder?-1:1));
  for(let k=0;k<rest;k++) byRemainder[k].bps++;
  if (results.some(x=>x.bps<1)) fail('ALLOCATION_TOO_SMALL');
  return results.map(x=>({purpose:x.purpose,percentBps:x.bps}));
}

export function buildPublicOrderPayload({source,data,idempotencyKey}={}) {
  if (!data || typeof data!=='object' || Array.isArray(data)) fail('INVALID_DATA');
  if (source==='donation') {
    if (data.periodicite!=='ponctuel') fail('MONTHLY_NOT_AVAILABLE');
    if (data.anonymePublic===true) fail('ANONYMITY_NOT_YET_SUPPORTED');
    if (!positive(data.montant) || Number(data.montant)<100 || Number(data.montant)>100000000) fail('INVALID_AMOUNT');
    const base=common({firstName:data.prenom,lastName:data.nom,email:data.email,
      phoneE164:data.telephoneE164,country:data.pays,method:data.methode,
      messagingChannel:data.methode==='tara'?data.messagerie:null},idempotencyKey);
    const designations=data.affectation==='libre'?[{purpose:'libre',percentBps:10000}]:
      data.affectation==='ciblee'?allocationInBasisPoints(data.montant,data.repartition):fail('INVALID_ALLOCATION');
    return Object.freeze({kind:'donation',...base,amountXaf:String(data.montant),
      designations,donorDeclaration:true});
  }
  if (source==='membership') {
    const f=data.form;
    if (!f || f.type!=='nouvelle' || f.pays!=='CM' || f.formule==='couple') fail('MEMBERSHIP_SCOPE');
    if (f.modeCotisation!=='aucun' || data.amounts?.totalImmediate!==2000 ||
        f.demandeCarte===true) fail('MEMBERSHIP_COMPLEX_NOT_YET_SUPPORTED');
    if (!f.accepteStatuts || !f.accepteDonnees) fail('MISSING_CONSENT');
    const base=common({firstName:f.prenom,lastName:f.nom,email:f.email,
      phoneE164:'+237'+String(f.telephone||'').replace(/[\s().-]/g,''),
      country:'CM',method:data.methode,
      messagingChannel:data.methode==='tara'?data.messagerie:null},idempotencyKey);
    return Object.freeze({kind:'initial_membership',...base,dob:f.dateNaissance,
      birthPlace:f.lieuNaissance,civility:f.civilite,memberCategory:f.categorie,
      acceptedStatutes:true,acceptedDataNotice:true});
  }
  fail('INVALID_SOURCE');
}

const PROVIDER_HOSTS = new Set(['taramoney.com','www.taramoney.com','dklo.co','www.dklo.co',
  'wa.me','api.whatsapp.com','web.whatsapp.com','whatsapp.com','www.whatsapp.com',
  't.me','telegram.me','www.telegram.me','dikalo.com','www.dikalo.com','dikalo.co','www.dikalo.co']);
const fieldFor = (method,channel) => method==='mobile'?'smsLink':method==='carte'?'cardLink':
  method==='tara'?({general:'generalLink',whatsapp:'whatsappLink',telegram:'telegramLink',dikalo:'dikaloLink'}[channel]??null):null;
/** Validation de défense en profondeur sur le navigateur; seule l'API est autorité. */
export function validatePublicCheckoutResponse(response, method, messagingChannel=null) {
  if (!response || typeof response!=='object' || Array.isArray(response) ||
    response.currency!=='XAF' || response.paymentConfirmed!==false ||
    response.membershipGranted!==false || !/^[0-9a-f-]{36}$/i.test(response.paymentId||'') ||
    !/^[1-9]\d{0,8}$/.test(response.grossAmountXaf||'')) fail('INVALID_SERVER_RESPONSE');
  if (!['issued','reserved_channel_pending','pending_payment_setup','pending_external_payment','manual_review'].includes(response.status)) fail('INVALID_SERVER_RESPONSE');
  if (response.status==='issued') {
    if (response.linkField!==fieldFor(method,messagingChannel) ||
        typeof response.paymentUrl!=='string' || response.paymentUrl.length>2048) fail('WRONG_CHANNEL');
    const url=response.paymentUrl;
    if (response.linkField==='smsLink' && /^sms:/i.test(url)) {
      if (!/^sms:(?:\+[1-9][0-9]{6,14})?(?:\?body=[A-Za-z0-9._~%\-]*)?$/i.test(url)) fail('UNSAFE_URL');
      return Object.freeze(response);
    }
    let parsed;
    try {parsed=new URL(url);}catch{fail('UNSAFE_URL');}
    if (parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.hash ||
        !PROVIDER_HOSTS.has(parsed.hostname.toLowerCase())) fail('UNSAFE_URL');
    if (response.linkField==='cardLink' &&
        (!['taramoney.com','www.taramoney.com'].includes(parsed.hostname) || !/^\/(?:card|cardpay)\/.+/.test(parsed.pathname))) fail('WRONG_CHANNEL');
    if (response.linkField==='generalLink' &&
        (!['taramoney.com','www.taramoney.com'].includes(parsed.hostname) || !/^\/pay\/.+/.test(parsed.pathname))) fail('WRONG_CHANNEL');
    if (parsed.pathname.startsWith('/pay/') && response.linkField!=='generalLink') fail('GENERIC_LINK_FORBIDDEN');
  } else if (response.paymentUrl!=null || response.linkField!=null) fail('PREMATURE_URL');
  return Object.freeze(response);
}
