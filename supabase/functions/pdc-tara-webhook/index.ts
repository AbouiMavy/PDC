import {classifyWebhookRecord} from './record-outcome.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2';

const MAX_BYTES = 16384;
const encoder = new TextEncoder();

function reply(status: number, received = false) {
  return new Response(JSON.stringify({received}), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function secureEquals(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/.test(a) ||
      !/^[a-f0-9]{64}$/.test(b)) return false;

  const hash = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest('SHA-256',encoder.encode(s))
    );

  const x = await hash(a);
  const y = await hash(b);
  let diff = 0;

  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function validText(x: unknown, max: number): x is string {
  return typeof x === 'string' &&
    x.length >= 1 && x.length <= max;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PDC_TARA_WEBHOOK_TOKEN');
  const businessId = Deno.env.get('PDC_TARA_BUSINESS_ID');

  if (!secret || !businessId) {
    console.error('PDC_WEBHOOK_CONFIG_MISSING', {
      tokenConfigured: Boolean(secret),
      businessConfigured: Boolean(businessId)
    });
    return reply(503);
  }

  const url = new URL(req.url);
  const suppliedToken = url.searchParams.get('token') || '';

  if (!(await secureEquals(suppliedToken,secret)))
    return reply(401);

  if (req.method !== 'POST') return reply(405);

  if (!req.headers.get('content-type')?.toLowerCase()
       .startsWith('application/json'))
    return reply(415);

  const length = Number(req.headers.get('content-length') || '0');
  if (!Number.isSafeInteger(length) || length > MAX_BYTES)
    return reply(413);

  let payload: Record<string, unknown>;

  try {
    const body = await req.text();
    if (encoder.encode(body).length > MAX_BYTES)
      return reply(413);

    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) ||
        typeof parsed !== 'object')
      return reply(400);

    payload = parsed;
  } catch {
    return reply(400);
  }

  if (
    payload.businessId !== businessId ||
    !validText(payload.paymentId,200) ||
    !validText(payload.collectionId,200) ||
    !validText(payload.productId,128) ||
    !/^PDC_[A-Za-z0-9_-]{24}$/.test(payload.productId) ||
    !validText(payload.status,50) ||
    !/^[A-Z_]{3,50}$/.test(payload.status) ||
    typeof payload.amount !== 'string' ||
    !/^(0|[1-9][0-9]{0,9})$/.test(payload.amount)
  ) return reply(400);

  const amount = Number(payload.amount);
  if (!Number.isSafeInteger(amount) ||
      amount > 2147483647)
    return reply(400);

  // Même empreinte canonique que le backend V5-C.
  const fingerprintSource = JSON.stringify([
    payload.businessId,
    payload.paymentId,
    payload.productId,
    payload.collectionId,
    payload.amount,
    payload.status,
    typeof payload.changeDate === 'string'
      ? payload.changeDate : ''
  ]);

  const digest = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(fingerprintSource)
    )
  );
  const fingerprint = [...digest]
    .map(v => v.toString(16).padStart(2,'0'))
    .join('');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    console.error('PDC_WEBHOOK_SUPABASE_CONFIG_MISSING', {
      urlConfigured: Boolean(supabaseUrl),
      legacyKeyConfigured: Boolean(serviceKey),
      newSecretKeysConfigured:
        Boolean(Deno.env.get('SUPABASE_SECRET_KEYS'))
    });
    return reply(503);
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: {persistSession:false,autoRefreshToken:false}
    });

    const {data,error} = await admin.rpc(
      'pdc_v5c41_record_tara_webhook_hint',
      {
        p_fingerprint:fingerprint,
        p_product_id:payload.productId,
        p_provider_payment_id:payload.paymentId,
        p_amount_claimed_xaf:amount,
        p_status_claimed:payload.status
      }
    );

    // La prise en charge est distinguée du simple HTTP 200.
    // Produit inconnu, réponse inattendue, erreur : pas d'accusé de réception.
    const outcome=classifyWebhookRecord({data,error});
    if (!outcome.received) {
      if (error) {
        console.error('PDC_WEBHOOK_RPC_FAILED',JSON.stringify({
          code:typeof error.code==='string'?error.code:'UNKNOWN'
        }));
      } else {
        console.warn('PDC_WEBHOOK_RECORD_REJECTED',
          JSON.stringify({code:outcome.code}));
      }
      return reply(outcome.httpStatus,outcome.received);
    }


    if (error) {
      console.error('PDC_WEBHOOK_RPC_FAILED', {
        code: String(error.code ?? 'UNKNOWN').slice(0, 40)
      });
      return reply(503);
    }

    // Produit inconnu : notification ignorée.
    // Doublon : la fonction SQL existante le dédoublonne.
    if (data === false) return reply(422,false);

    return reply(200,true);
  } catch (error) {
    console.error('PDC_WEBHOOK_EXCEPTION', {
      type: error instanceof Error ? error.name : 'UNKNOWN'
    });
    return reply(503);
  }
});
