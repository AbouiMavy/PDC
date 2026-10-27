// Activation VOLONTAIRE d'un serveur local de developpement. Pas d'auto-start.
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { validatePortraitWriterConfig } from './portrait-writer-db-v5b610c.mjs';
import { createPortraitStorageV5B610B } from './portrait-storage-v5b610b.mjs';
import { createApplicantPortraitRepositoryV5B610F1 } from './applicant-portrait-repository-v5b610f1.mjs';
import { createApplicantPortraitIngestV5B610F1 } from './applicant-portrait-ingest-v5b610f1.mjs';
import { createApplicantPortraitDevServerV5B610F1 } from './applicant-portrait-http-v5b610f1.mjs';
const REF='rvgpnmznhzwlzqyefahd';
const env=process.env;
if(env.PDC_SUPABASE_PROJECT_REF!==REF ||
   env.PDC_ENABLE_APPLICANT_PORTRAIT_DEV!=='YES' ||
   env.PDC_ENABLE_PORTRAIT_UPLOAD_DEV!=='YES' ||
   env.PDC_APPLICANT_HOST!=='127.0.0.1' ||
   !Number.isInteger(Number(env.PDC_APPLICANT_PORT)) ||
   Number(env.PDC_APPLICANT_PORT)<1024 || Number(env.PDC_APPLICANT_PORT)>65535 ||
   !env.PDC_SUPABASE_SERVICE_ROLE_KEY && !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('PDC_APPLICANT_START_DENIED_DEV_ONLY');
}
const config=validatePortraitWriterConfig(env);
const pool=new Pool({connectionString:config.connectionString,
  ssl:{ca:readFileSync(config.caFile,'utf8'),rejectUnauthorized:true},
  max:1,connectionTimeoutMillis:5000,statement_timeout:5000});
try {
  const repository=createApplicantPortraitRepositoryV5B610F1({query:(sql,args)=>pool.query(sql,args)});
  const storage=createPortraitStorageV5B610B({projectRef:REF,
    serviceKey:env.PDC_SUPABASE_SERVICE_ROLE_KEY??env.SUPABASE_SERVICE_ROLE_KEY});
  const ingest=createApplicantPortraitIngestV5B610F1({repository,storage});
  const server=createApplicantPortraitDevServerV5B610F1({ingest,
    allowedOrigins:['http://localhost:5173','http://127.0.0.1:5173']});
  server.listen(Number(env.PDC_APPLICANT_PORT),'127.0.0.1',()=>{
    console.log('PDC applicant portrait DEV listening on loopback only; no checkout/issuance available');
  });
  const stop=()=>server.close(()=>pool.end().then(()=>process.exit(0)));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
} catch(error) {await pool.end();throw error;}
