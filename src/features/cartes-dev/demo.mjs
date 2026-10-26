import { FRONT_MODELS, BACK_MODEL, TERRITORIAL_LABELS, TERRITORIAL_DEFAULTS, toSpecimenData, validatePhotoSpecimen,
  renderFrontSpecimen, renderBackSpecimen, savePng } from './carte-specimen.mjs';

const $=id=>document.getElementById(id);
const form=$('member-form');
let portraitUrl=null;
let portrait=null;
const imageFromUrl=src=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Chargement du modèle impossible.'));
  img.src=src;
});
const backgrounds={front:{},back:null};
const storedTerritories={};
let previousType=$('card-type').value;
function setTerritoryType(type){
  const labels=TERRITORIAL_LABELS[type];
  const defaults=storedTerritories[type]??TERRITORIAL_DEFAULTS[type];
  for(let i=1;i<=4;i++){
    $(`territory-${i}-label`).textContent=labels[i-1];
    $(`territory-${i}`).value=defaults[i-1];
  }
  $('front-heading').textContent=`Recto : ${type==='cameroun'?'Cameroun':'Diaspora'}`;
  $('back-heading').textContent='Verso : commun aux deux cartes';
}
setTerritoryType(previousType);
$('card-type').addEventListener('change',()=>{
  storedTerritories[previousType]=[1,2,3,4].map(i=>$(`territory-${i}`).value);
  previousType=$('card-type').value;
  setTerritoryType(previousType);
  rerender();
});
function invalidateExports(){
  $('download-front').disabled=true;
  $('download-back').disabled=true;
}
async function rerender(){
  invalidateExports();$('error').textContent='';
  try {
    const type=$('card-type').value;
    if(!backgrounds.front[type]) backgrounds.front[type]=await imageFromUrl(FRONT_MODELS[type]);
    if(!backgrounds.back) backgrounds.back=await imageFromUrl(BACK_MODEL);
    const member=toSpecimenData(Object.fromEntries(new FormData(form)));
    renderFrontSpecimen($('front'),backgrounds.front[type],member,portrait);
    renderBackSpecimen($('back'),backgrounds.back);
    $('download-front').disabled=false;
    $('download-back').disabled=false;
  } catch(err){ $('error').textContent=err.message || 'Erreur de rendu.'; }
}
form.addEventListener('submit',event=>{event.preventDefault();rerender();});
$('portrait').addEventListener('change',async event=>{
  portrait=null;
  const file=event.target.files?.[0];
  const error=validatePhotoSpecimen(file);
  if(portraitUrl){URL.revokeObjectURL(portraitUrl);portraitUrl=null;}
  if(error){ $('error').textContent=error;event.target.value='';invalidateExports();return; }
  if(file){
    try{portraitUrl=URL.createObjectURL(file);portrait=await imageFromUrl(portraitUrl);}
    catch(_){$('error').textContent='Impossible de lire la photo.';invalidateExports();return;}
  }
  rerender();
});
$('download-front').addEventListener('click',()=>savePng($('front'),`PDC_${$('card-type').value.toUpperCase()}_SPECIMEN_RECTO_NON_VALIDE.png`));
$('download-back').addEventListener('click',()=>savePng($('back'),`PDC_${$('card-type').value.toUpperCase()}_SPECIMEN_VERSO_NON_VALIDE.png`));
window.addEventListener('pagehide',()=>{if(portraitUrl)URL.revokeObjectURL(portraitUrl);});
rerender();
