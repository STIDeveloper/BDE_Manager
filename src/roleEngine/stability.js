import { DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE } from './config.js';
import { ROLE_CATALOG } from './config.js';
import { buildSlots } from './roles.js';
import { buildScoreMatrix } from './scoring.js';
import { runSolver } from './solver.js';
import { mulberry32 } from './normalizer.js';

/**
 * Analyse de stabilité : applique N perturbations aléatoires (mais déterministes)
 * sur les poids et pénalités, relance le solveur et mesure la fréquence
 * avec laquelle chaque paire (candidat, rôle) reste inchangée.
 *
 * @param {object} params
 * @param {import('./types.js').Candidate[]} params.candidates
 * @param {object} params.capacities
 * @param {object} [params.weights]
 * @param {object} [params.penalties]
 * @param {number} [params.iterations=200]
 * @param {number} [params.jitter=0.20]  Amplitude (±20 %)
 * @param {number} [params.seed]
 * @param {number} [params.minScore]
 * @param {Set<string>} [params.lockedPairs]
 * @returns {{
 *   stability: Map<string, number>,   // "candidateId:roleId" → fréquence 0..1
 *   perCandidate: Map<string, number>,// candidateId → stabilité moyenne sur son poste actuel
 *   unstableCount: number,
 *   arbitrationsRequired: Array<{candidateId:string, roleId:string, stability:number, currentScore:number}>
 * }}
 */
export function analyzeStability({
  candidates,
  capacities,
  weights = DEFAULT_WEIGHTS,
  penalties = DEFAULT_PENALTIES,
  iterations = 200,
  jitter = 0.20,
  seed = 0xBDE_2026,
  minScore = DEFAULT_MIN_SCORE,
  lockedPairs = new Set(),
}) {
  const rng = mulberry32(seed);
  const slots = buildSlots(capacities);

  // Baseline
  const baselineMatrix = buildScoreMatrix(candidates, ROLE_CATALOG, weights, penalties);
  const baseline = runSolver(candidates, capacities, baselineMatrix, { minScore, lockedPairs });

  // Map baseline : candidateId → roleId
  const baselineRole = new Map();
  baseline.assignments.forEach(a => {
    if (a.candidateId) baselineRole.set(a.candidateId, a.roleId);
  });

  // Map compteur : "candidateId:roleId" → nombre d'occurrences dans les perturbations
  const pairCounts = new Map();
  const candidateCounts = new Map(); // candidateId → nombre de perturbations où il garde le même rôle

  const weightKeys = Object.keys(weights);
  const penaltyKeys = Object.keys(penalties);

  for (let it = 0; it < iterations; it++) {
    // Perturbe les poids
    const w = { ...weights };
    weightKeys.forEach(k => {
      const delta = (rng() * 2 - 1) * jitter;
      w[k] = Math.max(0, w[k] * (1 + delta));
    });
    // Renormalise
    const sum = weightKeys.reduce((s, k) => s + w[k], 0) || 1;
    weightKeys.forEach(k => { w[k] = w[k] / sum; });

    // Perturbe les pénalités
    const p = { ...penalties };
    penaltyKeys.forEach(k => {
      const delta = (rng() * 2 - 1) * jitter;
      p[k] = Math.max(0, p[k] * (1 + delta));
    });

    const matrix = buildScoreMatrix(candidates, ROLE_CATALOG, w, p);
    const run = runSolver(candidates, capacities, matrix, { minScore, lockedPairs });

    run.assignments.forEach(a => {
      if (!a.candidateId || !a.roleId) return;
      const pairKey = `${a.candidateId}:${a.roleId}`;
      pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);

      if (baselineRole.get(a.candidateId) === a.roleId) {
        candidateCounts.set(a.candidateId, (candidateCounts.get(a.candidateId) || 0) + 1);
      }
    });
  }

  // Normalisation en fréquences
  const stability = new Map();
  pairCounts.forEach((count, key) => {
    stability.set(key, count / iterations);
  });

  const perCandidate = new Map();
  candidateCounts.forEach((count, cid) => {
    perCandidate.set(cid, count / iterations);
  });

  // Détection des affectations instables (stabilité < 0.75)
  const arbitrationsRequired = [];
  baseline.assignments.forEach(a => {
    if (!a.candidateId || !a.roleId) return;
    const key = `${a.candidateId}:${a.roleId}`;
    const stab = stability.get(key) ?? 0;
    if (stab < 0.75) {
      arbitrationsRequired.push({
        candidateId: a.candidateId,
        roleId: a.roleId,
        stability: stab,
        currentScore: a.score?.total ?? 0,
      });
    }
  });

  // Tri par instabilité croissante
  arbitrationsRequired.sort((a, b) => a.stability - b.stability);

  return {
    stability,
    perCandidate,
    unstableCount: arbitrationsRequired.length,
    arbitrationsRequired,
  };
}

/**
 * Détecte les paires bloquantes : un candidat A préfère un rôle R
 * dont le titulaire actuel B a un score inférieur à celui de A sur R.
 *
 * @param {object} params
 * @param {import('./types.js').Candidate[]} params.candidates
 * @param {import('./types.js').Assignment[]} params.assignments
 * @param {Map<string, Map<string, import('./types.js').ScoreBreakdown>>} params.scoreMatrix
 * @returns {Array<{candidateId:string, currentRole:string, preferredRole:string, gap:number}>}
 */
export function detectBlockingPairs({ candidates, assignments, scoreMatrix }) {
  const blockers = [];

  // Map : candidateId → assignment
  const byCandidate = new Map();
  assignments.forEach(a => {
    if (a.candidateId) byCandidate.set(a.candidateId, a);
  });

  // Map : roleId → [candidats assignés]
  const byRole = new Map();
  assignments.forEach(a => {
    if (!a.roleId || !a.candidateId) return;
    if (!byRole.has(a.roleId)) byRole.set(a.roleId, []);
    byRole.get(a.roleId).push(a);
  });

  candidates.forEach(c => {
    const current = byCandidate.get(c.id);
    if (!current || !current.roleId) return;

    // Rôles pour lesquels le candidat serait meilleur que l'actuel titulaire
    c.choices.forEach(roleId => {
      if (roleId === current.roleId) return;
      const myScore = scoreMatrix.get(c.id).get(roleId)?.total || 0;
      if (myScore < 60) return;

      const holders = byRole.get(roleId) || [];
      holders.forEach(h => {
        if (h.candidateId === c.id) return;
        const theirScore = h.score?.total || 0;
        if (myScore - theirScore > 10) {
          blockers.push({
            candidateId: c.id,
            currentRole: current.roleId,
            preferredRole: roleId,
            gap: myScore - theirScore,
          });
        }
      });
    });
  });

  return blockers.sort((a, b) => b.gap - a.gap);
}

/**
 * Analyse de sensibilité locale : à quel point le score d'une affectation
 * est-il sensible à une variation de chaque critère ?
 *
 * @param {import('./types.js').Candidate} candidate
 * @param {import('./types.js').Role} role
 * @param {object} weights
 * @param {object} penalties
 * @param {Function} computeScoreFn
 * @returns {{ criterion: string, deltaMinus: number, deltaPlus: number, range: number }[]}
 */
export function sensitivityAnalysis(candidate, role, weights, penalties, computeScoreFn) {
  const base = computeScoreFn(candidate, role, weights, penalties).total;
  const delta = 0.10; // ±10 %

  const results = [];
  const keys = ['P', 'D', 'E', 'A', 'M', 'F'];

  keys.forEach(k => {
    const wMinus = { ...weights };
    wMinus[k] = Math.max(0, weights[k] - delta);
    const wPlus = { ...weights };
    wPlus[k] = weights[k] + delta;

    const scoreMinus = computeScoreFn(candidate, role, wMinus, penalties).total;
    const scorePlus = computeScoreFn(candidate, role, wPlus, penalties).total;

    results.push({
      criterion: k,
      deltaMinus: scoreMinus - base,
      deltaPlus: scorePlus - base,
      range: Math.abs(scorePlus - scoreMinus),
    });
  });

  return results.sort((a, b) => b.range - a.range);
}