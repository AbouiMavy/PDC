import test from 'node:test';
import assert from 'node:assert/strict';
import {makeMobilePayInputT12} from '../src/v5c/tara-mobilepay-client-t12.mjs';
const base={productId:'PDC_'+'a'.repeat(24),productName:'Don au PDC',amountXaf:'500',webHookUrl:'https://example.org/webhook'};

test('T12-F : network=Wave accepté pour Sénégal +221',()=>{
  const v=makeMobilePayInputT12({...base,phoneNumber:'221771234567',network:'Wave'});
  assert.equal(v.network,'Wave');assert.equal(v.phoneNumber,'221771234567');assert.equal(v.productPrice,500);
});
test('T12-F : network=Wave accepté pour Côte d’Ivoire +225',()=>{
  const v=makeMobilePayInputT12({...base,phoneNumber:'2250707070707',network:'Wave'});
  assert.equal(v.network,'Wave');
});
test('T12-F : network absent pour paiement camerounais classique',()=>{
  const v=makeMobilePayInputT12({...base,phoneNumber:'237699123456'});
  assert.equal(Object.hasOwn(v,'network'),false);
});
test('T12-F : network=Wave interdit sur un pays non couvert par ce réseau dans le contrat actuel',()=>{
  assert.throws(()=>makeMobilePayInputT12({...base,phoneNumber:'237699123456',network:'Wave'}),/PDC_T12_NETWORK_INVALID/);
});
test('T12-F : Sénégal sans Wave conserve network optionnel',()=>{
  const v=makeMobilePayInputT12({...base,phoneNumber:'221771234567'});
  assert.equal(Object.hasOwn(v,'network'),false);
});
