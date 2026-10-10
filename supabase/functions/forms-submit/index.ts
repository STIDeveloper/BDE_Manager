// ============================================================
// Fonction Edge « forms-submit » : envoi / modification d'une réponse.
// POST JSON { slug, answers, files?, turnstileToken?, draftToken?, editToken?, honeypot?, params? }
// En-têtes : apikey = clé publique ; Authorization = JWT utilisateur
// (facultatif, requis si le formulaire exige une connexion).
// Déployer avec --no-verify-jwt (les envois anonymes sont autorisés ; le
// JWT éventuel est vérifié ici).
// Secrets : TURNSTILE_SECRET_KEY, APP_ORIGIN, RATE_LIMIT_SALT (facultatif),
// BREVO_* (facultatif). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont
// fournis automatiquement par Supabase.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import * as engine from '../_shared/forms-engine/index.js';
import { handleSubmit } from '../_shared/submit.js';
import { HttpError, jsonResponse, corsHeaders, originAllowed, readJsonBody, bearerToken, appOrigins } from '../_shared/http.js';
import { clientIp, fetchWithTimeout, logTech } from '../_shared/util.js';
import { brevoConfig, sendBrevoEmail } from '../_shared/brevo.js';

const env = (k: string) => Deno.env.get(k) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const APP_ORIGIN = env('APP_ORIGIN');
const brevo = brevoConfig(env);

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const res = await fetchWithTimeout(fetch, 'https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: env('TURNSTILE_SECRET_KEY'), response: token, ...(ip && ip !== 'inconnue' ? { remoteip: ip } : {}) }).toString(),
  }, 6000);
  if (!res.ok) return false;
  const data = await res.json();
  return data?.success === true;
}

const background = (p: Promise<unknown>) => {
  // @ts-ignore EdgeRuntime est fourni par Supabase Edge Runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  else p.catch(() => {});
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  // Pré-vol : l'origine précise est contrôlée sur la requête réelle (selon le formulaire).
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, !!origin) });
  // En-têtes CORS de la réponse : application ou origine d'intégration autorisée.
  let allowOrigin = originAllowed(origin, APP_ORIGIN, null);
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    if (!APP_ORIGIN || !appOrigins(APP_ORIGIN).length) throw new HttpError(503, 'Serveur incomplet : APP_ORIGIN non configuré.');
    const body = await readJsonBody(req);
    const out = await handleSubmit({ body, origin, ip: clientIp(req.headers), userJwt: bearerToken(req) }, {
      rpc: (name: string, params: Record<string, unknown>) => admin.rpc(name, params),
      getUser: async (jwt: string) => {
        const { data, error } = await admin.auth.getUser(jwt);
        return error || !data?.user ? null : { id: data.user.id, email: data.user.email || null };
      },
      verifyTurnstile: env('TURNSTILE_SECRET_KEY') ? verifyTurnstile : null,
      createUploadUrl: async (path: string) => {
        const { data, error } = await admin.storage.from('form-uploads').createSignedUploadUrl(path);
        if (error || !data) throw new HttpError(500, 'Préparation du téléversement impossible.');
        return { signedUrl: data.signedUrl, token: data.token, path: data.path };
      },
      sendEmail: brevo ? (msg: { to: { email: string }[], subject: string, html: string, text: string }) => sendBrevoEmail(brevo, msg) : null,
      background,
      engine,
      env: { appOrigin: APP_ORIGIN, rateSalt: env('RATE_LIMIT_SALT') || env('SUPABASE_URL'), appUrl: appOrigins(APP_ORIGIN)[0] },
      now: () => new Date(),
      onOriginAllowed: () => { allowOrigin = true; },
    });
    return jsonResponse(out.status, out.body, corsHeaders(origin, allowOrigin));
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { ok: false, error: err.message, ...err.extra }, corsHeaders(origin, allowOrigin));
    }
    logTech('forms-submit', 'erreur inattendue', err as Error);
    return jsonResponse(500, { ok: false, error: 'Erreur du serveur : réessaie dans un instant.' }, corsHeaders(origin, allowOrigin));
  }
});
