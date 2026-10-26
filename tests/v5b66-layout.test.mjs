import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const jsx = readFileSync(new URL('src/pages/Adhesion.jsx', root), 'utf8');
const css = readFileSync(new URL('src/pages/Adhesion.css', root), 'utf8');

const gridPattern = '<div className="pdc-adhesion-grid">';

test('Les champs obligatoires du membre sont conservés, sans champ Sexe', () => {
  for (const id of ['a-last', 'a-first', 'a-dob', 'a-birthplace', 'a-country', 'a-job', 'a-email', 'a-phone']) {
    assert.equal(jsx.split(`id="${id}"`).length - 1, 1, `${id}: un seul champ attendu`);
  }
  assert.doesNotMatch(jsx, /a-(?:partner-)?sex|sexePartenaire|form\.sexe/);
});

test('Identité : nom/prénom et date/lieu de naissance sont appariés', () => {
  const identity = jsx.slice(jsx.indexOf(gridPattern, jsx.indexOf('<h2>{t.personal}</h2>')));
  assert.match(identity, /id="a-last"[\s\S]*id="a-first"[\s\S]*id="a-dob"[\s\S]*id="a-birthplace"/);
  const identityRow = identity.slice(0, identity.indexOf(gridPattern, gridPattern.length));
  assert.equal(identityRow.match(/className="pdc-adhesion-field"/g)?.length, 4);
});

test('Pays et profession forment une ligne de grille sans champ orphelin', () => {
  const start = jsx.indexOf('id="a-country"');
  const end = jsx.indexOf('id="a-email"');
  assert.ok(start > 0 && end > start);
  assert.match(jsx.slice(start, end), /id="a-job"/);
  assert.equal(jsx.split('id="a-country"').length - 1, 1);
  assert.match(jsx.slice(start, end), /<\/div>\s*<\/div>\s*<div className="pdc-adhesion-grid">/);
});

test('Coordonnées du partenaire : e-mail et téléphone restent deux colonnes normales', () => {
  const start = jsx.indexOf('id="a-partner-email"');
  const end = jsx.indexOf('</div><label className="pdc-adhesion-check">', start);
  assert.ok(start > 0 && end > start);
  assert.match(jsx.slice(start, end), /id="a-partner-phone"/);
  assert.doesNotMatch(jsx.slice(start, end), /pdc-adhesion-wide/);
});

test('La grille est alignée et passe en une colonne sur mobile', () => {
  assert.match(css, /\.pdc-adhesion-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.pdc-adhesion-grid > \.pdc-adhesion-field\{margin:0\}/);
  assert.match(css, /@media\(max-width:640px\)\{\.pdc-adhesion-grid,\.pdc-adhesion-metrics\{grid-template-columns:1fr\}/);
});

test('Carte facultative et photos couple préservées', () => {
  for (const value of ['form.demandeCarte', 'a-photo-member', 'a-photo-partner', 'form.civilitePartenaire']) {
    assert.ok(jsx.includes(value));
  }
});
