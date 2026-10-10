// ============================================================
// REGISTRE DES MODULES — sauvegarde & synchronisation
// ============================================================
// Chaque module de données (trésorerie, événements, agenda…) s'enregistre
// ici. Deux usages :
//   1. Sauvegarde JSON : la sauvegarde complète inclut automatiquement les
//      données de tous les modules (champ `modules` du backup).
//   2. Synchronisation (backend collaboratif) : chaque module déclare ses
//      « tranches » synchronisables. Le moteur de synchronisation
//      (src/backend/) les observe de façon générique : il compare l'état
//      avant/après et pousse les enregistrements modifiés, sans que les
//      modules aient à connaître le backend.
//
// ── Tranche synchronisable (SyncSlice) ───────────────────────
// {
//   collection: 'finance.transactions', // nom unique côté serveur (« module.collection »)
//   store,                              // store Zustand (avec getState/setState/subscribe)
//   key: 'transactions',                // clé de l'état (singleton : clé ou tableau de clés)
//   kind: 'map' | 'array' | 'singleton',// map : { clé: valeur } (id = clé, la valeur peut être
//                                       //   un objet quelconque) ; array : objets { id } ;
//                                       //   singleton : valeur(s) entière(s) (ex. réglages)
//   capability: 'finance',              // famille de permissions (voir backend/permissions)
//   sensitive?: boolean,                // données personnelles (journalisation, exports)
// }
// Les objets d'une tranche « array » DOIVENT avoir un `id` stable.
// ============================================================

const modules = new Map();
const syncSlices = [];
const listeners = new Set();

/**
 * @param {{ name: string, label: string, exportData: () => object,
 *           importData: (data: object) => void, slices?: object[] }} mod
 */
export function registerModule(mod) {
  if (!mod?.name) throw new Error('Module sans nom');
  modules.set(mod.name, mod);
  (mod.slices || []).forEach(s => registerSyncSlice(s));
  listeners.forEach(fn => fn());
}

export function registerSyncSlice(slice) {
  if (!slice?.collection || !slice.store || !slice.key) throw new Error('Tranche de synchronisation invalide');
  if (syncSlices.some(s => s.collection === slice.collection)) return;
  syncSlices.push({ kind: 'map', capability: slice.collection.split('.')[0], ...slice });
  listeners.forEach(fn => fn());
}

export const getModules = () => [...modules.values()];
export const getSyncSlices = () => [...syncSlices];
export function onRegistryChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Données de tous les modules pour la sauvegarde. */
export function exportModules() {
  const out = {};
  modules.forEach((m, name) => {
    try { out[name] = m.exportData(); } catch (e) { console.error(`[backup] module ${name}`, e); }
  });
  return out;
}

/** Restaure les modules présents dans une sauvegarde (les autres restent intacts). */
export function importModules(data = {}) {
  const restored = [];
  Object.entries(data || {}).forEach(([name, payload]) => {
    const m = modules.get(name);
    if (!m || !payload) return;
    m.importData(payload);
    restored.push(m.label || name);
  });
  return restored;
}
