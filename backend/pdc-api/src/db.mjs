import { readFileSync } from 'node:fs';

// Refuse les connexions avec identifiants administrateurs / sans CA de vérification.
export async function makeAdminRepository(env = process.env) {
  if (env.PDC_API_ENABLE_DB !== 'true') throw new Error('DB integration disabled');
  const raw = env.DATABASE_URL;
  const caFile = env.PDC_PG_CA_FILE;
  if (!raw || !caFile) throw new Error('DATABASE_URL and PDC_PG_CA_FILE required');
  const uri = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(uri.protocol) || !uri.hostname || !uri.username) {
    throw new Error('Invalid DATABASE_URL');
  }
  if (uri.searchParams.has('sslmode') || uri.searchParams.has('sslrootcert')) {
    throw new Error('Remove sslmode/sslrootcert from DATABASE_URL; TLS is configured separately');
  }
  if (/^(postgres|service_role|supabase_admin|authenticator)$/i.test(decodeURIComponent(uri.username).split('.')[0])) {
    throw new Error('Privileged database role prohibited');
  }
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: raw,
    ssl: { ca: readFileSync(caFile, 'utf8'), rejectUnauthorized: true },
    max: 2,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    application_name: 'pdc-api-v5b3-dev',
  });
  return {
    async isNationalTreasury(userId) {
      const { rows } = await pool.query(
        'SELECT pdc_private.treasury_v5c44t_authorized_dev($1::uuid) AS allowed', [userId]
      );
      return rows[0]?.allowed === true;
    },
    async treasuryRegister(userId, { limit, offset, category, status, search }) {
      const { rows } = await pool.query(
        'SELECT pdc_private.treasury_v5c44t_register_dev($1::uuid,$2::integer,$3::integer,$4::text,$5::text,$6::text) AS result',
        [userId, limit, offset, category, status, search]
      );
      return rows[0]?.result ?? { total: 0, items: [] };
    },
    async isNationalAdmin(userId) {
      const { rows } = await pool.query('SELECT pdc_private.api_is_national_admin($1::uuid) AS allowed', [userId]);
      return rows[0]?.allowed === true;
    },
    async dashboard(userId) {
      const { rows } = await pool.query('SELECT * FROM pdc_private.api_national_dashboard($1::uuid)', [userId]);
      return rows[0] ?? { applications_to_review: '0', active_memberships: '0' };
    },
    async financeOverview(userId) {
      const { rows } = await pool.query(
        'SELECT * FROM pdc_private.api_finance_overview($1::uuid)', [userId]
      );
      return rows;
    },
    async reviewBatches(userId) {
      const { rows } = await pool.query(
        'SELECT * FROM pdc_private.api_review_batches($1::uuid)', [userId]);
      return rows;
    },
    async reviewMembers(userId, batchId, offset) {
      const { rows } = await pool.query(
        'SELECT * FROM pdc_private.api_review_members($1::uuid,$2::uuid,$3::integer)',
        [userId, batchId, offset]);
      return rows;
    },
    async cardPreparationQueue(userId, offset) {
      const { rows } = await pool.query(
        'SELECT * FROM pdc_private.api_card_preparation_queue($1::uuid,$2::integer)',
        [userId, offset]);
      return rows;
    },
    async close() { await pool.end(); },
  };
}
