import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ad=readFileSync(new URL('../src/pages/Adhesion.jsx',import.meta.url),'utf8');
const payment=readFileSync(new URL('../src/components/PaymentMethods/PaymentMethods.jsx',import.meta.url),'utf8');
test('six rubriques numérotées dans le formulaire Adhérer',()=>{
  assert.match(ad,/<h2>1\. \{t\.type/);
  assert.match(ad,/<h2>2\. \{t\.personal\}<\/h2>/);
  assert.match(ad,/<h2>3\. \{t\.annual\}<\/h2>/);
  assert.match(ad,/<h2>4\. \{t\.cardSection\}<\/h2>/);
  assert.match(ad,/titlePrefix="5\. "/);
  assert.match(ad,/<h2>6\. \{t\.memberStatements\}<\/h2>/);
});
test('Soutenir conserve son titre et Adhérer reçoit son préfixe sans double 5',()=>{
  assert.match(payment,/titlePrefix = ''/);
  assert.match(payment,/titlePrefix \?/);
  assert.match(payment,/donation\.paymentTitle/);
});
test('aucun paiement déclenché depuis une rubrique',()=>{
  assert.doesNotMatch(payment,/\bfetch\(|\/paymentlinks|window\.location/);
});
