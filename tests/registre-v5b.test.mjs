import test from 'node:test';
import assert from 'node:assert/strict';
import {calculSoldeParVersements, calculPremiereCotisation, montantReparti, enUnitesMineures} from '../src/features/gestion-financiere/registre.mjs';
test('conversion sure: 30 EUR = 3000 centimes et 500 XAF = 500 FCFA',()=>{
  assert.equal(enUnitesMineures('30','EUR'),3000);
  assert.equal(enUnitesMineures('30.50','EUR'),3050);
  assert.equal(enUnitesMineures('500','XAF'),500);
  assert.throws(()=>enUnitesMineures('10.50','XAF'),/entier/);
});
test('2 000 FCFA initiaux obligatoires, cotisation annuelle facultative',()=>{
  const r=calculPremiereCotisation({categorie:'urbain'});
  assert.deepEqual({total:r.total,solde:r.soldeAnnuel},{total:2000,solde:12000});
});
test('premier versement partiel et solde',()=>{
  const r=calculPremiereCotisation({categorie:'urbain',mode:'partiel',partiel:3000});
  assert.equal(r.total,5000);assert.equal(r.soldeAnnuel,9000);
});
test('frais d’adhésion et cotisation sont deux destinations',()=>{
  assert.equal(montantReparti({paiement:5000,parts:[{type:'frais_adhesion',montant:2000},{type:'cotisation',montant:3000}]}),5000);
});
test('deux versements confirmés seulement',()=>{
  const a=calculSoldeParVersements({montantDu:12000,devise:'XAF',operations:[
    {id:'T1',montant:3000,devise:'XAF',statut:'confirme'},
    {id:'T2',montant:4000,devise:'XAF',statut:'confirme'},
    {id:'T3',montant:5000,devise:'XAF',statut:'en_attente'}]});
  assert.equal(a.paye,7000);assert.equal(a.solde,5000);
});
test('un événement dupliqué est rejeté',()=>{
  assert.throws(()=>calculSoldeParVersements({montantDu:12000,devise:'XAF',operations:[
    {id:'T1',montant:2000,devise:'XAF',statut:'confirme'},
    {id:'T1',montant:2000,devise:'XAF',statut:'confirme'}]}),/dupliqué/);
});
test('pas de solde négatif ni de mélange de devises',()=>{
  assert.throws(()=>calculSoldeParVersements({montantDu:1000,devise:'XAF',operations:[{id:'T1',montant:1200,devise:'XAF',statut:'confirme'}]}),/Trop-perçu/);
  assert.throws(()=>calculSoldeParVersements({montantDu:12000,devise:'XAF',operations:[{id:'T2',montant:100,devise:'EUR',statut:'confirme'}]}),/devise/);
});
test('répartition incohérente rejetée',()=>{
  assert.throws(()=>montantReparti({paiement:5000,parts:[{type:'cotisation',montant:3000}]}),/différentes/);
});
test('versement annuel zéro interdit en mode partiel',()=>{
  assert.throws(()=>calculPremiereCotisation({categorie:'urbain',mode:'partiel',partiel:0}),/partiel/);
});
