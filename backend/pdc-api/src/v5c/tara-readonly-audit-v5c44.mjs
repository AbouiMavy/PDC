// V5-C.44.2 — Audit financier serveur, sans paiement et sans écritures.
// Réutilise l'algorithme de rapprochement déjà testé en V5-C.
// Aucune route HTTP, confirmation, admission, ni appel à createPaymentLink.
import { V5CError } from './contracts.mjs';
import { validateTaraProductId } from './tara-server-client-v5c.mjs';
import { reconcileTaraProduct } from './tara-reconciliation-v5c.mjs';

const deny = code => { throw new V5CError(code); };
const ROLE = 'pdc_tara_v5c_writer';
const AMOUNT = /^[1-9][0-9]{0,9}$/;
const CHANNELS = Object.freeze({mobile:'smsLink',carte:'cardLink'});

/** Lecture par une seule RPC SECURITY DEFINER (migration V5-C.44 DEV).
 * Ne retourne pas de nom, téléphone, email, compte ou preuve de paiement.
 */
export async function makeTaraV5C44AuditReaderPg({pool,enabled=false,environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox' || typeof pool?.query!=='function')
    deny('PDC_TARA_44_AUDIT_READER_DISABLED');
  let role;
  try { role=(await pool.query('SELECT current_user AS role_name'))?.rows?.[0]?.role_name; }
  catch { deny('PDC_TARA_44_DB_UNAVAILABLE'); }
  if (role!==ROLE) deny('PDC_TARA_44_WRONG_ROLE');
  async function load(productId) {
    validateTaraProductId(productId);
    let result;
    try {
      result=await pool.query(
        'SELECT * FROM pdc_private.tara_v5c44_load_audit_context($1::text)',
        [productId]);
    } catch { deny('PDC_TARA_44_DB_UNAVAILABLE'); }
    if (!Array.isArray(result?.rows) || result.rows.length>1)
      deny('PDC_TARA_44_DB_RESPONSE_INVALID');
    return result.rows[0]??null;
  }
  return Object.freeze({load});
}

const result = (productId, decision, reason=null, extra={}) => Object.freeze({
  productId, decision, reason, ...extra,
  paymentConfirmed:false, admissionGranted:false, settlementAuthorized:false,
});

/** Contexte chargé exclusivement depuis PostgreSQL privé, jamais depuis React.
 * Carte et canaux de partage : examen manuel faute de corroboration documentaire.
 * Un résultat 'corroborated' n'est PAS une écriture de confirmation.
 */
export function makeTaraV5C44ReadOnlyAuditor({reader,client,enabled=false,
  environment='disabled'}={}) {
  if (enabled!==true || environment!=='sandbox' ||
      typeof reader?.load!=='function' ||
      typeof client?.checkMobileStatus!=='function' ||
      typeof client?.listTransactions!=='function')
    deny('PDC_TARA_44_AUDITOR_DISABLED');

  async function inspect(productId,{pageSize=20,maxPages=10}={}) {
    validateTaraProductId(productId);
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||
       !Number.isInteger(maxPages)||maxPages<1||maxPages>20)
      deny('PDC_TARA_44_PAGINATION_INVALID');
    const row=await reader.load(productId);
    if (!row || row.productId!==productId || row.currency!=='XAF' ||
        !AMOUNT.test(row.amountXaf??'') ||
        BigInt(row.amountXaf)>2147483647n)
      deny('PDC_TARA_44_PRIVATE_CONTEXT_INVALID');
    if(row.linkState!=='issued')
      return result(productId,'not_verified','LINK_NOT_ISSUED');
    if (!['initiated','pending'].includes(row.paymentStatus))
      return result(productId,'manual_review','PAYMENT_STATUS_NOT_ELIGIBLE');
    // N'utiliser qu'un canal persisté côté base, jamais celui d'un appelant HTTP.
    const channel=row.selectedMethod;
    if (!Object.hasOwn(CHANNELS,channel) ||
        row.selectedLinkField!==CHANNELS[channel])
      return result(productId,'manual_review','CHANNEL_NOT_VERIFIED');
    if (channel==='carte')
      return result(productId,'manual_review','CARD_STATUS_CONTRACT_MISSING');

    try {
      const proof=await reconcileTaraProduct({client,productId,
        expectedAmountXaf:row.amountXaf,paymentChannel:'mobile',
        pageSize,maxPages});
      if (!proof || proof.productId!==productId ||
          !['corroborated','not_verified','manual_review'].includes(proof.decision))
        deny('PDC_TARA_44_PROVIDER_RESPONSE_INVALID');
      return result(productId,proof.decision,proof.reason??null,
        proof.decision==='corroborated'
          ? {amountXaf:row.amountXaf,currency:'XAF',
              source:'TARA_STATUS_AND_TRANSACTION_LIST',
              requiresAtomicDbReconciliation:true}
          : {});
    } catch(error) {
      if(error instanceof V5CError &&
         error.code==='PDC_TARA_44_PROVIDER_RESPONSE_INVALID') throw error;
      // Le refus de service, y compris les timeouts, n'est pas une preuve.
      return result(productId,'manual_review','PROVIDER_UNAVAILABLE');
    }
  }
  return Object.freeze({inspect});
}
