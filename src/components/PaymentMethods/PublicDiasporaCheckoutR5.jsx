import {useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {HumanChallenge} from './PublicCheckoutV5C29';
import {INDICATIFS} from '../DonForm/indicatifs';
import {buildDiasporaR5Intent} from '../../features/adhesion/diaspora-r5-intent.mjs';
import {calculDiaspora} from '../../features/adhesion/tarifs.mjs';
import {validatePublicCheckoutResponse} from '../../features/payments/public-checkout-payload-v5c29.mjs';
import {makePendingReceiptV5C44} from '../../features/payments/manual-receipt-v5c44.mjs';
import {savePendingReturnR5} from '../../features/payments/return-session-r5.mjs';
import './PublicCheckoutV5C29.css';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const diasporaR5Enabled=()=>
  import.meta.env.VITE_PDC_R5_ENABLED==='true' &&
  import.meta.env.VITE_PDC_R5_MODE==='sandbox' &&
  /^https:\/\/[^/?#]+$/.test(import.meta.env.VITE_PDC_R5_API_ORIGIN??'') &&
  typeof import.meta.env.VITE_PDC_R5_TURNSTILE_SITE_KEY==='string'&&
  import.meta.env.VITE_PDC_R5_TURNSTILE_SITE_KEY.length>8;
export default function PublicDiasporaCheckoutR5({data,photoMember,photoPartner,language='fr'}){
  const fr=language!=='en',navigate=useNavigate();
  const enabled=diasporaR5Enabled();
  const key=useRef(null);
  if(!key.current)key.current=typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():null;
  const order=useMemo(()=>{try{return buildDiasporaR5Intent({form:data.form,
    idempotencyKey:key.current,phonePrefix:INDICATIFS[data.form.pays]});}catch{return null;}},[data]);
  const [human,setHuman]=useState(''),[started,setStarted]=useState(false),
    [stage,setStage]=useState('ready'),[result,setResult]=useState(null),[error,setError]=useState(''),
    [partnerEmailStatus,setPartnerEmailStatus]=useState('');
  if(!enabled)return <p role="status">{fr?'Le dossier diaspora reste en mode prévisualisation : le parcours financier R5 DEV n’est pas activé.':
    'Diaspora application is in preview mode: the R5 DEV payment flow is disabled.'}</p>;
  if(data.methode==='virement')return <p role="status">{fr?'Le virement diaspora exige une validation bancaire distincte et n’est pas activé dans cette recette R5. Sélectionnez un autre moyen pour un essai Sandbox.':'Diaspora bank transfers require separate bank verification and are not enabled in this R5 Sandbox.'}</p>;
  const api=import.meta.env.VITE_PDC_R5_API_ORIGIN;
  async function post(path,body){
    const r=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('PDC_R5_MANUAL_REVIEW');
    return r.json();
  }
  async function uploadPhoto(orderId,sessionToken,slot,file){
    if(!file)throw Error('PDC_R5_MISSING_PHOTO');
    setStage(slot==='member'?'photo-member':'photo-partner');
    const g=await post('/v1/public/r5/portrait-grant',{orderId,sessionToken,slot});
    if(typeof g.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(g.token))throw Error('PDC_R5_INVALID_GRANT');
    const r=await fetch(`${api}/v1/public/r5/photo/${orderId}/${slot}`,{
      method:'POST',headers:{'Content-Type':file.type,'Authorization':`Bearer ${g.token}`},
      body:file,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
    if(!r.ok||(await r.json())?.status!=='stored_private_pending_admission')throw Error('PDC_R5_PHOTO_NOT_CONFIRMED');
  }
  async function submit(){
    if(started||!order||!human)return;
    setStarted(true);setStage('create');
    let created=null;
    try{
      created=await post('/v1/public/r5/diaspora',{verificationToken:human,order});
      if(!UUID.test(created.orderId??'')||!UUID.test(created.paymentId??'')||
         !/^[A-Za-z0-9_-]{43}$/.test(created.sessionToken??''))
        throw Error('PDC_R5_INTAKE_SESSION_UNAVAILABLE');
      setPartnerEmailStatus(created.partnerEmailStatus||'');
      setResult({status:'reserved_channel_pending',paymentId:created.paymentId,
        grossAmountXaf:created.grossAmountXaf,currency:'XAF',paymentConfirmed:false,membershipGranted:false});
      if(data.form.demandeCarte){
        await uploadPhoto(created.orderId,created.sessionToken,'member',photoMember);
        if(order.formula==='couple')await uploadPhoto(created.orderId,created.sessionToken,'partner',photoPartner);
      }
      // L'attestation du payeur autorise le paiement. Le conjoint confirmera par courriel.
      setStage('checkout');
      const raw=await post('/v1/public/r5/checkout',{
        orderId:created.orderId,sessionToken:created.sessionToken,
        method:data.methode,messagingChannel:data.methode==='tara'?data.messagerie:null});
      const validated=validatePublicCheckoutResponse(raw,data.methode,
        data.methode==='tara'?data.messagerie:null);
      setResult(validated);setStage('result');
    }catch{
      // Si la réponse HTTP est ambiguë, ne JAMAIS recréer un paiement automatiquement.
      setError('MANUAL_REVIEW');setStage('manual');
    }
  }
  const amount=order?calculDiaspora({formule:order.formula}).montant:null;
  return <section className="pdc-checkout-v5c29" aria-live="polite">
    <h2>{fr?'Dossier diaspora — Sandbox DEV':'Diaspora application — DEV Sandbox'}</h2>
    {order&&<p>{amount} € · {fr?'taux de référence PDC : 1 € = 656 FCFA':'PDC reference rate: EUR 1 = XAF 656'}</p>}
    <p>{fr?'Aucun paiement n’est confirmé par cette page. Les vérifications financières et l’admission restent séparées.':
      'This page does not confirm payment. Financial verification and membership approval are separate.'}</p>
    {!started&&<>
      <HumanChallenge siteKey={import.meta.env.VITE_PDC_R5_TURNSTILE_SITE_KEY} onToken={setHuman}/>
      <button type="button" disabled={!order||!human} onClick={submit}>
        {fr?'Enregistrer le dossier et préparer le paiement':'Submit application and prepare payment'}</button>
    </>}
    {['create','photo-member','photo-partner','checkout'].includes(stage)&&
      <p role="status">{fr?'Traitement du dossier en cours, sans renvoi automatique.':'Processing once, without automatic retry.'}</p>}
    {order?.formula==='couple'&&partnerEmailStatus==='delivery_requires_review'&&<p role="alert">{fr
      ?'Le dossier est enregistré, mais l’envoi du courriel au partenaire nécessite une intervention administrative. Ne soumettez pas de deuxième demande.'
      :'Application saved, but delivery of the partner email requires administrative review. Do not submit a duplicate.'}</p>}
    {order?.formula==='couple'&&partnerEmailStatus==='sent'&&<p role="status">{fr
      ?'Un courriel de confirmation a été adressé au deuxième bénéficiaire.'
      :'A personal confirmation email was sent to the second beneficiary.'}</p>}
    {order?.formula==='couple'&&result&&<p role="status">{fr
      ?'La confirmation personnelle du second bénéficiaire sera demandée par courriel. Sans confirmation sous 14 jours : 30 € de cotisation individuelle et 10 € de don, selon votre autorisation.'
      :'The second beneficiary will be invited to confirm by email. Without confirmation in 14 days: EUR 30 individual dues and EUR 10 donation, as authorized.'}</p>}
    {error&&<p role="alert">{fr?'Issue incertaine : conservez la référence du dossier. Ne soumettez pas une seconde demande.':
      'Uncertain outcome. Keep the application reference and do not resubmit.'}</p>}
    {result&&<>
      <p><strong>{fr?'Référence PDC':'PDC reference'} : </strong><code>{result.paymentId}</code></p>
      {result.status==='issued'&&result.paymentUrl&&<a href={result.paymentUrl} rel="noopener noreferrer"
        onClick={()=>{try{savePendingReturnR5('membership',result);}catch{}}}>
        {fr?'Ouvrir TaraMoney (paiement non confirmé)':'Open TaraMoney (payment unconfirmed)'}</a>}
      {result.status!=='issued'&&<p>{fr?'Paiement encore en attente : aucun lien n’est émis à ce stade.':
        'Payment is still pending; no payment link has been issued.'}</p>}
      <button type="button" onClick={()=>navigate('/adhesion/merci',
        {state:{pdcReceipt:makePendingReceiptV5C44('membership',result)}})}>
        {fr?'Conserver mon accusé de réception':'Keep my request acknowledgement'}</button>
    </>}
  </section>;
}
