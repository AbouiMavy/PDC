import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTaraLinkResponse,makeTaraServerClient} from '../src/v5c/tara-server-client-v5c.mjs';
import {selectTaraPaymentLink,TARA_LINK_FIELDS} from '../src/v5c/tara-channel-links-v5c.mjs';

const LINKS={status:'SUCCESS',generalLink:'https://taramoney.com/pay/123456',
  cardLink:'https://taramoney.com/card/123456',
  whatsappLink:'https://wa.me/?text=payment',
  telegramLink:'https://t.me/share/url?url=https%3A%2F%2Ftaramoney.com%2Fpay%2F123456',
  dikaloLink:'https://www.dklo.co/share/dikalo/123456',
  smsLink:'https://www.dklo.co/share/sms/123456'};

const selected=(raw,method,messagingChannel=null)=>selectTaraPaymentLink(raw,{method,messagingChannel});
test('API Tara conserve les six champs de liens et valide SUCCESS majuscule',()=>{
  const result=parseTaraLinkResponse(LINKS);
  for (const key of ['generalLink','cardLink','whatsappLink','telegramLink','dikaloLink','smsLink'])
    assert.equal(result[key],LINKS[key]);
});
test('Mobile Money utilise exclusivement smsLink',()=>{
  assert.deepEqual(selected(LINKS,'mobile'),{field:'smsLink',paymentUrl:LINKS.smsLink});
});
test('WhatsApp utilise exclusivement whatsappLink',()=>{
  assert.deepEqual(selected(LINKS,'tara','whatsapp'),{field:'whatsappLink',paymentUrl:LINKS.whatsappLink});
});
test('Telegram utilise exclusivement telegramLink',()=>{
  assert.deepEqual(selected(LINKS,'tara','telegram'),{field:'telegramLink',paymentUrl:LINKS.telegramLink});
});
test('Dikalo utilise exclusivement dikaloLink',()=>{
  assert.deepEqual(selected(LINKS,'tara','dikalo'),{field:'dikaloLink',paymentUrl:LINKS.dikaloLink});
});
test('carte bancaire via Tara utilise exclusivement cardLink',()=>{
  assert.deepEqual(selected(LINKS,'carte'),{field:'cardLink',paymentUrl:LINKS.cardLink});
});
test('absence de lien de canal : JAMAIS de repli sur generalLink',()=>{
  for (const [method,messagingChannel,field] of [['mobile',null,'smsLink'],
      ['tara','whatsapp','whatsappLink'],['tara','telegram','telegramLink'],
      ['tara','dikalo','dikaloLink'],['carte',null,'cardLink']]) {
    const raw={...LINKS};delete raw[field];
    assert.throws(()=>selected(raw,method,messagingChannel),/PDC_TARA_CHANNEL_LINK_UNAVAILABLE/);
  }
});
test('virement et combinaisons inconnues refusés par le routeur Tara',()=>{
  for (const [method,messagingChannel] of [['virement',null],['tara',null],['mobile','telegram'],['carte','whatsapp'],['tara','signal']])
    assert.throws(()=>selected(LINKS,method,messagingChannel),/PDC_TARA_CHANNEL_INVALID/);
});
test('un statut prestataire FAILED ne peut produire aucun lien sélectionné',()=>{
  assert.throws(()=>selected({...LINKS,status:'FAILED'},'mobile'),/PDC_TARA_LINK_NOT_CREATED/);
});
test('une URL fournisseur externe inconnue ou protocole dangereux est rejeté',()=>{
  for(const field of ['smsLink','whatsappLink','telegramLink','dikaloLink']) {
    assert.throws(()=>parseTaraLinkResponse({...LINKS,[field]:'https://evil.example/pay'}),/PDC_TARA_PAYMENT_LINK_INVALID/);
    assert.throws(()=>parseTaraLinkResponse({...LINKS,[field]:'javascript:alert(1)'}),/PDC_TARA_PAYMENT_LINK_INVALID/);
  }
});
test('lien sms natif accepté uniquement au format sms:',()=>{
  const raw={...LINKS,smsLink:'sms:?body=Paiement%20PDC'};
  assert.equal(selected(raw,'mobile').paymentUrl,'sms:?body=Paiement%20PDC');
  assert.throws(()=>parseTaraLinkResponse({...LINKS,smsLink:'sms:foo#javascript'}),/PDC_TARA_PAYMENT_LINK_INVALID/);
});
test('client HTTP prive renvoie les liens distincts, sans clés dans le résultat',async()=>{
  const client=makeTaraServerClient({apiKey:'faux_test_secret',businessId:'PDC_TEST',
    environment:'sandbox',allowNetwork:true,
    fetchImpl:async(_url,_config)=>({ok:true,text:async()=>JSON.stringify(LINKS)})});
  const result=await client.createPaymentLink({productId:'PDC_'+'a'.repeat(24),
    productName:'Don PDC',amountXaf:'500',productDescription:'Don PDC public',
    returnUrl:'https://pdc.example.org/retour',webHookUrl:'https://api.pdc.example.org/tara'});
  assert.equal(result.smsLink,LINKS.smsLink);
  assert.equal(result.cardLink,LINKS.cardLink);
  assert.equal(result.whatsappLink,LINKS.whatsappLink);
  assert.equal('apiKey' in result,false);
});
test('commande publique réserve aussi une carte Tara et conserve le virement séparé',()=>{
  const base=new URL('../../../',import.meta.url);
  const src=readFileSync(new URL('backend/pdc-api/src/v5c/tara-public-checkout-coordinator-v5c.mjs',base),'utf8');
  const sql=readFileSync(new URL('supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql',base),'utf8');
  assert.match(src,/order\.method==='virement'\)/);
  assert.doesNotMatch(sql,/WHEN 'carte' THEN 'stripe'/);
  assert.match(sql,/WHEN 'virement' THEN 'bank_transfer' ELSE 'tara'/);
});
