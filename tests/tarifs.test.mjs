import test from 'node:test';
import assert from 'node:assert/strict';
import {calculPremiereAdhesionCM,calculDiaspora,calculSoldeCotisation} from '../src/features/adhesion/tarifs.mjs';
test('première adhésion CM : frais sans cotisation',()=>{
  assert.deepEqual(calculPremiereAdhesionCM({categorie:'urbain'}),{devise:'XAF',fraisAdhesion:2000,cotisationAnnuelle:12000,versementCotisation:0,resteAnnuel:12000,totalImmediate:2000});
});
test('première adhésion CM : règlement partiel',()=>{
  assert.equal(calculPremiereAdhesionCM({categorie:'urbain',mode:'partiel',versement:'3000'}).totalImmediate,5000);
  assert.equal(calculPremiereAdhesionCM({categorie:'urbain',mode:'partiel',versement:'3000'}).resteAnnuel,9000);
});
test('première adhésion CM : règlement total',()=>{assert.equal(calculPremiereAdhesionCM({categorie:'rural_etudiant',mode:'total'}).totalImmediate,7000);});
test('montant partiel invalide refusé',()=>{
  for(const n of ['-5','0','12000','12001','10.5','']) assert.throws(()=>calculPremiereAdhesionCM({categorie:'urbain',mode:'partiel',versement:n}));
});
test('diaspora simple/couple/réduit',()=>{
  assert.equal(calculDiaspora({formule:'simple'}).totalImmediate,30);
  assert.equal(calculDiaspora({formule:'couple'}).totalImmediate,40);
  assert.equal(calculDiaspora({formule:'reduit'}).totalImmediate,15);
});
test('seuls les versements confirmés réduisent le solde',()=>{
  assert.deepEqual(calculSoldeCotisation({annuel:12000,versements:[
    {nature:'cotisation',montant:3000,statut:'confirme'},
    {nature:'cotisation',montant:4000,statut:'en_attente'},
    {nature:'frais_adhesion',montant:2000,statut:'confirme'}
  ]}),{du:12000,encaisse:3000,solde:9000});
});
