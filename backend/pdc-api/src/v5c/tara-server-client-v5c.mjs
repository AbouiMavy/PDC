// V5-C — adaptateur Tara, strictement SERVEUR et désactivé par défaut.
// Contrat issu de la documentation fournie par Tara le 27/10/2026.
// Aucune utilisation dans React, aucune route HTTP, aucune donnée réelle.
import { randomBytes } from 'node:crypto';
import { V5CError } from './contracts.mjs';

const URLS = Object.freeze({
  link: 'https://www.dklo.co/api/tara/paymentlinks',
  mobileStatus: 'https://www.dklo.co/api/tara/transactions/status',
  transactions: 'https://www.dklo.co/api/tara/transactionlist',
});
const PRODUCT = /^[A-Za-z0-9_-]{8,128}$/;
const AMOUNT = /^[1-9][0-9]{0,15}$/;
const LIMIT = 2147483647n;
const fail = code => { throw new V5CError(code); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// Référence imprévisible créée par le SERVEUR PDC ; à persister avant le POST Tara.
export function newTaraProductId() {
  return `PDC_${randomBytes(18).toString('base64url')}`;
}

export function validateTaraProductId(value) {
  if (typeof value !== 'string' || !PRODUCT.test(value)) fail('PDC_TARA_PRODUCT_ID_INVALID');
  return value;
}
function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) fail('PDC_TARA_URL_INVALID');
  let url;
  try { url = new URL(value); } catch { fail('PDC_TARA_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !url.hostname || /^(localhost|127\.|0\.0\.0\.0$)/i.test(url.hostname)) fail('PDC_TARA_URL_INVALID');
  return url.toString();
}
function money(value) {
  if (typeof value !== 'string' || !AMOUNT.test(value) || BigInt(value) > LIMIT)
    fail('PDC_TARA_PRICE_INVALID');
  return Number(value); // XAF : zéro chiffre après la virgule.
}
export function makeTaraLinkInput({ productId, productName, amountXaf, productDescription,
  returnUrl, webHookUrl, productPictureUrl } = {}) {
  validateTaraProductId(productId);
  if (typeof productName !== 'string' || productName.length < 3 || productName.length > 120 ||
      typeof productDescription !== 'string' || productDescription.length < 3 || productDescription.length > 500)
    fail('PDC_TARA_PRODUCT_METADATA_INVALID');
  const data = {
    productId, productName, productPrice: money(amountXaf), productDescription,
    returnUrl: httpsUrl(returnUrl), webHookUrl: httpsUrl(webHookUrl),
  };
  if (productPictureUrl != null) data.productPictureUrl = httpsUrl(productPictureUrl);
  return Object.freeze(data);
}

// Les liens Tara de partage ont plusieurs hôtes légitimes, mais jamais
// un protocole exécutable ou une adresse choisie par le navigateur.
const TARA_SHARE_HOSTS = new Set([
  'taramoney.com','www.taramoney.com','dklo.co','www.dklo.co',
  'wa.me','api.whatsapp.com','web.whatsapp.com','whatsapp.com','www.whatsapp.com',
  't.me','telegram.me','www.telegram.me',
  'dikalo.com','www.dikalo.com','dikalo.co','www.dikalo.co',
]);
function validTaraShareLink(value, field) {
  if (typeof value !== 'string' || value.length < 7 || value.length > 2048 ||
      /[\u0000-\u001f\u007f]/.test(value)) fail('PDC_TARA_PAYMENT_LINK_INVALID');
  if (field==='smsLink' && /^sms:/i.test(value)) {
    // Un SMS est un partage, pas une preuve de paiement.
    if (!/^sms:(?:[+0-9,;]*)?(?:\?[^#]*)?$/i.test(value))
      fail('PDC_TARA_PAYMENT_LINK_INVALID');
    return value;
  }
  let u;
  try { u = new URL(value); } catch { fail('PDC_TARA_PAYMENT_LINK_INVALID'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash ||
      !TARA_SHARE_HOSTS.has(u.hostname.toLowerCase())) fail('PDC_TARA_PAYMENT_LINK_INVALID');
  return u.toString();
}
function validProviderPayUrl(value, expectedPrefix) {
  if (typeof value !== 'string' || value.length > 2048) fail('PDC_TARA_PAYMENT_LINK_INVALID');
  let u;
  try { u = new URL(value); } catch { fail('PDC_TARA_PAYMENT_LINK_INVALID'); }
  // URLs de paiement documentées par Tara, pas de redirection arbitraire fournie à React.
  if (u.protocol !== 'https:' || !['taramoney.com', 'www.taramoney.com'].includes(u.hostname) ||
      !u.pathname.startsWith(expectedPrefix) || u.username || u.password || u.hash)
    fail('PDC_TARA_PAYMENT_LINK_INVALID');
  return u.toString();
}
export function parseTaraLinkResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !['success','SUCCESS'].includes(raw.status))
    fail('PDC_TARA_LINK_NOT_CREATED');
  const generalLink = validProviderPayUrl(raw.generalLink, '/pay/');
  const result = { generalLink };
  if (own(raw, 'cardLink') && raw.cardLink != null) result.cardLink = validProviderPayUrl(raw.cardLink, '/card/');
  for (const field of ['smsLink','whatsappLink','telegramLink','dikaloLink']) {
    if (own(raw,field) && raw[field] != null)
      result[field] = validTaraShareLink(raw[field],field);
  }
  return Object.freeze(result); // Pas d'injection d'URL WhatsApp/Telegram arbitraire.
}
export function parseTaraMobileStatus(raw, productId) {
  validateTaraProductId(productId);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.productId !== productId ||
      typeof raw.status !== 'string' || !/^[A-Z_]{3,40}$/.test(raw.status))
    fail('PDC_TARA_STATUS_INVALID');
  return Object.freeze({ productId, status: raw.status });
}
export function parseTaraTransactionRows(raw) {
  if (!Array.isArray(raw) || raw.length > 200) fail('PDC_TARA_LIST_INVALID');
  return Object.freeze(raw.map(x => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || typeof x.transactionId !== 'string' ||
        x.transactionId.length > 200 || typeof x.status !== 'string' || x.status.length > 40 ||
        !['XAF','EUR'].includes(x.currency) ||
        !((typeof x.amount === 'number' && Number.isSafeInteger(x.amount)) ||
          (typeof x.amount === 'string' && /^\d{1,16}$/.test(x.amount))) ||
        !/^\d{1,16}$/.test(String(x.amount)) || BigInt(String(x.amount)) > LIMIT)
      fail('PDC_TARA_TRANSACTION_ROW_INVALID');
    return Object.freeze({transactionId:x.transactionId,amount:String(x.amount),currency:x.currency,status:x.status});
  }));
}

/** Aucune requête réseau sans opt-in explicite ET déclaration sandbox.
 * Un fournisseur peut utiliser ses vraies URLs en sandbox : obtenir la confirmation Tara avant le test.
 */
export function makeTaraServerClient({ apiKey, businessId, environment = 'disabled',
  allowNetwork = false, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (environment !== 'sandbox' || allowNetwork !== true) fail('PDC_TARA_NETWORK_DISABLED');
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 2048 ||
      typeof businessId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(businessId) ||
      typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 15000)
    fail('PDC_TARA_PRIVATE_CONFIG_INVALID');
  async function post(url, payload) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {'Content-Type':'application/json',Accept:'application/json'},
        body: JSON.stringify({apiKey, businessId, ...payload}),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response?.ok) fail('PDC_TARA_PROVIDER_UNAVAILABLE');
      const body = await response.text();
      if (body.length > 262144) fail('PDC_TARA_RESPONSE_TOO_LARGE');
      return JSON.parse(body);
    } catch (error) {
      if (error instanceof V5CError) throw error;
      // Ne jamais retransmettre corps, URL avec identifiants, stack ou message serveur.
      fail('PDC_TARA_PROVIDER_UNAVAILABLE');
    }
  }
  return Object.freeze({
    async createPaymentLink(input,{selectedField=null}={}) {
      const allowed=['smsLink','whatsappLink','telegramLink',
        'dikaloLink','cardLink'];
      if(selectedField!==null && !allowed.includes(selectedField))
        fail('PDC_TARA_CHANNEL_INVALID');

      const body=makeTaraLinkInput(input);
      const raw=await post(URLS.link,body);

      if(selectedField===null)
        return parseTaraLinkResponse(raw);

      if(!raw || typeof raw!=='object' || Array.isArray(raw))
        fail('PDC_TARA_LINK_NOT_CREATED');

      const selected={
        status:raw.status,
        generalLink:raw.generalLink,
        [selectedField]:raw[selectedField]
      };

      try {
        return parseTaraLinkResponse(selected);
      } catch(error) {
        const profile=value=>{
          if(typeof value!=='string')return {type:typeof value};
          try {
            const u=new URL(value);
            return {protocol:u.protocol,host:u.hostname||null};
          }catch {
            return {type:'unparseable'};
          }
        };
        console.warn('PDC_TARA_LINK_FORMAT_REJECTED',
          JSON.stringify({
            field:selectedField,
            general:profile(raw.generalLink),
            selected:profile(raw[selectedField])
          }));
        throw error;
      }
    },
    async checkMobileStatus(productId) {
      validateTaraProductId(productId);
      return parseTaraMobileStatus(await post(URLS.mobileStatus,{productId}),productId);
    },
    async listTransactions({start=0,size=20}={}) {
      if (!Number.isInteger(start) || start < 0 || start > 100000 ||
          !Number.isInteger(size) || size < 1 || size > 100)
        fail('PDC_TARA_PAGINATION_INVALID');
      return parseTaraTransactionRows(await post(URLS.transactions,{start,size}));
    },
    // L'endpoint /paid/transactionlist n'est PAS appelé : méthode et paramètres non documentés.
  });
}
