#!/usr/bin/env node
// Patch volontairement minimal pour la V5-B.6.6+ du formulaire.
// Refuse tout écrasement si le code ne correspond pas à l'intégration attendue.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.cwd());
const file=resolve(root,'src/pages/Adhesion.jsx');
let body=readFileSync(file,'utf8');
const importLine="import { preparePortraitUploadIntent } from '../features/adhesion/portrait-upload-intent-v5b610e.mjs';\n";
const targetImport="import { prefixForCivilite } from '../features/adhesion/civilite.mjs';\n";
const guard="    if(photoError)return setError(t.errors[photoError] || t.errors.photo);\n";
const newGuard=`    if(photoError)return setError(t.errors[photoError] || t.errors.photo);
    // Préparation locale, sans téléversement ni appel réseau tant que le paiement
    // et les autorisations individuelles ne sont pas raccordés côté serveur.
    try {
      preparePortraitUploadIntent({
        requestCard:form.demandeCarte,
        isCouple:!domestic&&form.formule==='couple',
        photoMember:photoMembre,
        photoPartner:photoPartenaire,
      });
    } catch { return setError(t.errors.photo); }
`;
const reviewMarker="      <p className=\"pdc-adhesion-alert\">{t.noPayment}</p>\n";
const reviewChange=`      {isNew && form.demandeCarte && <p className="pdc-adhesion-alert" role="status">
        {lang==='en'
          ? 'Photos selected for the requested card(s). They are still on this device and have NOT been uploaded. Secure transfer will be enabled only after verified payment and a separate authorization for each beneficiary.'
          : 'Photos sélectionnées pour la ou les cartes demandées. Elles restent sur cet appareil et ne sont PAS encore téléversées. Le dépôt sécurisé sera activé uniquement après confirmation du paiement et autorisation individuelle pour chaque bénéficiaire.'}
      </p>}
      <p className="pdc-adhesion-alert">{t.noPayment}</p>
`;
if(body.includes('portrait-upload-intent-v5b610e.mjs')) {
  console.log('V5-B.6.10-E déjà appliquée : fichier inchangé.');process.exit(0);
}
for(const [s,label] of [[targetImport,'import civilité'],[guard,'garde de photo'],[reviewMarker,'avis récapitulatif']]) {
  if(body.split(s).length!==2) throw new Error('PDC_V5B610E_LAYOUT_MISMATCH : '+label);
}
body=body.replace(targetImport,targetImport+importLine).replace(guard,newGuard).replace(reviewMarker,reviewChange);
writeFileSync(file,body,'utf8');
console.log('V5-B.6.10-E : préparation photos et avis récapitulatif intégrés.');
