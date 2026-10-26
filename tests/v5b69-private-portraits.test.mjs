import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portraitObjectKey, checkTrustedPortraitMetadata, PORTRAIT_BUCKET_DEV } from '../backend/pdc-api/src/portrait-policy.mjs';
const sql = readFileSync(new URL('../supabase/migrations/20261026001100_pdc_v5b69_private_portraits_registry.sql', import.meta.url), 'utf8');
const req = 'e802d645-b8ed-4a5c-a9e9-9b08df0086a1';
const asset = '34e5d451-696b-42ce-ad30-b245067091d3';
const valid = { contentType:'image/jpeg', fileBytes:400000, sha256Hex:'a'.repeat(64), width:500, height:600 };

test('Chemin opaque lie a la demande et a l actif', () => {
 assert.equal(portraitObjectKey(req,asset,'image/jpeg'),`card-requests/${req}/${asset}.jpg`);
 assert.equal(portraitObjectKey(req,asset,'image/png'),`card-requests/${req}/${asset}.png`);
 assert.ok(!portraitObjectKey(req,asset,'image/png').includes('PDC-I-'));
});
test('Ne jamais accepter une cle personnelle fabriquee par nom', () => {
 assert.throws(()=>portraitObjectKey('M-PDC-I-000001',asset,'image/jpeg'),/REFERENCE/);
 assert.throws(()=>portraitObjectKey(req,'x', 'image/jpeg'),/REFERENCE/);
});
test('Refuser les types non pris en charge', () => {
 assert.throws(()=>portraitObjectKey(req,asset,'image/svg+xml'),/TYPE/);
 assert.throws(()=>checkTrustedPortraitMetadata({...valid,contentType:'image/webp'}),/TYPE/);
});
test('Refuser une photo trop lourde', () => {
 assert.throws(()=>checkTrustedPortraitMetadata({...valid,fileBytes:5242881}),/SIZE/);
 assert.throws(()=>checkTrustedPortraitMetadata({...valid,fileBytes:0}),/SIZE/);
});
test('Refuser empreinte et dimensions invalides', () => {
 assert.throws(()=>checkTrustedPortraitMetadata({...valid,sha256Hex:'NOT_SHA256'}),/DIGEST/);
 assert.throws(()=>checkTrustedPortraitMetadata({...valid,width:100}),/DIMENSIONS/);
});
test('Accepter metadonnees normalisees', () => assert.deepEqual(checkTrustedPortraitMetadata(valid),valid));
test('Aucune exposition SQL au navigateur et API actuelle', () => {
 assert.match(sql,/ALTER TABLE pdc_private\.card_portrait_assets ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/REVOKE ALL ON TABLE pdc_private\.card_portrait_assets/i);
 assert.match(sql,/pdc_api_runtime_v5b3/);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|SELECT|DELETE) ON pdc_private\.card_portrait_assets TO (?:anon|authenticated)/i);
});
test('Une photo active par demande et aucune emission de carte', () => {
 assert.match(sql,/UNIQUE INDEX card_portrait_one_stored_per_request_v5b69/);
 assert.match(sql,/WHERE status='stored'/);
 assert.doesNotMatch(sql,/UPDATE pdc_private\.membership_card_requests SET status='issued'/i);
 assert.equal(PORTRAIT_BUCKET_DEV,'pdc-member-portraits-dev');
});
