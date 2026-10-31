// Recette unitaires R5, sans réseau, sans paiement ni photo réelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDiasporaR5,DIASPORA_FX_R5} from '../src/r5/diaspora-contract.mjs';
import {makeDiasporaR5Repository} from '../src/r5/diaspora-repository.mjs';
import {makeProvisionalPhotoRepositoryR5} from '../src/r5/provisional-portrait-repository.mjs';
import {provisionalKey,makeProvisionalPortraitR5} from '../src/r5/portrait-provisional.mjs';
import {validateR5CardReadiness} from '../src/r5/card-readiness.mjs';
import {makeDiasporaTaraR5} from '../src/r5/tara-diaspora-r5.mjs';
import {makePartnerEmailR51,makeResendSenderR51} from '../src/r5/partner-email-r5.mjs';
import {createDiasporaHttpR5} from '../src/r5/diaspora-http-r5.mjs';
import {savePendingReturnR5,readPendingReturnR5} from '../../../src/features/payments/return-session-r5.mjs';
import {buildDiasporaR5Intent} from '../../../src/features/adhesion/diaspora-r5-intent.mjs';
import {DIASPORA} from '../../../src/features/adhesion/tarifs.mjs';
const UUID1='cdf9bf18-9aac-488d-9fbb-3040ac500001';
const UUID2='cdf9bf18-9aac-488d-9fbb-3040ac500002';
const UUID3='cdf9bf18-9aac-488d-9fbb-3040ac500003';
const PRODUCT='PDC_abcdefghijklmnopqrstuvwx';
const member={civility:'Madame',firstName:'Alice',lastName:'Fictive',dob:'1980-02-14',birthPlace:'Obala',
 email:'alice@example.test',phoneE164:'+33612345678',acceptedStatutes:true,acceptedDataNotice:true};
const partner={civility:'Monsieur',firstName:'Bob',lastName:'Fictif',dob:'1981-03-15',birthPlace:'Yaounde',
 email:'bob@example.test',phoneE164:'+33622345678',acceptedStatutes:true,acceptedDataNotice:true};
const base={idempotencyKey:'r5_test_fixed_idempotent_0001',formula:'simple',country:'FR',member,
 donationConversionAccepted:false,
 requestCard:false,cardFormat:null,territory:{region:'CE',department:'LEKIE',commune:'OBALA'}};
const drafted=(a=base)=>prepareDiasporaR5({request:a});
const sha=x=>createHash('sha256').update(x).digest('hex');

test('Tarifs partagés avec V5B, taux validé 656 et monnaie sans frais initiaux supplémentaires',()=>{
 assert.equal(DIASPORA_FX_R5.rateMilliXafPerEur,'656000');
 assert.equal(DIASPORA_FX_R5.roundToXaf,10);
 for(const [formula,eur,xaf] of [['reduit','1500','9840'],['simple','3000','19680'],['couple','4000','26240']]){
  const r=drafted({...base,formula,...(formula==='couple'?{partner,donationConversionAccepted:true}:{})});
  assert.equal(DIASPORA[formula]*100,Number(eur));
  assert.equal(r.legalAmountEurCents,eur);assert.equal(r.providerAmountXaf,xaf);
  assert.equal(r.legalCurrency,'EUR');assert.equal(r.providerCurrency,'XAF');
  assert.equal(r.paymentConfirmed,false);assert.equal(r.membershipGranted,false);assert.equal(r.cardIssued,false);
 }
});
test('Un seul dossier de paiement pour deux bénéficiaires distincts',()=>{
 const r=drafted({...base,formula:'couple',partner,donationConversionAccepted:true});
 assert.equal(r.partner.email,'bob@example.test');assert.equal(r.legalAmountEurCents,'4000');
 assert.match(r.requestDigest,/^[a-f0-9]{64}$/);
});
test('Refus de la manipulation du prix, d’un consentement absent, du doublon et de date impossible',()=>{
 assert.throws(()=>drafted({...base,amountXaf:'1'}),/ORDER_INVALID/);
 assert.throws(()=>drafted({...base,member:{...member,acceptedDataNotice:false}}),/PERSON_INVALID/);
 assert.throws(()=>drafted({...base,formula:'couple',partner:{...member},donationConversionAccepted:true}),/DUPLICATE_BENEFICIARY/);
 assert.throws(()=>drafted({...base,formula:'couple',partner}),/DONATION_CONSENT_REQUIRED/);
 assert.throws(()=>drafted({...base,partner}),/PARTNER_NOT_APPLICABLE/);
 assert.throws(()=>drafted({...base,member:{...member,dob:'1980-02-31'}}),/DOB_INVALID/);
 assert.throws(()=>drafted({...base,requestCard:true,cardFormat:null}),/CARD_FORMAT_INVALID/);
});
test('Adaptateur formulaire diaspora existant : rattachement + téléphone normalisé',()=>{
 const f={type:'nouvelle',pays:'FR',formule:'simple',civilite:'Madame',prenom:'Alice',nom:'Fictive',
  dateNaissance:'1980-02-14',lieuNaissance:'Obala',email:member.email,telephone:'0612345678',
  accepteStatuts:true,accepteDonnees:true,demandeCarte:false,formatCarte:'numerique',
  rattachementRegion:'CE',rattachementDepartement:'LEKIE',rattachementCommune:'OBALA'};
 const x=buildDiasporaR5Intent({form:f,phonePrefix:'+33',idempotencyKey:base.idempotencyKey});
 assert.equal(x.member.phoneE164,member.phoneE164);assert.equal(x.territory.commune,'OBALA');
 assert.equal(x.cardFormat,null);
});
test('Rôle intake interdit à R4; un token de session est non devinable et pas en clair en SQL',async()=>{
 await assert.rejects(makeDiasporaR5Repository({pool:{query:async()=>({rows:[{role_name:'pdc_tara_v5c_writer'}]})},enabled:true,environment:'sandbox'}),/DB_ROLE_INVALID/);
 let payload=null;
 const pool={query:async(sql,args)=>sql.startsWith('SELECT current_user')?{rows:[{role_name:'pdc_r5_intake_writer'}]}:(payload=JSON.parse(args[0]),{rows:[{order_id:UUID1,payment_id:UUID2,provider_amount_xaf:'19680',legal_amount_eur_cents:'3000',beneficiary_count:1,session_valid:true}]})};
 const repo=await makeDiasporaR5Repository({pool,enabled:true,environment:'sandbox'});
 const r=await repo.create(base);
 assert.match(r.sessionToken,/^[A-Za-z0-9_-]{43}$/);
 assert.ok(payload.intakeSessionSha256===sha(r.sessionToken));
 assert.ok(!JSON.stringify(payload).includes(r.sessionToken));
 assert.equal(r.paymentConfirmed,false);
});
test('Rejeu idempotent sans session originale : ne recrée pas un nouveau pouvoir',async()=>{
 const pool={query:async(sql)=>sql.startsWith('SELECT current_user')?{rows:[{role_name:'pdc_r5_intake_writer'}]}:
 {rows:[{order_id:UUID1,payment_id:UUID2,provider_amount_xaf:'19680',legal_amount_eur_cents:'3000',beneficiary_count:1,session_valid:false}]}};
 const repo=await makeDiasporaR5Repository({pool,enabled:true,environment:'sandbox'});
 const x=await repo.create(base);
 assert.equal(x.status,'manual_review');assert.equal(x.sessionToken,undefined);
});
test('Octroi du portrait : le serveur transmet seulement SHA-256 de la session et du jeton',async()=>{
 let params;
 const pool={query:async(sql,args)=>sql.startsWith('SELECT current_user')?{rows:[{role_name:'pdc_r5_intake_writer'}]}:
 (params=args,{rows:[{grant_id:UUID3,expires_at:'2099-01-01T00:00:00.000Z'}]})};
 const repo=await makeDiasporaR5Repository({pool,enabled:true,environment:'sandbox'});
 const token='A'.repeat(43),digest=sha('B'.repeat(43));
 await repo.issuePhotoGrant({orderId:UUID1,slot:'member',sessionToken:token,tokenHash:digest});
 assert.equal(params[3],sha(token));assert.equal(params[2],digest);
});
test('Rôle portrait R5 distinct; dossier et objet strictement opaques',async()=>{
 await assert.rejects(makeProvisionalPhotoRepositoryR5({pool:{query:async()=>({rows:[{role_name:'pdc_r5_intake_writer'}]})},enabled:true,environment:'sandbox'}),/ROLE_INVALID/);
 const p=provisionalKey(UUID1,'member',UUID2);
 assert.equal(p,`provisional-r5/${UUID1}/member/${UUID2}.jpg`);
 assert.throws(()=>provisionalKey('alice','member',UUID2),/PHOTO_KEY_INVALID/);
});
test('Portrait : intégrité SHA, dépôt privé et confirmation ; pas de délivrance de carte',async()=>{
 const b=Buffer.from('fixture-pseudophoto-mais-normalisee');
 const meta={fileBytes:b.length,sha256Hex:sha(b),contentType:'image/jpeg',width:250,height:300};
 const calls=[];
 const service=makeProvisionalPortraitR5({
  intake:{issuePhotoGrant:async()=>({grantId:UUID3,expiresAt:'2099-01-01T00:00:00.000Z'})},
  db:{reserve:async()=>({assetId:UUID2,objectKey:provisionalKey(UUID1,'member',UUID2)}),
    confirm:async()=>{calls.push('confirm')},cancel:async()=>{calls.push('cancel')}},
  storage:{upload:async()=>calls.push('upload'),download:async()=>b,remove:async()=>calls.push('remove')},
  normalize:async()=>({bytes:b,...meta})
 });
 const g=await service.issue({orderId:UUID1,slot:'member',sessionToken:'A'.repeat(43)});
 const res=await service.upload({orderId:UUID1,slot:'member',token:g.token,imageBytes:b,mime:'image/jpeg'});
 assert.equal(res.status,'stored_private_pending_admission');
 assert.deepEqual(calls,['upload','confirm']);
});
test('Risque de carte : admission, numéro, photo et revue administrative requis',()=>{
 const row={slot:'member',cardRequestId:UUID1,applicationStatus:'accepted',membershipStatus:'active',
  cardStatus:'reviewed',photoStatus:'stored',memberNumber:'F-PDC-I-000123'};
 assert.throws(()=>validateR5CardReadiness({orderStatus:'submitted_pending_payment',beneficiaries:[row]}),/NOT_READY/);
 assert.throws(()=>validateR5CardReadiness({orderStatus:'payment_verified',beneficiaries:[{...row,cardStatus:'requested'}]}),/NOT_READY/);
 assert.equal(validateR5CardReadiness({orderStatus:'payment_verified',beneficiaries:[row]}).issueCard,false);
});
test('Retour Tara : état uniquement provisoire, conservé 1h et expiration contrôlée',()=>{
 const db=new Map(),storage={setItem:(k,v)=>db.set(k,v),getItem:k=>db.get(k)??null,removeItem:k=>db.delete(k)};
 const receipt={paymentId:UUID1,productId:PRODUCT,grossAmountXaf:'9840',currency:'XAF',
  status:'issued',paymentConfirmed:false,membershipGranted:false};
 assert.equal(savePendingReturnR5('membership',receipt,{storage,now:1000}),true);
 const read=readPendingReturnR5({storage,now:1100});
 assert.equal(read.kind,'adhesion');assert.equal(read.receipt.paymentConfirmed,false);
 assert.equal(readPendingReturnR5({storage,now:1200})?.kind,'adhesion');
 savePendingReturnR5('donation',receipt,{storage,now:2000});
 assert.equal(readPendingReturnR5({storage,now:2000+3600001}),null);
 assert.throws(()=>savePendingReturnR5('membership',{...receipt,paymentConfirmed:true},{storage,now:1000}),/RECEIPT_INVALID/);
});
test('Émetteur Tara : aucune seconde émission après état unknown',async()=>{
 let calls=0;
 const pool={query:async(sql)=>sql.startsWith('SELECT current_user')?{rows:[{role_name:'pdc_r5_intake_writer'}]}:
  {rows:[{product_id:PRODUCT,payment_id:UUID2,amount_xaf:'9840',link_state:'unknown'}]}};
 const issuer=await makeDiasporaTaraR5({pool,taraClient:{createPaymentLink:async()=>{calls++}},
  enabled:true,environment:'sandbox',returnUrl:'https://example.test/retour-paiement?kind=adhesion',
  webHookUrl:'https://example.test/webhook'});
 const x=await issuer.create({orderId:UUID1,sessionToken:'A'.repeat(43),method:'mobile'});
 assert.equal(x.status,'manual_review');assert.equal(calls,0);assert.equal(x.productId,undefined);
});
test('Migration additive : aucun retour à la cotation FX variable, aucune admission automatique',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
 const sql=readFileSync(resolve(root,'supabase/migrations/20261030004600_pdc_r5_consolidated_intake_dev.sql'),'utf8');
 assert.doesNotMatch(sql,/r5_fx_quotes|fx_quote_id|rate_milli_xaf_per_eur/);
 assert.match(sql,/v_expected:=\(\(v_eur\*656\+999\)\/1000\)\*10/);
 assert.match(sql,/PDC_R5_DONATION_CONSENT_REQUIRED/);
 assert.match(sql,/session_sha256/);
 assert.doesNotMatch(sql,/admit_paid_couple_dev_v5b610f3\s*\(/);
 assert.match(sql,/REVOKE ALL ON FUNCTION pdc_private\.r5_confirm_verified_fx_dev/);
});

test('Émission unique Tara après réservation et claim : prix uniquement de SQL, pas du navigateur',async()=>{
 let providerCalls=0;const seen=[];
 const pool={query:async(sql,args)=>{
   seen.push(sql);
   if(sql.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_r5_intake_writer'}]};
   if(sql.includes('r5_reserve_tara_intent_dev'))return {rows:[{product_id:PRODUCT,payment_id:UUID2,amount_xaf:'26240',link_state:'reserved'}]};
   if(sql.includes('r5_claim_tara_link_dev'))return {rows:[{ok:true}]};
   if(sql.includes('r5_save_tara_link_dev'))return {rows:[{ok:true}]};
   throw Error('UNEXPECTED_QUERY');
 }};
 const tara=await makeDiasporaTaraR5({pool,enabled:true,environment:'sandbox',
   taraClient:{createPaymentLink:async x=>{providerCalls++;assert.equal(x.amountXaf,'26240');
     assert.equal(x.returnUrl,'https://example.test/retour-paiement?kind=adhesion');
     return {status:'SUCCESS',generalLink:'https://taramoney.com/pay/pdc-R5-test'};}},
   returnUrl:'https://example.test/retour-paiement?kind=adhesion',webHookUrl:'https://example.test/webhook'});
 const out=await tara.create({orderId:UUID1,sessionToken:'A'.repeat(43),method:'tara',messagingChannel:'general'});
 assert.equal(out.status,'issued');assert.equal(out.productId,PRODUCT);assert.equal(out.linkField,'generalLink');
 assert.equal(out.paymentConfirmed,false);assert.equal(providerCalls,1);
 assert.ok(seen.some(x=>x.includes('r5_save_tara_link_dev')));
});

test('Frontière HTTP R5 : origine étrangère rejetée avant tout traitement',async()=>{
 let touched=false;
 const svc={create:async()=>{touched=true;return {}},issuePhotoGrant:async()=>({})};
 const portraits={issue:async()=>({}),upload:async()=>({})};
 const tara={create:async()=>({})};
 const server=createDiasporaHttpR5({intake:svc,portraits,tara,partnerEmail:{send:async()=>{},reply:async()=>true},
  enforceRateLimit:async()=>true,verifyHuman:async()=>true,
  resolveClientAddress:()=> '127.0.0.1',allowedOrigins:['https://trusted.example'],
  enabled:true,environment:'sandbox'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
   const port=server.address().port;
   const response=await fetch(`http://127.0.0.1:${port}/v1/public/r5/diaspora`,{
    method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},
    body:JSON.stringify({verificationToken:'ABCDE',order:base})});
   assert.equal(response.status,403);assert.equal(touched,false);
 }finally{await new Promise(r=>server.close(r));}
});


test('R5.1: case expresse obligatoire pour couple, non applicable au solo',()=>{
 assert.throws(()=>drafted({...base,formula:'couple',partner}),/DONATION_CONSENT_REQUIRED/);
 const r=drafted({...base,formula:'couple',partner,donationConversionAccepted:true});
 assert.equal(r.donationConversionAccepted,true);
 assert.equal(r.legalAmountEurCents,'4000');assert.equal(r.providerAmountXaf,'26240');
 assert.throws(()=>drafted({...base,donationConversionAccepted:true}),/DONATION_CONSENT_REQUIRED/);
});
test('R5.1: lien de confirmation 256 bits, seul digest en base, un seul email',async()=>{
 let sent=null;let memo=null;
 const pool={query:async(q,args)=>{
   if(q.startsWith('SELECT current_user'))return {rows:[{role_name:'pdc_r5_intake_writer'}]};
   if(q.includes('r5_issue_partner_email_dev')){memo=args;return {rows:[{partner_email:'second@example.test',deadline:'2099-01-01'}]};}
   if(q.includes('r5_mark_partner_email_sent_dev'))return {rows:[{ok:true}]};
   if(q.includes('r5_reply_partner_email_dev'))return {rows:[{ok:true}]};
   throw Error('query unexpected');
 }};
 const mail=await makePartnerEmailR51({pool,siteOrigin:'https://test.example',
  sendEmail:async x=>(sent=x,'test-mail-1234'),enabled:true,environment:'sandbox'});
 assert.equal(await mail.send({orderId:UUID1,sessionToken:'a'.repeat(43)}),'sent');
 assert.equal(memo[1],sha('a'.repeat(43)));assert.match(memo[2],/^[a-f0-9]{64}$/);
 assert.equal(sent.to,'second@example.test');
 assert.ok(sent.text.includes('/adhesion/confirmer-partenaire#t='));
 assert.equal(sent.text.includes(memo[2]),false);
 assert.equal(await mail.reply({token:'b'.repeat(43),decision:'confirmed'}),true);
 assert.equal(await mail.reply({token:'wrong',decision:'confirmed'}),false);
});
test('R5.1: émission Resend avec clé idempotente et échec fournisseur fermé',async()=>{
 let request;
 const send=makeResendSenderR51({apiKey:'re_testabcdef0123456789',from:'PDC <no-reply@example.test>',
  fetchImpl:async(url,opts)=>(request={url,opts},{ok:true,json:async()=>({id:'provider-12345'})})});
 assert.equal(await send({to:'member@example.test',subject:'Verification',text:'Sample',
   idempotencyKey:'r51-'+UUID1}),'provider-12345');
 assert.equal(request.url,'https://api.resend.com/emails');
 assert.equal(request.opts.headers['Idempotency-Key'],'r51-'+UUID1);
});
test('R5.1 SQL: refus/expiration = 30 EUR cotisation + 10 EUR don; sans deuxième encaissement',()=>{
 const sql=readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20261030004600_pdc_r5_consolidated_intake_dev.sql'),'utf8');
 assert.match(sql,/r5_regularize_couple_dev/);
 assert.match(sql,/r5_partner_email_tokens/);
 assert.match(sql,/CHECK\(member_dues_eur_cents \+ donation_eur_cents = original_total_eur_cents\)/);
 assert.match(sql,/partner_response_state='expired'/);
 assert.match(sql,/r5_issue_partner_email_dev/);
 assert.doesNotMatch(sql,/CREATE TABLE pdc_private.r5_fx_quotes/);
});
