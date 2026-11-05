import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseMobileCameroonT12,prepareMobileSelectionT12} from '../src/features/payments/mobile-money-t12.mjs';
test('T12: SMS preserved without requiring a debit number',()=>{
  assert.deepEqual(prepareMobileSelectionT12({method:'mobile',mobileMode:'sms'}),{mobileMode:'sms',phoneE164:null});
});
test('T12: Cameroon direct numbers normalize deterministically',()=>{
  assert.equal(normaliseMobileCameroonT12('699 123 456').providerPhone,'237699123456');
  assert.equal(normaliseMobileCameroonT12('+237 699 123 456').phoneE164,'+237699123456');
  assert.equal(prepareMobileSelectionT12({method:'mobile',mobileMode:'direct',mobilePhone:'699-123-456'}).phoneE164,'+237699123456');
});
test('T12: reject unsupported numbers and mode',()=>{
  for (const phone of ['','601','+33612345678','+23769912345a','+2376991234567']) {
    assert.throws(()=>normaliseMobileCameroonT12(phone),/PDC_T12_PHONE_INVALID/);
  }
  assert.throws(()=>prepareMobileSelectionT12({method:'mobile',mobileMode:'api'}),/PDC_T12_MODE_INVALID/);
});
test('T12: other methods do not receive a mobile route',()=>{
  assert.equal(prepareMobileSelectionT12({method:'carte',mobileMode:'direct'}),null);
});
