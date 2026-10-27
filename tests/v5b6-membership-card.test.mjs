import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatInternetMemberNumber, internetNumberPattern,validateCardSelection,validatePhoto,PHOTO_MAX_BYTES} from '../src/features/adhesion/carte.mjs';
const repo = new URL('../',import.meta.url);
const f = path => readFileSync(new URL(path,repo),'utf8');
const good = {type:'image/jpeg',size:850000};
test('numérotation de six chiffres pour hommes et femmes et compteur partagé',()=>{
 assert.equal(formatInternetMemberNumber('M',1),'M-PDC-I-000001');
 assert.equal(formatInternetMemberNumber('F',2),'F-PDC-I-000002');
 assert.match(formatInternetMemberNumber('F',999999),internetNumberPattern);
 for(const value of [0,1000000,1.2,'3',-1])assert.throws(()=>formatInternetMemberNumber('M',value));
 assert.throws(()=>formatInternetMemberNumber('X',4));
});
test('absence de carte : aucune photo exigée',()=>{
 assert.equal(validateCardSelection({requestCard:false,isCouple:true}),null);
});
test('carte individuelle : une photo requise et valide',()=>{
 assert.equal(validateCardSelection({requestCard:true,isCouple:false}), 'photoMember');
 assert.equal(validateCardSelection({requestCard:true,isCouple:false,photoMember:good}),null);
 assert.equal(validatePhoto({type:'image/gif',size:3500}),'photoType');
 assert.equal(validatePhoto({type:'image/png',size:PHOTO_MAX_BYTES+1}),'photoSize');
});
test('carte couple : deux photos dans la même demande',()=>{
 assert.equal(validateCardSelection({requestCard:true,isCouple:true,photoMember:good}),'photoPartner');
 assert.equal(validateCardSelection({requestCard:true,isCouple:true,photoMember:good,photoPartner:{type:'image/png',size:900}}),null);
});
test('le formulaire collecte la naissance et la civilité uniquement en adhésion',()=>{
 const s=f('src/pages/Adhesion.jsx');
 for(const k of ['a-birthplace','a-partner-birthplace','civilitePartenaire','a-photo-member','a-photo-partner'])assert.ok(s.includes(k),k);
 const t=f('src/features/adhesion/textes.js');
 assert.ok(t.includes('L’adhésion au PDC est enregistrée après validation du formulaire et confirmation du paiement. Elle devient définitive à la délivrance de la carte de membre'));
 assert.ok(t.includes('Place of birth *'));
 assert.doesNotMatch(s, /a-(?:partner-)?sex/);
 assert.doesNotMatch(s, /\bsexe(?:Partenaire)?\b/);
 assert.doesNotMatch(t, /Sexe \(numérotation\)|Sex \(member number\)/);
 const d=f('src/components/DonForm/DonForm.jsx');
 assert.equal(d.includes('lieuNaissance'),false);
});
test('migration additive sécurisée sans activation des paiements',()=>{
 const s=f('supabase/migrations/20261025000600_pdc_v5b6_identity_cards_numbering.sql');
 assert.match(s,/ADD COLUMN birth_place/);
 assert.match(s,/ADD COLUMN sex_code/);
 assert.match(s,/MAXVALUE 999999 NO CYCLE/);
 assert.match(s,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(s,/REVOKE ALL ON pdc_private\.internet_number_reservations/);
 assert.ok(!s.includes('CREATE OR REPLACE FUNCTION pdc_private.admit_member_dev'));
});
