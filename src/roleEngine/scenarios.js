import {
  DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE,
  DEFAULT_POLE_TARGETS, resolveCatalog, getCatalogRoles, capacityOf,
} from './config.js';
import { buildScoreMatrix } from './scoring.js';
import { runSolver, localSearch } from './solver.js';
import { detectAlerts } from './alerts.js';
import { DEFAULT_CONSTRAINTS } from './constraints.js';

export const SCENARIO_PRESETS = {
  satisfaction: {
    name: 'Satisfaction maximale',
    description: 'Privilégie l\'obtention du 1er choix par le plus grand nombre.',
    weights: { P: 0.55, D: 0.15, E: 0.10, A: 0.08, M: 0.07, F: 0.05 },
    penalties: { ...DEFAULT_PENALTIES, nonRequested: 35 },
    poleTargets: { minPoleSize: 1, weightByDemand: 0.9, weightByCapacity: 0.1 },
  },
  equilibre: {
    name: 'Équilibre des pôles',
    description: 'Répartit les effectifs de façon homogène entre pôles.',
    weights: { P: 0.30, D: 0.25, E: 0.10, A: 0.10, M: 0.10, F: 0.15 },
    penalties: { ...DEFAULT_PENALTIES, nonRequested: 20 },
    poleTargets: { minPoleSize: 3, weightByDemand: 0.4, weightByCapacity: 0.6 },
  },
  continuite: {
    name: 'Continuité et expérience',
    description: 'Renforce les postes clés avec des profils expérimentés.',
    weights: { P: 0.25, D: 0.15, E: 0.30, A: 0.10, M: 0.10, F: 0.10 },
    penalties: { ...DEFAULT_PENALTIES, alternanceOnBureau: 20, lowAvailabilityOnLeadership: 25 },
    poleTargets: { minPoleSize: 2, weightByDemand: 0.5, weightByCapacity: 0.5 },
  },
};

/**
 * Pôles du catalogue qui portent au moins un rôle, dans l'ordre du catalogue.
 * Les clés de regroupement sont des IDS de pôle (libellés via le catalogue).
 */
function polesWithRoles(roles) {
  const ids = [];
  roles.forEach(r => { if (!ids.includes(r.pole)) ids.push(r.pole); });
  return ids;
}

/**
 * Tailles cibles par pôle : mélange demande observée / capacités annoncées,
 * avec un plancher minPoleSize. Les pôles dont la capacité totale est nulle
 * n'ont pas de cible (ils ne peuvent pas être pourvus).
 * @returns {Map<string, number>}  poleId → cible
 */
export function computePoleTargets(candidates, capacities, poleTargets = DEFAULT_POLE_TARGETS, catalog) {
  const cat = resolveCatalog(catalog);
  const { minPoleSize, weightByDemand, weightByCapacity } = { ...DEFAULT_POLE_TARGETS, ...(poleTargets || {}) };
  const roles = getCatalogRoles(cat);
  const demand = {};
  polesWithRoles(roles).forEach(p => { demand[p] = 0; });
  candidates.forEach(c => {
    (c.choices || []).forEach(roleId => {
      const role = cat.roles?.[roleId];
      if (role) demand[role.pole] = (demand[role.pole] || 0) + 1;
    });
  });
  const capacityByPole = {};
  roles.forEach(role => {
    capacityByPole[role.pole] = (capacityByPole[role.pole] || 0) + capacityOf(role, capacities);
  });
  const totalCandidates = candidates.length;
  const totalCapacity = Object.values(capacityByPole).reduce((s, n) => s + n, 0) || 1;
  const targets = new Map();
  const totalDemand = Object.values(demand).reduce((s, n) => s + n, 0) || 1;
  Object.keys(capacityByPole).forEach(pole => {
    if (!capacityByPole[pole]) return;
    const demandShare = (demand[pole] || 0) / totalDemand;
    const capacityShare = capacityByPole[pole] / totalCapacity;
    const share = weightByDemand * demandShare + weightByCapacity * capacityShare;
    targets.set(pole, Math.max(minPoleSize, Math.round(share * totalCandidates)));
  });
  return targets;
}

export function runScenario({
  candidates, capacities,
  weights = DEFAULT_WEIGHTS,
  penalties = DEFAULT_PENALTIES,
  poleTargets = DEFAULT_POLE_TARGETS,
  minScore = DEFAULT_MIN_SCORE,
  lockedPairs = new Set(),
  constraints = DEFAULT_CONSTRAINTS,
  scenarioName,
  scenarioDescription,
  catalog,
}) {
  const cat = resolveCatalog(catalog);
  const roles = getCatalogRoles(cat);
  const scoreMatrix = buildScoreMatrix(candidates, roles, weights, penalties, constraints, cat);
  const baseRun = runSolver(candidates, capacities, scoreMatrix, { minScore, lockedPairs, catalog: cat });

  const poleTargetsMap = computePoleTargets(candidates, capacities, poleTargets, cat);
  let current = baseRun.assignments.map(a => ({ ...a }));
  current = balancePoles(current, scoreMatrix, poleTargetsMap, minScore, cat);

  const improved = localSearch(current, scoreMatrix, { minScore, lockedPairs });

  const assigned = improved.assignments.filter(a => a.slotId && a.candidateId);
  const scores = assigned.map(a => a.score.total);
  const avgSatisfaction = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
  const worstSatisfaction = scores.length ? Math.min(...scores) : 0;

  // Effectifs par pôle (clés = ids de pôle)
  const poleSizes = {};
  polesWithRoles(roles).forEach(p => { poleSizes[p] = 0; });
  improved.assignments.forEach(a => {
    if (!a.slotId || !a.candidateId) return;
    const role = cat.roles?.[a.roleId];
    if (role) poleSizes[role.pole] = (poleSizes[role.pole] || 0) + 1;
  });

  const alerts = detectAlerts({
    candidates, assignments: improved.assignments,
    poleTargets: poleTargetsMap, poleSizes, minScore, catalog: cat,
  });

  return {
    name: scenarioName,
    description: scenarioDescription,
    weights: { ...weights },
    penalties: { ...penalties },
    assignments: improved.assignments,
    globalScore: improved.globalScore,
    avgSatisfaction, worstSatisfaction,
    poleSizes,
    poleTargets: Object.fromEntries(poleTargetsMap),
    alerts,
  };
}

function balancePoles(assignments, scoreMatrix, poleTargets, minScore, cat) {
  const current = assignments.map(a => ({ ...a }));
  const maxIter = 50;
  const poleOf = (roleId) => cat.roles?.[roleId]?.pole;

  for (let iter = 0; iter < maxIter; iter++) {
    const sizes = {};
    current.forEach(a => {
      if (!a.slotId || !a.candidateId) return;
      const pole = poleOf(a.roleId);
      if (pole !== undefined) sizes[pole] = (sizes[pole] || 0) + 1;
    });

    let deficitPole = null, surplusPole = null;
    let maxDeficit = 0, maxSurplus = 0;
    for (const [pole, target] of poleTargets) {
      const diff = target - (sizes[pole] || 0);
      if (diff > maxDeficit) { maxDeficit = diff; deficitPole = pole; }
      if (-diff > maxSurplus) { maxSurplus = -diff; surplusPole = pole; }
    }
    if (!deficitPole || !surplusPole || maxDeficit < 1) break;

    let improved = false;
    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      if (!a.slotId || !a.candidateId || a.locked) continue;
      if (poleOf(a.roleId) !== surplusPole) continue;

      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        const b = current[j];
        if (!b.slotId || !b.candidateId || b.locked) continue;
        if (poleOf(b.roleId) !== deficitPole) continue;

        const sAonB = scoreMatrix.get(a.candidateId)?.get(b.roleId)?.total || 0;
        const sBonA = scoreMatrix.get(b.candidateId)?.get(a.roleId)?.total || 0;
        if (sAonB < minScore || sBonA < minScore) continue;

        const gain = (sAonB + sBonA) - (a.score.total + b.score.total);
        if (gain > -5) {
          const origA = { slotId: a.slotId, roleId: a.roleId, score: a.score };
          a.slotId = b.slotId; a.roleId = b.roleId;
          a.score = scoreMatrix.get(a.candidateId)?.get(a.roleId) || null;
          b.slotId = origA.slotId; b.roleId = origA.roleId;
          b.score = scoreMatrix.get(b.candidateId)?.get(origA.roleId) || null;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return current;
}

export function compareScenarios(baseInputs) {
  const { candidates, capacities, minScore, lockedPairs, constraints, catalog } = baseInputs;
  const cat = resolveCatalog(catalog);

  const scenarios = Object.values(SCENARIO_PRESETS).map(preset =>
    runScenario({
      catalog: cat,
      candidates, capacities,
      weights: preset.weights,
      penalties: preset.penalties,
      poleTargets: preset.poleTargets,
      minScore, lockedPairs, constraints,
      scenarioName: preset.name,
      scenarioDescription: preset.description,
    })
  );

  const ranking = {
    bestGlobalScore: [...scenarios].sort((a, b) => b.globalScore - a.globalScore)[0]?.name,
    bestAvg: [...scenarios].sort((a, b) => b.avgSatisfaction - a.avgSatisfaction)[0]?.name,
    bestWorst: [...scenarios].sort((a, b) => b.worstSatisfaction - a.worstSatisfaction)[0]?.name,
    // ⚠️ Fix #11 : plus petit score = meilleur équilibre
    bestBalance: [...scenarios].sort((a, b) => poleBalanceScore(a) - poleBalanceScore(b))[0]?.name,
    fewestAlerts: [...scenarios].sort((a, b) => a.alerts.length - b.alerts.length)[0]?.name,
  };

  return { scenarios, ranking };
}

function poleBalanceScore(scenario) {
  let sum = 0;
  Object.entries(scenario.poleTargets).forEach(([pole, target]) => {
    sum += Math.abs((scenario.poleSizes[pole] || 0) - target);
  });
  return sum;
}