#!/usr/bin/env node
// Test unique et DEV UNIQUEMENT: charge une image 100% fictive via la
// passerelle privee existante. Aucune route publique, aucun fichier .env modifie.
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivatePortraitRuntime } from '../src/portrait-runtime-v5b610c.mjs';
const REF='rvgpnmznhzwlzqyefahd';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FAIL = code => {throw new Error(code);};

export function liveTestConfig(env) {
  if (env.PDC_LIVE_PORTRAIT_TEST !== 'YES' || env.PDC_SUPABASE_PROJECT_REF !== REF ||
      env.PDC_ENABLE_PORTRAIT_UPLOAD_DEV !== 'YES' ||
      env.PDC_TEST_ADMIN_EMAIL !== 'pdc-v5b3-test@example.invalid' ||
      !UUID.test(env.PDC_TEST_CARD_REQUEST_ID ?? '')) FAIL('PDC_DEV_TEST_GUARD_FAILED');
  for (const key of ['PDC_TEST_ADMIN_PASSWORD','PDC_TEST_WRITER_PASSWORD','SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[key] || env[key].trim().length < 8) FAIL(`PDC_MISSING_${key}`);
  }
  const dburi = new URL('postgresql://placeholder@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
  dburi.username=`pdc_portrait_upload_runtime_v5b610c.${REF}`;
  dburi.password=env.PDC_TEST_WRITER_PASSWORD;
  return {
    ...env,
    PDC_PORTRAIT_DATABASE_URL:dburi.toString(),
    PDC_PG_CA_FILE:env.PDC_PG_CA_FILE || join(homedir(),'.postgresql','root.crt'),
  };
}

export async function acquireTestToken(env, fetchImpl=fetch) {
  const endpoint = `https://${REF}.supabase.co/auth/v1/token?grant_type=password`;
  let res;
  try { res=await fetchImpl(endpoint,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json',apikey:env.SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify({email:env.PDC_TEST_ADMIN_EMAIL,password:env.PDC_TEST_ADMIN_PASSWORD}),
    }); }
  catch { FAIL('PDC_TEST_AUTH_NETWORK_FAILED'); }
  if (!res.ok) FAIL(`PDC_TEST_AUTH_REJECTED_${res.status}`);
  const body=await res.json();
  if (!body.access_token || typeof body.access_token!=='string') FAIL('PDC_TEST_AUTH_TOKEN_MISSING');
  return body.access_token;
}

if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  let runtime;
  try {
    const env=liveTestConfig(process.env);
    const token=await acquireTestToken(env);
    runtime=await createPrivatePortraitRuntime(env);
    const path=fileURLToPath(new URL('../../../tests/assets/fictive-portrait-test.png',import.meta.url));
    const bytes=await readFile(path);
    const result=await runtime.service.upload({
      authorization:`Bearer ${token}`,
      cardRequestId:env.PDC_TEST_CARD_REQUEST_ID,
      imageBytes:bytes,
      declaredMime:'image/png',
    });
    console.log('V5-B.6.10-D : upload fictif reussi (pas de carte delivree).');
    console.log('card_request_id:',result.cardRequestId);
    console.log('asset_id:',result.assetId);
    console.log('Chemin a retrouver dans Storage: card-requests/'+result.cardRequestId+'/'+result.assetId+'.jpg');
    console.log('IMPORTANT : confirmer via SQL Editor puis supprimer le fichier via Storage UI avant nettoyage SQL.');
  } catch (error) {
    // Ne jamais imprimer de secrets, URL PostgreSQL ni contenu de session.
    const code=String(error?.code || error?.message || 'PDC_TEST_UNKNOWN_ERROR');
    console.error('V5-B.6.10-D ECHEC:',/^PDC_[A-Z0-9_]+$/.test(code)?code:'PDC_TEST_RUNTIME_FAILED');
    process.exitCode=1;
  } finally {
    if (runtime) await runtime.close();
  }
}
