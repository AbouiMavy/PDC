// R5.1 — canal email pour consentement personnel. Aucune preuve de paiement.
// Le jeton de 256 bits est conservé uniquement sous SHA-256 dans PostgreSQL.
import {randomBytes,createHash} from 'node:crypto';
const hex=x=>createHash('sha256').update(x).digest('hex');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
export function makeResendSenderR51({apiKey,from,fetchImpl=fetch}={}){
  if(typeof apiKey!=='string'||!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)||
     typeof from!=='string'||from.length>200||!from.includes('@')||typeof fetchImpl!=='function')
    throw Error('PDC_R51_MAIL_NOT_CONFIGURED');
  return async({to,subject,text,idempotencyKey})=>{
    if(typeof to!=='string'||!/^\S+@\S+\.\S+$/.test(to)||
       typeof idempotencyKey!=='string'||!/^r51-[a-f0-9-]{36}$/.test(idempotencyKey))
      throw Error('PDC_R51_MAIL_INVALID');
    const response=await fetchImpl('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json',
        'Idempotency-Key':idempotencyKey},
      body:JSON.stringify({from,to:[to],subject,text}),redirect:'error',
      signal:AbortSignal.timeout(8000)
    });
    if(!response?.ok)throw Error('PDC_R51_MAIL_PROVIDER_UNAVAILABLE');
    const r=await response.json();
    if(typeof r?.id!=='string'||r.id.length<5||r.id.length>200)
      throw Error('PDC_R51_MAIL_PROVIDER_INVALID');
    return r.id;
  };
}
export async function makePartnerEmailR51({pool,sendEmail,siteOrigin,enabled=false,environment='disabled'}={}){
  if(enabled!==true||environment!=='sandbox'||typeof pool?.query!=='function'||
     typeof sendEmail!=='function'||!/^https:\/\/[^/?#]+$/.test(siteOrigin??''))
    throw Error('PDC_R51_PARTNER_EMAIL_DISABLED');
  const role=(await pool.query('SELECT current_user AS role_name')).rows?.[0]?.role_name;
  if(role!=='pdc_r5_intake_writer')throw Error('PDC_R51_DB_ROLE_INVALID');
  return Object.freeze({
    async send({orderId,sessionToken}){
      if(!UUID.test(orderId??'')||!TOKEN.test(sessionToken??''))throw Error('PDC_R51_EMAIL_CONTEXT_INVALID');
      const token=randomBytes(32).toString('base64url');
      const tokenHash=hex(token);
      const rows=(await pool.query(
        'SELECT * FROM pdc_private.r5_issue_partner_email_dev($1::uuid,$2::text,$3::text)',
        [orderId,hex(sessionToken),tokenHash])).rows;
      if(rows?.length!==1||typeof rows[0].partner_email!=='string')
        throw Error('PDC_R51_EMAIL_ISSUE_FAILED');
      // Le fragment #t n'est pas transmis au serveur HTTP lors de l'ouverture du lien.
      const url=`${siteOrigin}/adhesion/confirmer-partenaire#t=${token}`;
      const subject='Vérification personnelle d’une demande vous concernant';
      const message=`Bonjour,\n\nUne personne a indiqué vos coordonnées dans une demande d’adhésion couple au Parti des Démocrates Camerounais (PDC). Vous n’êtes PAS encore adhérent(e).\n\nSi vous souhaitez personnellement adhérer, consultez les textes du parti et confirmez votre accord via la page suivante. Vous pouvez également refuser.\n\n${url}\n\nLa demande expire 14 jours après sa création. Sans réponse, le dossier du demandeur pourra être régularisé en adhésion individuelle conformément à son autorisation. Aucun paiement ne vous est demandé.\n\nSi vous n’êtes pas à l’origine de cette demande, refusez-la ou ignorez ce message.\n\nPDC`;
      // Échec incertain : jamais de deuxième email automatique ni de nouveau jeton.
      const id=await sendEmail({to:rows[0].partner_email,subject,text:message,
        idempotencyKey:`r51-${orderId}`});
      const ack=(await pool.query('SELECT pdc_private.r5_mark_partner_email_sent_dev($1::uuid,$2::text,$3::text) AS ok',
        [orderId,tokenHash,id])).rows?.[0]?.ok;
      if(ack!==true)throw Error('PDC_R51_EMAIL_ACK_FAILED');
      return 'sent';
    },
    async reply({token,decision}){
      if(!TOKEN.test(token??'')||!['confirmed','declined'].includes(decision))return false;
      const rows=(await pool.query('SELECT pdc_private.r5_reply_partner_email_dev($1::text,$2::text) AS ok',
        [hex(token),decision])).rows;
      return rows?.[0]?.ok===true;
    }
  });
}
