/** PDC V5-B.6.7 : visualisation NON OFFICIELLE, pour données FICTIVES uniquement.
 * Aucun accès Supabase, aucun paiement, aucune émission/délivrance de carte.
 * Les photographies sont traitées en mémoire et ne sont pas téléversées.
 */
export const CARD_WIDTH = 1011;
export const CARD_HEIGHT = 639;
export const CARD_TYPES=Object.freeze({CAMEROUN:'cameroun',DIASPORA:'diaspora'});
export const FRONT_MODELS=Object.freeze({
  cameroun:new URL('./assets/modele-recto-cameroun.png',import.meta.url).href,
  diaspora:new URL('./assets/modele-recto-diaspora.png',import.meta.url).href,
});
export const FRONT_MODEL=FRONT_MODELS.diaspora; // Alias de compatibilité (ancien atelier)
export const TERRITORIAL_LABELS=Object.freeze({
  cameroun:Object.freeze(['Conseil régional','Conseil départemental','Comité d’arrondissement','Chambre']),
  diaspora:Object.freeze(['Secteur continental','Secteur national','Secteur régional','Secteur de base']),
});
export const TERRITORIAL_DEFAULTS=Object.freeze({
  cameroun:Object.freeze(['Centre','Lékié','Obala','Chambre fictive']),
  diaspora:Object.freeze(['Europe','France','Île-de-France','Section fictive']),
});
export const MOTTO_FR='DIEU - PATRIE - JUSTICE - DÉMOCRATIE';
export const MOTTO_EN='GOD - FATHERLAND - JUSTICE - DEMOCRACY';
export function requireCardType(type){
  if(type!=='cameroun' && type!=='diaspora')throw new TypeError('Choisir le modèle Cameroun ou diaspora.');
  return type;
}
export const BACK_MODEL = new URL('./assets/modele-verso-officiel.png', import.meta.url).href;
const PREFIX = Object.freeze({ Madame: 'F', Monsieur: 'M' });
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png']);

export function numeroSpecimen(civilite, serial = 123) {
  const prefix = PREFIX[civilite];
  if (!prefix || !Number.isInteger(serial) || serial < 1 || serial > 999999) {
    throw new TypeError('Civilité ou série invalide');
  }
  // Calcul de DÉMONSTRATION seulement. Le vrai numéro vient de PostgreSQL.
  return `${prefix}-PDC-I-${String(serial).padStart(6, '0')}`;
}
export function validatePhotoSpecimen(file) {
  if (!file) return null;  // aperçu possible sans photo
  if (!ALLOWED_PHOTO_MIME.has(file.type)) return 'Format photo : JPEG ou PNG uniquement.';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) {
    return 'La photo doit être inférieure ou égale à 5 Mo.';
  }
  return null;
}
export function formatBirthSpecimen(dateIso, place) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso || '')) return 'DATE DE TEST';
  const [y,m,d]=dateIso.split('-');
  return `${d}/${m}/${y} — ${String(place || '').trim() || 'LIEU DE TEST'}`;
}
export function toSpecimenData(raw={}){
  const type=requireCardType(raw.cardType??'cameroun');
  const get=(key,fallback,max=120)=>String(raw[key]??fallback).trim().slice(0,max)||fallback;
  const defaults=TERRITORIAL_DEFAULTS[type];
  return {
    type,
    number:numeroSpecimen(raw.civilite||'Madame',Number(raw.serial??123)),
    lastName:get('lastName','EXEMPLE',70),
    firstName:get('firstName','Prénom fictif',80),
    born:formatBirthSpecimen(raw.dateOfBirth||'1990-06-15',raw.placeOfBirth||'Ville fictive'),
    territory:defaults.map((defaultValue,i)=>get(`territory${i+1}`,defaultValue,80)),
    issueDate:get('issueDate','26/10/2026',20),
  };
}
function fitText(ctx,text,x,y,maxWidth,{size=22,minimum=12,weight=600,color='#1c2930'}={}){
  const value=String(text ?? '');
  let fontSize=size;
  ctx.fillStyle=color;
  do {
    ctx.font=`${weight} ${fontSize}px Arial, sans-serif`;
    if(ctx.measureText(value).width<=maxWidth)break;
    fontSize-=1;
  } while(fontSize>minimum);
  // Si le texte est encore trop long, le tronquer sans déborder du champ.
  let out=value;
  while(out.length>1&&ctx.measureText(out).width>maxWidth){out=out.slice(0,-1);}
  if(out.length<value.length){
    while(out.length>1&&ctx.measureText(`${out}…`).width>maxWidth)out=out.slice(0,-1);
    out+='…';
  }
  ctx.fillText(out,x,y);
}
export function drawWatermark(ctx) {
  ctx.save();
  ctx.translate(CARD_WIDTH/2,CARD_HEIGHT/2);
  ctx.rotate(-Math.PI/8);
  ctx.textAlign='center';
  ctx.font='900 112px Arial, sans-serif';
  ctx.fillStyle='rgba(145,25,18,0.24)';
  ctx.fillText('SPÉCIMEN',0,20);
  ctx.font='700 26px Arial, sans-serif';
  ctx.fillText('CARTE NON VALIDE — TEST',0,66);
  ctx.restore();
}
export function drawPhoto(ctx,photo){
  const x=13,y=166,w=254,h=298;
  if(!photo)return; // illustration officielle conservée si pas de fichier
  const iw=photo.naturalWidth??photo.width;
  const ih=photo.naturalHeight??photo.height;
  if(!(iw>0&&ih>0))throw new TypeError('Photographie impossible à décoder');
  const ratio=Math.max(w/iw,h/ih);
  const sw=w/ratio,sh=h/ratio;
  ctx.drawImage(photo,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,h);
}
function overwriteInactiveCode(ctx){
  // La maquette d'origine contient un QR et un code-barres factices.
  // Ils sont volontairement MASQUÉS pour éviter toute ambiguïté de validité.
  ctx.fillStyle='#f8faf5';
  ctx.fillRect(80,497,86,79);
  ctx.strokeStyle='#deac12';ctx.lineWidth=2;
  ctx.strokeRect(84,502,76,68);
  ctx.textAlign='center';ctx.fillStyle='#325e3f';
  ctx.font='700 12px Arial, sans-serif';
  ctx.fillText('QR',122,527);ctx.fillText('NON',122,544);ctx.fillText('ACTIF',122,561);
  ctx.textAlign='left';
  // Les deux rectos transmis ne présentent pas de code-barres actif.
}
/** Rend un recto SPÉCIMEN sur un canvas local, sans altérer la devise de l'image d'origine. */
export function renderFrontSpecimen(canvas, background, values, photo=null){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new TypeError('Canvas 2D indisponible');
  requireCardType(values.type);
  canvas.width=CARD_WIDTH;canvas.height=CARD_HEIGHT;
  ctx.drawImage(background,0,0,CARD_WIDTH,CARD_HEIGHT);
  drawPhoto(ctx,photo);
  const x=666;
  // Coordonnées prises sur la maquette OFFICIELLE fournie (1011 × 639).
  const rows=[
    [values.lastName,214], [values.firstName,271], [values.born,330],
    [values.territory[0],389], [values.territory[1],445],
    [values.territory[2],503], [values.territory[3],560]
  ];
  rows.forEach(([value,y],i)=>fitText(ctx,value,x,y,332,{size:i===2?20:23,minimum:12,weight:600}));
  overwriteInactiveCode(ctx);
  // La devise DÉMOCRATIE / DEMOCRACY figure déjà sur les deux rectos fournis.
  // Ne pas repeindre ni remplacer cette zone : conserver le graphisme officiel.
  fitText(ctx,values.number,837,611,165,{size:17,minimum:12,color:'#f9c62b',weight:700});
  fitText(ctx,values.issueDate,837,631,165,{size:16,minimum:12,color:'#f9c62b',weight:700});
  drawWatermark(ctx);
  return canvas;
}
/** Le verso COMMUN est conservé à l'identique, avec filigrane de test. */
export function renderBackSpecimen(canvas, background){
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new TypeError('Canvas 2D indisponible');
  canvas.width=CARD_WIDTH;canvas.height=CARD_HEIGHT;
  ctx.drawImage(background,0,0,CARD_WIDTH,CARD_HEIGHT);
  drawWatermark(ctx);
  return canvas;
}
export function savePng(canvas, filename) {
  if(!canvas || typeof canvas.toBlob!=='function')throw new TypeError('Canvas invalide');
  canvas.toBlob(blob=>{
    if(!blob)return;
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  },'image/png');
}
