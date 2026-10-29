import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('formulaires reliés uniquement dans sandbox explicitement activée',()=>{
  for(const path of ['src/pages/Soutenir.jsx','src/pages/Adhesion.jsx']){
    const s=read(path);
    assert.match(s,/publicCheckoutSandboxEnabled\(\)/);
    assert.match(s,/<PublicCheckoutV5C29/);
    assert.match(s,/source="(donation|membership)"/);
  }
});
test('choix de paiement partagé intact et pas de secret dans React',()=>{
  const s=read('src/components/PaymentMethods/PublicCheckoutV5C29.jsx');
  assert.match(s,/VITE_PDC_V5C29_CHECKOUT_ENABLED/);
  assert.match(s,/VITE_PDC_V5C29_ENV/);
  assert.match(s,/verificationToken:token,order:order\.data/);
  assert.match(s,/credentials:'same-origin'/);
  assert.doesNotMatch(s,/service_role|TARA_API_KEY|TURNSTILE_SECRET/);
  assert.match(read('src/components/DonForm/DonForm.jsx'),/telephoneE164:/);
});
test('pas de listener public automatique, pas de migration exécutée par la composition',()=>{
  const s=read('backend/pdc-api/src/v5c/public-sandbox-composition-v5c29.mjs');
  assert.doesNotMatch(s,/\.listen\s*\(|db push|child_process/);
  assert.match(s,/makePgPublicRateLimiterV5C29/);
  assert.match(s,/makeTurnstileVerifierV5C29/);
});
test('le script SQL du limiteur conserve les permissions privées',()=>{
  const s=read('supabase/migrations/20261028002900_pdc_v5c_public_rate_limit_dev.sql');
  assert.match(s,/ENABLE ROW LEVEL SECURITY/);
  assert.match(s,/REVOKE ALL ON FUNCTION/);
  assert.match(s,/TO pdc_tara_v5c_writer/);
  assert.ok(existsSync(new URL('../tests/sql/v5c29-rate-limit-rollback.sql',import.meta.url)));
});
