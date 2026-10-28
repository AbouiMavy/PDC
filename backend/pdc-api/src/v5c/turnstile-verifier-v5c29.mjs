// V5-C.29 — vérification SERVEUR Turnstile, fermée par défaut.
// Un jeton client n'est jamais une preuve tant que siteverify n'a pas répondu.
const API='https://challenges.cloudflare.com/turnstile/v0/siteverify';
export function makeTurnstileVerifierV5C29({secret,expectedHostname,
  fetchImpl=fetch,enabled=false,environment='disabled'}={}){
  if(enabled!==true || environment!=='sandbox' ||
     typeof secret!=='string' || secret.length<8 ||
     typeof expectedHostname!=='string' || !/^[a-z0-9.-]+$/i.test(expectedHostname) ||
     typeof fetchImpl!=='function') throw new Error('TURNSTILE_VERIFIER_DISABLED');
  return async function verifyHuman({token,address}={}){
    if(typeof token!=='string' || token.length<20 || token.length>2048 ||
       !/^[A-Za-z0-9._~-]+$/.test(token))return false;
    const fields=new URLSearchParams({secret,response:token});
    if(typeof address==='string' && address.length<128 && /^[a-f0-9:.]+$/i.test(address))
      fields.set('remoteip',address);
    try{
      const r=await fetchImpl(API,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:fields.toString(),redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!r?.ok)return false;
      const result=await r.json();
      return result?.success===true && result?.hostname===expectedHostname &&
        result?.action==='pdc-public-order';
    }catch{return false;}
  };
}
