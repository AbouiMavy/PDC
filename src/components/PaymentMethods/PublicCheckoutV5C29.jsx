import './PublicCheckoutV5C29.css';
import {useNavigate} from 'react-router-dom';
import {makePendingReceiptV5C44} from '../../features/payments/manual-receipt-v5c44.mjs';
import {useEffect, useMemo, useRef, useState} from 'react';
import {buildPublicOrderPayload,validatePublicCheckoutResponse} from '../../features/payments/public-checkout-payload-v5c29.mjs';

// Double verrou explicite: l'activation Vite expose seulement une clé de site PUBLIQUE.
// Aucun secret DB/Tara/Turnstile ne doit figurer dans les variables VITE_*.
export const publicCheckoutSandboxEnabled = () =>
  import.meta.env.VITE_PDC_V5C29_CHECKOUT_ENABLED==='true' &&
  import.meta.env.VITE_PDC_V5C29_ENV==='sandbox' &&
  /^https:\/\/[^/?#]+$/.test(import.meta.env.VITE_PDC_V5C29_API_ORIGIN||'') &&
  typeof import.meta.env.VITE_PDC_V5C29_TURNSTILE_SITE_KEY==='string' &&
  import.meta.env.VITE_PDC_V5C29_TURNSTILE_SITE_KEY.length>8;

function HumanChallenge({onToken,siteKey}) {
  const node=useRef(null);
  useEffect(()=>{
    let widget=null,disposed=false;
    const scriptUrl='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    let script=document.querySelector('script[data-pdc-turnstile="v5c29"]');
    let owned=false;
    const initialize=()=>{
      if(disposed || !node.current || !window.turnstile || widget!==null)return;
      try {widget=window.turnstile.render(node.current,{
        sitekey:siteKey,action:'pdc-public-order',
        callback:token=>onToken(token),
        'expired-callback':()=>onToken(''),
        'error-callback':()=>onToken(''),
        'timeout-callback':()=>onToken(''),
      });}catch{onToken('');}
    };
    if (!script){
      script=document.createElement('script');
      script.src=scriptUrl;script.async=true;script.defer=true;
      script.dataset.pdcTurnstile='v5c29';owned=true;
      document.head.appendChild(script);
    }
    script.addEventListener('load',initialize);
    if(window.turnstile)initialize();
    return ()=>{
      disposed=true;onToken('');
      script?.removeEventListener('load',initialize);
      if(widget!==null && window.turnstile){try{window.turnstile.remove(widget);}catch{/* leaving page */}}
      // Le script partagé peut servir à un second formulaire, ne pas le supprimer.
      if(owned && !window.turnstile)script?.remove();
    };
  },[siteKey,onToken]);
  return <div ref={node} aria-label="Vérification humaine de sécurité"/>;
}

const messages={
  fr:{ready:'Commande de test DEV : aucun paiement confirmé par cette étape.',
    prepare:'Préparer ma commande sécurisée',pending:'Commande préparée. Le lien de paiement n’est pas encore disponible.',
    manual:'Vérification manuelle nécessaire. Ne recommencez pas cette demande ; conservez sa référence.',
    issued:'Lien correspondant au moyen choisi. Son ouverture ne confirme pas le paiement.',
    open:'Ouvrir le lien de paiement',bank:'Virement : conservez les instructions bancaires du formulaire. Le paiement reste non confirmé.',
    invalid:'Ce parcours n’est pas encore pris en charge (mensuel, anonymat public, carte de membre, cotisation simultanée ou diaspora).',
    unavailable:'Service DEV momentanément indisponible. N’envoyez pas une deuxième commande : vérifiez la référence avec l’équipe.',
    human:'Validez le contrôle humain pour continuer.',
    sms:'Attention : smsLink peut ouvrir l’application SMS ; il ne prouve pas un paiement Mobile Money.'},
  en:{ready:'DEV test order: this step does not confirm a payment.',prepare:'Prepare a secure order',
    pending:'Order prepared. The payment link is not available yet.',
    manual:'Manual verification required. Do not resubmit this request; keep its reference.',
    issued:'The link matches the selected channel. Opening it does not confirm payment.',
    open:'Open payment link',bank:'Bank transfer: use the form’s bank details. Payment is not confirmed.',
    invalid:'This flow is not yet supported (monthly, public anonymity, membership card, simultaneous dues or diaspora).',
    unavailable:'DEV service unavailable. Do not submit another order; ask the team to check this reference.',
    human:'Complete the human check to continue.',
    sms:'Note: smsLink may launch SMS sharing; it does not prove a Mobile Money payment.'}
};

export default function PublicCheckoutV5C29({source,data,language='fr'}){
  const lang=language==='en'?'en':'fr',m=messages[lang];
  const navigate=useNavigate();
  const enabled=publicCheckoutSandboxEnabled();
  const [token,setToken]=useState(''),[status,setStatus]=useState(null);
  const [started,setStarted]=useState(false),[busy,setBusy]=useState(false);
  const reference=useRef(null);
  if(reference.current===null){
    reference.current=typeof crypto!=='undefined' && typeof crypto.randomUUID==='function'
      ? crypto.randomUUID():null;
  }
  const order=useMemo(()=>{
    try{return {data:buildPublicOrderPayload({source,data,idempotencyKey:reference.current}),error:null};}
    catch{return {data:null,error:'UNSUPPORTED'};}
  },[source,data]);
  const requestedMethod=data?.methode;
  const requestedChannel=data?.methode==='tara'?data?.messagerie:null;
  if(!enabled)return null;
  const apiOrigin=import.meta.env.VITE_PDC_V5C29_API_ORIGIN;
  async function submit(){
    if(started || busy || !order.data || !token)return;
    setStarted(true);setBusy(true);
    try {
      const response=await fetch(`${apiOrigin}/v1/public/orders`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({verificationToken:token,order:order.data}),
        cache:'no-store',credentials:'same-origin',redirect:'error',
        signal:AbortSignal.timeout(20000),
      });
      if(!response.ok)throw new Error('HTTP_FAILED');
      const json=await response.json();
      setStatus({result:validatePublicCheckoutResponse(json,requestedMethod,requestedChannel)});
    }catch{
      // Même après timeout, la commande peut exister. Ne jamais rejouer automatiquement.
      setStatus({error:'UNKNOWN_OUTCOME'});
    }finally{setBusy(false);}
  }
  const result=status?.result;
  return <section className="pdc-checkout-v5c29" aria-live="polite">
    <h2>{lang==='en'?'Secure DEV payment test':'Essai de paiement sécurisé — DEV'}</h2>
    <p>{m.ready}</p>
    {!order.data?<p role="status">{m.invalid}</p>:
    <>
      {!started&&<>
        <HumanChallenge siteKey={import.meta.env.VITE_PDC_V5C29_TURNSTILE_SITE_KEY} onToken={setToken}/>
        {!token&&<p>{m.human}</p>}
        <button className="pdc-checkout-v5c29__submit" type="button" disabled={!token||busy} onClick={submit}>{m.prepare}</button>
      </>}
      {busy&&<p role="status">{lang==='en'?'Submitting once…':'Envoi unique en cours…'}</p>}
      {status?.error&&<p role="alert">{m.unavailable}</p>}
      {result&&<>
        <p><strong>{result.paymentId}</strong> — {result.grossAmountXaf} FCFA</p>
        <p role="status">{result.status==='issued'?m.issued:result.status==='manual_review'?m.manual:
          result.status==='pending_external_payment'?m.bank:m.pending}</p>
        {result.status==='issued'&&<>
          <a href={result.paymentUrl} target={result.paymentUrl.startsWith('sms:')?undefined:'_blank'}
             rel="noopener noreferrer" referrerPolicy="no-referrer">{result.linkField==='smsLink'
            ? (lang==='fr'?'Ouvrir le SMS TaraMoney':'Open TaraMoney SMS') : m.open}</a>
          {result.linkField==='smsLink'&&<p>{m.sms}</p>}
        </>}
        <button className="pdc-checkout-v5c29__submit" type="button" onClick={()=>{
          // Attestation de réception, PAS paiement ou admission.
          const pdcReceipt=makePendingReceiptV5C44(source,result);
          navigate(source==='membership'?'/adhesion/merci':'/soutenir/merci',
            {state:{pdcReceipt}});
        }}>{lang==='fr'?'Terminer et conserver ma référence':'Finish and keep my reference'}</button>
      </>}
    </>}
  </section>;
}
