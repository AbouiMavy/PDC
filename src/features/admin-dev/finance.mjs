// Présentation des montants PostgreSQL en unités minimales.
// EUR = centimes ; XAF = FCFA. Aucun taux de change ni arrondi flottant.
export const FINANCE_KEYS = Object.freeze([
  'initialFeeDueMinor', 'initialFeePaidMinor',
  'annualDuesDueMinor', 'annualDuesPaidMinor', 'donationsConfirmedMinor',
]);

export function validateFinanceResponse(payload) {
  if (!payload || !Array.isArray(payload.currencies) || payload.currencies.length !== 2) {
    throw new Error('FINANCE_BAD_RESPONSE');
  }
  const seen = new Set();
  for (const row of payload.currencies) {
    if (!row || !['XAF', 'EUR'].includes(row.currency) || seen.has(row.currency)) {
      throw new Error('FINANCE_BAD_RESPONSE');
    }
    seen.add(row.currency);
    for (const key of FINANCE_KEYS) {
      if (typeof row[key] !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(row[key])) {
        throw new Error('FINANCE_BAD_RESPONSE');
      }
    }
  }
  return payload;
}

export function formatMinor(minor, currency, lang = 'fr') {
  if (typeof minor !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(minor)) {
    throw new Error('INVALID_MONEY');
  }
  const units = BigInt(minor);
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  if (currency === 'XAF') return `${new Intl.NumberFormat(locale).format(units)} FCFA`;
  if (currency === 'EUR') {
    const euros = units / 100n;
    const cents = (units % 100n).toString().padStart(2, '0');
    return `${new Intl.NumberFormat(locale).format(euros)}${lang === 'en' ? '.' : ','}${cents} €`;
  }
  throw new Error('UNSUPPORTED_CURRENCY');
}
