// T12 — Adaptateur serveur TaraMoney Mobile Pay.
// Aucun appel direct depuis React. Aucune confirmation d'encaissement ici.
// L'appelant DOIT réserver et verrouiller durablement productId + dossier
// AVANT l'envoi au prestataire, et ne jamais réémettre après issue incertaine.
const ENDPOINT = 'https://www.dklo.co/api/tara/mobilepay';
const PRODUCT = /^PDC_[A-Za-z0-9_-]{24}$/;
const INTEGER = /^[1-9]\d{0,9}$/;
const MESSAGE = /^[A-Za-z0-9_ -]{1,80}$/;
const VENDOR = /^[A-Z][A-Z0-9_]{1,63}$/;

const reject = code => { throw new Error(`PDC_T12_${code}`); };
const safeUrl = value => {
  if (typeof value !== 'string' || value.length > 2048) reject('WEBHOOK_INVALID');
  let url;
  try { url = new URL(value); } catch { reject('WEBHOOK_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
      !url.hostname || /^(?:localhost|127\.|0\.0\.0\.0)/i.test(url.hostname)) reject('WEBHOOK_INVALID');
  return url.toString();
};

/** Prépare un payload explicite, jamais un paiement confirmé.
 * network est documenté pour Wave au Sénégal/Côte d'Ivoire uniquement.
 * Pour les numéros camerounais, il est omis ; l'opérateur constaté sera vendor.
 */
export function makeMobilePayInputT12({
  productId, productName, amountXaf, phoneNumber, webHookUrl, network
} = {}) {
  if (typeof productId !== 'string' || !PRODUCT.test(productId)) reject('PRODUCT_INVALID');
  if (typeof productName !== 'string' || productName.trim().length < 3 ||
      productName.length > 120 || /[\u0000-\u001f<>]/.test(productName)) reject('NAME_INVALID');
  if (typeof amountXaf !== 'string' || !INTEGER.test(amountXaf) ||
      BigInt(amountXaf) > 2147483647n) reject('AMOUNT_INVALID');
  if (typeof phoneNumber !== 'string' || !/^[1-9]\d{8,14}$/.test(phoneNumber))
    reject('PHONE_INVALID');
  // Le paiement direct camerounais attend précisément 237 + neuf chiffres.
  if (phoneNumber.startsWith('237') && !/^2376\d{8}$/.test(phoneNumber))
    reject('PHONE_INVALID');
  if (network != null &&
      (network !== 'Wave' || !/^(?:221|225)\d{8,10}$/.test(phoneNumber)))
    reject('NETWORK_INVALID');
  return Object.freeze({
    productId, productName: productName.trim(), productPrice: Number(amountXaf),
    phoneNumber, webHookUrl: safeUrl(webHookUrl),
    ...(network == null ? {} : {network}),
  });
}

export function parseMobilePayLaunchT12(raw, productId) {
  if (!PRODUCT.test(productId) || !raw || typeof raw !== 'object' ||
      Array.isArray(raw) || !['SUCCESS','FAILURE'].includes(raw.status) ||
      typeof raw.message !== 'string' || !MESSAGE.test(raw.message) ||
      (raw.vendor != null && (typeof raw.vendor !== 'string' || !VENDOR.test(raw.vendor))))
    reject('RESPONSE_INVALID');
  return Object.freeze({
    productId,
    status: raw.status === 'SUCCESS' ? 'request_initiated' : 'request_rejected',
    providerStatus: raw.status,
    providerMessage: raw.message,
    vendor: raw.vendor ?? null,
    paymentConfirmed: false,
    membershipGranted: false,
  });
}

export function makeTaraMobilePayClientT12({
  apiKey, businessId, fetchImpl = fetch, environment = 'disabled',
  allowNetwork = false, timeoutMs = 8000
} = {}) {
  if (environment !== 'sandbox' || allowNetwork !== true) reject('DISABLED');
  if (typeof apiKey !== 'string' || apiKey.length < 8 || apiKey.length > 2048 ||
      typeof businessId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(businessId) ||
      typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 || timeoutMs > 15000) reject('CONFIG_INVALID');
  return Object.freeze({
    async initiate(input) {
      const prepared = makeMobilePayInputT12(input);
      // AUCUN RETRY AUTOMATIQUE. Une erreur réseau peut masquer un débit lancé.
      let response, raw;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: {'Content-Type':'application/json',Accept:'application/json'},
          body: JSON.stringify({apiKey,businessId,...prepared}),
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response?.ok) reject('PROVIDER_UNKNOWN_OUTCOME');
        const body = await response.text();
        if (body.length > 32768) reject('PROVIDER_UNKNOWN_OUTCOME');
        raw = JSON.parse(body);
      } catch {
        reject('PROVIDER_UNKNOWN_OUTCOME');
      }
      try {
        return parseMobilePayLaunchT12(raw, prepared.productId);
      } catch {
        reject('PROVIDER_UNKNOWN_OUTCOME');
      }
    },
  });
}
