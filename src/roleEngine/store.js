import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  importResponses, computeAssignments, compareAllScenarios, checkStability,
  DEFAULT_CAPACITIES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE,
  DEFAULT_CONSTRAINTS,
} from './index.js';
import { BDE_MONTREUIL_PRESET } from './constraints.js';

export const useRolesStore = create(
  persist(
    (set, get) => ({
      candidates: [],
      importReport: null,
      importedAt: null,
      rawCsvHash: null,

      weights: { ...DEFAULT_WEIGHTS },
      penalties: { ...DEFAULT_PENALTIES },
      capacities: { ...DEFAULT_CAPACITIES },
      minScore: DEFAULT_MIN_SCORE,
      lockedPairs: [],
      constraints: { ...DEFAULT_CONSTRAINTS },

      scenarios: [],
      ranking: null,
      selectedScenarioIndex: 0,
      stability: null,
      stabilityLoading: false,

      importCsv: (csvText) => {
        const hash = simpleHash(csvText);
        if (hash === get().rawCsvHash && get().candidates.length > 0) {
          return { cached: true, candidates: get().candidates, report: get().importReport };
        }
        const { candidates, report } = importResponses(csvText);
        set({
          candidates, importReport: report,
          importedAt: new Date().toISOString(),
          rawCsvHash: hash,
          scenarios: [], ranking: null, stability: null,
        });
        get().recompute();
        return { cached: false, candidates, report };
      },

      recompute: () => {
        const { candidates, weights, penalties, capacities, minScore, lockedPairs, constraints } = get();
        if (candidates.length === 0) return;

        const lockedSet = new Set(lockedPairs);
        const { scenarios, ranking } = compareAllScenarios(candidates, {
          capacities, minScore, lockedPairs: lockedSet, constraints,
        });

        const custom = computeAssignments(candidates, {
          capacities, weights, penalties, minScore, lockedPairs: lockedSet, constraints,
          scenarioName: 'Personnalisé (poids actuels)',
          scenarioDescription: 'Recalculé à partir de vos curseurs.',
        });

        set({
          scenarios: [custom, ...scenarios],
          ranking: { ...ranking, custom: custom.name },
        });
      },

      setWeight: (key, value) => {
        set(state => ({ weights: { ...state.weights, [key]: value } }));
        get().recompute();
      },

      setPenalty: (key, value) => {
        set(state => ({ penalties: { ...state.penalties, [key]: value } }));
        get().recompute();
      },

      setCapacity: (roleId, value) => {
        set(state => ({ capacities: { ...state.capacities, [roleId]: Math.max(0, value) } }));
        get().recompute();
      },

      setMinScore: (value) => {
        set({ minScore: value });
        get().recompute();
      },

      resetWeights: () => {
        set({
          weights: { ...DEFAULT_WEIGHTS },
          penalties: { ...DEFAULT_PENALTIES },
          minScore: DEFAULT_MIN_SCORE,
        });
        get().recompute();
      },

      setConstraints: (nextConstraints) => {
        set({ constraints: { ...DEFAULT_CONSTRAINTS, ...nextConstraints } });
        get().recompute();
      },

      updateForcedRole: (personKey, roleId) => {
        const s = get();
        const next = { ...s.constraints };
        next.forcedRoles = { ...next.forcedRoles };
        if (roleId) next.forcedRoles[personKey] = roleId;
        else delete next.forcedRoles[personKey];
        set({ constraints: next });
        get().recompute();
      },

      updateMaxLevel: (personKey, level) => {
        const s = get();
        const next = { ...s.constraints };
        next.maxLevels = { ...next.maxLevels };
        if (level) next.maxLevels[personKey] = level;
        else delete next.maxLevels[personKey];
        set({ constraints: next });
        get().recompute();
      },

      updatePreferredRole: (personKey, roleId) => {
        const s = get();
        const next = { ...s.constraints };
        next.preferredRoles = { ...next.preferredRoles };
        if (roleId) next.preferredRoles[personKey] = roleId;
        else delete next.preferredRoles[personKey];
        set({ constraints: next });
        get().recompute();
      },

      loadPreset: (preset) => {
        set({ constraints: { ...DEFAULT_CONSTRAINTS, ...preset } });
        get().recompute();
      },

      clearConstraints: () => {
        set({ constraints: { ...DEFAULT_CONSTRAINTS } });
        get().recompute();
      },

      toggleLock: (candidateId, slotId) => {
        const pair = `${candidateId}:${slotId}`;
        set(state => ({
          lockedPairs: state.lockedPairs.includes(pair)
            ? state.lockedPairs.filter(p => p !== pair)
            : [...state.lockedPairs, pair],
        }));
        get().recompute();
      },

      isLocked: (candidateId, slotId) => get().lockedPairs.includes(`${candidateId}:${slotId}`),

      clearLocks: () => {
        set({ lockedPairs: [] });
        get().recompute();
      },

      setSelectedScenario: (idx) => set({ selectedScenarioIndex: idx }),

      getSelectedScenario: () => {
        const s = get();
        return s.scenarios[s.selectedScenarioIndex] || null;
      },

      runStability: (iterations = 200) => {
        const { candidates, weights, penalties, capacities, minScore, lockedPairs, constraints } = get();
        if (candidates.length === 0) return;
        set({ stabilityLoading: true });
        setTimeout(() => {
          const stab = checkStability(candidates, {
            capacities, weights, penalties, iterations, minScore,
            lockedPairs: new Set(lockedPairs), constraints,
          });
          set({ stability: stab, stabilityLoading: false });
        }, 50);
      },

      clearAll: () => {
        set({
          candidates: [], importReport: null, importedAt: null, rawCsvHash: null,
          scenarios: [], ranking: null, stability: null, lockedPairs: [],
        });
      },

      exportConfig: () => {
        const s = get();
        return {
          version: 2,
          exportedAt: new Date().toISOString(),
          config: {
            weights: s.weights, penalties: s.penalties, capacities: s.capacities,
            minScore: s.minScore, lockedPairs: s.lockedPairs, constraints: s.constraints,
          },
        };
      },

      importConfig: (payload) => {
        if (!payload?.config) throw new Error('Config invalide');
        set({
          weights: { ...DEFAULT_WEIGHTS, ...payload.config.weights },
          penalties: { ...DEFAULT_PENALTIES, ...payload.config.penalties },
          capacities: { ...DEFAULT_CAPACITIES, ...payload.config.capacities },
          minScore: payload.config.minScore ?? DEFAULT_MIN_SCORE,
          lockedPairs: payload.config.lockedPairs ?? [],
          constraints: payload.config.constraints ?? { ...DEFAULT_CONSTRAINTS },
        });
        get().recompute();
      },
    }),
    {
      name: 'bde-roles-storage',
      version: 3,
      partialize: (state) => ({
        weights: state.weights,
        penalties: state.penalties,
        capacities: state.capacities,
        minScore: state.minScore,
        lockedPairs: state.lockedPairs,
        constraints: state.constraints,
      }),
    }
  )
);

function simpleHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export { BDE_MONTREUIL_PRESET };