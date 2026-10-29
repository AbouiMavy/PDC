// V5-C — préparation contrôlée d'une commande PUBLIQUE, sans compte militant.
// Aucune requête réseau, aucune écriture DB, aucun accès automatique à Tara.
// Le serveur doit persister l'identité, la contribution brute et l'allocation
// dans UNE transaction SQL avant l'appel au prestataire.
import { createHash } from 'node:crypto';
import { V5CError } from './contracts.mjs';
import { normalizeDonationDesignations } from './donations.mjs';

const fail = code => { throw new V5CError(code); };
const METHODS = new Set(['mobile','tara','carte','virement']);
const ID = /^[A-Za-z0-9:_-]{16,128}$/;
const XAF = /^(?:[1-9][0-9]{0,9})$/;
const COUNTRY = /^[A-Z]{2}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9][0-9]{6,14}$/;
const allowedFields = new Set(['kind','idempotencyKey','firstName','lastName','email','phoneE164',
  'country','method','messagingChannel','amountXaf','designations','dob','birthPlace',
  'civility','memberCategory','annualMode','annualPaymentXaf','acceptedStatutes','acceptedDataNotice','donorDeclaration']);
const name = (v,max=100) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max &&
  !/[\u0000-\u001f\u007f<>]/.test(v);
const isoDate = value => {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===value &&
    value < new Date().toISOString().slice(0,10);
};

/** Les champs sont strictement bornés avant tout stockage. Pas de prix libre
 * pour les frais initiaux d'adhésion; le PDC en fixe le montant côté serveur.
 * Pour un premier lot, seules les adhésions individuelles au Cameroun sans
 * cotisation annuelle simultanée sont admissibles à ce tarif XAF.
 */
export function preparePublicOrderRequest(raw) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object' ||
      Object.keys(raw).some(k=>!allowedFields.has(k))) fail('PDC_PUBLIC_ORDER_INVALID');
  if (!['donation','initial_membership'].includes(raw.kind) ||
      typeof raw.idempotencyKey !== 'string' || !ID.test(raw.idempotencyKey) ||
      !name(raw.firstName) || !name(raw.lastName) ||
      typeof raw.email !== 'string' || raw.email.length > 254 || !emailPattern.test(raw.email) ||
      typeof raw.phoneE164 !== 'string' || !phonePattern.test(raw.phoneE164) ||
      !COUNTRY.test(raw.country) || !METHODS.has(raw.method)) fail('PDC_PUBLIC_ORDER_INVALID');

  // Les options de routage doivent être compatibles avec le canal choisi.
  if (raw.method === 'tara' && !['general','whatsapp','telegram','dikalo'].includes(raw.messagingChannel))
    fail('PDC_PUBLIC_PAYMENT_CHANNEL_INVALID');
  if (raw.method !== 'tara' && raw.messagingChannel != null)
    fail('PDC_PUBLIC_PAYMENT_CHANNEL_INVALID');

  let kind, grossAmountXaf, designations = null, membership = null;
  if (raw.kind === 'donation') {
    if (raw.donorDeclaration !== true ||
        typeof raw.amountXaf !== 'string' || !XAF.test(raw.amountXaf) ||
        BigInt(raw.amountXaf) < 100n || BigInt(raw.amountXaf) > 100000000n ||
        raw.dob != null || raw.birthPlace != null || raw.memberCategory != null ||
        raw.acceptedStatutes != null) fail('PDC_PUBLIC_DONATION_INVALID');
    // Le contrôle d'identité/nationalité du donateur reste une étape DISTINCTE.
    designations = normalizeDonationDesignations(raw.designations);
    grossAmountXaf = raw.amountXaf;
    kind = 'donation';
  } else {
    if (raw.country !== 'CM' || raw.acceptedStatutes !== true ||
        raw.acceptedDataNotice !== true || raw.amountXaf != null ||
        raw.designations != null || raw.donorDeclaration != null ||
        !['Madame','Monsieur'].includes(raw.civility) ||
        !isoDate(raw.dob) || !name(raw.birthPlace,160) ||
        !['rural_etudiant','urbain','conseil_national','ben'].includes(raw.memberCategory))
      fail('PDC_PUBLIC_MEMBERSHIP_INVALID');
    // Le tarif et la ventilation sont recalculés côté serveur, jamais adoptés depuis React.
    const annualDue={rural_etudiant:5000,urbain:12000,conseil_national:20000,ben:25000}[raw.memberCategory];
    const mode=raw.annualMode??'aucun';
    const annualPaidRaw=raw.annualPaymentXaf ?? (raw.annualMode==null?'0':null);
    if (!['aucun','partiel','total'].includes(mode)||!annualDue||
        typeof annualPaidRaw!=='string'||!/^\d{1,5}$/.test(annualPaidRaw))
      fail('PDC_PUBLIC_MEMBERSHIP_INVALID');
    const paid=Number(annualPaidRaw);
    if ((mode==='aucun'&&paid!==0)||(mode==='total'&&paid!==annualDue)||
        (mode==='partiel'&&(paid<=0||paid>=annualDue)))fail('PDC_PUBLIC_MEMBERSHIP_INVALID');
    grossAmountXaf=String(2000+paid);
    membership = Object.freeze({civility:raw.civility,dateOfBirth:raw.dob,
      birthPlace:raw.birthPlace.trim(),category:raw.memberCategory,annualPaymentXaf:String(paid)});
    kind = 'individual_initial';
  }
  const order = {
    kind, idempotencyKey:raw.idempotencyKey,
    firstName:raw.firstName.trim(),lastName:raw.lastName.trim(),
    email:raw.email.trim().toLowerCase(),phoneE164:raw.phoneE164,
    country:raw.country,method:raw.method,messagingChannel:raw.messagingChannel ?? null,
    grossAmountXaf,designations,membership,
  };
  // Digest canonique à passer à une RPC privée : le même idempotencyKey ne
  // peut pas servir à changer le montant, la personne ou le moyen de paiement.
  const requestDigest = createHash('sha256').update(JSON.stringify(order)).digest('hex');
  return Object.freeze({ ...order,requestDigest, currency:'XAF',
    paymentConfirmed:false, membershipGranted:false });
}
