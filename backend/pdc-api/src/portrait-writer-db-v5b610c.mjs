// PostgreSQL technique : connexion independante de l'API readonly 8787.
// Identifiant et mot de passe exclusivement serveur, jamais dans VITE_*.
import { readFileSync } from 'node:fs';
import { createPortraitRepositoryV5B610B } from './portrait-repository-v5b610b.mjs';
const ROLE = 'pdc_portrait_upload_runtime_v5b610c';
const PROJECT = 'rvgpnmznhzwlzqyefahd';

export function validatePortraitWriterConfig(env) {
  const raw = env.PDC_PORTRAIT_DATABASE_URL;
  if (!raw || !env.PDC_PG_CA_FILE) throw new Error('PDC_PORTRAIT_WRITER_CONFIG_MISSING');
  let uri;
  try { uri = new URL(raw); } catch { throw new Error('PDC_PORTRAIT_WRITER_URL_INVALID'); }
  if (!['postgres:','postgresql:'].includes(uri.protocol) ||
      decodeURIComponent(uri.username) !== `${ROLE}.${PROJECT}` ||
      !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(uri.hostname) ||
      uri.port !== '5432' || uri.pathname !== '/postgres' ||
      !uri.password || uri.search || uri.hash ||
      raw === env.DATABASE_URL) throw new Error('PDC_PORTRAIT_WRITER_URL_DENIED');
  return { connectionString: raw, caFile: env.PDC_PG_CA_FILE };
}

export async function createPortraitWriterConnection(env = process.env, { PoolFactory } = {}) {
  const conf = validatePortraitWriterConfig(env);
  const Pool = PoolFactory ?? (await import('pg')).Pool;
  const pool = new Pool({
    connectionString: conf.connectionString,
    ssl: {ca: readFileSync(conf.caFile,'utf8'),rejectUnauthorized:true},
    max:1, idleTimeoutMillis:5000, connectionTimeoutMillis:5000,
    statement_timeout:5000, application_name:'pdc-portraits-dev-v5b610c',
  });
  return {
    repository: createPortraitRepositoryV5B610B({query:(sql,values)=>pool.query(sql,values)}),
    close:()=>pool.end(),
  };
}
