// R5 : réutilise les tarifs ET le calcul de change R4; pas de devis FX concurrent.
// 1 EUR = 656 XAF, arrondi supérieur à 10 FCFA (barème PDC validé).
import {createHash} from 'node:crypto';
import {DIASPORA} from '../../../../src/features/adhesion/tarifs.mjs';
import {xafQuoteFromEuroCents} from '../v5c/tara-rate-quote-r4.mjs';
export const DIASPORA_FX_R5=Object.freeze({rateMilliXafPerEur:'656000',roundToXaf:10});
const ID=/^[A-Za-z0-9:_-]{16,128}$/;
const NAME=/^[^\u0000-\u001f<>]{1,100}$/;
const PHONE=/^\+[1-9][0-9]{6,14}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const fail=(code)=>{throw Error('PDC_R5_'+code);};
const clean=(s)=>typeof s==='string'?s.trim():'';
function person(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||
    Object.keys(p).some(k=>!['civility','firstName','lastName','dob','birthPlace','email','phoneE164','acceptedStatutes','acceptedDataNotice'].includes(k)) ||
    !['Madame','Monsieur'].includes(p.civility)||
    p.acceptedStatutes!==true||p.acceptedDataNotice!==true||
    !NAME.test(clean(p.firstName))||!NAME.test(clean(p.lastName))||
    clean(p.birthPlace).length<1||clean(p.birthPlace).length>160||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(p.email))||
    !PHONE.test(p.phoneE164??'')||!DATE.test(p.dob??'')) fail('PERSON_INVALID');
  const d=new Date(p.dob+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==p.dob||
     p.dob>=new Date().toISOString().slice(0,10)) fail('DOB_INVALID');
  return {civility:p.civility,firstName:clean(p.firstName),lastName:clean(p.lastName),
    dob:p.dob,birthPlace:clean(p.birthPlace),email:clean(p.email).toLowerCase(),
    phoneE164:p.phoneE164,acceptedStatutes:true,acceptedDataNotice:true};
}
export function prepareDiasporaR5({request}={}){
  if(!request||typeof request!=='object'||Array.isArray(request)||
    Object.keys(request).some(k=>!['idempotencyKey','formula','country','member','partner','requestCard','cardFormat','territory','donationConversionAccepted'].includes(k))||
    !ID.test(request.idempotencyKey??'')||!Object.hasOwn(DIASPORA,request.formula)||
    !/^[A-Z]{2}$/.test(request.country??'')||request.country==='CM'||
    typeof request.requestCard!=='boolean')fail('ORDER_INVALID');
  if(typeof request.donationConversionAccepted!=='boolean'||
     (request.formula==='couple')!==request.donationConversionAccepted)fail('DONATION_CONSENT_REQUIRED');
  const member=person(request.member);
  const partner=request.formula==='couple'?person(request.partner):null;
  if(request.formula!=='couple'&&request.partner!=null)fail('PARTNER_NOT_APPLICABLE');
  if(partner&&(partner.email===member.email||
    (partner.firstName.toLowerCase()===member.firstName.toLowerCase()&&
     partner.lastName.toLowerCase()===member.lastName.toLowerCase()&&partner.dob===member.dob)))fail('DUPLICATE_BENEFICIARY');
  if(request.requestCard?!['digital','physical','both'].includes(request.cardFormat):request.cardFormat!=null)fail('CARD_FORMAT_INVALID');
  const t=request.territory;
  if(!t||typeof t!=='object'||Array.isArray(t)||
     Object.keys(t).sort().join(',')!=='commune,department,region'||
     Object.values(t).some(v=>typeof v!=='string'||!clean(v)||clean(v).length>100))fail('TERRITORY_INVALID');
  const legalAmountEurCents=String(DIASPORA[request.formula]*100);
  const converted=xafQuoteFromEuroCents({euroCents:legalAmountEurCents,...DIASPORA_FX_R5});
  const payload={idempotencyKey:request.idempotencyKey,formula:request.formula,country:request.country,
    donationConversionAccepted:request.donationConversionAccepted,
    member,partner,requestCard:request.requestCard,cardFormat:request.requestCard?request.cardFormat:null,
    territory:Object.fromEntries(Object.entries(t).map(([k,v])=>[k,clean(v)])),
    legalAmountEurCents,providerAmountXaf:converted.providerAmountXaf};
  return Object.freeze({...payload,requestDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    legalCurrency:'EUR',providerCurrency:'XAF',paymentConfirmed:false,membershipGranted:false,cardIssued:false});
}
