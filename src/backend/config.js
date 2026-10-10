// ============================================================
// CONFIGURATION DU BACKEND COLLABORATIF (Supabase)
// ============================================================
// Deux sources, par ordre de priorité :
//   1. variables de build VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env) ;
//   2. saisie dans l'écran « Équipe & accès » (persistée dans ce navigateur).
// Seule la clé PUBLIQUE (anon / publishable) est acceptée : elle est faite
// pour être embarquée dans le navigateur, la sécurité reposant sur les
// politiques RLS du serveur. Une clé secrète (service_role / sb_secret_)
// donnerait tous les droits à quiconque ouvre l'application : refusée.
// Ce module est léger (aucune dépendance) : il est chargé au démarrage.
// ============================================================

const LS_KEY = 'bde-backend-config';

function readEnv() {
  try {
    const url = import.meta.env?.VITE_SUPABASE_URL;
    const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
    if (url && key) return { url: normalizeUrl(url), key: String(key).trim(), source: 'env' };
  } catch { /* hors Vite */ }
  return null;
}

export function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

/** @returns {{ url: string, key: string, source: 'env'|'local' } | null} */
export function getBackendConfig() {
  const env = readEnv();
  if (env && !validateBackendConfig(env)) return env;
  try {
    const raw = globalThis.localStorage?.getItem(LS_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (cfg && !validateBackendConfig(cfg)) return { url: normalizeUrl(cfg.url), key: String(cfg.key).trim(), source: 'local' };
  } catch { /* configuration illisible : ignorée */ }
  return null;
}

export const isBackendConfigured = () => !!getBackendConfig();
export const isEnvConfigured = () => !!readEnv();

function decodeJwtPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
  } catch { return null; }
}

/**
 * Vérifie l'URL du projet et la clé publique.
 * @returns {string|null} message d'erreur (français) ou null si valide
 */
export function validateBackendConfig({ url, key } = {}) {
  const u = normalizeUrl(url);
  if (!u) return 'Indique l’URL du projet Supabase.';
  let parsed;
  try { parsed = new URL(u); } catch { return 'URL invalide : elle doit ressembler à https://abcdefgh.supabase.co'; }
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) return 'L’URL doit commencer par https://';
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return 'Indique uniquement l’adresse du projet (sans chemin), ex. https://abcdefgh.supabase.co';
  if (parsed.username || parsed.password) return 'URL invalide.';

  const k = String(key || '').trim();
  if (!k) return 'Indique la clé publique (anon / publishable).';
  if (/^sb_secret_/i.test(k)) return 'Ceci est une clé SECRÈTE : ne la mets jamais dans l’application. Utilise la clé publique (publishable / anon).';
  if (/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(k)) return null;
  const payload = decodeJwtPayload(k);
  if (!payload) return 'Clé non reconnue : copie la clé « anon public » ou « publishable » du projet.';
  if (payload.role === 'service_role') return 'Ceci est la clé service_role (secrète) : ne la mets jamais dans l’application. Utilise la clé « anon public ».';
  if (payload.role !== 'anon') return 'Clé non reconnue : copie la clé « anon public » ou « publishable » du projet.';
  return null;
}

/**
 * Teste la connexion au projet (point d'entrée public de l'authentification).
 * @returns {Promise<string|null>} message d'erreur ou null si le projet répond
 */
export async function testBackendConfig({ url, key }, { timeoutMs = 8000 } = {}) {
  const invalid = validateBackendConfig({ url, key });
  if (invalid) return invalid;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeUrl(url)}/auth/v1/settings`, {
      headers: { apikey: String(key).trim() },
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) return 'Le projet a refusé cette clé : vérifie la clé publique.';
    if (!res.ok) return `Le serveur répond avec une erreur (${res.status}). Vérifie l’URL du projet.`;
    return null;
  } catch (err) {
    if (err?.name === 'AbortError') return 'Le serveur ne répond pas (délai dépassé). Vérifie l’URL et ta connexion.';
    return 'Serveur injoignable : vérifie l’URL du projet (et ta connexion Internet).';
  } finally {
    clearTimeout(timer);
  }
}

export function saveBackendConfig({ url, key }) {
  const err = validateBackendConfig({ url, key });
  if (err) throw new Error(err);
  globalThis.localStorage?.setItem(LS_KEY, JSON.stringify({ url: normalizeUrl(url), key: String(key).trim() }));
}

export function clearBackendConfig() {
  try { globalThis.localStorage?.removeItem(LS_KEY); } catch { /* ignoré */ }
}
