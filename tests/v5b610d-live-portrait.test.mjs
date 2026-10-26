import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {liveTestConfig,acquireTestToken} from '../backend/pdc-api/scripts/test-live-portrait-v5b610d.mjs';
const REF='rvgpnmznhzwlzqyefahd';
const fixture=()=>({PDC_LIVE_PORTRAIT_TEST:'YES',PDC_SUPABASE_PROJECT_REF:REF,
 PDC_ENABLE_PORTRAIT_UPLOAD_DEV:'YES',PDC_TEST_ADMIN_EMAIL:'pdc-v5b3-test@example.invalid',
 PDC_TEST_CARD_REQUEST_ID:randomUUID(),PDC_TEST_WRITER_PASSWORD:'1234567890pw',
 PDC_TEST_ADMIN_PASSWORD:'1234567890adm',SUPABASE_SERVICE_ROLE_KEY:'TESTKEY_1234567890',
 SUPABASE_PUBLISHABLE_KEY:'TEST_PUBLISHABLE'});
test('refuse une execution sans triple interrupteur DEV',()=>{let e=fixture();delete e.PDC_LIVE_PORTRAIT_TEST;assert.throws(()=>liveTestConfig(e),/PDC_DEV_TEST_GUARD_FAILED/);});
test('refuse un projet distinct du projet DEV',()=>{let e=fixture();e.PDC_SUPABASE_PROJECT_REF='another';assert.throws(()=>liveTestConfig(e),/PDC_DEV_TEST_GUARD_FAILED/);});
test('refuse une adresse mail autre que le compte fictif',()=>{let e=fixture();e.PDC_TEST_ADMIN_EMAIL='person@example.org';assert.throws(()=>liveTestConfig(e),/PDC_DEV_TEST_GUARD_FAILED/);});
test('refuse un identifiant de demande de carte non UUID',()=>{let e=fixture();e.PDC_TEST_CARD_REQUEST_ID='abc';assert.throws(()=>liveTestConfig(e),/PDC_DEV_TEST_GUARD_FAILED/);});
test('refuse un secret manquant',()=>{let e=fixture();delete e.SUPABASE_SERVICE_ROLE_KEY;assert.throws(()=>liveTestConfig(e),/PDC_MISSING_SUPABASE_SERVICE_ROLE_KEY/);});
test('construit uniquement le login writer supabase reserve',()=>{const e=liveTestConfig(fixture());const u=new URL(e.PDC_PORTRAIT_DATABASE_URL);assert.equal(decodeURIComponent(u.username),`pdc_portrait_upload_runtime_v5b610c.${REF}`);assert.equal(u.hostname,'aws-0-eu-west-1.pooler.supabase.com');assert.equal(u.port,'5432');});
test('accepte uniquement un token renvoye par Supabase Auth',async()=>{const e=fixture();const token=await acquireTestToken(e, async(url,opt)=>{assert.ok(url.startsWith(`https://${REF}.supabase.co/auth/v1/token`));assert.equal(opt.method,'POST');return {ok:true,async json(){return {access_token:'a.b.c'};}}});assert.equal(token,'a.b.c');});
test('refuse un mot de passe admin invalide sans ecrire',async()=>{const e=fixture();await assert.rejects(acquireTestToken(e,async()=>({ok:false,status:400})),/PDC_TEST_AUTH_REJECTED_400/);});
