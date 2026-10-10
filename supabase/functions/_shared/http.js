// ============================================================
// HTTP commun : CORS limité, réponses JSON en français, lecture bornée.
// ============================================================

export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {object} [extra] */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Origine normalisée (schéma + hôte + port) ou '' si invalide. */
export function normalizeOrigin(o) {
  try {
    const u = new URL(String(o || '').trim());
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) return '';
    return u.origin;
  } catch {
    return '';
  }
}

/** Liste d'origines de l'application (APP_ORIGIN, séparées par des virgules). */
export function appOrigins(appOrigin) {
  return String(appOrigin || '').split(',').map(normalizeOrigin).filter(Boolean);
}

/**
 * L'origine est-elle autorisée ? Application, ou origine d'intégration
 * déclarée dans le formulaire (settings.embed : { allowed, origins }).
 * Une requête sans en-tête Origin (outil en ligne de commande) n'est pas
 * un navigateur : elle reste soumise à Turnstile et à la limitation.
 */
export function originAllowed(origin, appOrigin, embed) {
  if (!origin) return true;
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (appOrigins(appOrigin).includes(o)) return true;
  if (embed && embed.allowed === true && Array.isArray(embed.origins)) {
    return embed.origins.map(normalizeOrigin).includes(o);
  }
  return false;
}

export function corsHeaders(origin, allowed) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowed) h['Access-Control-Allow-Origin'] = normalizeOrigin(origin);
  return h;
}

export function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** Lit un corps JSON en refusant au-delà de maxBytes. */
export async function readJsonBody(req, maxBytes = 700_000) {
  const type = req.headers.get('content-type') || '';
  if (!/application\/json/i.test(type)) throw new HttpError(415, 'Format attendu : JSON.');
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'Envoi trop volumineux.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Envoi trop volumineux.');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('objet attendu');
    return body;
  } catch {
    throw new HttpError(400, 'Requête illisible (JSON invalide).');
  }
}

/** Jeton Bearer d'un utilisateur (on ignore la clé publique du projet). */
export function bearerToken(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return null;
  const t = m[1].trim();
  // Clé publique (sb_publishable_…) ou JWT « anon » : pas un utilisateur.
  if (/^sb_publishable_/i.test(t)) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload?.role === 'anon') return null;
  } catch {
    return null;
  }
  return t;
}
