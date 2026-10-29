// Décision de réception ; aucune notification ne confirme un paiement.
export function classifyWebhookRecord({data,error}={}) {
  if (error) return Object.freeze({httpStatus:503,received:false,code:'RPC_FAILED'});
  if (data === true) return Object.freeze({httpStatus:200,received:true,code:'STORED_OR_DUPLICATE'});
  if (data === false) return Object.freeze({httpStatus:422,received:false,code:'UNKNOWN_PRODUCT'});
  return Object.freeze({httpStatus:503,received:false,code:'UNEXPECTED_RPC_RESULT'});
}
