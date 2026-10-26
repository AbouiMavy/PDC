// PDC V5-B.4 — SERVEUR DE TEST uniquement. N'est pas invoqué par « npm run build ».
// Le projet React de production conserve son vite.config existant, inchangé.
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), 'backend/pdc-api/.env');
function readBackendPublicConfig(filename) {
  const vars = {};
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (match) vars[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  const authUrl = vars.SUPABASE_URL;
  const publishableKey = vars.SUPABASE_PUBLISHABLE_KEY;
  if (!authUrl || !publishableKey || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(authUrl)) {
    throw new Error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY invalides ou absentes dans backend/pdc-api/.env');
  }
  return { authUrl, publishableKey };
}
const publicConfig = readBackendPublicConfig(envFile);

export default defineConfig(({ command }) => {
  if (command !== 'serve') throw new Error('V5-B.4 admin-dev: build volontairement interdit');
  return {
  // EXCLUSIVEMENT deux valeurs publiques dans la page de test.
  define: {
    __PDC_DEV_SUPABASE_URL__: JSON.stringify(publicConfig.authUrl),
    __PDC_DEV_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(publicConfig.publishableKey),
  },
  publicDir: false,
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true,
    // Réseau Codespaces : la visibilité du port 5175 doit rester PRIVATE.
    allowedHosts: ['.app.github.dev'],
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.crt', '*.pem', '**/backend/**', '**/.postgresql/**'],
    },
    proxy: {
      '/__pdc_admin_api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: false,
        rewrite: path => path.replace(/^\/__pdc_admin_api/, ''),
      },
    },
  },
  plugins: [{
    name: 'pdc-admin-dev-only-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/admin-dev.html')) {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
          res.setHeader('Referrer-Policy', 'no-referrer');
        }
        next();
      });
    },
  }],
  };
});
