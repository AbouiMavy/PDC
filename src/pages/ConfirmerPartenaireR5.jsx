import {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {useTranslation} from 'react-i18next';
import './Adhesion.css';
// Un lien de courriel ne suffit pas. Seule une action volontaire du partenaire valide.
export default function ConfirmerPartenaireR5(){
  const {i18n}=useTranslation(),fr=!i18n.resolvedLanguage?.startsWith('en');
  const token=useMemo(()=>new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t'),[]);
  const valid=typeof token==='string'&&/^[A-Za-z0-9_-]{43}$/.test(token);
  const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState('');
  async function reply(decision){
    if(!valid||busy||result||(decision==='confirmed'&&!checked))return;
    setBusy(true);
    try{
      const r=await fetch(import.meta.env.VITE_PDC_R5_API_ORIGIN+'/v1/public/r5/partner-response',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,decision}),
        credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw Error('not-accepted');
      const payload=await r.json();
      if(payload?.status!=='recorded')throw Error('not-accepted');
      setResult(decision);window.history.replaceState(null,'',window.location.pathname);
    }catch{setResult('error');}finally{setBusy(false);}
  }
  return <main className="pdc-adhesion pdc-adhesion-thanks"><section className="pdc-adhesion-card">
    <h1>{fr?'Confirmation personnelle d’une demande d’adhésion':'Personal membership confirmation'}</h1>
    <p>{fr?'Une personne a communiqué vos coordonnées pour une adhésion couple au PDC. Vous n’êtes pas membre tant que vous n’avez pas confirmé et que le dossier n’a pas été admis.':
      'Someone provided your contact details for a PDC couple application. You are not a member unless you confirm and the application is approved.'}</p>
    {!result&&valid&&<>
      <p>{fr?'Consultez les textes du PDC et les informations sur la protection des données avant de répondre.':
        'Review PDC documents and privacy information before responding.'}</p>
      <p><Link to="/adhesion" target="_blank" rel="noopener noreferrer">{fr?'Voir la page d’adhésion':'View membership page'}</Link></p>
      <label className="pdc-adhesion-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>
        {fr?'J’ai pris connaissance des textes fondamentaux et je souhaite personnellement adhérer au PDC.':
          'I have reviewed the party documents and personally wish to apply to the PDC.'}</label>
      <div className="pdc-adhesion-actions">
        <button type="button" className="pdc-adhesion-primary" disabled={!checked||busy} onClick={()=>reply('confirmed')}>{fr?'Je confirme':'I confirm'}</button>
        <button type="button" className="pdc-adhesion-secondary" disabled={busy} onClick={()=>reply('declined')}>{fr?'Je refuse':'I decline'}</button>
      </div>
    </>}
    {result==='confirmed'&&<p role="status">{fr?'Votre confirmation est enregistrée. Votre admission reste soumise à vérification.':'Your response was recorded; admission is subject to review.'}</p>}
    {result==='declined'&&<p role="status">{fr?'Votre refus est enregistré. Aucune adhésion ne sera établie à votre nom.':'Your refusal was recorded. No membership will be created in your name.'}</p>}
    {(!valid||result==='error')&&<p role="alert">{fr?'Lien invalide, expiré ou déjà utilisé. Contactez le PDC si besoin.':'Invalid, expired or already used link. Contact PDC if needed.'}</p>}
  </section></main>;
}
