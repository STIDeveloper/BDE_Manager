// ============================================================
// FABRIQUE DE STORES DE MODULE
// ============================================================
// Store Zustand persisté avec, d'office :
//  - stockage silencieux + synchronisation entre onglets (core/crossTabSync) ;
//  - enregistrement dans le registre des modules (sauvegarde JSON + synchro) ;
//  - horodatage des enregistrements (helpers.stamp) pour la résolution des
//    conflits côté backend (dernier écrit gagne, par enregistrement).
//
// Usage :
//   export const useFinanceStore = createModuleStore({
//     name: 'finance', label: 'Trésorerie', version: 1,
//     initialState: { transactions: {}, categories: {}, settings: {...} },
//     slices: [{ key: 'transactions', kind: 'map', capability: 'finance' }, …],
//     actions: (set, get, h) => ({ addTransaction: (t) => … }),
//     migrate: (persisted, version) => persisted,
//   });
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createSilenceableStorage, onExternalStorageChange } from './crossTabSync.js';
import { registerModule } from './moduleRegistry.js';

export const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
export const nowIso = () => new Date().toISOString();

/** Utilitaires passés aux actions des modules. */
export function createHelpers(set, get) {
  return {
    newId,
    nowIso,
    /** Ajoute createdAt / updatedAt. */
    stamp: (record, isNew = false) => {
      const t = nowIso();
      return { ...record, ...(isNew || !record.createdAt ? { createdAt: record.createdAt || t } : {}), updatedAt: t };
    },
    /** Insère ou met à jour un enregistrement d'une collection « map ». */
    upsert: (key, record) => {
      if (!record?.id) throw new Error(`Enregistrement sans id (${key})`);
      const prev = get()[key]?.[record.id];
      const t = nowIso();
      const next = { ...(prev || {}), ...record, createdAt: prev?.createdAt || record.createdAt || t, updatedAt: t };
      set(s => ({ [key]: { ...s[key], [record.id]: next } }));
      return next;
    },
    /** Supprime un enregistrement d'une collection « map ». */
    remove: (key, id) => {
      set(s => {
        if (!s[key]?.[id]) return {};
        const { [id]: _removed, ...rest } = s[key];
        return { [key]: rest };
      });
    },
  };
}

export function createModuleStore({
  name, label, version = 1, initialState, actions, slices = [], migrate, exportKeys,
}) {
  const storageKey = `bde-mod-${name}`;
  const silent = createSilenceableStorage();
  const dataKeys = exportKeys || Object.keys(initialState);

  const useModuleStore = create(
    persist(
      (set, get) => ({
        ...structuredCloneSafe(initialState),
        ...actions(set, get, createHelpers(set, get)),
      }),
      {
        name: storageKey,
        version,
        storage: createJSONStorage(() => silent.storage),
        partialize: (s) => Object.fromEntries(dataKeys.map(k => [k, s[k]])),
        migrate: (persisted, v) => (migrate ? migrate(persisted, v) : persisted),
        merge: (persisted, current) => ({ ...current, ...(persisted || {}) }),
      }
    )
  );

  onExternalStorageChange(storageKey, () => {
    silent.runSilently(() => { useModuleStore.persist.rehydrate(); });
  });

  registerModule({
    name,
    label,
    exportData: () => Object.fromEntries(dataKeys.map(k => [k, useModuleStore.getState()[k]])),
    importData: (data) => {
      const patch = {};
      dataKeys.forEach(k => { if (data[k] !== undefined) patch[k] = data[k]; });
      useModuleStore.setState(patch);
    },
    slices: slices.map(s => ({ ...s, collection: s.collection || `${name}.${s.key}`, store: useModuleStore })),
  });

  return useModuleStore;
}

function structuredCloneSafe(v) {
  try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
}
