// V5-C.30 — accès PostgreSQL avec rôle minimal, vérification TLS et projet DEV.
// Aucune connexion au chargement du module. Aucun mot de passe écrit sur disque.
import {readFileSync} from 'node:fs';
const PROJECT=/^[a-z0-9]{20}$/;
const ROLE='pdc_tara_v5c_writer';

export function validateWriterConnectionV5C30({connectionString,projectRef}={}) {
  if (typeof projectRef!=='string' || !PROJECT.test(projectRef) ||
      typeof connectionString!=='string' || connectionString.length>4096)
    throw new Error('PDC_V5C30_DB_PROJECT_INVALID');
  let u;
  try {u=new URL(connectionString);}catch{throw new Error('PDC_V5C30_DB_URL_INVALID');}
  if (!['postgres:','postgresql:'].includes(u.protocol) ||
      u.pathname!=='/postgres' || !u.password || u.search || u.hash ||
      !['5432','6543'].includes(u.port))
    throw new Error('PDC_V5C30_DB_URL_INVALID');
  const user=decodeURIComponent(u.username);
  const direct=u.hostname===`db.${projectRef}.supabase.co` && user===ROLE && u.port==='5432';
  const pooler=/^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) &&
    user===`${ROLE}.${projectRef}` && ['5432','6543'].includes(u.port);
  if (!direct && !pooler) throw new Error('PDC_V5C30_DB_IDENTITY_INVALID');
  // On retourne seulement un booléen de mode, jamais l'URL ou les identifiants.
  return Object.freeze({mode:direct?'direct':'pooler'});
}

export async function openWriterPoolV5C30({connectionString,projectRef,caFile,PoolClass}={}) {
  validateWriterConnectionV5C30({connectionString,projectRef});
  if (typeof caFile!=='string' || !caFile.startsWith('/') || caFile.length>1024)
    throw new Error('PDC_V5C30_DB_CA_INVALID');
  let ca;
  try {ca=readFileSync(caFile,'utf8');}
  catch{throw new Error('PDC_V5C30_DB_CA_UNREADABLE');}
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----'))
    throw new Error('PDC_V5C30_DB_CA_INVALID');
  const Pool=PoolClass??(await import('pg')).Pool;
  const pool=new Pool({connectionString,ssl:{ca,rejectUnauthorized:true},
    max:2,idleTimeoutMillis:15000,connectionTimeoutMillis:5000,
    statement_timeout:5000,application_name:'pdc-v5c30-public-dev'});
  try {
    const r=await pool.query('SELECT current_user AS role_name');
    if (r?.rows?.length!==1 || r.rows[0]?.role_name!=='pdc_tara_v5c_writer')
      throw new Error('PDC_V5C30_DB_ROLE_INVALID');
    return pool;
  }catch{
    try{await pool.end();}catch{/* no secret in errors */}
    throw new Error('PDC_V5C30_DB_CONNECTION_REFUSED');
  }
}
