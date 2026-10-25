import test from 'node:test';
import assert from 'node:assert/strict';
import { TERRITOIRES } from '../src/components/DonForm/territoires.js';
import { COMMUNES_CM, communesPourDepartement } from '../src/features/adhesion/communes-cm.js';

test('Dons et adhésions partagent le même référentiel pour les 58 départements', () => {
  const divisions = TERRITOIRES.CM.regions.flatMap(region => region.departements.map(d => d.code));
  assert.equal(divisions.length, 58);
  for (const nom of divisions) {
    assert(communesPourDepartement(nom).length > 0, `Liste manquante pour ${nom}`);
    assert.deepEqual(communesPourDepartement(nom), COMMUNES_CM[nom]);
  }
});

test('Lékié et Bénoué : exemples de sélection en cascade', () => {
  const centre = TERRITOIRES.CM.regions.find(r => r.code === 'Centre');
  const nord = TERRITOIRES.CM.regions.find(r => r.code === 'Nord');
  assert(centre.departements.some(d => d.code === 'Lékié'));
  assert(nord.departements.some(d => d.code === 'Bénoué'));
  assert(communesPourDepartement('Lékié').includes('Obala'));
  assert(communesPourDepartement('Bénoué').includes('Garoua 1er'));
});
