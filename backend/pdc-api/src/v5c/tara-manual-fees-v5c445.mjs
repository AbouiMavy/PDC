// V5-C.44.5 — contrôle mathématique, aucun tarif Tara présumé.
// Le rapprochement manuel ne doit JAMAIS déduire une confirmation de ces montants.
const MONEY = /^(0|[1-9][0-9]{0,9})$/;
const MAX = 2147483647n;
const parseMoney = value => {
  if (typeof value !== 'string' || !MONEY.test(value))
    throw Error('PDC_MANUAL_FEE_AMOUNT_INVALID');
  const amount=BigInt(value);
  if (amount>MAX) throw Error('PDC_MANUAL_FEE_AMOUNT_INVALID');
  return amount;
};
export function checkManualTaraFeesV5C445({grossXaf,netXaf,feeXaf,expectedGrossXaf,currency='XAF'}={}) {
  const gross=parseMoney(grossXaf);
  const net=parseMoney(netXaf);
  const fee=parseMoney(feeXaf);
  const expected=parseMoney(expectedGrossXaf);
  if (gross===0n || expected===0n || currency!=='XAF')
    throw Error('PDC_MANUAL_FEE_CURRENCY_INVALID');
  if (net+fee!==gross || gross!==expected)
    return Object.freeze({decision:'disputed',reason:'AMOUNT_OR_FEES_MISMATCH',paymentConfirmed:false});
  return Object.freeze({decision:'fees_consistent_for_manual_review',grossXaf:gross.toString(),
    netXaf:net.toString(),feeXaf:fee.toString(),currency:'XAF',paymentConfirmed:false});
}
