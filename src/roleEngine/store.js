import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createSilenceableStorage, onExternalStorageChange } from '../core/crossTabSync.js';
import {
  importResponses, computeAssignments, compareAllScenarios, checkStability,
  DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE,
  DEFAULT_CONSTRAINTS,
} from './index.js';
import { BDE_MONTREUIL_PRESET } from './constraints.js';
import { parseRoleLabel } from './roles.js';
import { detectContradictions } from './signals.js';
import { useStore } from '../store.js';
import {
  getActiveCatalog, subscribeCatalog, capacitiesOf, DEFAULT_ROLES as CATALOG_DEFAULT_ROLES,
} from '../core/catalog.js';

// ============================================================
// STORE DU MOTEUR D'AFFECTATION
// ============================================================
// Les capacités ne sont plus stockées ici : elles appartiennent aux rôles du
// catalogue (store principal, éditables dans « Gestion des rôles »).
// `capacities` est un miroir en lecture seule, tenu à jour automatiquement,
// conservé pour la compatibilité des composants et des exports de config.

const currentCapacities = () => capacitiesOf(getActiveCatalog());
const rolesStorage = createSilenceableStorage();

/** Retire les références à des rôles / niveaux qui n'existent plus. */
function sanitizeConstraints(constraints, catalog) {
  const c = { ...DEFAULT_CONSTRAINTS, ...(constraints || {}) };
  const roleOk = (id) => !!catalog.roles[id];
  const filterMap = (map, keep) => Object.fromEntries(Object.entries(map || {}).filter(([, v]) => keep(v)));
  const forbiddenRoles = {};
  Object.entries(c.forbiddenRoles || {}).forEach(([k, list]) => {
    const kept = (Array.isArray(list) ? list : []).filter(roleOk);
    if (kept.length) forbiddenRoles[k] = kept;
  });
  return {
    ...c,
    forcedRoles: filterMap(c.forcedRoles, roleOk),
    preferredRoles: filterMap(c.preferredRoles, roleOk),
    maxLevels: filterMap(c.maxLevels, (lvl) => !!catalog.levels[lvl]),
    forbiddenRoles,
  };
}

/** Verrous valides : rôle existant et index de place ≤ capacité. */
function sanitizeLocks(lockedPairs, catalog) {
  return (lockedPairs || []).filter(pair => {
    const [, slotId] = String(pair).split(':');
    const [roleId, idx] = String(slotId || '').split('#');
    const role = catalog.roles[roleId];
    return !!role && Number(idx) >= 1 && Number(idx) <= (role.capacity ?? 0);
  });
}

const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ré-interprète les choix bruts des candidats avec le catalogue courant :
 * un rôle créé (ou un alias ajouté) APRÈS l'import du CSV est ainsi reconnu
 * sans réimporter. Renvoie le même tableau si rien ne change.
 */
export function reparseCandidates(candidates, catalog) {
  let changed = false;
  const next = candidates.map(c => {
    if (!Array.isArray(c.rawChoices)) return c;
    const choices = [...new Set(c.rawChoices.map(raw => parseRoleLabel(raw, catalog)).filter(Boolean))];
    if (sameJSON(choices, c.choices)) return c;
    changed = true;
    const updated = { ...c, choices };
    updated.contradictions = detectContradictions(updated, catalog);
    return updated;
  });
  return changed ? next : candidates;
}

export const useRolesStore = create(
  persist(
    (set, get) => ({
      candidates: [],
      importReport: null,
      importedAt: null,
      rawCsvHash: null,

      weights: { ...DEFAULT_WEIGHTS },
      penalties: { ...DEFAULT_PENALTIES },
      capacities: currentCapacities(),
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
        const { candidates, report } = importResponses(csvText, { catalog: getActiveCatalog() });
        set({
          candidates, importReport: report,
          importedAt: new Date().toISOString(),
          rawCsvHash: hash,
          scenarios: [], ranking: null, stability: null,
          selectedScenarioIndex: 0,
        });
        get().recompute();
        return { cached: false, candidates, report };
      },

      recompute: () => {
        const catalog = getActiveCatalog();
        const capacities = capacitiesOf(catalog);
        const { candidates, weights, penalties, minScore, constraints } = get();
        // Nettoyage silencieux des verrous devenus invalides (rôle supprimé,
        // capacité réduite) : un verrou orphelin bloquerait le candidat.
        const lockedPairs = sanitizeLocks(get().lockedPairs, catalog);
        const patch = { capacities };
        if (lockedPairs.length !== get().lockedPairs.length) patch.lockedPairs = lockedPairs;

        if (candidates.length === 0) {
          set({ ...patch, scenarios: [], ranking: null, stability: null });
          return;
        }

        const lockedSet = new Set(lockedPairs);
        const { scenarios, ranking } = compareAllScenarios(candidates, {
          capacities, minScore, lockedPairs: lockedSet, constraints, catalog,
        });

        const custom = computeAssignments(candidates, {
          capacities, weights, penalties, minScore, lockedPairs: lockedSet, constraints, catalog,
          scenarioName: 'Personnalisé (poids actuels)',
          scenarioDescription: 'Recalculé à partir de vos curseurs.',
        });

        const all = [custom, ...scenarios];
        set({
          ...patch,
          scenarios: all,
          ranking: { ...ranking, custom: custom.name },
          // La stabilité calculée correspond à l'ancien contexte : on l'invalide.
          stability: null,
          selectedScenarioIndex: Math.min(get().selectedScenarioIndex, all.length - 1),
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

      /** Délégué au catalogue (source de vérité) ; le recalcul suit via l'abonnement. */
      setCapacity: (roleId, value) => {
        useStore.getState().setRoleCapacity(roleId, value);
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
        set({ constraints: sanitizeConstraints(nextConstraints, getActiveCatalog()) });
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
        set({ constraints: sanitizeConstraints(preset, getActiveCatalog()) });
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
        const { candidates, weights, penalties, minScore, lockedPairs, constraints } = get();
        if (candidates.length === 0) return;
        set({ stabilityLoading: true });
        setTimeout(() => {
          try {
            const catalog = getActiveCatalog();
            const stab = checkStability(candidates, {
              capacities: capacitiesOf(catalog), weights, penalties, iterations, minScore,
              lockedPairs: new Set(lockedPairs), constraints, catalog,
            });
            set({ stability: stab, stabilityLoading: false });
          } catch (err) {
            console.error('[Moteur] Analyse de stabilité impossible', err);
            set({ stabilityLoading: false });
          }
        }, 50);
      },

      clearAll: () => {
        set({
          candidates: [], importReport: null, importedAt: null, rawCsvHash: null,
          scenarios: [], ranking: null, stability: null, lockedPairs: [], selectedScenarioIndex: 0,
        });
      },

      exportConfig: () => {
        const s = get();
        return {
          version: 3,
          exportedAt: new Date().toISOString(),
          config: {
            weights: s.weights, penalties: s.penalties,
            // Informatif : à l'import, les capacités sont appliquées au catalogue.
            capacities: currentCapacities(),
            minScore: s.minScore, lockedPairs: s.lockedPairs, constraints: s.constraints,
          },
        };
      },

      importConfig: (payload) => {
        if (!payload?.config || typeof payload.config !== 'object') throw new Error('Config invalide');
        const cfg = payload.config;
        const catalog = getActiveCatalog();
        if (cfg.capacities && typeof cfg.capacities === 'object') {
          const main = useStore.getState();
          main.runBatch(async () => {
            Object.entries(cfg.capacities).forEach(([roleId, cap]) => {
              if (catalog.roles[roleId] && catalog.roles[roleId].capacity !== cap) main.setRoleCapacity(roleId, cap);
            });
          });
        }
        set({
          weights: { ...DEFAULT_WEIGHTS, ...cfg.weights },
          penalties: { ...DEFAULT_PENALTIES, ...cfg.penalties },
          minScore: Number.isFinite(cfg.minScore) ? cfg.minScore : DEFAULT_MIN_SCORE,
          lockedPairs: Array.isArray(cfg.lockedPairs) ? cfg.lockedPairs : [],
          constraints: sanitizeConstraints(cfg.constraints, getActiveCatalog()),
        });
        get().recompute();
      },
    }),
    {
      name: 'bde-roles-storage',
      version: 4,
      storage: createJSONStorage(() => rolesStorage.storage),
      // Les candidats sont désormais persistés (sinon l'onglet était vide après
      // rechargement). Ils contiennent des données personnelles : le bouton
      // « Effacer » de l'import les supprime. Les scénarios sont recalculés.
      partialize: (state) => ({
        candidates: state.candidates,
        importReport: state.importReport,
        importedAt: state.importedAt,
        rawCsvHash: state.rawCsvHash,
        selectedScenarioIndex: state.selectedScenarioIndex,
        weights: state.weights,
        penalties: state.penalties,
        minScore: state.minScore,
        lockedPairs: state.lockedPairs,
        constraints: state.constraints,
      }),
      migrate: (persisted, version) => {
        const s = { ...(persisted || {}) };
        if (version < 4) {
          // v3 → v4 : les capacités migrent vers le catalogue. Le store principal
          // l'a déjà fait lors de sa propre migration ; ce filet couvre le cas
          // où il n'avait pas encore d'état persisté. On ne remplace que les
          // capacités restées à leur valeur par défaut.
          const caps = s.capacities;
          if (caps && typeof caps === 'object') {
            const roles = { ...useStore.getState().roles };
            let changed = false;
            Object.entries(caps).forEach(([roleId, cap]) => {
              const r = roles[roleId];
              const n = Math.round(Number(cap));
              if (r && Number.isFinite(n) && r.capacity === CATALOG_DEFAULT_ROLES[roleId]?.capacity && r.capacity !== n) {
                roles[roleId] = { ...r, capacity: Math.max(0, Math.min(99, n)) };
                changed = true;
              }
            });
            if (changed) useStore.setState({ roles });
          }
          delete s.capacities;
        }
        return s;
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted || {}),
        constraints: { ...DEFAULT_CONSTRAINTS, ...(persisted?.constraints || {}) },
        capacities: currentCapacities(),
      }),
      onRehydrateStorage: () => (state) => {
        // Les scénarios ne sont pas persistés : recalcul après hydratation.
        if (state?.candidates?.length) setTimeout(() => useRolesStore.getState().recompute(), 0);
      },
    }
  )
);

// ------------------------------------------------------------
// Réaction aux changements du catalogue (rôles, capacités, niveaux…)
// ------------------------------------------------------------
// Recalcul différé (les clics +/− sur une capacité s'enchaînent vite) et
// purge des contraintes qui référencent un rôle ou un niveau supprimé.
let recomputeTimer = null;
subscribeCatalog((catalog) => {
  const s = useRolesStore.getState();
  const constraints = sanitizeConstraints(s.constraints, catalog);
  const lockedPairs = sanitizeLocks(s.lockedPairs, catalog);
  const patch = { capacities: capacitiesOf(catalog) };
  const candidates = reparseCandidates(s.candidates, catalog);
  if (candidates !== s.candidates) patch.candidates = candidates;
  if (!sameJSON(constraints, s.constraints)) patch.constraints = constraints;
  if (lockedPairs.length !== s.lockedPairs.length) patch.lockedPairs = lockedPairs;
  useRolesStore.setState(patch);
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => useRolesStore.getState().recompute(), 150);
});

// Synchronisation entre onglets (voir core/crossTabSync.js).
onExternalStorageChange('bde-roles-storage', () => {
  rolesStorage.runSilently(() => { useRolesStore.persist.rehydrate(); });
});

function simpleHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

export { BDE_MONTREUIL_PRESET };
