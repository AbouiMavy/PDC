import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDiasporaR5Intent} from '../src/features/adhesion/diaspora-r5-intent.mjs';
import {buildPublicOrderPayload} from '../src/features/payments/public-checkout-payload-v5c29.mjs';
import {preparePublicOrderRequest} from '../backend/pdc-api/src/v5c/tara-public-order-preparation-v5c.mjs';
import {prepareDiasporaR5} from '../backend/pdc-api/src/r5/diaspora-contract.mjs';
import {makePublicOrderPgV5C} from '../backend/pdc-api/src/v5c/tara-public-order-pg-v5c.mjs';

const id='pdc_t10_test_idempotence_00000001';
const cm={kind:'donation',idempotencyKey:id,firstName:'Anne',lastName:'Mbala',
 email:'anne@example.test',phoneE164:'+237612345678',country:'CM',method:'mobile',
 amountXaf:'500',designations:[{purpose:'libre',percentBps:10000}],donorDeclaration:true,
 residence:{region:'CE',department:'LEKIE',city:'OBALA',postalCode:null}};
test('T10 donation : les subdivisions survivent à la normalisation du serveur',()=>{
  const p=preparePublicOrderRequest(cm);
  assert.deepEqual(p.residence,cm.residence);
  assert.equal(p.grossAmountXaf,'500');
  assert.match(p.requestDigest,/^[0-9a-f]{64}$/);
  assert.throws(()=>preparePublicOrderRequest({...cm,residence:{...cm.residence,provinceInterdite:'x'}}),/RESIDENCE_INVALID/);
});
test('T10 dépôt SQL public : la liste blanche ne supprime plus residence',async()=>{
  let received;
  const pool={query:async(sql,args)=>{
    if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_tara_v5c_writer'}]};
    received=JSON.parse(args[0]);
    return {rows:[{paymentId:'ab1d4e12-937e-4891-8a58-33a8fc7ad317',
      quoteId:'bb1d4e12-937e-4891-8a58-33a8fc7ad317',
      payerId:'cb1d4e12-937e-4891-8a58-33a8fc7ad317',
      kind:'donation',amountMinor:'500',currency:'XAF',beneficiaryIds:[]}]};
  }};
  const repo=await makePublicOrderPgV5C({pool,enabled:true,environment:'sandbox'});
  await repo.create(cm);
  assert.deepEqual(received.residence,cm.residence);
  assert.equal(received.grossAmountXaf,'500');
});
test('T10 don navigateur : code postal et ville transmis',()=>{
  const p=buildPublicOrderPayload({source:'donation',idempotencyKey:id,data:{
    nom:'Mbala',prenom:'Anne',email:'anne@example.test',telephoneE164:'+33612345678',
    pays:'FR',region:'IDF',departement:'75',commune:'Paris',codePostal:'75001',
    montant:500,periodicite:'ponctuel',methode:'mobile',affectation:'libre',anonymePublic:false}});
  assert.deepEqual(p.residence,{region:'IDF',department:'75',city:'Paris',postalCode:'75001'});
});
test('T10 adhésion Cameroun : commune libre résolue',()=>{
  const p=buildPublicOrderPayload({source:'membership',idempotencyKey:id,
   data:{form:{type:'nouvelle',pays:'CM',nom:'Mbala',prenom:'Anne',email:'anne@example.test',
   telephone:'612345678',civilite:'Madame',dateNaissance:'1990-05-01',lieuNaissance:'Yaoundé',
   region:'CE',departement:'LEKIE',commune:'__autre__',communeAutre:'Commune test',
   categorie:'urbain',formule:'simple',modeCotisation:'aucun',demandeCarte:false,
   accepteStatuts:true,accepteDonnees:true},amounts:{totalImmediate:2000},methode:'mobile'}});
  assert.equal(p.residence.city,'Commune test');
  assert.equal(p.residence.region,'CE');
});
const member={civility:'Madame',firstName:'Anne',lastName:'Mbala',dob:'1990-05-01',
 birthPlace:'Yaoundé',email:'anne@example.test',phoneE164:'+33612345678',
 acceptedStatutes:true,acceptedDataNotice:true};
const diaspora={idempotencyKey:id,formula:'simple',country:'FR',member,partner:null,
 requestCard:false,cardFormat:null,donationConversionAccepted:false,
 territory:{region:'CE',department:'LEKIE',commune:'OBALA'},
 residence:{region:'Île-de-France',department:'Val-de-Marne',city:'Thiais',postalCode:'94320'}};
test('T10 diaspora : résidence étrangère indépendante du rattachement CM',()=>{
  const p=prepareDiasporaR5({request:diaspora});
  assert.equal(p.residence.region,'Île-de-France');
  assert.equal(p.territory.region,'CE');
  assert.equal(p.residence.city,'Thiais');
  assert.equal(p.territory.commune,'OBALA');
  assert.throws(()=>prepareDiasporaR5({request:{...diaspora,residence:{...diaspora.residence,city:''}}}),/RESIDENCE_INVALID/);
});
test('T10 adaptateur diaspora : conserve les deux objets',()=>{
  const f={type:'nouvelle',pays:'FR',formule:'simple',civilite:'Madame',prenom:'Anne',
   nom:'Mbala',dateNaissance:'1990-05-01',lieuNaissance:'Yaoundé',email:'anne@example.test',
   telephone:'612345678',accepteStatuts:true,accepteDonnees:true,
   region:'IDF',departement:'94',ville:'Thiais',codePostal:'94320',
   rattachementRegion:'CE',rattachementDepartement:'LEKIE',rattachementCommune:'OBALA',
   demandeCarte:false};
  const p=buildDiasporaR5Intent({form:f,idempotencyKey:id,phonePrefix:'+33'});
  assert.equal(p.residence.region,'IDF');
  assert.equal(p.territory.region,'CE');
});
test('T10 SQL REVIEW ONLY : pas de reprise financière ni mise à jour historique',()=>{
 const sql=readFileSync('docs/t10/review/05600-territoires-registre-T10-REVIEW-ONLY.sql','utf8');
 assert.match(sql,/home_territory_snapshot/);
 assert.match(sql,/r5_create_diaspora_dossier_dev/);
 assert.match(sql,/treasury_v5c44t_register_dev/);
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.people\b/i);
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.payment_attempts\b/i);
 assert.doesNotMatch(sql,/UPDATE\s+pdc_private\.payment_allocations\b/i);
});
