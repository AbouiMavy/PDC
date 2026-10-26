// Composition privee, pas de route HTTP installee : outil futur de test/admin.
import { makeSupabaseVerifier } from './auth.mjs';
import { makeAdminRepository } from './db.mjs';
import { createPortraitWriterConnection } from './portrait-writer-db-v5b610c.mjs';
import { createPortraitStorageV5B610B } from './portrait-storage-v5b610b.mjs';
import { createPortraitIngestService } from './portrait-ingest-v5b610b.mjs';
import { createAuthenticatedPortraitService } from './portrait-admin-auth-v5b610c.mjs';
export async function createPrivatePortraitRuntime(env = process.env) {
  if (env.PDC_SUPABASE_PROJECT_REF !== 'rvgpnmznhzwlzqyefahd' ||
      env.PDC_ENABLE_PORTRAIT_UPLOAD_DEV !== 'YES') throw new Error('PDC_DEV_ONLY_UPLOAD_DISABLED');
  const verifyUser = makeSupabaseVerifier({url:env.SUPABASE_URL,publishableKey:env.SUPABASE_PUBLISHABLE_KEY});
  const adminReader = await makeAdminRepository(env);
  let writer;
  try {
    writer = await createPortraitWriterConnection(env);
    const storage = createPortraitStorageV5B610B({serviceKey:env.SUPABASE_SERVICE_ROLE_KEY,projectRef:env.PDC_SUPABASE_PROJECT_REF});
    const ingest = createPortraitIngestService({repository:writer.repository,storage});
    return {
      service:createAuthenticatedPortraitService({verifyUser,adminReader,ingest}),
      close: async () => {await writer.close(); await adminReader.close();},
    };
  } catch (err) {
    if (writer) await writer.close();
    await adminReader.close();
    throw err;
  }
}
