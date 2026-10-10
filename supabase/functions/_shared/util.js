// ============================================================
// Outils communs aux fonctions Edge (JavaScript pur : Deno ET Node).
// Aucune dépendance au runtime : les variables d'environnement, le client
// Supabase et fetch sont injectés par les points d'entrée (index.ts).
// ============================================================

const enc = new TextEncoder();

/** Empreinte SHA-256 hexadécimale (identique à public.forms_sha256 en SQL). */
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(String(text ?? '')));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** n octets aléatoires → 2n caractères hexadécimaux. */
export function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RX = /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/;
export const EMAIL_RX = /^[^\s@"<>(),;:\\[\]]+@[^\s@"<>(),;:\\[\]]+\.[a-z]{2,}$/i;
export const isEmail = v => typeof v === 'string' && v.length <= 254 && EMAIL_RX.test(v.trim());
export const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Nom de fichier sûr pour un chemin de stockage (pas de « / », « .. », accents simplifiés). */
export function safeFileName(name) {
  const base = String(name || 'fichier').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '').replace(/-+/g, '-').slice(-80);
  return base || 'fichier';
}

/** Adresse IP du client (en-têtes posés par l'infrastructure Supabase / Cloudflare). */
export function clientIp(headers) {
  const get = (k) => (typeof headers?.get === 'function' ? headers.get(k) : headers?.[k]) || '';
  return (get('cf-connecting-ip') || get('x-real-ip') || String(get('x-forwarded-for')).split(',')[0] || 'inconnue').trim().slice(0, 64);
}

/** fetch avec délai maximal (AbortSignal). */
export async function fetchWithTimeout(fetchImpl, url, init = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Toutes les questions d'une définition (pages → sections → colonnes),
 * avec la clé de la question répétable parente le cas échéant.
 */
export function listQuestions(definition) {
  const out = [];
  const walk = (items, repeatKey) => {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!isPlainObject(it)) continue;
      if (it.kind === 'question' && typeof it.key === 'string') out.push({ ...it, _repeatKey: repeatKey || null });
      if (it.kind === 'section') walk(it.items, it.repeat ? (it.key || it.id) : repeatKey);
      if (it.kind === 'columns' && Array.isArray(it.columns)) it.columns.forEach(col => walk(col, repeatKey));
    }
  };
  (Array.isArray(definition?.pages) ? definition.pages : []).forEach(p => walk(p?.items, null));
  return out;
}

/** Journal technique SANS donnée personnelle (code + message court). */
export function logTech(scope, message, err) {
  const code = err?.code ? ` [${String(err.code).slice(0, 20)}]` : '';
  // Message technique expurgé : adresses e-mail, valeurs « Key (x)=(valeur) »
  // de Postgres et longues suites de chiffres retirées.
  const detail = err?.message ? String(err.message).slice(0, 160)
    .replace(/[^\s@]+@[^\s@]+/g, '[email]').replace(/=\([^)]*\)/g, '=(…)').replace(/\d{6,}/g, '[n]') : '';
  console.warn(`[${scope}] ${message}${code}`, detail);
}
