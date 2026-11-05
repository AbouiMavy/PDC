// T12 : choix explicite du parcours, sans déclencher de paiement côté client.
export const MOBILE_MONEY_MODES = Object.freeze(['sms','direct']);
export function normaliseMobileCameroonT12(value) {
  if (typeof value !== 'string') throw Error('PDC_T12_PHONE_INVALID');
  const cleaned=value.replace(/[\s().-]/g,'');
  const local=cleaned.startsWith('+237')?cleaned.slice(4):cleaned.startsWith('237')?cleaned.slice(3):cleaned;
  if (!/^6\d{8}$/.test(local)) throw Error('PDC_T12_PHONE_INVALID');
  return Object.freeze({local, phoneE164:'+237'+local, providerPhone:'237'+local});
}
export function prepareMobileSelectionT12({method,mobileMode='sms',mobilePhone=''}={}) {
  if (method!=='mobile') return null;
  if (!MOBILE_MONEY_MODES.includes(mobileMode)) throw Error('PDC_T12_MODE_INVALID');
  if (mobileMode==='sms') return Object.freeze({mobileMode:'sms',phoneE164:null});
  return Object.freeze({mobileMode:'direct',phoneE164:normaliseMobileCameroonT12(mobilePhone).phoneE164});
}
