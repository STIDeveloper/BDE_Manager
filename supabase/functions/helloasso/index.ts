// ============================================================
// Fonction Edge « helloasso » : paiement d'une réponse de formulaire.
//   POST /functions/v1/helloasso/checkout   { responseId, editToken } → { url }
//   POST /functions/v1/helloasso/webhook?token=<HELLOASSO_WEBHOOK_TOKEN>
//        (URL à déclarer dans HelloAsso › Mon compte › Intégrations et API ›
//         « URL de callback / notifications »)
// Déployer avec --no-verify-jwt (HelloAsso n'envoie pas de JWT Supabase).
// Secrets : HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET, HELLOASSO_ORG_SLUG,
// HELLOASSO_ENV (« sandbox » pour les tests, sinon production),
// HELLOASSO_WEBHOOK_TOKEN (recommandé), APP_ORIGIN.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { handleCheckout, handleWebhook } from '../_shared/payment.js';
import { helloassoConfig, helloassoToken, createCheckoutIntent, getCheckoutIntent } from '../_shared/helloasso.js';
import { HttpError, jsonResponse, corsHeaders, originAllowed, readJsonBody, appOrigins } from '../_shared/http.js';
import { logTech } from '../_shared/util.js';

const env = (k: string) => Deno.env.get(k) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cfg = helloassoConfig(env);
let cachedToken: { value: string, until: number } | null = null;

const helloasso = cfg ? {
  token: async () => {
    if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
    const value = await helloassoToken(cfg);
    cachedToken = { value, until: Date.now() + 20 * 60_000 };   // jeton valable 30 min chez HelloAsso
    return value;
  },
  createIntent: (token: string, p: Parameters<typeof createCheckoutIntent>[2]) => createCheckoutIntent(cfg, token, p),
  getIntent: (token: string, id: string) => getCheckoutIntent(cfg, token, id),
} : null;

const rpc = (name: string, params: Record<string, unknown>) => admin.rpc(name, params);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  const origin = req.headers.get('origin') || '';
  const allowed = originAllowed(origin, env('APP_ORIGIN'), null);
  const cors = route === 'checkout' ? corsHeaders(origin, allowed) : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    const appUrl = appOrigins(env('APP_ORIGIN'))[0];
    if (!appUrl) throw new HttpError(503, 'Serveur incomplet : APP_ORIGIN non configuré.');
    if (route === 'checkout') {
      if (!allowed) throw new HttpError(403, 'Origine non autorisée.');
      const out = await handleCheckout(await readJsonBody(req, 10_000), { rpc, helloasso, env: { appUrl } });
      return jsonResponse(out.status, out.body, cors);
    }
    if (route === 'webhook') {
      const out = await handleWebhook({ body: await readJsonBody(req, 200_000), token: url.searchParams.get('token') || '' },
        { rpc, helloasso, env: { appUrl, webhookToken: env('HELLOASSO_WEBHOOK_TOKEN') } });
      return jsonResponse(out.status, out.body);
    }
    throw new HttpError(404, 'Route inconnue (checkout ou webhook).');
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse(err.status, { ok: false, error: err.message }, cors);
    logTech('helloasso', 'erreur inattendue', err as Error);
    return jsonResponse(502, { ok: false, error: 'Service de paiement indisponible : réessaie plus tard.' }, cors);
  }
});
