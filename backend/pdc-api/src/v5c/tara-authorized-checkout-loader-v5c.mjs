// V5-C — lecture d'un devis XAF existant depuis le registre privé.
// UNIQUEMENT pour un militant ayant déjà une liaison vérifiée auth.users -> memberships.
// Les dons publics et les nouvelles adhésions utilisent un autre parcours à développer.
import { quoteFromPrivateDb, V5CError } from './contracts.mjs';

const ROLE = 'pdc_tara_v5c_writer';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = code => { throw new V5CError(code); };

export async function makeTaraAuthorizedCheckoutLoader({pool,enabled=false,
  environment='disabled'}={}) {
  if (enabled !== true || environment !== 'sandbox' || typeof pool?.query !== 'function')
    fail('PDC_TARA_QUOTE_LOADER_DISABLED');
  let role;
  try { role = await pool.query('SELECT current_user AS role_name'); }
  catch { fail('PDC_TARA_QUOTE_LOADER_ROLE_UNKNOWN'); }
  if (role?.rows?.length !== 1 || role.rows[0]?.role_name !== ROLE)
    fail('PDC_TARA_QUOTE_LOADER_WRONG_ROLE');

  // L'API HTTP doit d'abord vérifier le JWT auprès de Supabase Auth.
  // Le rôle PostgreSQL n'a pas d'accès SELECT direct aux tables.
  return async function loadAuthorizedCheckout({userId,paymentId}={}) {
    if (typeof userId !== 'string' || !UUID.test(userId) ||
        typeof paymentId !== 'string' || !UUID.test(paymentId))
      fail('PDC_TARA_QUOTE_LOOKUP_INVALID');
    let result;
    try {
      result = await pool.query(
        `SELECT * FROM pdc_private.tara_v5c_authorized_checkout($1::uuid,$2::uuid)`,
        [userId.toLowerCase(),paymentId.toLowerCase()]);
    } catch { fail('PDC_TARA_QUOTE_LOOKUP_UNAVAILABLE'); }
    if (!Array.isArray(result?.rows) || result.rows.length > 1)
      fail('PDC_TARA_QUOTE_RESPONSE_INVALID');
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    if (typeof row?.payment_id !== 'string' ||
        row.payment_id.toLowerCase() !== paymentId.toLowerCase())
      fail('PDC_TARA_QUOTE_RESPONSE_INVALID');
    const quote = quoteFromPrivateDb(row);
    if (quote.currency !== 'XAF' || quote.amountMinor === '0')
      fail('PDC_TARA_QUOTE_RESPONSE_INVALID');
    return Object.freeze({paymentId:row.payment_id.toLowerCase(),quote});
  };
}
