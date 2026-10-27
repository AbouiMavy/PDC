import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  CARD_TYPES,FRONT_MODELS,BACK_MODEL,TERRITORIAL_LABELS,TERRITORIAL_DEFAULTS,
  MOTTO_FR,MOTTO_EN,numeroSpecimen,toSpecimenData,
  renderFrontSpecimen,renderBackSpecimen,validatePhotoSpecimen,CARD_WIDTH,CARD_HEIGHT,
} from '../src/features/cartes-dev/carte-specimen.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function ctxAndCanvas(){
  const events=[];
  const ctx={
    save(){},restore(){},translate(){},rotate(){},fillRect(...args){events.push(['rect',...args]);},strokeRect(){},
    drawImage(...args){events.push(['image',...args]);},
    fillText(text){events.push(['text',text]);},
    measureText(text){return{width:text.length*9};},
    set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},
    set font(v){},set textAlign(v){}
  };
  return{ctx,events,canvas:{width:0,height:0,getContext(v){assert.equal(v,'2d');return ctx;}}};
}
test('deux modèles de recto différents et un seul verso commun',()=>{
  assert.notEqual(FRONT_MODELS.cameroun,FRONT_MODELS.diaspora);
  assert.match(FRONT_MODELS.cameroun,/modele-recto-cameroun\.png/);
  assert.match(FRONT_MODELS.diaspora,/modele-recto-diaspora\.png/);
  assert.match(BACK_MODEL,/modele-verso-officiel\.png/);
  const a=read('src/features/cartes-dev/assets/modele-recto-cameroun.png');
  const b=read('src/features/cartes-dev/assets/modele-recto-diaspora.png');
  assert.notEqual(sha(a),sha(b));
  const c=read('src/features/cartes-dev/assets/modele-verso-officiel.png');
  assert.ok(c.length>100000);
});
test('le verso PDC fourni est conservé octet par octet',()=>{
  const back=read('src/features/cartes-dev/assets/modele-verso-officiel.png');
  assert.equal(sha(back),'af7f35a5ccaca863e8f4df67e2d36257341a342c09d05f2817559ce7857d418e'.slice(0,64));
});
test('champs territoriaux Cameroun : quatre conseils/comités/chambre',()=>{
  assert.deepEqual(TERRITORIAL_LABELS.cameroun,[
    'Conseil régional','Conseil départemental','Comité d’arrondissement','Chambre']);
  const vals=toSpecimenData({cardType:'cameroun',territory1:'Sud',territory2:'Océan',territory3:'Kribi',territory4:'Chambre A'});
  assert.deepEqual(vals.territory,['Sud','Océan','Kribi','Chambre A']);
  assert.equal(vals.type,'cameroun');
});
test('champs territoriaux Diaspora : secteurs continental, national, régional, base',()=>{
  assert.deepEqual(TERRITORIAL_LABELS.diaspora,[
    'Secteur continental','Secteur national','Secteur régional','Secteur de base']);
  const vals=toSpecimenData({cardType:'diaspora',territory1:'Europe',territory2:'France',territory3:'IDF',territory4:'Paris'});
  assert.deepEqual(vals.territory,['Europe','France','IDF','Paris']);
  assert.notDeepEqual(TERRITORIAL_DEFAULTS.cameroun,TERRITORIAL_DEFAULTS.diaspora);
});
test('la devise DÉMOCRATIE / DEMOCRACY figure dans les références et reste intacte au rendu',()=>{
  assert.equal(MOTTO_FR,'DIEU - PATRIE - JUSTICE - DÉMOCRATIE');
  assert.equal(MOTTO_EN,'GOD - FATHERLAND - JUSTICE - DEMOCRACY');
  for (const type of Object.values(CARD_TYPES)) {
    const {events,canvas}=ctxAndCanvas();
    renderFrontSpecimen(canvas,{},toSpecimenData({cardType:type}));
    // Aucune couche de peinture n'efface la devise du bandeau inférieur gauche.
    assert.ok(!events.some(e=>e[0]==='rect' && e[1]===0 && e[2]>=580 && e[3]>=350));
    assert.ok(!events.some(e=>e[0]==='text' && /ÉGALITÉ|EQUALITY/.test(e[1])));
    assert.ok(events.some(e=>e[0]==='image')); // image originale utilisée
  }
  const {events,canvas}=ctxAndCanvas();
  renderBackSpecimen(canvas,{});
  assert.ok(events.some(e=>e[1]==='SPÉCIMEN'));
  assert.ok(!events.some(e=>e[1]===MOTTO_FR)); // verso commun : aucun texte ajouté
});
test('les deux types produisent le recto avec sept champs, watermark et dimensions attendues',()=>{
  for(const type of Object.values(CARD_TYPES)){
    const {events,canvas}=ctxAndCanvas();
    const values=toSpecimenData({cardType:type});
    renderFrontSpecimen(canvas,{},values);
    assert.equal(canvas.width,CARD_WIDTH);assert.equal(canvas.height,CARD_HEIGHT);
    assert.ok(events.some(e=>e[1]===values.territory[3]));
    assert.ok(events.some(e=>e[1]==='SPÉCIMEN'));
    assert.ok(events.some(e=>e[1]==='QR'));
    assert.ok(!events.some(e=>e[1]===MOTTO_FR)); // devise déjà imprimée sur le fond source
  }
});
test('numéro fictif M/F à six chiffres, photo et dates',()=>{
  assert.equal(numeroSpecimen('Madame',1),'F-PDC-I-000001');
  assert.equal(numeroSpecimen('Monsieur',234),'M-PDC-I-000234');
  assert.throws(()=>toSpecimenData({cardType:'inconnu'}));
  assert.equal(validatePhotoSpecimen(null),null);
  assert.match(validatePhotoSpecimen({type:'image/svg+xml',size:100}),/JPEG ou PNG/);
  assert.equal(toSpecimenData({dateOfBirth:'2000-04-15',placeOfBirth:'Obala'}).born,'15/04/2000 — Obala');
});
test('atelier autonome : sélecteur, champs dynamiques, aucune donnée envoyée',()=>{
  const html=read('carte-dev.html').toString('utf-8');
  const js=read('src/features/cartes-dev/demo.mjs').toString('utf-8');
  assert.match(html,/id="card-type"/);
  for(let i=1;i<=4;i++)assert.match(html,new RegExp(`id="territory-${i}"`));
  assert.match(js,/FRONT_MODELS\[type\]/);
  assert.match(js,/TERRITORIAL_LABELS\[type\]/);
  assert.match(js,/backgrounds\.back/);
  assert.doesNotMatch(js,/fetch\(|supabase|localStorage|sessionStorage|Authorization|Bearer/);
});
