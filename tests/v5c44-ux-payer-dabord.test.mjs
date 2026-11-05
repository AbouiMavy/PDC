import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('44 UX R3: lien de paiement prioritaire et distinct du bouton de fin',()=>{
  const x=read('src/components/PaymentMethods/PublicCheckoutV5C29.jsx');
  assert.match(x,/pdc-checkout-v5c29__pay-link/);
  assert.match(x,/Payer \${result.grossAmountXaf} FCFA sur TaraMoney/);
  // R5.1: ouvre la phase de references ET conserve le dossier de retour Tara.
  assert.match(x,/onClick=\{\(\)=>\{\s*setLinkOpened\(true\);\s*savePendingReturnR5\(source,result\);\s*\}\}/);
  assert.match(x,/result.status!==\x27issued\x27\|\|linkOpened/);
  assert.ok(x.indexOf('pdc-checkout-v5c29__pay-link')<x.indexOf('pdc-checkout-v5c29__finish'));
});
test('44 UX R3: paiement différé et ouverture ne prouvent rien',()=>{
  const x=read('src/components/PaymentMethods/PublicCheckoutV5C29.jsx');
  assert.match(x,/Payer plus tard/);
  assert.match(x,/makePendingReceiptV5C44/); // aucun statut financier manipulé
});
test('44 UX R3: lien stylisé pour mobile avec focus visible',()=>{
  const c=read('src/components/PaymentMethods/PublicCheckoutV5C29.css');
  assert.match(c,/\.pdc-checkout-v5c29__pay-link \{/);
  assert.match(c,/@media \(max-width: 600px\)/);
  assert.match(c,/:focus-visible/);
});
test('44 UX R3: accusé téléchargeable sans reçus financiers ni appels backend',()=>{
  const c=read('src/components/PaymentMethods/PendingManualReceiptV5C44.jsx');
  assert.match(c,/saveAcknowledgment/);
  assert.match(c,/Not a payment receipt/);
  assert.doesNotMatch(c,/fetch\s*\(|localStorage|sessionStorage/);
  assert.match(c,/const membership=receipt\.source===['"]membership['"]/);
  assert.match(c,/\{membership\s*\?\s*\(/);
});
test('44 UX R3: pas de prévisualisation concurrente en sandbox',()=>{
  const x=read('src/pages/Adhesion.jsx');
  // R5.1: pas de bouton de previsualisation si le checkout CM OU diaspora est actif.
  assert.match(x,/\{!\(domestic\?publicCheckoutSandboxEnabled\(\):diasporaR5Enabled\(\)\)\&\&<button/);
});
test('44 UX R3: libellé produit conservé en UTF-8',()=>{
  const x=read('backend/pdc-api/src/v5c/tara-public-issuer-v5c.mjs');
  assert.match(x,/Première adhésion PDC/);
});
