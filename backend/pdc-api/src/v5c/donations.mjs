import { V5CError } from './contracts.mjs';
const PURPOSES = new Set(['scrutateurs', 'cautionnements', 'campagne', 'autres', 'libre']);
const fail = () => { throw new V5CError('PDC_DONATION_DESIGNATION_INVALID'); };
/** Répartition 100.00 % en points de base, sans flottants et sans arrondis. */
export function normalizeDonationDesignations(designations) {
  if (!Array.isArray(designations) || designations.length < 1 || designations.length > 5) fail();
  const seen = new Set(); let total = 0;
  const normalized = designations.map(x => {
    if (!x || !PURPOSES.has(x.purpose) || seen.has(x.purpose) ||
        !Number.isInteger(x.percentBps) || x.percentBps < 1 || x.percentBps > 10000) fail();
    seen.add(x.purpose); total += x.percentBps;
    return Object.freeze({purpose:x.purpose,percentBps:x.percentBps});
  });
  if (total !== 10000 || (seen.has('libre') && seen.size !== 1)) fail();
  return Object.freeze(normalized);
}
