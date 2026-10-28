import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PAYS } from './pays';
import { INDICATIFS } from './indicatifs';
import { TERRITOIRES } from './territoires';
import { communesPourDepartement } from '../../features/adhesion/communes-cm';
import PaymentMethods from '../PaymentMethods/PaymentMethods';
import './DonForm.css';

const MONTANTS = [500, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000];
const POSTES = ['scrutateurs', 'cautionnements', 'campagne', 'autres'];
const integer = value => /^\d+$/.test(String(value)) ? Number(value) : NaN;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const emailValid = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const phoneValid = (number, prefix, country) => {
  const s = String(number || '').replace(/[\s().-]/g,'');
  if (!/^\d{4,14}$/.test(s) || !/^\+[1-9]\d{0,3}$/.test(prefix)) return false;
  const withoutTrunk = ['FR','GB','DE'].includes(country) ? s.replace(/^0/, '') : s;
  const len = (prefix + withoutTrunk).replace(/\D/g,'').length;
  if (len < 7 || len > 15) return false;
  if (country === 'CM') return /^6\d{8}$/.test(withoutTrunk);
  if (country === 'FR') return /^\d{9}$/.test(withoutTrunk);
  if (country === 'US' || country === 'CA') return /^[2-9]\d{9}$/.test(withoutTrunk);
  return true;
};

/** Local demonstration: no payment request, storage or server call. */
export default function DonForm({ onValidated }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'fr';
  const money = n => `${new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits:0 }).format(n)} ${lang === 'en' ? 'XAF' : 'FCFA'}`;
  const displayNames = useMemo(() => new Intl.DisplayNames([lang],{type:'region'}),[lang]);
  const [periodicite,setPeriodicite] = useState('ponctuel');
  const [montantChoisi,setMontantChoisi] = useState('5000');
  const [montantLibre,setMontantLibre] = useState('');
  const [affectation,setAffectation] = useState('libre');
  const [repartition,setRepartition] = useState({scrutateurs:'',cautionnements:'',campagne:'',autres:''});
  const [methode,setMethode] = useState('mobile');
  const [messagerie,setMessagerie] = useState('whatsapp');
  const [pays,setPays] = useState('CM');
  const [region,setRegion] = useState('');
  const [departement,setDepartement] = useState('');
  const [communeSelection,setCommuneSelection] = useState('');
  const [communeAutre,setCommuneAutre] = useState('');
  const [indicatifManuel,setIndicatifManuel] = useState('');
  const [telephoneLocal,setTelephoneLocal] = useState('');
  const [erreur,setErreur] = useState('');
  const territoire = TERRITOIRES[pays];
  const regionSelectionnee = territoire?.regions?.find(r => r.code === region);
  const departementsPossibles = regionSelectionnee?.departements || null;
  const auCameroun = pays === 'CM';
  const communesPossibles = auCameroun && departement ? communesPourDepartement(departement) : [];
  const communeCameroun = communeSelection === '__autre__' || communesPossibles.length === 0 ? communeAutre.trim() : communeSelection;
  const indicatifAuto = INDICATIFS[pays] || '';
  const indicatif = indicatifAuto || indicatifManuel;
  const montant = montantChoisi === 'personnalise' ? integer(montantLibre) : Number(montantChoisi);
  const totalReparti = POSTES.reduce((sum,id) => sum + (integer(repartition[id] || '0') || 0),0);
  const reste = Number.isFinite(montant) ? montant - totalReparti : 0;
  const effacerMessage = () => setErreur('');
  const changerPays = code => { setPays(code);setRegion('');setDepartement('');setCommuneSelection('');setCommuneAutre('');setIndicatifManuel('');setTelephoneLocal('');effacerMessage(); };
  const changerRepartition = (id,value) => { if (value !== '' && !/^\d+$/.test(value)) return; setRepartition(old => ({...old,[id]:value}));effacerMessage();};
  function soumettre(event) {
    event.preventDefault(); effacerMessage();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!Number.isSafeInteger(montant) || montant < 100) return setErreur(t('donation.errors.amount'));
    if (affectation === 'ciblee' && totalReparti !== montant) return setErreur(t('donation.errors.allocation'));
    const b = String(values.dateNaissance || '');
    const d = new Date(`${b}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || Number.isNaN(d.getTime()) || d.getFullYear()!==Number(b.slice(0,4)) || d.getMonth()+1!==Number(b.slice(5,7)) || d.getDate()!==Number(b.slice(8,10)) || b>today()) return setErreur(t('donation.errors.dob'));
    const communeValidee = auCameroun ? communeCameroun : String(values.commune || '').trim();
    if (!values.nom?.trim() || !values.prenom?.trim() || !communeValidee) return setErreur(t('donation.errors.person'));
    if (auCameroun && (!region || !departement)) return setErreur(t('donation.errors.territory'));
    if (!phoneValid(telephoneLocal,indicatif,pays)) return setErreur(t('donation.errors.phone'));
    if (!emailValid(values.email)) return setErreur(t('donation.errors.email'));
    if (!values.declaration) return setErreur(t('donation.errors.statement'));
    // Store ONLY in React component state via onValidated; nothing is sent externally.
    onValidated?.({
      civilite:values.civilite,nom:values.nom.trim(),prenom:values.prenom.trim(),
      email:values.email.trim(),pays,region:auCameroun ? region : (values.region || region),
      departement:auCameroun ? departement : (values.departement || departement),commune:communeValidee,
      periodicite,montant,affectation,repartition:affectation==='ciblee' ? {...repartition} : null,
      methode,messagerie,anonymePublic:Boolean(values.anonymePublic),
      telephoneE164:indicatif + (['FR','GB','DE'].includes(pays)
        ? telephoneLocal.replace(/[\s().-]/g,'').replace(/^0/,'')
        : telephoneLocal.replace(/[\s().-]/g,''))
    });
  }
  return <form className="pdc-don-form" onSubmit={soumettre} onChange={effacerMessage}>
    <p className="pdc-don-form__note"><strong>*</strong> {t('donation.required').replace(/^\*\s*/, '')}</p>
    <section className="pdc-don-form__section" aria-labelledby="pdc-periodicite">
      <h2 id="pdc-periodicite">{t('donation.frequencyTitle')}</h2>
      <div className="pdc-don-form__tabs" role="group" aria-label={t('donation.frequencyLabel')}>
        {['ponctuel','mensuel'].map(id=><label key={id} className={periodicite===id?'is-selected':''}>
          <input type="radio" name="periodicite" value={id} checked={periodicite===id} onChange={()=>setPeriodicite(id)}/>{t(id==='ponctuel'?'donation.once':'donation.monthly')}
        </label>)}
      </div>
      <p className="pdc-don-form__aide">{t(periodicite==='ponctuel'?'donation.onceInfo':'donation.monthlyInfo')}</p>
      <h3>{t(periodicite==='ponctuel'?'donation.amountOnce':'donation.amountMonthly')}</h3>
      <div className="pdc-don-form__montants" role="group" aria-label={t('donation.proposedAmounts')}>
        {MONTANTS.map(n=><label key={n} className={`pdc-don-form__montant ${montantChoisi===String(n)?'is-selected':''}`}>
          <input type="radio" name="montantPropose" value={n} checked={montantChoisi===String(n)} onChange={()=>setMontantChoisi(String(n))}/>{money(n)}
        </label>)}
        <label className={`pdc-don-form__montant pdc-don-form__montant-libre ${montantChoisi==='personnalise'?'is-selected':''}`}>
          <input type="radio" name="montantPropose" value="personnalise" checked={montantChoisi==='personnalise'} onChange={()=>setMontantChoisi('personnalise')}/>{t('donation.custom')}
        </label>
      </div>
      {montantChoisi==='personnalise' && <div className="pdc-don-form__field pdc-don-form__custom">
        <label htmlFor="pdc-montant-libre">{t('donation.customLabel')}</label>
        <input id="pdc-montant-libre" name="montantLibre" type="number" min="100" step="1" inputMode="numeric" value={montantLibre} required placeholder={t('donation.customExample')} onChange={e=>setMontantLibre(e.target.value)}/>
      </div>}
    </section>
    <section className="pdc-don-form__section" aria-labelledby="pdc-repartition">
      <h2 id="pdc-repartition">{t('donation.allocationTitle')}</h2>
      <div className="pdc-don-form__choix">
        <label><input type="radio" name="modeRepartition" value="libre" checked={affectation==='libre'} onChange={()=>setAffectation('libre')}/>{t('donation.allocationFree')}</label>
        <label><input type="radio" name="modeRepartition" value="ciblee" checked={affectation==='ciblee'} onChange={()=>setAffectation('ciblee')}/>{t('donation.allocationTargeted')}</label>
      </div>
      {affectation==='ciblee' && <div className="pdc-don-form__allocation">
        <p className="pdc-don-form__aide">{t('donation.allocationHelp')}</p>
        <div className="pdc-don-form__grid">{POSTES.map(id=><div className="pdc-don-form__field" key={id}>
          <label htmlFor={`pdc-${id}`}>{t(`donation.posts.${id}`)}</label>
          <input id={`pdc-${id}`} type="number" name={`repartition_${id}`} min="0" step="1" placeholder="0" inputMode="numeric" value={repartition[id]} onChange={e=>changerRepartition(id,e.target.value)}/>
        </div>)}</div>
        <p className="pdc-don-form__bilan" aria-live="polite">{t('donation.allocated')} : <strong>{money(totalReparti)}</strong> · {t(reste>=0?'donation.remaining':'donation.exceeded')} : <strong>{money(Math.abs(reste))}</strong></p>
      </div>}
    </section>
    <section className="pdc-don-form__section" aria-labelledby="pdc-identite">
      <h2 id="pdc-identite">{t('donation.identityTitle')}</h2>
      <fieldset className="pdc-don-form__fieldset"><legend>{t('donation.civility')}</legend>
        <div className="pdc-don-form__civilite"><label><input type="radio" name="civilite" value="Madame" required/> {t('donation.ms')}</label><label><input type="radio" name="civilite" value="Monsieur" required/> {t('donation.mr')}</label></div>
      </fieldset>
      <div className="pdc-don-form__grid">
        <div className="pdc-don-form__field"><label htmlFor="pdc-nom">{t('donation.lastName')}</label><input id="pdc-nom" name="nom" autoComplete="family-name" required maxLength="100"/></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-prenom">{t('donation.firstName')}</label><input id="pdc-prenom" name="prenom" autoComplete="given-name" required maxLength="100"/></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-naissance">{t('donation.dob')}</label><input id="pdc-naissance" name="dateNaissance" type="date" max={today()} required/></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-pays">{t('donation.residenceCountry')}</label><select id="pdc-pays" name="pays" value={pays} onChange={e=>changerPays(e.target.value)} required autoComplete="country">
          {PAYS.map(item=><option key={item.code} value={item.code}>{lang==='en' ? displayNames.of(item.code) || item.nom : item.nom}</option>)}
        </select></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-region">{t(auCameroun?'donation.regionRequired':'donation.region')} {!auCameroun && <span className="pdc-don-form__facultatif">{t('donation.optional')}</span>}</label>
          {territoire ? <select id="pdc-region" name="region" autoComplete="address-level1" value={region} required={auCameroun} onChange={e=>{setRegion(e.target.value);setDepartement('');setCommuneSelection('');setCommuneAutre('');}}>
            <option value="">{t(auCameroun?'donation.selectRequired':'donation.selectOptional')}</option>{territoire.regions.map(r=><option key={r.code} value={r.code}>{r.nom}</option>)}
          </select> : <input id="pdc-region" name="region" autoComplete="address-level1" maxLength="120" placeholder={t('donation.freeEntry')}/>}
        </div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-departement">{t(auCameroun?'donation.districtRequired':'donation.district')} {!auCameroun && <span className="pdc-don-form__facultatif">{t('donation.optional')}</span>}</label>
          {auCameroun ? <select id="pdc-departement" name="departement" value={departement} onChange={e=>{setDepartement(e.target.value);setCommuneSelection('');setCommuneAutre('');}} required disabled={!region}>
            <option value="">{t('donation.selectRequired')}</option>{(departementsPossibles||[]).map(d=><option key={d.code} value={d.code}>{d.nom}</option>)}
          </select> : departementsPossibles?.length ? <select id="pdc-departement" name="departement" value={departement} onChange={e=>setDepartement(e.target.value)}>
            <option value="">{t('donation.selectOptional')}</option>{departementsPossibles.map(d=><option key={d.code} value={d.code}>{d.nom}</option>)}
          </select> : <input id="pdc-departement" name="departement" maxLength="120" placeholder={territoire&&!region?t('donation.districtFirst'):t('donation.freeOptional')}/>}
        </div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-ville">{t('donation.city')}</label>
          {auCameroun ? <>
            {communesPossibles.length > 0 ? <select id="pdc-ville" name="commune" required disabled={!departement} value={communeSelection} onChange={e=>{setCommuneSelection(e.target.value);setCommuneAutre('');}}>
              <option value="">{t('donation.selectRequired')}</option>
              {communesPossibles.map(nom=><option key={nom} value={nom}>{nom}</option>)}
              <option value="__autre__">{t('donation.otherCommune')}</option>
            </select> : <input id="pdc-ville" name="communeAutre" required disabled={!departement} value={communeAutre} onChange={e=>setCommuneAutre(e.target.value)} maxLength="120" placeholder={t('donation.otherCommuneLabel')}/>}
            {communeSelection==='__autre__' && <input id="pdc-autre-commune" name="communeAutre" aria-label={t('donation.otherCommuneLabel')} placeholder={t('donation.otherCommuneLabel')} required value={communeAutre} onChange={e=>setCommuneAutre(e.target.value)} maxLength="120"/>}
          </> : <input key={pays} id="pdc-ville" name="commune" required maxLength="120" autoComplete="address-level2"/>}
        </div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-code-postal">{t('donation.postcode')} <span className="pdc-don-form__facultatif">{t('donation.optional')}</span></label><input id="pdc-code-postal" name="codePostal" autoComplete="postal-code" maxLength="20"/></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-telephone">{t('donation.phone')}</label><div className="pdc-don-form__telephone">
          {indicatifAuto ? <span className="pdc-don-form__indicatif" aria-label={t('donation.phoneCodeAuto',{code:indicatifAuto})}>{indicatifAuto}</span> : <input className="pdc-don-form__indicatif-manuel" aria-label={t('donation.phoneCode')} type="tel" placeholder="+..." value={indicatifManuel} onChange={e=>setIndicatifManuel(e.target.value)} required maxLength="5"/>}
          <input id="pdc-telephone" name="telephoneLocal" type="tel" autoComplete="tel-national" required maxLength="24" inputMode="tel" value={telephoneLocal} onChange={e=>setTelephoneLocal(e.target.value)} placeholder={pays==='CM'?'6XX XXX XXX':pays==='FR'?'6 12 34 56 78':t('donation.phoneOther')} aria-describedby="pdc-aide-tel" />
        </div><small id="pdc-aide-tel">{t('donation.phoneHelp')}</small></div>
        <div className="pdc-don-form__field"><label htmlFor="pdc-email">{t('donation.email')}</label><input id="pdc-email" name="email" type="email" autoComplete="email" required maxLength="254" placeholder={t('donation.emailPlaceholder')}/></div>
      </div>
    </section>
    <section className="pdc-don-form__section" aria-labelledby="pdc-anonymat"><h2 id="pdc-anonymat">{t('donation.privacyTitle')}</h2>
      <label className="pdc-don-form__attestation"><input name="anonymePublic" type="checkbox"/><span>{t('donation.privacyOpt')}</span></label>
      <p className="pdc-don-form__aide">{t('donation.privacyInfo')}</p>
    </section>
    <PaymentMethods methode={methode} onMethodeChange={setMethode}
      messagerie={messagerie} onMessagerieChange={setMessagerie} titleId="pdc-paiement"/>
    <section className="pdc-don-form__section" aria-labelledby="pdc-declaration"><h2 id="pdc-declaration">{t('donation.statementTitle')}</h2>
      <label className="pdc-don-form__attestation"><input name="declaration" type="checkbox" required/><span>{t('donation.statement')} <strong>*</strong></span></label>
      <p className="pdc-don-form__aide">{t('donation.statementHelp')}</p>
    </section>
    {erreur && <p className="pdc-don-form__erreur" role="alert">{erreur}</p>}
    <button className="pdc-don-form__submit" type="submit">{t('donation.submit')}</button>
  </form>;
}
