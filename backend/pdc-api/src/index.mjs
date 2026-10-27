import { createApp } from './app.mjs';
import { makeSupabaseVerifier } from './auth.mjs';
import { makeAdminRepository } from './db.mjs';

// Refuse de démarrer sans connexion PostgreSQL RESTREINTE explicitement activée.
if (process.env.PDC_API_ENABLE_DB !== 'true') {
  console.error('PDC API disabled: set PDC_API_ENABLE_DB=true only after configuring restricted login and TLS.');
  process.exitCode = 1;
} else {
  try {
    const verifyUser = makeSupabaseVerifier({
      url: process.env.SUPABASE_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    });
    const repository = await makeAdminRepository();
    const server = createApp({
      verifyUser,
      repository,
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    });
    const port = Number(process.env.PDC_API_PORT ?? 8787);
    const host = process.env.PDC_API_HOST ?? '127.0.0.1';
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('Only loopback IPv4 and non-privileged port supported in development');
    }
    server.listen(port, host, () => console.log('PDC API development service listening on loopback'));
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.on(sig, () => server.close(() => repository.close().then(() => process.exit(0))));
    }
  } catch {
    console.error('PDC API startup refused: verify private environment settings.');
    process.exitCode = 1;
  }
}
