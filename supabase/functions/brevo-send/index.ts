// ============================================================
// Fonction Edge « brevo-send » : message d'un organisateur aux répondants
// (ou aux membres) d'un espace, via Brevo.
// POST JSON { workspaceId, responseIds?: uuid[], to?: email[], subject, message, link?: { url, label } }
// Authorization : JWT de l'organisateur (capacité « forms » ≥ write vérifiée).
// Les accusés de réception de forms-submit n'appellent PAS cette fonction
// par HTTP : ils utilisent directement le module partagé _shared/brevo.js.
// Secrets : BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, APP_ORIGIN.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { handleNotify } from '../_shared/notify.js';
import { HttpError, jsonResponse, corsHeaders, originAllowed, readJsonBody, bearerToken } from '../_shared/http.js';
import { brevoConfig, sendBrevoEmail } from '../_shared/brevo.js';
import { logTech } from '../_shared/util.js';

const env = (k: string) => Deno.env.get(k) || '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const brevo = brevoConfig(env);

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const allowed = originAllowed(origin, env('APP_ORIGIN'), null);
  const cors = corsHeaders(origin, allowed);
  if (req.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
  try {
    if (!allowed) throw new HttpError(403, 'Origine non autorisée.');
    if (req.method !== 'POST') throw new HttpError(405, 'Méthode non autorisée.');
    const body = await readJsonBody(req, 100_000);
    const out = await handleNotify({ body, userJwt: bearerToken(req) }, {
      rpc: (name: string, params: Record<string, unknown>) => admin.rpc(name, params),
      getUser: async (jwt: string) => {
        const { data, error } = await admin.auth.getUser(jwt);
        return error || !data?.user ? null : { id: data.user.id, email: data.user.email || null };
      },
      sendEmail: brevo ? (msg: { to: { email: string }[], subject: string, html: string, text: string }) => sendBrevoEmail(brevo, msg) : null,
      orgName: env('BREVO_SENDER_NAME'),
    });
    return jsonResponse(out.status, out.body, cors);
  } catch (err) {
    if (err instanceof HttpError) return jsonResponse(err.status, { ok: false, error: err.message }, cors);
    logTech('brevo-send', 'erreur inattendue', err as Error);
    return jsonResponse(500, { ok: false, error: 'Erreur du serveur.' }, cors);
  }
});
