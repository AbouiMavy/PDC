// V5-B.11 — vérification HTTP non destructive APRÈS déploiement.
// Usage : node scripts/check-pdc-public-routes.mjs
//         PDC_PUBLIC_ORIGIN=https://example.org node scripts/check-pdc-public-routes.mjs
// Aucun identifiant, aucune opération de paiement, aucun dépôt de donnée.
const base = process.env.PDC_PUBLIC_ORIGIN ?? 'https://pdc-portail.vercel.app';
let origin;
try {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Origine HTTPS sans chemin ni identifiants attendue');
  }
  origin = url.origin;
} catch (err) {
  console.error(`FAIL origine invalide: ${err.message}`);
  process.exit(2);
}

const checks = [
  {path: '/', expected: 200, html: true},
  {path: '/histoire', expected: 200, html: true},
  {path: '/adhesion', expected: 200, html: true},
  {path: '/adhesion/merci?preview=1', expected: 200, html: true},
  {path: '/soutenir', expected: 200, html: true},
  {path: '/soutenir/merci', expected: 200, html: true},
  {path: '/mon-espace', expected: 200, html: true},
  {path: '/admin-dev.html', expected: 404},
  {path: '/carte-dev.html', expected: 404},
  {path: '/__pdc_admin_api/v1/admin/dashboard', expected: 404},
  {path: '/__pdc_admin_api/v1/admin/session', expected: 404},
];
let errors = 0;
console.log(`Recette HTTP PDC : ${origin}`);
for (const {path, expected, html} of checks) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(new URL(path, origin), {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'Accept': 'text/html,application/json' },
    });
    const body = await response.text();
    const correctStatus = response.status === expected;
    const correctHtml = !html || (
      (response.headers.get('content-type') ?? '').includes('text/html') &&
      /id=["']root["']/.test(body) &&
      /src=["']\/assets\//.test(body)
    );
    if (correctStatus && correctHtml) {
      console.log(`PASS ${response.status} ${path}`);
    } else {
      errors++;
      console.error(`FAIL ${path}: HTTP ${response.status} (attendu ${expected}), HTML SPA ${correctHtml ? 'OK' : 'invalide'}`);
    }
  } catch (err) {
    errors++;
    console.error(`FAIL ${path}: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}
console.log(`Bilan : ${checks.length - errors} réussite(s), ${errors} échec(s).`);
if (errors) process.exitCode = 1;
