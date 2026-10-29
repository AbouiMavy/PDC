import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const text = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const shared = text('../src/components/PaymentMethods/PaymentMethods.jsx');
const adh = text('../src/pages/Adhesion.jsx');
const don = text('../src/components/DonForm/DonForm.jsx');

test('adhesion et don utilisent exactement le meme composant', () => {
  assert.match(adh,/PaymentMethods from '..\/components\/PaymentMethods\/PaymentMethods'/);
  assert.match(don,/PaymentMethods from '..\/PaymentMethods\/PaymentMethods'/);
  assert.match(adh,/<PaymentMethods methode=\{methode\}/);
  assert.match(don,/<PaymentMethods methode=\{methode\}/);
});
test('4 moyens de paiement accessibles dans les deux formulaires',()=>{
  assert.match(shared,/\['mobile', 'tara', 'carte', 'virement'\]/);
  assert.match(shared,/donation\.methods\.\$\{id\}/);
  assert.match(shared,/onMethodeChange\(id\)/);
});
test('choix WhatsApp et Telegram memorises',()=>{
  assert.match(shared,/\['general','whatsapp','telegram','dikalo'\]/);
  assert.match(shared,/id === 'general'/);
  assert.match(shared,/onMessagerieChange\(id\)/);
  assert.match(adh,/const \[messagerie,setMessagerie\]/);
  assert.match(adh,/messagerie==='telegram'/);
});
test('virement reprend les coordonnees bancaires et copies',()=>{
  assert.match(shared,/RIB\.iban/);
  assert.match(shared,/RIB\.bic/);
  assert.match(shared,/navigator\.clipboard\.writeText/);
});
test('récapitulatif adhesion reprend le mode selectionne',()=>{
  assert.match(adh,/donationText\(`donation\.methods\.\$\{methode\}`\)/);
});
test('aucun fetch Tara ni paiement déclenché par le composant',()=>{
  assert.doesNotMatch(shared,/\bfetch\(|\/paymentlinks|window\.location|window\.open/);
  assert.doesNotMatch(shared,/\bconfirmed\b|paymentConfirmed\s*:\s*true/);
});
test('étiquettes non supprimees du formulaire Soutenir',()=>{
  assert.match(shared,/donation\.paymentTitle/);
  assert.match(shared,/donation\.methodDetails\.\$\{id\}/);
  assert.match(shared,/donation\.bankHelp/);
});
