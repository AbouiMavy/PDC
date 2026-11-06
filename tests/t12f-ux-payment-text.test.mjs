import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const fr=readFileSync(new URL('../src/locales/fr.js',import.meta.url),'utf8');
const en=readFileSync(new URL('../src/locales/en.js',import.meta.url),'utf8');

test('T12-F : la carte TaraMoney est décrite en français sans jargon interne',()=>{
  assert.match(fr,/carte:'Paiement sécurisé par carte bancaire ou portefeuille numérique via TaraMoney'/);
  assert.match(fr,/cardHelp: 'Le lien de paiement ouvre la page sécurisée TaraMoney\./);
  assert.doesNotMatch(fr,/carte:'[^']*cardLink|cardHelp: '[^']*cardLink/);
  assert.doesNotMatch(fr,/cardHelp: '[^']*Paiement non activé/);
});
test('T12-F : le texte anglais est cohérent avec la version française',()=>{
  assert.match(en,/carte:'Secure card or digital wallet payment through TaraMoney'/);
  assert.match(en,/cardHelp:'The payment link opens TaraMoney’s secure checkout\./);
  assert.doesNotMatch(en,/carte:'[^']*cardLink|cardHelp:'[^']*cardLink/);
});
test('T12-F : indisponibilité du parcours et confirmation de la transaction restent distinctes',()=>{
  assert.match(fr,/paymentUnavailable: 'Le paiement en ligne n’est pas disponible dans cette version du site\./);
  assert.match(fr,/cardHelp: '[^']*Le PDC confirmera la contribution après vérification du paiement\./);
  assert.match(fr,/taraHelp: '[^']*Le PDC confirmera la contribution après vérification du paiement\./);
  assert.match(en,/cardHelp:'[^']*The PDC will confirm your contribution once the payment has been verified\./);
  assert.match(en,/paymentUnavailable:'Online payment is unavailable in this version of the website\./);
});
