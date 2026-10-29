// R4 — taux fournisseur explicite, borné et auditable. Pas d'appel réseau.
// Ne pas remplacer une quote privée existante sans autorisation de rapprochement FX.
export function xafQuoteFromEuroCents({euroCents,rateMilliXafPerEur,roundToXaf=10}) {
  if (!/^[1-9][0-9]{0,9}$/.test(euroCents??'') ||
      !/^[1-9][0-9]{0,9}$/.test(rateMilliXafPerEur??'') ||
      ![5,10].includes(roundToXaf))throw Error('PDC_R4_FX_INVALID');
  const cents=BigInt(euroCents), rate=BigInt(rateMilliXafPerEur), unit=BigInt(roundToXaf);
  if(rate<600000n || rate>800000n)throw Error('PDC_R4_FX_RATE_NOT_APPROVED');
  // Montant exact XAF: centimes EUR * milli-XAF/EUR / 100 000.
  // Arrondi au multiple SUPERIEUR, pas à la dizaine la plus proche.
  const rounded=((cents*rate+100000n*unit-1n)/(100000n*unit))*unit;
  if(rounded<1n||rounded>2147483647n)throw Error('PDC_R4_FX_AMOUNT_INVALID');
  return Object.freeze({originalCurrency:'EUR',originalAmountMinor:euroCents,
    providerCurrency:'XAF',providerAmountXaf:String(rounded),
    rateMilliXafPerEur,roundToXaf});
}
