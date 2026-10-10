// ============================================================
// STUDIO DOCUMENTS — VÉRIFICATION D'AUTHENTICITÉ
// ============================================================
// Chaque document émis porte un QR code encodant
//   ${origine}/#/verifier?ref=BDE-2026-0007&fp=3F9A-21C4-77B0
// La page publique #/verifier (components/documents/VerifyPage.jsx)
// compare la référence et l'empreinte au registre.
//
// ⚠️ Sans backend, le registre n'existe QUE sur l'appareil qui a émis le
// document : la vérification ne fonctionne que là. Le module backend peut
// brancher une vérification distante :
//   setRemoteVerifier(async (ref, fp) => ({ status, entry? }) | null)
//   setVerificationBaseUrl('https://bde.exemple.fr/')   // URL publique
// `status` : 'match' | 'mismatch' | 'found' | 'not-found'.
// `entry`  : { ref, title, createdAt, fingerprint, signedAt? } (jamais de
//            données personnelles au-delà du titre du document).
// ============================================================

let baseUrl = null;
let remoteVerifier = null;
const listeners = new Set();

/** URL publique de l'application (sinon origine + chemin de la page courante). */
export function setVerificationBaseUrl(url) {
  baseUrl = url ? String(url) : null;
  listeners.forEach(fn => fn());
}

/** Racine utilisée pour les liens de vérification. */
export function verificationBase() {
  if (baseUrl) return baseUrl.replace(/#.*$/, '').replace(/\/?$/, '/');
  if (typeof window === 'undefined' || !window.location) return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname || '/'}`;
}

/** Lien de vérification imprimé (QR code) sur un document émis. */
export function verificationUrl(ref, fingerprint) {
  const params = new URLSearchParams();
  if (ref) params.set('ref', String(ref));
  if (fingerprint) params.set('fp', String(fingerprint));
  return `${verificationBase()}#/verifier?${params.toString()}`;
}

/** Fonction de vérification distante (fournie par le backend), ou null pour la retirer. */
export function setRemoteVerifier(fn) {
  remoteVerifier = typeof fn === 'function' ? fn : null;
  listeners.forEach(f => f());
}

export const hasRemoteVerifier = () => !!remoteVerifier;

export function onVerificationConfigChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Vérification distante (backend) : null si aucun backend n'est configuré
 * ou s'il est injoignable (l'appelant retombe alors sur le registre local).
 * @returns {Promise<{ status: string, entry?: object }|null>}
 */
export async function verifyRemote(ref, fingerprint) {
  if (!remoteVerifier) return null;
  try {
    const res = await remoteVerifier(ref, fingerprint);
    return res && typeof res.status === 'string' ? res : null;
  } catch (e) {
    console.error('[Documents] vérification distante indisponible', e?.message || e);
    return null;
  }
}

/** Paramètres d'un hash « #/verifier?ref=…&fp=… ». */
export function parseVerificationHash(hash) {
  const q = new URLSearchParams(String(hash || '').split('?')[1] || '');
  return { ref: q.get('ref') || '', fp: q.get('fp') || '' };
}
