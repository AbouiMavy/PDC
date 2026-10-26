import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCoupleAdmissionResult} from '../src/couple-admission-contract-v5b610f3.mjs';
const A='1903c0e5-3315-4cdc-9e13-2d01bfed2d49';
const B='bcb2a8fd-5148-497d-bd03-b5d7c385d91e';
const row=(slot,mid,number)=>({slot,membership_id:mid,member_number:number});
const example=()=>[row('member',A,'M-PDC-I-000101'),row('partner',B,'F-PDC-I-000102')];
const bad=r=>assert.throws(()=>validateCoupleAdmissionResult(r),/PDC_COUPLE_ADMISSION_RESULT_INVALID/);
const sql=()=>readFileSync(new URL('../../../supabase/migrations/20261026001700_pdc_v5b610f3_couple_admission_dev.sql',import.meta.url),'utf8');

test('deux identifiants distincts donnent deux dossiers validés',()=>{
 const r=validateCoupleAdmissionResult(example());
 assert.equal(r.member.membershipId,A);assert.equal(r.partner.memberNumber,'F-PDC-I-000102');
});
test('l ordre de restitution SQL ne permute pas les bénéficiaires',()=>{
 const r=validateCoupleAdmissionResult(example().reverse());assert.equal(r.member.memberNumber,'M-PDC-I-000101');
});
test('résultat sans deux lignes refusé',()=>{bad([]);bad([example()[0]]);bad([...example(),example()[0]]);});
test('deux slots member interdits',()=>bad([example()[0],row('member',B,'F-PDC-I-000102')]));
test('slot non documenté interdit',()=>bad([example()[0],row('admin',B,'F-PDC-I-000102')]));
test('UUID invalide interdit',()=>bad([row('member','123','M-PDC-I-000101'),example()[1]]));
test('numéro militaire fantaisiste interdit',()=>bad([row('member',A,'PDC-DEV-2026-01'),example()[1]]));
test('un même dossier pour deux bénéficiaires interdit',()=>bad([example()[0],row('partner',A,'F-PDC-I-000102')]));
test('numéro identique interdit',()=>bad([example()[0],row('partner',B,'M-PDC-I-000101')]));
test('rang national identique avec préfixe différent interdit',()=>bad([example()[0],row('partner',B,'F-PDC-I-000101')]));
test('résultat gelé après validation',()=>{
 const r=validateCoupleAdmissionResult(example());assert.equal(Object.isFrozen(r),true);assert.equal(Object.isFrozen(r.member),true);
});
test('aucune création de paiement ni allocation de 20 EUR dans F3',()=>{
 const s=sql();assert.doesNotMatch(s,/INSERT\s+INTO\s+pdc_private\.(payment_attempts|payment_allocations|dues_obligations)/i);
 assert.doesNotMatch(s,/amount_minor\s*=\s*2000/i);
});
test('vérification obligatoire par la fonction financière privée F2',()=>{
 const s=sql();assert.match(s,/pdc_private\.couple_payment_verified_dev_v5b610f2\(p_order\)/);
});
test('transaction et registre d admissions atomiques',()=>{
 const s=sql();assert.match(s,/CREATE TABLE pdc_private\.couple_admissions_v5b610f3/);
 assert.match(s,/INSERT INTO pdc_private\.couple_admissions_v5b610f3/);
 assert.match(s,/UPDATE pdc_private\.internet_member_counter_v5b62/);
 assert.match(s,/BEGIN;[\s\S]*COMMIT;/);
});
test('aucun droit anonyme, navigateur ou runtime photo',()=>{
 const s=sql();assert.match(s,/REVOKE ALL ON FUNCTION pdc_private\.admit_paid_couple_dev_v5b610f3/);
 assert.match(s,/pdc_portrait_upload_runtime_v5b610c/);
 assert.doesNotMatch(s,/GRANT EXECUTE ON FUNCTION pdc_private\.admit_paid_couple_dev_v5b610f3/);
});
test('pas d API, de jeton Storage ni de secrets dans le module de validation',()=>{
 const s=readFileSync(new URL('../src/couple-admission-contract-v5b610f3.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/createServer\(|SUPABASE_SERVICE_ROLE_KEY|process\.env|new Pool\(/);
});
