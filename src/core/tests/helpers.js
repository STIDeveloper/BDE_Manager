// Utilitaires de test : localStorage en mémoire (Node n'en fournit pas
// toujours) à installer AVANT d'importer les stores.

export function installMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
    _data: data,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  return storage;
}

/** Laisse s'exécuter les microtâches / timers courts (hydratation, debounce). */
export const flush = (ms = 0) => new Promise(r => setTimeout(r, ms));
