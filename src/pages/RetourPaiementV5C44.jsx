import {Navigate,Link,useSearchParams} from 'react-router-dom';
import {useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {readPendingReturnR5} from '../features/payments/return-session-r5.mjs';
import './Adhesion.css';

// L'URL de TaraMoney sert uniquement à choisir une PAGE, jamais à confirmer une opération.
// Retour dans le même onglet : l'accusé provisoire PDC est récupéré puis présenté.
// Retour dans un autre navigateur : page existante en attente, SANS donnée financière inventée.
export default function RetourPaiementV5C44(){
  const {i18n}=useTranslation();
  const fr=!i18n.resolvedLanguage?.startsWith('en');
  const [params]=useSearchParams();
  const pending=useMemo(()=>readPendingReturnR5(),[]);
  const kind=pending?.kind ?? (params.get('kind')==='adhesion'?'adhesion':params.get('kind')==='don'?'don':null);
  if(kind){
    return <Navigate replace to={kind==='adhesion'?'/adhesion/merci':'/soutenir/merci'}
      state={pending?{pdcReceipt:pending.receipt}:undefined}/>;
  }
  return <main className="pdc-adhesion pdc-adhesion-thanks"><section className="pdc-adhesion-card">
    <h1>{fr?'Retour de TaraMoney':'Return from TaraMoney'}</h1>
    <h2>{fr?'Paiement en attente de vérification':'Payment awaiting verification'}</h2>
    <p>{fr?'Le retour du fournisseur ne constitue pas une preuve de paiement. Conservez vos références PDC et TaraMoney.':'Returning from the payment provider is not proof of payment. Keep your PDC and TaraMoney references.'}</p>
    <Link to="/adhesion/merci" className="pdc-adhesion-secondary">{fr?'Ma demande d’adhésion':'My membership request'}</Link>
    {' '}
    <Link to="/soutenir/merci" className="pdc-adhesion-secondary">{fr?'Ma demande de don':'My donation request'}</Link>
  </section></main>;
}
