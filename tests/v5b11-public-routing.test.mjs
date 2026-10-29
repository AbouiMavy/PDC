// V5-B.11 : le routage Vercel ne doit ouvrir que les routes React publiques.
// Tests sans accès réseau, exécutés par `node --test tests/*.test.mjs` dans CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const config = JSON.parse(read('vercel.json'));
const rewrites = config.rewrites;
const publicPaths = [
  '/histoire',
  '/adhesion',
  '/adhesion/merci',
  '/retour-paiement',
  '/soutenir',
  '/soutenir/merci',
  '/mon-espace',
];
const privatePaths = [
  '/admin-dev.html',
  '/carte-dev.html',
  '/__pdc_admin_api/v1/admin/dashboard',
  '/__pdc_admin_api/v1/admin/session',
  '/backend/pdc-api/.env',
  '/src/features/admin-dev/main.jsx',
  '/nimporte-quelle-page-inexistante',
];

// Contrat conservateur : seules les URL explicites sont réécrites.
// Un glob /:path* ou /(.*) transformerait certains 404 de sécurité en 200.
function resolvedDestination(pathname) {
  const match = rewrites.find(rule => rule.source === pathname);
  return match?.destination ?? null;
}

test('configuration Vercel strictement limitée aux routes publiques', () => {
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.ok(Array.isArray(rewrites) && rewrites.length > 0);
  assert.equal(config.routes, undefined, 'pas de legacy routes ou de catch-all concurrent');
  assert.equal(config.redirects, undefined);
  const sources = rewrites.map(rule => rule.source);
  assert.deepEqual([...sources].sort(), [...publicPaths].sort());
  assert.equal(new Set(sources).size, sources.length);
  for (const rule of rewrites) {
    assert.deepEqual(Object.keys(rule).sort(), ['destination', 'source']);
    assert.equal(rule.destination, '/index.html');
    assert.match(rule.source, /^\/[a-z-]+(?:\/[a-z-]+)?$/);
  }
});

test('chaque route React publique déclarée est couverte par Vercel', () => {
  const app = read('src/App.jsx');
  const paths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map(match => match[1])
    .filter(path => path !== '/')
    .map(path => `/${path}`);
  assert.deepEqual([...paths].sort(), [...publicPaths].sort(),
    'Une nouvelle page React exige de revoir explicitement les rewrites');
  for (const path of paths) assert.equal(resolvedDestination(path), '/index.html');
  // / est déjà servi par le fichier physique index.html.
  assert.equal(resolvedDestination('/'), null);
  assert.match(read('src/main.jsx'), /<BrowserRouter>/);
});

test('aucune page DEV, route admin ou URL inconnue réécrite vers React', () => {
  for (const path of privatePaths) {
    assert.equal(resolvedDestination(path), null, `${path} doit rester sans rewrite`);
    assert.ok(!rewrites.some(rule => rule.source === path), path);
  }
  assert.ok(!JSON.stringify(rewrites).includes('admin-dev'));
  assert.ok(!JSON.stringify(rewrites).includes('carte-dev'));
});

test('espace militant = prévisualisation publique, pas un accès nominatif', () => {
  const espace = read('src/pages/EspaceMilitant.jsx');
  assert.match(espace, /static preview/i);
  assert.match(espace, /getAdhesionText/);
  assert.doesNotMatch(espace, /\bfetch\s*\(|\blocalStorage\b|\bservice_role\b/i);
});

test('correctif Safari iPhone des champs dates préservé', () => {
  for (const file of ['src/pages/Adhesion.css', 'src/components/DonForm/DonForm.css']) {
    const css = read(file);
    assert.match(css, /@supports\s*\(-webkit-touch-callout:\s*none\)/);
    assert.match(css, /input\[type="date"\]/);
    assert.match(css, /::-webkit-date-and-time-value/);
    assert.match(css, /max-width:\s*100%/);
  }
});

test('pages sensibles absentes du build public lorsqu\'il existe', () => {
  if (!existsSync(new URL('dist/index.html', root))) return;
  for (const path of ['dist/admin-dev.html', 'dist/carte-dev.html']) {
    assert.equal(existsSync(new URL(path, root)), false, `${path} interdit dans dist`);
  }
});
