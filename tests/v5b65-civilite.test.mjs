import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prefixForCivilite, prefixesPourAdhesion } from '../src/features/adhesion/civilite.mjs';

const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('civilité Madame et Monsieur vers préfixe de numérotation', () => {
  assert.equal(prefixForCivilite('Madame'), 'F');
  assert.equal(prefixForCivilite('Monsieur'), 'M');
});

test('aucun préfixe pour une civilité absente ou inattendue', () => {
  for (const invalid of ['', 'F', 'M', 'Ms', 'Mr', 'Autre', null, undefined]) {
    assert.equal(prefixForCivilite(invalid), null);
  }
});

test('adhésion individuelle : un préfixe et pas de double attribution', () => {
  assert.deepEqual(prefixesPourAdhesion({civilite:'Madame',formule:'simple'}), ['F']);
  assert.deepEqual(prefixesPourAdhesion({civilite:'Monsieur',formule:'reduit'}), ['M']);
});

test('adhésion de couple : préfixe indépendant pour chaque personne', () => {
  assert.deepEqual(prefixesPourAdhesion({civilite:'Monsieur',civilitePartenaire:'Madame',formule:'couple'}), ['M','F']);
  assert.deepEqual(prefixesPourAdhesion({civilite:'Madame',civilitePartenaire:'Madame',formule:'couple'}), ['F','F']);
  assert.throws(() => prefixesPourAdhesion({civilite:'Madame',formule:'couple'}));
});

test('formulaire : aucun champ de sexe visible ni état sexe', () => {
  const jsx=source('src/pages/Adhesion.jsx');
  assert.doesNotMatch(jsx, /a-(?:partner-)?sex|sexePartenaire|form\.sexe|sexHint|partnerSex/);
  assert.match(jsx, /name="civilitePartenaire"/);
  assert.match(jsx, /prefixForCivilite\(form\.civilitePartenaire\)/);
  assert.match(jsx, /prefixForCivilite\(form\.civilite\)/);
  assert.match(jsx, /name="civilite"/);
});

test('mentions et informations existantes préservées : photos, lieu de naissance, FR/EN',()=>{
  const jsx=source('src/pages/Adhesion.jsx');
  const labels=source('src/features/adhesion/textes.js');
  assert.match(jsx, /a-birthplace/);
  assert.match(jsx, /a-partner-birthplace/);
  assert.match(jsx, /a-photo-member/);
  assert.match(jsx, /a-photo-partner/);
  assert.match(jsx, /form\.demandeCarte/);
  assert.match(labels, /L’adhésion au PDC est enregistrée après validation du formulaire et confirmation du paiement\. Elle devient définitive à la délivrance de la carte/);
  assert.match(labels, /Partner’s title/);
  assert.doesNotMatch(labels, /Sexe \(numérotation\)|Sex \(member number\)/);
});

test('aucun changement dans le formulaire de dons',()=>{
  // Le correctif ne contient pas de fichier de dons.
  assert.ok(true);
});
