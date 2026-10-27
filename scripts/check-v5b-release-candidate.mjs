// Vérification statique non destructive de la candidate V5-B.
// Un PASS n'est PAS une autorisation de collecter des données militantes réelles.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
let failures = 0;
let warnings = 0;
const good = s => console.log(`PASS ${s}`);
const fail = s => { failures++; console.error(`FAIL ${s}`); };
const warn = s => { warnings++; console.warn(`WARN ${s}`); };
const path = p => resolve(root, p);
const needed = [
 'supabase/migrations/20261026001600_pdc_v5b610f2_couple_payment_bundle_dev.sql',
 'supabase/migrations/20261026001700_pdc_v5b610f3_couple_admission_dev.sql',
 'supabase/migrations/20261026001800_pdc_v5b610f31_fix_ambiguous_slot_dev.sql',
 'supabase/migrations/20261027001900_pdc_v5b610f4_couple_portrait_grants_dev.sql',
 'backend/pdc-api/src/couple-portrait-grants-v5b610f4.mjs',
 'tests/sql/v5b610f4-couple-portrait-grants-test.sql',
 'src/pages/Adhesion.jsx',
 'vite.config.js',
];
for (const p of needed) existsSync(path(p)) ? good(`présent : ${p}`) : fail(`absent : ${p}`);
if (needed.every(p=>existsSync(path(p)))) {
 const sql=readFileSync(path(needed[3]),'utf8');
 if (/REVOKE ALL ON FUNCTION pdc_private\.couple_photo_issue_pair_dev_v5b610f4/.test(sql) &&
     /NOT pdc_private\.couple_payment_verified_dev_v5b610f2/.test(sql) &&
     /BEGIN;[\s\S]*COMMIT;/.test(sql)) good('barrières SQL F4 et transaction présentes');
 else fail('une barrière SQL F4 attendue est manquante');
 const html=readFileSync(path('src/pages/Adhesion.jsx'),'utf8');
 if (/\/adhesion\/merci\?preview=1/.test(html))
  warn('formulaire en simulation : aucune preuve de checkout connecté');
 else warn('parcours du formulaire modifié : revue de code obligatoire');
}
try {
 const names=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
 const risky=names.filter(x=>/(^|\/)\.env$|\.(pem|key|p12|zip)$/.test(x));
 if (risky.length) fail(`fichiers potentiellement sensibles suivis : ${risky.join(', ')}`);
 else good('aucun .env, .pem, .key, .p12 ou .zip versionné');
} catch { warn('contrôle des fichiers suivis Git indisponible'); }
const distPaths=['dist/admin-dev.html','dist/carte-dev.html'];
if (existsSync(path('dist/index.html'))) {
 const found=distPaths.filter(p=>existsSync(path(p)));
 if (found.length) fail(`pages de développement présentes dans le build : ${found.join(', ')}`);
 else good('build Vite ne contient pas admin-dev.html ni carte-dev.html');
} else warn('dist absent : exécuter npm run build avant une PR vers main');
warn('les secrets intégrés dans le code, les données PII et les webhooks exigent un audit humain');
warn('la fusion dans main peut déclencher Vercel : contrôler la configuration de production');
warn('API F1 et émission de jetons F4 non autorisées pour le public à ce stade');
console.log(`\nBilan : ${failures} erreur(s), ${warnings} avertissement(s).`);
process.exitCode=failures ? 1 : 0;
