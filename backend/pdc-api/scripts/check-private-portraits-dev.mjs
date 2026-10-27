#!/usr/bin/env node
// Véritable test Storage uniquement sur image artificielle, sans donnée de militant.
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPrivateStorageDev, DEV_PROJECT_REF } from '../src/private-storage-dev.mjs';

export async function smoke({ storage, bytes, id = randomUUID(), log = console.log }) {
  const path = `dev-smoketests/${id}.png`;
  let uploadStarted = false;
  let cleanupError = null;
  try {
    await storage.verifyBucket();
    log('1/5 — Bucket privé et limites JPEG/PNG vérifiés.');
    uploadStarted = true; // inclut le cas où le serveur stocke puis la réponse réseau se perd
    await storage.uploadDummy(path, bytes);
    log('2/5 — Image de test réellement envoyée.');
    const downloaded = await storage.downloadDummy(path);
    if (createHash('sha256').update(bytes).digest('hex') !==
        createHash('sha256').update(downloaded).digest('hex')) {
      throw new Error('PDC_PRIVATE_DOWNLOAD_HASH_MISMATCH');
    }
    log('3/5 — Lecture autorisée et empreinte vérifiées.');
    await storage.assertAnonymousDenied(path);
    log('4/5 — Lecture sans autorisation refusée.');
  } finally {
    if (uploadStarted) {
      try {
        await storage.removeDummy(path);
        await storage.assertDeleted(path);
        log('5/5 — Fichier fictif supprimé du Storage.');
      } catch (e) { cleanupError = e; }
    }
    if (cleanupError) {
      // Laisser uniquement un chemin sans PII, jamais de secret.
      throw new Error(`PDC_CLEANUP_REQUIRES_MANUAL_ACTION: ${path} (${cleanupError.message})`);
    }
  }
}

const asScript = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (asScript) {
  const env = process.env;
  if (env.PDC_DEV_STORAGE_SMOKE !== 'YES' ||
      env.PDC_SUPABASE_PROJECT_REF !== DEV_PROJECT_REF) {
    console.error('Arrêt : fixer PDC_DEV_STORAGE_SMOKE=YES et le projet de développement exact.');
    process.exitCode = 2;
  } else {
    try {
      const storage = createPrivateStorageDev({ key: env.SUPABASE_SERVICE_ROLE_KEY });
      const file = fileURLToPath(new URL('../../../tests/assets/fictive-portrait-test.png', import.meta.url));
      const bytes = new Uint8Array(await readFile(file));
      await smoke({ storage, bytes });
      console.log('V5-B.6.10-A OK : test réel du stockage privé réussi.');
    } catch (err) {
      console.error(`V5-B.6.10-A ÉCHEC : ${err.message}`);
      process.exitCode = 1;
    }
  }
}
