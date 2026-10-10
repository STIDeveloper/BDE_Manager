// ============================================================
// TABLEAU DE BORD — préférences d'affichage (persistées)
// ============================================================
// layout : { order: widgetId[], hidden: widgetId[] }
// Préférence d'interface : incluse dans la sauvegarde JSON, non synchronisée
// avec le backend (aucune tranche), chaque appareil garde la sienne.

import { createModuleStore } from '../../core/createModuleStore.js';

export const useDashboardStore = createModuleStore({
  name: 'dashboard',
  label: 'Tableau de bord (préférences)',
  version: 1,
  initialState: { layout: { order: [], hidden: [] } },
  slices: [],
  actions: (set) => ({
    setLayout: (layout) => set({ layout: { order: [...(layout.order || [])], hidden: [...(layout.hidden || [])] } }),
    resetLayout: () => set({ layout: { order: [], hidden: [] } }),
  }),
});
