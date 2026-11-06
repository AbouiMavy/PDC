import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const content=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const start=content('backend/pdc-api/scripts/start-public-sandbox-v5c41.mjs');
const protectedCompose=content('backend/pdc-api/src/v5c/public-sandbox-composition-v5c29.mjs');
const oldPreview=content('backend/pdc-api/scripts/start-public-sandbox-v5c30.mjs');
const gate=content('backend/pdc-api/src/v5c/t12c-activation-gate.mjs');

test('T12-D : branchement réel V5-C.41 et jamais dans le navigateur',()=>{
  assert.match(start,/decidePublicMobileActivationT12D\(env\)/);
  assert.match(start,/if\(mobileMode\.enabled\)await assertPublicMobileSqlReadyT12D\(pool\)/);
  assert.match(start,/makeTaraMobilePayClientT12\(/);
  assert.match(start,/mobileDirectEnabled:mobileMode\.enabled/);
  assert.match(start,/mobilePhoneHmacKey:mobileMode\.enabled\?env\.PDC_V5C41_MOBILE_HMAC_SECRET:null/);
  assert.doesNotMatch(start,/VITE_PDC_V5C29_MOBILE_DIRECT_ENABLED/);
});
test('T12-D : composition conservatrice, direct par défaut OFF',()=>{
  assert.match(protectedCompose,/mobileDirectEnabled=false,mobileClient=null,mobilePhoneHmacKey=null/);
  assert.match(protectedCompose,/await makePublicMobileDirectT12C\(/);
  assert.match(protectedCompose,/mobileDirect,mobileDirectEnabled/);
  assert.match(protectedCompose,/issueLinks\?await makeTaraSelectedChannelPgV5C/);
});
test('T12-D : ancien lanceur V5-C.30 conserve émission de lien désactivée',()=>{
  assert.match(oldPreview,/issueLinks:false/);
  assert.doesNotMatch(oldPreview,/MOBILE_DIRECT_ENABLED|makeTaraMobilePayClientT12/);
});
test('T12-D : verrou double opt-in serveur et contrôles SQL',()=>{
  assert.match(gate,/PDC_V5C41_MOBILE_DIRECT_ENABLED/);
  assert.match(gate,/PDC_V5C41_MOBILE_DIRECT_REVIEW_APPROVED/);
  assert.match(gate,/t12_v5c_claim_mobile_direct_dev/);
  assert.match(gate,/t12_v5c_direct_no_link_dev/);
});
