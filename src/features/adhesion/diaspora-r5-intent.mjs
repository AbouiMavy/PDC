// R5 : adaptateur DOM/formulaire existant, préparation en mémoire uniquement.
// Aucun prix fournisseur ou quote FX n'est défini par le navigateur.
function fail(){throw Error('PDC_R5_BROWSER_DIASPORA_INVALID');}
export function buildDiasporaR5Intent({form,idempotencyKey,phonePrefix}={}){
  if(!form||form.type!=='nouvelle'||form.pays==='CM'||
     !['simple','reduit','couple'].includes(form.formule)||
     typeof phonePrefix!=='string'||!/^\+[1-9][0-9]{0,3}$/.test(phonePrefix)||
     !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey??''))fail();
  const e164=v=>{
    const s=String(v??'').replace(/[\s().-]/g,'').replace(/^0+/,'');
    if(!/^\d{6,14}$/.test(s))fail();return phonePrefix+s;
  };
  const person=(slot)=>({
    civility:slot==='member'?form.civilite:form.civilitePartenaire,
    firstName:slot==='member'?form.prenom:form.prenomPartenaire,
    lastName:slot==='member'?form.nom:form.nomPartenaire,
    dob:slot==='member'?form.dateNaissance:form.dateNaissancePartenaire,
    birthPlace:slot==='member'?form.lieuNaissance:form.lieuNaissancePartenaire,
    email:slot==='member'?form.email:form.emailPartenaire,
    phoneE164:e164(slot==='member'?form.telephone:form.telephonePartenaire),
    acceptedStatutes:slot==='member'?form.accepteStatuts:form.consentPartenaire,
    acceptedDataNotice:slot==='member'?form.accepteDonnees:form.consentPartenaire,
  });
  const cardFormat={'numerique':'digital','physique':'physical','deux':'both'}[form.formatCarte];
  if(form.demandeCarte&&!cardFormat)fail();
  const commune=form.rattachementCommune==='__autre__'?form.rattachementAutre:form.rattachementCommune;
  if(form.formule==='couple' && (form.consentPartenaire!==true || form.accepteConversionDon!==true))fail();
  return Object.freeze({idempotencyKey,formula:form.formule,country:form.pays,
    donationConversionAccepted:form.formule==='couple' ? form.accepteConversionDon===true : false,
    member:person('member'),partner:form.formule==='couple'?person('partner'):null,
    requestCard:form.demandeCarte===true,cardFormat:form.demandeCarte?cardFormat:null,
    territory:{region:form.rattachementRegion,department:form.rattachementDepartement,commune}});
}
