// ============================================================
// SYNCHRONISATION ENTRE ONGLETS (même navigateur, même appareil)
// ============================================================
// Quand un autre onglet modifie localStorage, le navigateur émet un
// événement `storage` dans les onglets ouverts. On recharge alors l'état
// persisté SANS le réécrire : sinon un onglet pourrait renvoyer une version
// périmée et écraser la modification qu'il vient de recevoir (bug observé :
// une création de rôle « annulée toute seule » avec deux onglets ouverts).
//
// ⚠️ Ceci ne synchronise PAS plusieurs appareils ni plusieurs utilisateurs :
// les données restent locales au navigateur.

/**
 * Stockage persist qui peut être rendu muet pendant l'application d'un
 * changement externe.
 * @returns {{ storage: object, runSilently: (fn: () => void) => void }}
 */
export function createSilenceableStorage(getBackend = () => globalThis.localStorage) {
  let silent = 0;
  const storage = {
    getItem: (name) => {
      try { return getBackend()?.getItem(name) ?? null; } catch { return null; }
    },
    setItem: (name, value) => {
      if (silent > 0) return;
      try {
        getBackend()?.setItem(name, value);
      } catch (err) {
        // Quota dépassé ou stockage désactivé (navigation privée) : on le signale
        // sans planter l'application.
        console.error(`[BDE] Écriture impossible dans le stockage local (${name})`, err);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bde-storage-error', { detail: { name, error: String(err?.message || err) } }));
        }
      }
    },
    removeItem: (name) => {
      if (silent > 0) return;
      try { getBackend()?.removeItem(name); } catch { /* ignoré */ }
    },
  };
  const runSilently = (fn) => {
    silent++;
    try { fn(); } finally { silent--; }
  };
  return { storage, runSilently };
}

/**
 * Écoute les modifications d'une clé faites par un autre onglet.
 * @param {string} key  clé localStorage
 * @param {(newValue: string|null) => void} onExternalChange
 */
export function onExternalStorageChange(key, onExternalChange) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => {};
  const handler = (e) => {
    if (e.key !== key) return;
    if (e.storageArea && e.storageArea !== globalThis.localStorage) return;
    onExternalChange(e.newValue);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
