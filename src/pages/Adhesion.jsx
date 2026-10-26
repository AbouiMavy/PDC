import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAYS } from '../components/DonForm/pays';
import { INDICATIFS } from '../components/DonForm/indicatifs';
import { TERRITOIRES } from '../components/DonForm/territoires';
import { getAdhesionText } from '../features/adhesion/textes';
import { communesPourDepartement } from '../features/adhesion/communes-cm';
import { calculPremiereAdhesionCM, calculDiaspora, CAMEROUN, DIASPORA } from '../features/adhesion/tarifs.mjs';
import { PROFESSIONS } from '../features/adhesion/professions.js';
import { validateCardSelection, validatePhoto } from '../features/adhesion/carte.mjs';
import { prefixForCivilite } from '../features/adhesion/civilite.mjs';
import { preparePortraitUploadIntent } from '../features/adhesion/portrait-upload-intent-v5b610e.mjs';
import './Adhesion.css';

const FICHIERS = [
  '/documents/adhesion/statuts-pdc.pdf',
  '/documents/adhesion/reglement-interieur-pdc.pdf',
  '/documents/adhesion/decision-cotisations-pdc.pdf',
];
const defaultValues = {
  type:'nouvelle',pays:'CM',civilite:'',nom:'',prenom:'',dateNaissance:'',lieuNaissance:'',profession:'',
  email:'',telephone:'',region:'',departement:'',commune:'',communeAutre:'',
  regionEtrangere:'',departementEtranger:'',ville:'',codePostal:'',
  rattachementRegion:'',rattachementDepartement:'',rattachementCommune:'',rattachementAutre:'',
  categorie:'rural_etudiant',modeCotisation:'aucun',versementPartiel:'',formule:'simple',
  nomPartenaire:'',prenomPartenaire:'',civilitePartenaire:'',dateNaissancePartenaire:'',lieuNaissancePartenaire:'',emailPartenaire:'',telephonePartenaire:'',consentPartenaire:false,
  demandeCarte:false,formatCarte:'numerique',
  numeroMilitant:'',accepteStatuts:false,accepteDonnees:false,
};
const today = () => {
  const x = new Date();
  return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
};
const validEmail = x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((x||'').trim());
function validDOB(x){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x) || x>today())return false;
  const d=new Date(`${x}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.getFullYear()===Number(x.slice(0,4)) && d.getMonth()+1===Number(x.slice(5,7)) && d.getDate()===Number(x.slice(8,10));
}
const validatePhone = (raw,pays) => {
  const s=String(raw||'').replace(/[\s().-]/g,'');
  if(!/^\d{6,14}$/.test(s))return false;
  if(pays==='CM')return /^6\d{8}$/.test(s);
  if(pays==='FR')return /^[0-9]{9,10}$/.test(s);
  if(pays==='US'||pays==='CA')return /^[2-9]\d{9}$/.test(s);
  return true;
};

export default function Adhesion() {
  const {i18n}=useTranslation();
  const lang=i18n.resolvedLanguage?.startsWith('en')?'en':'fr';
  const t=getAdhesionText(lang);
  const navigate=useNavigate();
  const [step,setStep]=useState(1);
  const [expanded,setExpanded]=useState(false);
  const [form,setForm]=useState(defaultValues);
  const [error,setError]=useState('');
  // Uniquement en mémoire, aucune transmission ni persistance dans cette prévisualisation.
  const [photoMembre,setPhotoMembre]=useState(null);
  const [photoPartenaire,setPhotoPartenaire]=useState(null);
  const [portraitMembre,setPortraitMembre]=useState('');
  const [portraitPartenaire,setPortraitPartenaire]=useState('');
  useEffect(()=>{
    if (!photoMembre) {setPortraitMembre(''); return;}
    const url=URL.createObjectURL(photoMembre);
    setPortraitMembre(url);
    return ()=>URL.revokeObjectURL(url);
  },[photoMembre]);
  useEffect(()=>{
    if (!photoPartenaire) {setPortraitPartenaire(''); return;}
    const url=URL.createObjectURL(photoPartenaire);
    setPortraitPartenaire(url);
    return ()=>URL.revokeObjectURL(url);
  },[photoPartenaire]);
  const update=(key,value)=>{setForm(old=>({...old,[key]:value}));setError('');};
  const countryNames=useMemo(()=>new Intl.DisplayNames([lang],{type:'region'}),[lang]);
  const countries=useMemo(()=>[...PAYS].sort((a,b)=>((lang==='en'?countryNames.of(a.code):a.nom)||'').localeCompare((lang==='en'?countryNames.of(b.code):b.nom)||'',lang)),[lang,countryNames]);
  const domestic=form.pays==='CM';
  const territory=TERRITOIRES[form.pays];
  const region=territory?.regions?.find(r=>r.code===form.region);
  const divisions=region?.departements||[];
  const availableCommunes=communesPourDepartement(form.departement);
  const commune = form.commune==='__autre__' || availableCommunes.length===0 ? form.communeAutre.trim() : form.commune;
  const rattachementRegion=TERRITOIRES.CM.regions.find(r=>r.code===form.rattachementRegion);
  const rattachementDivisions=rattachementRegion?.departements||[];
  const rattachementCommunes=communesPourDepartement(form.rattachementDepartement);
  const rattachementCommune=form.rattachementCommune==='__autre__' || !rattachementCommunes.length ? form.rattachementAutre.trim() : form.rattachementCommune;
  const isNew=form.type==='nouvelle';
  let amounts=null;
  let amountError='';
  try{
    amounts=domestic?calculPremiereAdhesionCM({categorie:form.categorie,mode:form.modeCotisation,versement:form.versementPartiel}):calculDiaspora({formule:form.formule});
  }catch(err){amountError=err.message;}
  const money=(n,currency=domestic?'XAF':'EUR') => new Intl.NumberFormat(lang==='en'?'en-GB':'fr-FR',{style:'currency',currency,maximumFractionDigits:0}).format(n);
  const next=number=>{setError('');setStep(number);window.scrollTo?.({top:0,behavior:'smooth'});};
  const switchCountry=code=>setForm(prev=>({ ...prev,pays:code,region:'',departement:'',commune:'',communeAutre:'',regionEtrangere:'',departementEtranger:'',ville:'',codePostal:'',telephone:'',formule:'simple',telephonePartenaire:'',rattachementRegion:'',rattachementDepartement:'',rattachementCommune:'',rattachementAutre:'',categorie:'rural_etudiant',modeCotisation:'aucun',versementPartiel:'' }));
  function review(e){
    e.preventDefault();
    if(!form.accepteStatuts || !form.accepteDonnees)return setError(t.errors.consent);
    if(!isNew){
      if(!form.numeroMilitant.trim() || !validEmail(form.email))return setError(t.errors.required);
      return next(3);
    }
    if(!prefixForCivilite(form.civilite))return setError(t.errors.civility);
    if(!form.nom.trim() || !form.prenom.trim() || !validDOB(form.dateNaissance))return setError(t.errors.dob);
    if(!form.lieuNaissance.trim())return setError(t.errors.birthplace);

    if(!validEmail(form.email))return setError(t.errors.email);
    if(!validatePhone(form.telephone,form.pays))return setError(t.errors.phone);
    if(domestic && (!form.region || !form.departement || !commune))return setError(t.errors.territory);
    if(!domestic && (!form.ville.trim() || !(territory?.regions?.length ? form.region : form.regionEtrangere.trim())))return setError(t.errors.externalRegion);
    if(!domestic && !form.codePostal.trim())return setError(t.errors.postcode);
    if(!domestic && (!form.rattachementRegion || !form.rattachementDepartement || !rattachementCommune))return setError(t.errors.rattachement);
    if(!amounts)return setError(t.errors.partial);
    if(!domestic && form.formule==='couple' && (!form.nomPartenaire.trim() || !form.prenomPartenaire.trim() || !validDOB(form.dateNaissancePartenaire) || !form.lieuNaissancePartenaire.trim() || !prefixForCivilite(form.civilitePartenaire) || !validEmail(form.emailPartenaire) || !validatePhone(form.telephonePartenaire,form.pays) || !form.consentPartenaire))return setError(t.errors.partner);
    const photoError=validateCardSelection({requestCard:form.demandeCarte,isCouple:!domestic&&form.formule==='couple',photoMember:photoMembre,photoPartner:photoPartenaire});
    if(photoError)return setError(t.errors[photoError] || t.errors.photo);
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
    next(3);
  }
  return <main className="pdc-adhesion">
    <nav className="pdc-adhesion-steps" aria-label="Membership steps">
      {t.steps.map((s,i)=><div key={s} className={step===i+1?'current':''}><span>{i+1}</span>{s}</div>)}
    </nav>
    {step===1 && <section className="pdc-adhesion-card pdc-adhesion-intro">
      <div className="pdc-adhesion-accent"><i/><i/></div>
      <p className="pdc-adhesion-overline">{t.eyebrow}</p>
      <h1>{t.title}</h1><p>{t.intro}</p>
      {expanded && <p>{t.long}</p>}
      <button className="pdc-adhesion-secondary" type="button" onClick={()=>setExpanded(x=>!x)} aria-expanded={expanded}>{expanded?t.less:t.more} {expanded?'↑':'↓'}</button>
      <h2>{t.docsTitle}</h2>
      <ul className="pdc-adhesion-documents">{FICHIERS.map((url,i)=><li key={url}><a href={url} target="_blank" rel="noreferrer">{t.docs[i]} <span aria-hidden="true">↗</span></a></li>)}</ul>
      <p className="pdc-adhesion-alert">{t.docsNote}</p>
      <button className="pdc-adhesion-primary" type="button" onClick={()=>next(2)}>{t.go} →</button>
    </section>}
    {step===2 && <section className="pdc-adhesion-card">
      <button className="pdc-adhesion-back" type="button" onClick={()=>next(1)}>← {t.back}</button>
      <h1>{t.title}</h1>
      <form onSubmit={review} className="pdc-adhesion-form">
        <fieldset><legend>{t.type}</legend><div className="pdc-adhesion-radio">
          {[['nouvelle',t.first],['renouvellement',t.renew]].map(([val,label])=><label key={val}><input type="radio" name="type" value={val} checked={form.type===val} onChange={()=>update('type',val)}/> {label}</label>)}
        </div></fieldset>
        {!isNew ? <div className="pdc-adhesion-panel">
          <p>{t.renewHint}</p>
          <div className="pdc-adhesion-grid">
            <div className="pdc-adhesion-field"><label htmlFor="a-number">{t.uniqueId}</label><input id="a-number" value={form.numeroMilitant} onChange={e=>update('numeroMilitant',e.target.value)} required maxLength={100}/></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-renew-email">{t.email}</label><input id="a-renew-email" type="email" value={form.email} onChange={e=>update('email',e.target.value)} required /></div>
          </div>
          <p className="pdc-adhesion-alert">{t.remainderUnavailable}</p>
        </div> : <>
          <h2>{t.personal}</h2>
          <fieldset><legend>{t.civility}</legend><div className="pdc-adhesion-radio">{[['Madame',t.ms],['Monsieur',t.mr]].map(([v,label])=><label key={v}><input type="radio" name="civilite" checked={form.civilite===v} onChange={()=>update('civilite',v)}/>{label}</label>)}</div></fieldset>
          <div className="pdc-adhesion-grid">
            <div className="pdc-adhesion-field"><label htmlFor="a-last">{t.last}</label><input id="a-last" autoComplete="family-name" value={form.nom} onChange={e=>update('nom',e.target.value)} required maxLength={100}/></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-first">{t.firstName}</label><input id="a-first" autoComplete="given-name" value={form.prenom} onChange={e=>update('prenom',e.target.value)} required maxLength={100}/></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-dob">{t.dob}</label><input id="a-dob" type="date" value={form.dateNaissance} onChange={e=>update('dateNaissance',e.target.value)} max={today()} required/></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-birthplace">{t.birthplace}</label><input id="a-birthplace" autoComplete="off" value={form.lieuNaissance} onChange={e=>update('lieuNaissance',e.target.value)} required maxLength={160}/></div>
          </div>
          <div className="pdc-adhesion-grid">
            <div className="pdc-adhesion-field"><label htmlFor="a-country">{t.country}</label><select id="a-country" value={form.pays} onChange={e=>switchCountry(e.target.value)} required>{countries.map(x=><option key={x.code} value={x.code}>{lang==='en'?countryNames.of(x.code)||x.nom:x.nom}</option>)}</select><small>{t.currencyNote}</small></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-job">{t.profession}</label><select id="a-job" value={form.profession} onChange={e=>update('profession',e.target.value)}><option value="">{t.choose}</option>{PROFESSIONS.map(p=><option key={p} value={p}>{t.professions[p]}</option>)}</select></div>
          </div>
          <div className="pdc-adhesion-grid">
            <div className="pdc-adhesion-field"><label htmlFor="a-email">{t.email}</label><input id="a-email" type="email" autoComplete="email" value={form.email} onChange={e=>update('email',e.target.value)} required maxLength={200}/></div>
            <div className="pdc-adhesion-field"><label htmlFor="a-phone">{t.phone}</label><div className="pdc-adhesion-phone"><span>{INDICATIFS[form.pays]||'+'}</span><input id="a-phone" type="tel" autoComplete="tel-national" value={form.telephone} onChange={e=>update('telephone',e.target.value)} required maxLength={24} inputMode="tel"/></div><small>{t.phoneInfo}</small></div>
          </div>
          {domestic ? <>
            <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-region">{t.region}</label><select id="a-region" required value={form.region} onChange={e=>setForm(p=>({...p,region:e.target.value,departement:'',commune:'',communeAutre:''}))}><option value="">{t.choose}</option>{TERRITOIRES.CM.regions.map(r=><option key={r.code} value={r.code}>{r.nom}</option>)}</select></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-dept">{t.department}</label><select id="a-dept" value={form.departement} onChange={e=>setForm(p=>({...p,departement:e.target.value,commune:'',communeAutre:''}))} disabled={!form.region} required><option value="">{t.choose}</option>{divisions.map(d=><option key={d.code} value={d.code}>{d.nom}</option>)}</select></div>
            </div>
            <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-commune">{t.commune}</label>
                {availableCommunes.length ? <select id="a-commune" required value={form.commune} disabled={!form.departement} onChange={e=>setForm(p=>({...p,commune:e.target.value,communeAutre:''}))}>
                  <option value="">{t.choose}</option>{availableCommunes.map(c=><option key={c} value={c}>{c}</option>)}<option value="__autre__">{t.otherCommune}</option>
                </select> : <input id="a-commune" value={form.communeAutre} disabled={!form.departement} onChange={e=>update('communeAutre',e.target.value)} required maxLength={120}/>}
                {form.commune==='__autre__' && <><label htmlFor="a-other">{t.otherCommuneLabel}</label><input id="a-other" value={form.communeAutre} onChange={e=>update('communeAutre',e.target.value)} required maxLength={120}/></>}
              </div>
              <aside className="pdc-adhesion-inline-help">{t.communeHelp}</aside>
            </div>
          </> : <>
            <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-region-int">{t.externalRegion}</label>{territory?.regions?.length ? <select id="a-region-int" required value={form.region} onChange={e=>setForm(p=>({...p,region:e.target.value,departement:''}))}><option value="">{t.choose}</option>{territory.regions.map(r=><option key={r.code} value={r.code}>{r.nom}</option>)}</select> : <input id="a-region-int" required value={form.regionEtrangere} onChange={e=>update('regionEtrangere',e.target.value)} maxLength={120}/>}</div>
              <div className="pdc-adhesion-field"><label htmlFor="a-dept-int">{t.externalDepartment}</label>{divisions.length ? <select id="a-dept-int" value={form.departement} onChange={e=>update('departement',e.target.value)}><option value="">{t.choose}</option>{divisions.map(d=><option key={d.code} value={d.code}>{d.nom}</option>)}</select> : <input id="a-dept-int" value={form.departementEtranger} onChange={e=>update('departementEtranger',e.target.value)} maxLength={120}/>}</div>
              <div className="pdc-adhesion-field"><label htmlFor="a-city">{t.city}</label><input id="a-city" value={form.ville} onChange={e=>update('ville',e.target.value)} required maxLength={120}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-postal">{t.postcode}</label><input id="a-postal" autoComplete="postal-code" value={form.codePostal} onChange={e=>update('codePostal',e.target.value)} required maxLength={25}/></div>
            </div>
            <h2>{t.territorial}</h2>
            <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-home-region">{t.territorialRegion}</label>
                <select id="a-home-region" value={form.rattachementRegion} required onChange={e=>setForm(p=>({...p,rattachementRegion:e.target.value,rattachementDepartement:'',rattachementCommune:'',rattachementAutre:''}))}>
                  <option value="">{t.choose}</option>{TERRITOIRES.CM.regions.map(r=><option key={r.code} value={r.code}>{r.nom}</option>)}
                </select>
              </div>
              <div className="pdc-adhesion-field"><label htmlFor="a-home-dept">{t.territorialDepartment}</label>
                <select id="a-home-dept" value={form.rattachementDepartement} disabled={!form.rattachementRegion} required onChange={e=>setForm(p=>({...p,rattachementDepartement:e.target.value,rattachementCommune:'',rattachementAutre:''}))}>
                  <option value="">{t.choose}</option>{rattachementDivisions.map(d=><option key={d.code} value={d.code}>{d.nom}</option>)}
                </select>
              </div>
            </div>
            <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-home-commune">{t.territorialCommune}</label>
                {rattachementCommunes.length ? <select id="a-home-commune" value={form.rattachementCommune} disabled={!form.rattachementDepartement} required onChange={e=>setForm(p=>({...p,rattachementCommune:e.target.value,rattachementAutre:''}))}>
                  <option value="">{t.choose}</option>{rattachementCommunes.map(c=><option key={c} value={c}>{c}</option>)}<option value="__autre__">{t.otherCommune}</option>
                </select> : <input id="a-home-commune" value={form.rattachementAutre} disabled={!form.rattachementDepartement} required maxLength={120} onChange={e=>update('rattachementAutre',e.target.value)} />}
                {form.rattachementCommune==='__autre__' && <><label htmlFor="a-home-other">{t.otherCommuneLabel}</label><input id="a-home-other" required maxLength={120} value={form.rattachementAutre} onChange={e=>update('rattachementAutre',e.target.value)}/></>}
              </div>
              <aside className="pdc-adhesion-inline-help">{t.territorialHint}</aside>
            </div>
          </>}
          <h2>{t.annual}</h2>
          {domestic && <p className="pdc-adhesion-fee-note"><strong>{t.initial} : {money(2000,'XAF')}.</strong> {t.initialExplanation}</p>}
          {domestic?<>
            <p className="pdc-adhesion-section-intro">{t.cmRatesIntro}</p>
            <fieldset className="pdc-adhesion-plans"><legend>{t.cmRate}</legend><div className="pdc-adhesion-choice-grid">
              {Object.keys(CAMEROUN).map(k=><label key={k} className={`pdc-adhesion-choice ${form.categorie===k?'selected':''}`}><input type="radio" name="categorie" value={k} checked={form.categorie===k} onChange={()=>setForm(p=>({...p,categorie:k,modeCotisation:'aucun',versementPartiel:''}))}/><span className="pdc-adhesion-choice-label">{t.cmRates[k]}</span><strong>{money(CAMEROUN[k],'XAF')}</strong></label>)}
            </div></fieldset>
            <fieldset><legend>{t.partialQuestion}</legend><div className="pdc-adhesion-radio pdc-adhesion-radio-column">{[['aucun',t.none],['partiel',t.partial],['total',t.full]].map(([v,label])=><label key={v}><input type="radio" name="modeCotisation" checked={form.modeCotisation===v} onChange={()=>update('modeCotisation',v)}/>{label}</label>)}</div></fieldset>
            {form.modeCotisation==='partiel' && <div className="pdc-adhesion-field"><label htmlFor="a-partial">{t.partialAmount}</label><input id="a-partial" type="number" min="1" max={CAMEROUN[form.categorie]-1} step="1" inputMode="numeric" required value={form.versementPartiel} onChange={e=>update('versementPartiel',e.target.value)}/></div>}
          </>:<>
            <p className="pdc-adhesion-section-intro">{t.diasporaRatesIntro}</p>
            <fieldset className="pdc-adhesion-plans"><legend>{t.diasporaRate}</legend><div className="pdc-adhesion-choice-grid">
              {Object.keys(DIASPORA).map(k=><label key={k} className={`pdc-adhesion-choice ${form.formule===k?'selected':''}`}><input type="radio" name="formule" value={k} checked={form.formule===k} onChange={()=>{update('formule',k);if(k!=='couple')setPhotoPartenaire(null);}}/><span className="pdc-adhesion-choice-label">{t.diasporaRates[k]}</span><strong>{money(DIASPORA[k],'EUR')}</strong></label>)}
            </div></fieldset>
            <small>{t.diasporaHint}</small>
            {form.formule==='couple' && <div className="pdc-adhesion-panel"><h3>{t.partner}</h3>
              <fieldset><legend>{t.partnerCivility}</legend><div className="pdc-adhesion-radio">{[['Madame',t.ms],['Monsieur',t.mr]].map(([v,label])=><label key={v}><input type="radio" name="civilitePartenaire" checked={form.civilitePartenaire===v} onChange={()=>update('civilitePartenaire',v)} required/>{label}</label>)}</div></fieldset>
              <div className="pdc-adhesion-grid">
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-last">{t.partnerLast}</label><input id="a-partner-last" required value={form.nomPartenaire} onChange={e=>update('nomPartenaire',e.target.value)}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-first">{t.partnerFirst}</label><input id="a-partner-first" required value={form.prenomPartenaire} onChange={e=>update('prenomPartenaire',e.target.value)}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-dob">{t.partnerDob}</label><input id="a-partner-dob" type="date" max={today()} required value={form.dateNaissancePartenaire} onChange={e=>update('dateNaissancePartenaire',e.target.value)}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-birthplace">{t.partnerBirthplace}</label><input id="a-partner-birthplace" required maxLength={160} value={form.lieuNaissancePartenaire} onChange={e=>update('lieuNaissancePartenaire',e.target.value)}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-email">{t.partnerEmail}</label><input id="a-partner-email" type="email" required value={form.emailPartenaire} onChange={e=>update('emailPartenaire',e.target.value)}/></div>
              <div className="pdc-adhesion-field"><label htmlFor="a-partner-phone">{t.partnerPhone}</label><div className="pdc-adhesion-phone"><span>{INDICATIFS[form.pays]||'+'}</span><input id="a-partner-phone" type="tel" inputMode="tel" required maxLength={24} value={form.telephonePartenaire} onChange={e=>update('telephonePartenaire',e.target.value)}/></div></div>
            </div><label className="pdc-adhesion-check"><input type="checkbox" checked={form.consentPartenaire} onChange={e=>update('consentPartenaire',e.target.checked)} /> {t.partnerConsent}</label></div>}
          </>}
          <h2>{t.cardSection}</h2>
          <label className="pdc-adhesion-check"><input type="checkbox" checked={form.demandeCarte} onChange={e=>{
            update('demandeCarte',e.target.checked);
            if(!e.target.checked){setPhotoMembre(null);setPhotoPartenaire(null);}
          }}/>{t.cardRequest}</label>
          {!form.demandeCarte && <p className="pdc-adhesion-muted">{t.cardOptional}</p>}
          {form.demandeCarte && <div className="pdc-adhesion-panel">
            <fieldset><legend>{t.cardFormat}</legend><div className="pdc-adhesion-radio">
              {['numerique','physique','les_deux'].map(k=><label key={k}><input type="radio" name="formatCarte" checked={form.formatCarte===k} onChange={()=>update('formatCarte',k)}/>{t.cardFormats[k]}</label>)}
            </div></fieldset>
            <p className="pdc-adhesion-muted">{t.photoInfo}</p>
            <div className="pdc-adhesion-photo-grid">
              <div className="pdc-adhesion-field">
                <label htmlFor="a-photo-member">{t.photoMember}</label>
                <input id="a-photo-member" type="file" accept="image/jpeg,image/png" required={!photoMembre} onChange={e=>{const f=e.target.files?.[0]||null;const err=f&&validatePhoto(f);setPhotoMembre(err?null:f);setError(err?t.errors[err]:'');}}/>
                {portraitMembre && <img className="pdc-adhesion-portrait" src={portraitMembre} alt={t.photoMemberAlt}/>}
              </div>
              {!domestic&&form.formule==='couple' && <div className="pdc-adhesion-field">
                <label htmlFor="a-photo-partner">{t.photoPartner}</label>
                <input id="a-photo-partner" type="file" accept="image/jpeg,image/png" required={!photoPartenaire} onChange={e=>{const f=e.target.files?.[0]||null;const err=f&&validatePhoto(f);setPhotoPartenaire(err?null:f);setError(err?t.errors[err]:'');}}/>
                {portraitPartenaire && <img className="pdc-adhesion-portrait" src={portraitPartenaire} alt={t.photoPartnerAlt}/>}
              </div>}
            </div>
            {!domestic&&form.formule==='couple' && <p className="pdc-adhesion-muted">{t.couplePhotosInfo}</p>}
            <p className="pdc-adhesion-alert">{t.photoStorageWarning}</p>
          </div>}
          {amounts && <div className="pdc-adhesion-amounts" aria-live="polite">
            {domestic && <><div><span>{t.initial}</span><strong>{money(amounts.fraisAdhesion,'XAF')}</strong></div><div><span>{t.paidNow}</span><strong>{money(amounts.versementCotisation,'XAF')}</strong></div></>}
            <div className="total"><span>{t.currentPayment}</span><strong>{money(amounts.totalImmediate,amounts.devise)}</strong></div>
            {domestic && <div><span>{t.remaining}</span><strong>{money(amounts.resteAnnuel,'XAF')}</strong></div>}
          </div>}
          {amountError && <p className="pdc-adhesion-error" role="alert">{t.errors.partial}</p>}
        </>}
        {isNew && <p className="pdc-adhesion-fee-note">{t.membershipLegal}</p>}
        <h2>{t.memberStatements}</h2>
        <div className="pdc-adhesion-documents small">{FICHIERS.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer">{t.docs[i]} ↗</a>)}</div>
        <p className="pdc-adhesion-alert">{t.termsMissing}</p>
        <label className="pdc-adhesion-check"><input type="checkbox" checked={form.accepteStatuts} onChange={e=>update('accepteStatuts',e.target.checked)} required/> {t.accept}</label>
        <label className="pdc-adhesion-check"><input type="checkbox" checked={form.accepteDonnees} onChange={e=>update('accepteDonnees',e.target.checked)} required/> {t.privacy}</label>
        <small>{t.privacyDraft}</small>
        {error && <p className="pdc-adhesion-error" role="alert">{error}</p>}
        <button type="submit" className="pdc-adhesion-primary" disabled={isNew&&!amounts}>{t.toReview} →</button>
      </form>
    </section>}
    {step===3 && <section className="pdc-adhesion-card pdc-adhesion-review">
      <h1>{t.reviewTitle}</h1><dl>
        <div><dt>{t.mode}</dt><dd>{isNew?t.first:t.renew}</dd></div>
        {isNew ? <>
          <div><dt>{t.person}</dt><dd>{form.civilite==='Madame'?t.ms:t.mr} {form.prenom} {form.nom}</dd></div>
          <div><dt>{t.dob}</dt><dd>{form.dateNaissance}</dd></div>
          <div><dt>{t.birthplace}</dt><dd>{form.lieuNaissance}</dd></div>
          {!domestic&&form.formule==='couple'&&<>
            <div><dt>{t.partnerName}</dt><dd>{form.civilitePartenaire==='Madame'?t.ms:t.mr} {form.prenomPartenaire} {form.nomPartenaire}</dd></div>
            <div><dt>{t.partnerDob}</dt><dd>{form.dateNaissancePartenaire}</dd></div>
            <div><dt>{t.partnerBirthplace}</dt><dd>{form.lieuNaissancePartenaire}</dd></div>
          </>}
          <div><dt>{t.country}</dt><dd>{lang==='en'?countryNames.of(form.pays):PAYS.find(x=>x.code===form.pays)?.nom}</dd></div>
          {!domestic&&form.formule==='couple'&&<div><dt>{t.partnerPhone}</dt><dd>{INDICATIFS[form.pays]} {form.telephonePartenaire}</dd></div>}
          <div><dt>{t.profession}</dt><dd>{t.professions[form.profession]||'—'}</dd></div>
          <div><dt>{t.area}</dt><dd>{domestic?[form.region,form.departement,commune].join(' / '):[form.region||form.regionEtrangere,form.ville].filter(Boolean).join(' / ')}</dd></div>
          {!domestic&&<div><dt>{t.territorial}</dt><dd>{[form.rattachementRegion,form.rattachementDepartement,rattachementCommune].join(' / ')}</dd></div>}
          <div><dt>{t.email}</dt><dd>{form.email}</dd></div>
          {!domestic&&<div><dt>{t.postcode}</dt><dd>{form.codePostal}</dd></div>}
          <div><dt>{t.cardSection}</dt><dd>{form.demandeCarte?t.cardFormats[form.formatCarte]:t.noCardRequested}</dd></div>
          {form.demandeCarte && <div><dt>{t.photoMember}</dt><dd>{photoMembre?.name||t.noPhoto}</dd></div>}
          {form.demandeCarte&&!domestic&&form.formule==='couple'&&<div><dt>{t.photoPartner}</dt><dd>{photoPartenaire?.name||t.noPhoto}</dd></div>}
          <div><dt>{t.currentPayment}</dt><dd><strong>{money(amounts?.totalImmediate||0,amounts?.devise)}</strong></dd></div>
          {domestic&&<div><dt>{t.remaining}</dt><dd>{money(amounts?.resteAnnuel||0,'XAF')}</dd></div>}
        </> : <><div><dt>{t.uniqueId}</dt><dd>{form.numeroMilitant}</dd></div><div><dt>{t.email}</dt><dd>{form.email}</dd></div><div><dt>{t.remaining}</dt><dd>{t.remainderUnavailable}</dd></div></>}
      </dl>
      {isNew && form.demandeCarte && <p className="pdc-adhesion-alert" role="status">
        {lang==='en'
          ? 'Photos selected for the requested card(s). They are still on this device and have NOT been uploaded. Secure transfer will be enabled only after verified payment and a separate authorization for each beneficiary.'
          : 'Photos sélectionnées pour la ou les cartes demandées. Elles restent sur cet appareil et ne sont PAS encore téléversées. Le dépôt sécurisé sera activé uniquement après confirmation du paiement et autorisation individuelle pour chaque bénéficiaire.'}
      </p>}
      <p className="pdc-adhesion-alert">{t.noPayment}</p>
      <div className="pdc-adhesion-actions"><button className="pdc-adhesion-secondary" type="button" onClick={()=>next(2)}>← {t.edit}</button><button className="pdc-adhesion-primary" type="button" onClick={()=>navigate('/adhesion/merci?preview=1')}>{t.preview} →</button></div>
    </section>}
  </main>;
}
