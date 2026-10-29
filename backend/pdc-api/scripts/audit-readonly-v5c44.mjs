#!/usr/bin/env node
// V5-C.44.3 — commande opérateur. Pas de route HTTP, pas d'écriture.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeSyntheticTaraAuditV5C44,runReadOnlyTaraAuditV5C44}
  from '../src/v5c/tara-audit-lot3-v5c44.mjs';
import {makeTaraV5C44AuditReaderPg}
  from '../src/v5c/tara-readonly-audit-v5c44.mjs';
import {openWriterPoolV5C30}
  from '../src/v5c/public-writer-pool-v5c30.mjs';
import {makeTaraServerClient,validateTaraProductId}
  from '../src/v5c/tara-server-client-v5c.mjs';

const DEV_REF='rvgpnmznhzwlzqyefahd';
const flags=new Set(['--allow-provider-read']);
const named=new Set(['--mode','--scenario','--product-id','--page-size','--max-pages']);

function options(args) {
  const o={};
  for (const arg of args) {
    const sep=arg.indexOf('=');
    const key=sep<0?arg:arg.slice(0,sep);
    if(flags.has(key) && sep<0) {
      if(o[key])throw Error('PDC_TARA_44_DUPLICATE_ARG');
      o[key]=true;
    } else if(named.has(key) && sep>0 && sep<arg.length-1 && !Object.hasOwn(o,key)) {
      o[key]=arg.slice(sep+1);
    } else throw Error('PDC_TARA_44_ARGUMENT_INVALID');
  }
  if(!['mock','db-only','provider-read'].includes(o['--mode']))
    throw Error('PDC_TARA_44_MODE_INVALID');
  if(o['--mode']!=='mock' && o['--scenario'])
    throw Error('PDC_TARA_44_ARGUMENT_INVALID');
  if(o['--mode']!=='provider-read' && o['--allow-provider-read'])
    throw Error('PDC_TARA_44_ARGUMENT_INVALID');
  if(o['--mode']==='mock' && o['--product-id'])
    throw Error('PDC_TARA_44_ARGUMENT_INVALID');
  const paginationScenario=o['--mode']==='mock' && o['--scenario']==='pagination-incomplete';
  const pageSize=o['--page-size']===undefined?(paginationScenario?1:20):Number(o['--page-size']);
  const maxPages=o['--max-pages']===undefined?(paginationScenario?1:10):Number(o['--max-pages']);
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100 ||
     !Number.isInteger(maxPages)||maxPages<1||maxPages>20)
    throw Error('PDC_TARA_44_PAGINATION_INVALID');
  return {mode:o['--mode'],scenario:o['--scenario']??'missing',
    productId:o['--product-id']??null, pageSize,maxPages,
    allowProviderRead:o['--allow-provider-read']===true};
}

export async function mainV5C44(args=process.argv.slice(2),env=process.env) {
  const o=options(args);
  let reader,provider,productId,pool;
  try {
    if(o.mode==='mock') {
      ({reader,provider,productId}=makeSyntheticTaraAuditV5C44(o.scenario));
    } else {
      // Refuser implicitement tout environnement de production et toute autre base.
      if(env.CODESPACES!=='true' || env.NODE_ENV==='production' ||
         env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN!=='app.github.dev' ||
         env.PDC_V5C30_PROJECT_REF!==DEV_REF)
        throw Error('PDC_TARA_44_DEV_ENV_REQUIRED');
      productId=validateTaraProductId(o.productId);
      if(o.mode==='provider-read' &&
         (o.allowProviderRead!==true || env.PDC_V5C44_APPROVED_READONLY!=='oui' ||
          env.PDC_V5C44_TARA_SANDBOX_KEY_CONFIRMED!=='oui'))
        throw Error('PDC_TARA_44_PROVIDER_READ_NOT_APPROVED');
      pool=await openWriterPoolV5C30({
        connectionString:env.PDC_V5C30_DATABASE_URL,
        projectRef:DEV_REF,
        caFile:env.PDC_V5C30_DB_CA_FILE
      });
      reader=await makeTaraV5C44AuditReaderPg({
        pool,enabled:true,environment:'sandbox'
      });
      if(o.mode==='provider-read') {
        const tara=makeTaraServerClient({
          apiKey:env.PDC_V5C44_TARA_SANDBOX_API_KEY,
          businessId:env.PDC_V5C44_TARA_BUSINESS_ID,
          environment:'sandbox',allowNetwork:true
        });
        // API limitée aux lectures documentées : interdiction des liens.
        provider=Object.freeze({
          checkMobileStatus: id=>tara.checkMobileStatus(id),
          listTransactions: paging=>tara.listTransactions(paging)
        });
      }
    }
    const report=await runReadOnlyTaraAuditV5C44({
      reader,provider,productId,mode:o.mode,
      pageSize:o.pageSize,maxPages:o.maxPages
    });
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return report;
  } finally {
    if(pool)await pool.end();
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {await mainV5C44();}
  catch(e) {
    const m=typeof e?.code==='string'?e.code:e?.message;
    const code=typeof m==='string' && /^PDC_[A-Z0-9_]{3,100}$/.test(m)
      ?m:'PDC_TARA_44_AUDIT_FAILED';
    console.error('AUDIT_REFUSED:',code);
    process.exitCode=1;
  }
}
