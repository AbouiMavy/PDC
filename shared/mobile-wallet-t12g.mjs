// T12-G — contrat commun navigateur/serveur, aucune operation reseau.
// Pays du portefeuille INDEPENDANT de la residence du contributeur.
// Indicatifs E.164; validation structurelle volontairement prudente :
// le prestataire reste responsable de verifier l'existence et l'eligibilite du compte.
const ENTRIES = [
  ['BJ','229','Bénin','Benin'],
  ['BF','226','Burkina Faso','Burkina Faso'],
  ['CM','237','Cameroun','Cameroon'],
  ['CG','242','Congo-Brazzaville','Congo (Brazzaville)'],
  ['CD','243','RD Congo','DR Congo'],
  ['CI','225','Côte d’Ivoire','Côte d’Ivoire'],
  ['GA','241','Gabon','Gabon'],
  ['GH','233','Ghana','Ghana'],
  ['KE','254','Kenya','Kenya'],
  ['RW','250','Rwanda','Rwanda'],
  ['SN','221','Sénégal','Senegal'],
  ['SL','232','Sierra Leone','Sierra Leone'],
  ['UG','256','Ouganda','Uganda'],
  ['TZ','255','Tanzanie','Tanzania'],
  ['ZM','260','Zambie','Zambia'],
];
export const MOBILE_WALLET_COUNTRIES_T12G = Object.freeze(ENTRIES.map(
  ([code,dialCode,fr,en])=>Object.freeze({code,dialCode,fr,en,wave:code==='SN'||code==='CI'})
));
const COUNTRIES = new Map(MOBILE_WALLET_COUNTRIES_T12G.map(c=>[c.code,c]));
const reject = ()=>{throw Error('PDC_T12G_WALLET_INVALID');};
export function mobileWalletCountryT12G(code) {
  const c=COUNTRIES.get(code);
  if(!c)reject();
  return c;
}
export function normalizeMobileWalletT12G({mobileCountry,mobilePhone,mobileNetwork=null}={}) {
  const country=mobileWalletCountryT12G(mobileCountry);
  if(mobileNetwork!==null && mobileNetwork!==undefined && mobileNetwork!=='Wave')reject();
  if(mobileNetwork==='Wave' && !country.wave)reject();
  if(typeof mobilePhone!=='string'||mobilePhone.length>40||
      !/^[\d+().\s-]+$/.test(mobilePhone))reject();
  const input=mobilePhone.replace(/[\s().-]/g,'');
  if(!/^(?:\+?[0-9]+)$/.test(input))reject();
  const digits=input.startsWith('+')?input.slice(1):input;
  const hasInternationalPrefix=input.startsWith('+');
  if(hasInternationalPrefix && !digits.startsWith(country.dialCode))reject();
  let local=digits;
  if(digits.startsWith(country.dialCode)){
    // On ne supprime l'indicatif que si le reste ressemble a un numero national.
    const rest=digits.slice(country.dialCode.length);
    if(rest.length>=7 && rest.length<=12)local=rest;
    else if(hasInternationalPrefix)reject();
  }
  if(hasInternationalPrefix && local===digits)reject();
  // Indicatif national 0: CI (10 chiffres) et BJ (nouveau format 01...)
  // le conservent; certains autres pays retirent 0 du format national.
  if(!hasInternationalPrefix && !digits.startsWith(country.dialCode) &&
      local.startsWith('0') && !['CI','BJ'].includes(country.code) && local.length>=10)
    local=local.slice(1);
  if(!/^\d{7,12}$/.test(local))reject();
  if(country.code==='CM' && !/^6\d{8}$/.test(local))reject();
  if(country.code==='SN' && local.length!==9)reject();
  if(country.code==='CI' && local.length!==10)reject();
  if(country.code==='BJ' && local.length!==10)reject();
  const providerPhone=country.dialCode+local;
  if(!/^[1-9]\d{8,14}$/.test(providerPhone))reject();
  return Object.freeze({mobileCountry:country.code,mobileNetwork:mobileNetwork??null,
    local,phoneE164:'+'+providerPhone,providerPhone});
}
