// Données de l'écran Automatisations : source locale (store) ou serveur.
import { useMemo } from 'react';
import { create } from 'zustand';
import { useAutomationsStore } from '../store.js';
import { useBackendState } from '../../backend/state.js';
import { getBackendConfig } from '../../backend/config.js';
import {
  listServerAutomations, saveServerAutomation, formsApi, isConnected,
} from '../server.js';
import { normalizeAutomation } from '../model.js';

const selectWs = s => s.workspaceId;

/** true si un espace collaboratif est connecté (source = serveur). */
export function useConnected() {
  const ws = useBackendState(selectWs);
  return !!ws && !!getBackendConfig();
}

/** Cache mémoire des automatisations / exécutions serveur. */
export const useServerData = create((set) => ({
  automations: [], runs: [], loading: false, error: null, loadedAt: null,
  load: async () => {
    if (!isConnected()) return;
    set({ loading: true, error: null });
    try {
      const [automations, runs] = await Promise.all([
        listServerAutomations(),
        formsApi.listAutomationRuns({ limit: 200 }).catch(() => []),
      ]);
      set({ automations, runs: runs || [], loading: false, loadedAt: new Date().toISOString() });
    } catch (err) {
      set({ loading: false, error: String(err?.message || err) });
    }
  },
}));

const selectAutos = s => s.automations;
const selectServerAutos = s => s.automations;

/** Liste des automatisations de la source active. */
export function useAutomationList(connected) {
  const local = useAutomationsStore(selectAutos);
  const server = useServerData(selectServerAutos);
  return useMemo(() => (connected ? server : Object.values(local))
    .slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr')), [connected, local, server]);
}

/** Enregistre dans la source active. → automatisation enregistrée */
export async function persistAutomation(a, connected) {
  const clean = normalizeAutomation(a);
  if (connected) {
    const saved = await saveServerAutomation(clean);
    await useServerData.getState().load();
    return saved;
  }
  return useAutomationsStore.getState().saveAutomation(clean);
}

export async function removeAutomation(a, connected) {
  if (connected) {
    await formsApi.deleteAutomation(a.serverId || a.id);
    await useServerData.getState().load();
    return;
  }
  useAutomationsStore.getState().deleteAutomation(a.id);
}

export async function duplicateAutomationIn(a, connected) {
  if (connected) {
    const { id: _id, serverId: _s, ...rest } = a;
    return persistAutomation({ ...JSON.parse(JSON.stringify(rest)), name: `${a.name} (copie)`, enabled: false }, true);
  }
  return useAutomationsStore.getState().duplicateAutomation(a.id);
}
