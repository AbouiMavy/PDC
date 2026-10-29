// V5-C.44.3 — Rapprochement transactionnel exclusivement en LECTURE.
// Aucune écriture en base, aucune route HTTP, aucune émission de lien.
import {V5CError} from './contracts.mjs';
import {validateTaraProductId} from './tara-server-client-v5c.mjs';
import {makeTaraV5C44ReadOnlyAuditor} from './tara-readonly-audit-v5c44.mjs';

const deny = code => {throw new V5CError(code);};
export const MOCK_PRODUCT_ID_V5C44 = 'PDC_' + 'm'.repeat(24);
export const MOCK_SCENARIOS_V5C44 = Object.freeze([
  'matching','pending','missing','mismatch','duplicate',
  'card','general','provider-error','unissued','pagination-incomplete'
]);

// N'expose que les deux méthodes de consultation déjà documentées ;
// createPaymentLink et toute autre mutation sont volontairement absentes.
export function onlyTaraReadMethodsV5C44(provider) {
  if (typeof provider?.checkMobileStatus !== 'function' ||
      typeof provider?.listTransactions !== 'function')
    deny('PDC_TARA_44_READ_CLIENT_INVALID');
  return Object.freeze({
    checkMobileStatus: id => provider.checkMobileStatus(id),
    listTransactions: paging => provider.listTransactions(paging),
  });
}

function maskedProductId(productId) {
  return productId.slice(0,4) + '…' + productId.slice(-6);
}
const publicContext = row => Object.freeze({
  amountXaf: row?.amountXaf ?? null,
  currency: row?.currency ?? null,
  linkState: row?.linkState ?? null,
  paymentStatus: row?.paymentStatus ?? null,
  method: row?.selectedMethod ?? null,
  linkField: row?.selectedLinkField ?? null,
});

function wrapResult(productId,mode,row,proof) {
  return Object.freeze({
    iteration:'V5-C.44.3',
    mode,
    evidenceType: mode==='mock'?'SYNTHETIC_SIMULATION':
      mode==='db-only'?'PDC_DB_ONLY':'TARA_SANDBOX_READONLY',
    productIdMasked: maskedProductId(productId),
    pdc: publicContext(row),
    decision: proof.decision,
    reason: proof.reason ?? null,
    source: proof.source ?? null,
    paymentConfirmed:false,
    admissionGranted:false,
    settlementAuthorized:false,
  });
}

/** Ne transmet jamais au fournisseur le montant déclaré par React.
 * Le contexte est chargé depuis une RPC SQL privée, et figé pour ce contrôle.
 * Un résultat corroborated ne représente NI encaissement confirmé NI admission.
 */
export async function runReadOnlyTaraAuditV5C44({reader,provider,productId,
  mode='db-only',pageSize=20,maxPages=10}={}) {
  validateTaraProductId(productId);
  if(!['mock','db-only','provider-read'].includes(mode) ||
     typeof reader?.load !== 'function' ||
     !Number.isInteger(pageSize)||pageSize<1||pageSize>100 ||
     !Number.isInteger(maxPages)||maxPages<1||maxPages>20)
    deny('PDC_TARA_44_AUDIT_CONFIG_INVALID');
  const row=await reader.load(productId);
  if(!row || row.productId!==productId)
    deny('PDC_TARA_44_PRIVATE_CONTEXT_INVALID');
  if(mode==='db-only') {
    return wrapResult(productId,mode,row,{
      decision:'not_verified',reason:'PROVIDER_NOT_CONSULTED'
    });
  }
  const client=onlyTaraReadMethodsV5C44(provider);
  const cachedReader=Object.freeze({load: async id=> id===productId?row:null});
  const auditor=makeTaraV5C44ReadOnlyAuditor({
    reader:cachedReader,client,enabled:true,environment:'sandbox'
  });
  const proof=await auditor.inspect(productId,{pageSize,maxPages});
  return wrapResult(productId,mode,row,proof);
}

/** Simulation déterministe. Ne lit ni credentials, ni base, ni réseau. */
export function makeSyntheticTaraAuditV5C44(scenario='missing') {
  if(!MOCK_SCENARIOS_V5C44.includes(scenario))
    deny('PDC_TARA_44_SCENARIO_INVALID');
  const productId=MOCK_PRODUCT_ID_V5C44;
  const row=Object.freeze({
    productId,amountXaf:'500',currency:'XAF',
    linkState:scenario==='unissued'?'requested':'issued',
    paymentStatus:'initiated',
    selectedMethod:scenario==='card'?'carte':scenario==='general'?'tara':'mobile',
    selectedLinkField:scenario==='card'?'cardLink':
      scenario==='general'?'generalLink':'smsLink',
  });
  const paid=Object.freeze({transactionId:productId,amount:'500',currency:'XAF',status:'PAID'});
  const statuses=Object.freeze({pending:'PENDING'});
  const counters={readCalls:0,providerStatusCalls:0,providerListCalls:0};
  const reader=Object.freeze({async load(id) {
    counters.readCalls++;
    return id===productId?row:null;
  }});
  const provider=Object.freeze({
    async checkMobileStatus(id) {
      counters.providerStatusCalls++;
      if(scenario==='provider-error') throw new Error('PRIVATE_KEY_DO_NOT_EXPOSE');
      return {productId:id,status:statuses[scenario]??'SUCCESS'};
    },
    async listTransactions({start}) {
      counters.providerListCalls++;
      if(start>0)return [];
      if(scenario==='missing')return [];
      if(scenario==='mismatch')return [{...paid,amount:'499'}];
      if(scenario==='duplicate')return [paid,paid];
      return [paid];
    },
    createPaymentLink() {
      throw Error('MUST_NOT_CALL_PAYMENT_LINK_CREATION');
    }
  });
  return Object.freeze({productId,reader,provider,counters});
}
