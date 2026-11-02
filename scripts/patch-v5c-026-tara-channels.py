#!/usr/bin/env python3
"""Correctif contractuel V5-C.26. Aucun réseau, SQL exécuté, ni commit."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

def update(rel, variants):
    path = ROOT / rel
    if not path.is_file():
        raise SystemExit('FICHIER_ABSENT: '+rel)
    data = path.read_text(encoding='utf-8')
    original = data
    for before, after in variants:
        if after in data:  # déjà appliqué
            continue
        if data.count(before) != 1:
            raise SystemExit(f'ANCRE_INATTENDUE {rel}: {before[:75]} nombre={data.count(before)}; aucun fichier modifié.')
        data = data.replace(before,after,1)
    return path, original, data

items = []
items.append(update('backend/pdc-api/src/v5c/tara-server-client-v5c.mjs', [
("function validProviderPayUrl(value, expectedPrefix) {", """// Les liens Tara de partage ont plusieurs hôtes légitimes, mais jamais
// un protocole exécutable ou une adresse choisie par le navigateur.
const TARA_SHARE_HOSTS = new Set([
  'taramoney.com','www.taramoney.com','dklo.co','www.dklo.co',
  'wa.me','api.whatsapp.com','web.whatsapp.com','whatsapp.com','www.whatsapp.com',
  't.me','telegram.me','www.telegram.me',
  'dikalo.com','www.dikalo.com','dikalo.co','www.dikalo.co',
]);
function validTaraShareLink(value, field) {
  if (typeof value !== 'string' || value.length < 7 || value.length > 2048 ||
      /[\\u0000-\\u001f\\u007f]/.test(value)) fail('PDC_TARA_PAYMENT_LINK_INVALID');
  if (field==='smsLink' && /^sms:/i.test(value)) {
    // Un SMS est un partage, pas une preuve de paiement.
    if (!/^sms:(?:[+0-9,;]*)?(?:\\?[^#]*)?$/i.test(value))
      fail('PDC_TARA_PAYMENT_LINK_INVALID');
    return value;
  }
  let u;
  try { u = new URL(value); } catch { fail('PDC_TARA_PAYMENT_LINK_INVALID'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash ||
      !TARA_SHARE_HOSTS.has(u.hostname.toLowerCase())) fail('PDC_TARA_PAYMENT_LINK_INVALID');
  return u.toString();
}
function validProviderPayUrl(value, expectedPrefix) {"""),
("  if (own(raw, 'cardLink') && raw.cardLink != null) result.cardLink = validProviderPayUrl(raw.cardLink, '/card/');", """  if (own(raw, 'cardLink') && raw.cardLink != null) result.cardLink = validProviderPayUrl(raw.cardLink, '/card/');
  for (const field of ['smsLink','whatsappLink','telegramLink','dikaloLink']) {
    if (own(raw,field) && raw[field] != null)
      result[field] = validTaraShareLink(raw[field],field);
  }"""),
]))
items.append(update('backend/pdc-api/src/v5c/tara-public-order-preparation-v5c.mjs', [
("!['whatsapp','telegram'].includes(raw.messagingChannel)","!['whatsapp','telegram','dikalo'].includes(raw.messagingChannel)"),
]))
items.append(update('backend/pdc-api/src/v5c/tara-public-checkout-coordinator-v5c.mjs', [
("// Ne jamais lancer Tara pour un virement bancaire ou une carte Stripe.","// Virement hors Tara ; les cartes peuvent emprunter cardLink Tara."),
("if (order.method==='virement' || order.method==='carte')", "if (order.method==='virement')"),
("// Uniquement « mobile » ou « tara » : identité et montant proviennent de", "// Mobile, Tara messagerie et carte : identité et montant proviennent de"),
]))
items.append(update('supabase/migrations/20261028002300_pdc_v5c_public_order_atomic_dev.sql', [
("messaging_channel text CHECK (messaging_channel IS NULL OR messaging_channel IN ('whatsapp','telegram'))", "messaging_channel text CHECK (messaging_channel IS NULL OR messaging_channel IN ('whatsapp','telegram','dikalo'))"),
("NOT IN ('whatsapp','telegram')", "NOT IN ('whatsapp','telegram','dikalo')"),
("  v_provider := CASE v_method WHEN 'virement' THEN 'bank_transfer'\n      WHEN 'carte' THEN 'stripe' ELSE 'tara' END;", "  v_provider := CASE v_method WHEN 'virement' THEN 'bank_transfer' ELSE 'tara' END;"),
]))
items.append(update('src/components/PaymentMethods/PaymentMethods.jsx', [
("['whatsapp','telegram'].map", "['whatsapp','telegram','dikalo'].map"),
("{id === 'whatsapp' ? 'WhatsApp' : 'Telegram'}", "{id === 'whatsapp' ? 'WhatsApp' : id === 'telegram' ? 'Telegram' : 'Dikalo'}"),
]))
items.append(update('src/pages/Adhesion.jsx', [
("messagerie==='telegram'?'Telegram':'WhatsApp'", "messagerie==='telegram'?'Telegram':messagerie==='dikalo'?'Dikalo':'WhatsApp'"),
]))
items.append(update('src/locales/fr.js', [
("Via Stripe : carte bancaire, Apple Pay, PayPal, WeChat Pay… selon disponibilité", "Via TaraMoney (cardLink) ; moyens réellement disponibles selon le prestataire"),
("Les moyens de paiement Stripe varient selon le compte, le pays, la devise et la périodicité. Ils ne sont pas activés dans cette maquette.", "Le parcours carte TaraMoney utilise cardLink. Paiement non activé dans cette maquette."),
("Parcours Tara via WhatsApp ou Telegram", "Parcours Tara via WhatsApp, Telegram ou Dikalo"),
("Parcours WhatsApp / Telegram à confirmer auprès du prestataire.", "Le lien du canal sélectionné est renvoyé par TaraMoney ; aucun paiement n’est déclenché ici."),
]))
items.append(update('src/locales/en.js', [
("Via Stripe: cards, Apple Pay, PayPal, WeChat Pay… subject to availability", "Via TaraMoney (cardLink); available methods depend on the provider"),
("Stripe payment methods depend on the account, country, currency and billing frequency. They are not active in this preview.", "TaraMoney card checkout uses cardLink. Payments are not yet enabled in this preview."),
("Tara flow through WhatsApp or Telegram", "Tara flow through WhatsApp, Telegram or Dikalo"),
("WhatsApp / Telegram integration is pending provider confirmation.", "TaraMoney returns the selected messaging link; this preview does not initiate payment."),
]))
items.append(update('backend/pdc-api/test/v5c-tara-public-checkout-coordinator.test.mjs', [
("test('carte Stripe : aucune réservation Tara',async()=>{", "test('carte Tara : reservation via cardLink dans la prochaine etape',async()=>{"),
("  assert.equal(result.status,'pending_external_payment');\n  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER']);", "  assert.equal(result.status,'reserved_channel_pending');\n  assert.deepEqual(x.log,['SQL_CREATE_PUBLIC_ORDER','SQL_RESERVE_TARA']);"),
]))
items.append(update('tests/v5c-payment-modes-parity.test.mjs', [
(r"\['whatsapp','telegram'\]", r"\['whatsapp','telegram','dikalo'\]"),
]))
# Toutes les ancres vérifiées : écriture seulement maintenant.
for path, before, after in items:
    if after != before:
        path.write_text(after,encoding='utf-8')
        print('PATCH: '+str(path.relative_to(ROOT)))
print('V5C_026_TARA_CHANNELS_APPLIED')
