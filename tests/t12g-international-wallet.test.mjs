import test from 'node:test';
import assert from 'node:assert/strict';
import {MOBILE_WALLET_COUNTRIES_T12G,normalizeMobileWalletT12G} from '../shared/mobile-wallet-t12g.mjs';
import {prepareMobileSelectionT12} from '../src/features/payments/mobile-money-t12.mjs';
const numbers={BJ:'0197001234',BF:'70123456',CM:'699123456',CG:'061234567',CD:'812345678',
  CI:'0701234567',GA:'77123456',GH:'241234567',KE:'712345678',RW:'781234567',
  SN:'771234567',SL:'76123456',UG:'771234567',TZ:'712345678',ZM:'971234567'};
test('T12-G: 15 pays distincts, indicatifs et 2 pays Wave seulement',()=>{
  assert.equal(MOBILE_WALLET_COUNTRIES_T12G.length,15);
  assert.equal(new Set(MOBILE_WALLET_COUNTRIES_T12G.map(x=>x.code)).size,15);
  assert.deepEqual(MOBILE_WALLET_COUNTRIES_T12G.filter(x=>x.wave).map(x=>x.code),['CI','SN']);
  for(const c of MOBILE_WALLET_COUNTRIES_T12G){
    const v=normalizeMobileWalletT12G({mobileCountry:c.code,mobilePhone:numbers[c.code]});
    assert.equal(v.providerPhone,c.dialCode+v.local);
    assert.equal(v.phoneE164,'+'+v.providerPhone);
    assert.equal(v.mobileNetwork,null);
  }
});
test('T12-G: Wave uniquement sur +221 et +225 ; champ optionnel',()=>{
  const sn=normalizeMobileWalletT12G({mobileCountry:'SN',mobilePhone:'77 123 45 67',mobileNetwork:'Wave'});
  assert.equal(sn.providerPhone,'221771234567');assert.equal(sn.mobileNetwork,'Wave');
  const ci=normalizeMobileWalletT12G({mobileCountry:'CI',mobilePhone:'0701234567',mobileNetwork:'Wave'});
  assert.equal(ci.providerPhone,'2250701234567');assert.equal(ci.mobileNetwork,'Wave');
  assert.equal(normalizeMobileWalletT12G({mobileCountry:'SN',mobilePhone:'771234567'}).mobileNetwork,null);
  assert.throws(()=>normalizeMobileWalletT12G({mobileCountry:'CM',mobilePhone:'699123456',mobileNetwork:'Wave'}));
});
test('T12-G: indicatif du portefeuille independant du pays de residence',()=>{
  const sel=prepareMobileSelectionT12({method:'mobile',mobileMode:'direct',
    mobileCountry:'SN',mobilePhone:'771234567',mobileNetwork:'Wave'});
  assert.deepEqual({phone:sel.phoneE164,network:sel.mobileNetwork,country:sel.mobileCountry},
    {phone:'+221771234567',network:'Wave',country:'SN'});
});
test('T12-G: anciens SMS et numero camerounais retrocompatibles',()=>{
  assert.deepEqual(prepareMobileSelectionT12({method:'mobile',mobileMode:'sms'}),
    {mobileMode:'sms',phoneE164:null});
  assert.equal(prepareMobileSelectionT12({method:'mobile',mobileMode:'direct',
    mobilePhone:'699-123-456'}).phoneE164,'+237699123456');
});
test('T12-G: rejette un indicatif etranger incompatible, Wave non choisi et caracteres invalides',()=>{
  for(const x of [
    {mobileCountry:'CM',mobilePhone:'+221771234567'},
    {mobileCountry:'SN',mobilePhone:'+2250701234567'},
    {mobileCountry:'FR',mobilePhone:'612345678'},
    {mobileCountry:'CI',mobilePhone:'0701234567',mobileNetwork:'Mtn'},
    {mobileCountry:'CM',mobilePhone:'699123456;test'}
  ])assert.throws(()=>normalizeMobileWalletT12G(x));
});
