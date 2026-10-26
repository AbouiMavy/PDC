import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMUNES_CM, NOMBRE_COMMUNES_CM, communesPourDepartement } from '../src/features/adhesion/communes-cm.js';

test('360 entrées dans 58 départements', () => {
  assert.equal(Object.keys(COMMUNES_CM).length, 58);
  assert.equal(NOMBRE_COMMUNES_CM, 360);
  assert.equal(Object.values(COMMUNES_CM).reduce((n, names) => n + names.length, 0), 360);
});

test('aucune commune identique répétée dans le même département', () => {
  for (const [dep, names] of Object.entries(COMMUNES_CM)) {
    assert.equal(new Set(names).size, names.length, dep);
  }
});

test('sélection de la Bénoué et de la Lékié', () => {
  const benoue = communesPourDepartement('Bénoué');
  assert.equal(benoue.length, 12);
  assert(benoue.includes('Garoua 1er'));
  const lekie = communesPourDepartement('Lékié');
  assert.equal(lekie.length, 9);
  assert(lekie.includes('Sa’a'));
  assert(lekie.includes('Monatélé'));
});

test('variantes de noms communaux reconnues', () => {
  assert(communesPourDepartement('Méfou-et-Afamba').includes('Olanguina (Assamba)'));
  assert(communesPourDepartement('Nyong-et-Mfoumou').includes('Kobdombo (Nyakokombo)'));
  assert.deepEqual(communesPourDepartement('Inexistant'), []);
});
