// ============================================================
// AMORÇAGE DU BACKEND (léger)
// ============================================================
// Appelé au démarrage (src/modules/team/store.js, chargé par
// src/modules/index.js) et par l'indicateur d'en-tête. Sans configuration
// Supabase, rien n'est téléchargé : l'application reste en mode local.
// ============================================================

import { isBackendConfigured } from './config.js';
import { setBackendState } from './state.js';
import { setVerificationBaseUrl } from '../documents/verification.js';

// URL publique de l'application (QR codes de vérification), facultative :
// sans elle, l'adresse courante est utilisée.
try {
  const publicUrl = import.meta.env?.VITE_PUBLIC_APP_URL;
  if (publicUrl && /^https:\/\/[^\s]+$/.test(publicUrl)) setVerificationBaseUrl(publicUrl);
} catch { /* hors Vite */ }

let booting = null;

/** @returns {Promise<object|null>} le module engine (ou null en mode local) */
export function bootBackend() {
  if (!isBackendConfigured()) {
    setBackendState({ configured: false, ready: true, status: 'local' });
    return Promise.resolve(null);
  }
  if (!booting) {
    booting = import('./engine.js').then(async (engine) => {
      await engine.startBackend();
      return engine;
    }).catch((err) => {
      booting = null;
      setBackendState({ ready: true, status: 'error', error: `Chargement du module de synchronisation impossible (${err?.message || 'erreur'}).` });
      return null;
    });
  }
  return booting;
}

/** Charge le moteur (écran Équipe & accès), même sans configuration. */
export const loadEngine = () => import('./engine.js');

/** Après un changement de configuration. */
export async function rebootBackend() {
  const engine = await loadEngine();
  booting = null;
  await engine.resetBackend();
  booting = Promise.resolve(engine);
  return engine;
}
