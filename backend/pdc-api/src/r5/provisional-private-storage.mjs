// R5 : bucket V5-B existant, préfixe distinct ; aucune URL publique, aucun upsert.
// Ne jamais faire transiter la clé Supabase via Vite ou un navigateur.
import {PORTRAIT_BUCKET_DEV,MAX_PORTRAIT_BYTES} from '../portrait-policy.mjs';
const REF='rvgpnmznhzwlzqyefahd';
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const PATH=new RegExp(`^provisional-r5/${UUID}/(?:member|partner)/${UUID}\\.jpg$`,'i');
export function createProvisionalStorageR5({projectRef=REF,serviceKey,fetchImpl=fetch}={}){
  if(projectRef!==REF||typeof serviceKey!=='string'||serviceKey.length<30||/\s/.test(serviceKey)||typeof fetchImpl!=='function')
    throw Error('PDC_R5_PRIVATE_STORAGE_CONFIG_INVALID');
  const origin=`https://${REF}.supabase.co/storage/v1/object`;
  async function call(method,key,bytes){
    if(!PATH.test(key))throw Error('PDC_R5_PRIVATE_STORAGE_KEY_DENIED');
    const r=await fetchImpl(`${origin}/${method==='GET'?'authenticated/':''}${PORTRAIT_BUCKET_DEV}/${key}`,{
      method,headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,
        ...(method==='POST'?{'Content-Type':'image/jpeg','x-upsert':'false'}:{})},
      ...(bytes?{body:bytes}:{}),redirect:'error',signal:AbortSignal.timeout(15000)
    });
    if(!r.ok&&!(method==='DELETE'&&r.status===404))throw Error('PDC_R5_PRIVATE_STORAGE_FAILED');
    return r;
  }
  return Object.freeze({
    async upload(key,bytes,mime){if(mime!=='image/jpeg'||!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>MAX_PORTRAIT_BYTES)
      throw Error('PDC_R5_PRIVATE_STORAGE_BODY_INVALID');await call('POST',key,bytes);},
    async download(key){const r=await call('GET',key);const b=Buffer.from(await r.arrayBuffer());
      if(!b.length||b.length>MAX_PORTRAIT_BYTES)throw Error('PDC_R5_PRIVATE_STORAGE_RESPONSE_INVALID');return b;},
    async remove(key){await call('DELETE',key);}
  });
}
