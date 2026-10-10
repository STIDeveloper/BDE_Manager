import { buildSlots } from './roles.js';

export function hungarian(cost) {
  const n = cost.length;
  if (n === 0) return [];
  for (let i = 0; i < n; i++) {
    if (cost[i].length !== n) throw new Error('hungarian: matrice non carrée');
  }

  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const result = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

const VACANT_SLOT_COST    = 40;
const NOT_ASSIGNED_COST   = 45;
const INELIGIBLE_COST     = 1000;

/**
 * Ne conserve que les verrous « candidatId:slotId » exploitables :
 * candidat présent, slot existant (rôle encore au catalogue, capacité
 * suffisante) et ni le candidat ni le slot déjà verrouillés ailleurs.
 * Un verrou pendant est ignoré au lieu de rendre le candidat inplaçable.
 * @returns {Set<string>}
 */
export function sanitizeLockedPairs(lockedPairs, candidates, slots) {
  const valid = new Set();
  if (!lockedPairs) return valid;
  const candidateIds = new Set(candidates.map(c => c.id));
  const slotIds = new Set(slots.map(s => s.id));
  const usedC = new Set();
  const usedS = new Set();
  for (const lp of lockedPairs) {
    if (typeof lp !== 'string') continue;
    const sep = lp.indexOf(':');
    if (sep <= 0) continue;
    const cid = lp.slice(0, sep);
    const sid = lp.slice(sep + 1);
    if (!candidateIds.has(cid) || !slotIds.has(sid) || usedC.has(cid) || usedS.has(sid)) continue;
    usedC.add(cid); usedS.add(sid);
    valid.add(lp);
  }
  return valid;
}

export function solveAssignment(candidates, slots, scoreMatrix, opts = {}) {
  const minScore = opts.minScore ?? 55;
  const lockedPairs = sanitizeLockedPairs(opts.lockedPairs, candidates, slots);
  // Index des verrous (évite de reparcourir l'ensemble pour chaque cellule)
  const lockedCandidates = new Set();
  const lockedSlots = new Set();
  lockedPairs.forEach(lp => {
    const sep = lp.indexOf(':');
    lockedCandidates.add(lp.slice(0, sep));
    lockedSlots.add(lp.slice(sep + 1));
  });

  const N = candidates.length;
  const M = slots.length;
  const size = N + M;
  const cost = Array.from({ length: size }, () => new Float64Array(size));

  for (let i = 0; i < N; i++) {
    const c = candidates[i];
    const byRole = scoreMatrix.get(c.id);
    const candidateLocked = lockedCandidates.has(c.id);
    for (let j = 0; j < M; j++) {
      const slot = slots[j];
      const sb = byRole?.get(slot.roleId);
      const score = sb ? sb.total : 0;

      if (lockedPairs.has(`${c.id}:${slot.id}`)) { cost[i][j] = -1; continue; }
      // Slot verrouillé pour un autre candidat, ou candidat verrouillé ailleurs
      if (lockedSlots.has(slot.id) || candidateLocked) { cost[i][j] = INELIGIBLE_COST; continue; }

      cost[i][j] = score >= minScore ? (100 - score) : INELIGIBLE_COST;
    }
  }

  // Colonnes fictives « non assigné »
  for (let i = 0; i < N; i++) {
    const candidateLocked = lockedCandidates.has(candidates[i].id);
    for (let j = M; j < size; j++) {
      cost[i][j] = candidateLocked ? INELIGIBLE_COST : NOT_ASSIGNED_COST;
    }
  }

  // Lignes fictives « slot vacant »
  for (let i = N; i < size; i++) {
    for (let j = 0; j < M; j++) {
      cost[i][j] = lockedSlots.has(slots[j].id) ? INELIGIBLE_COST : VACANT_SLOT_COST;
    }
  }

  for (let i = N; i < size; i++) {
    for (let j = M; j < size; j++) {
      cost[i][j] = 0;
    }
  }

  const assignment = hungarian(cost);
  const assignments = [];
  const usedSlots = new Set();
  let globalScore = 0;

  for (let i = 0; i < N; i++) {
    const c = candidates[i];
    const j = assignment[i];
    if (j < M) {
      const slot = slots[j];
      const score = scoreMatrix.get(c.id)?.get(slot.roleId) || null;
      if (score && score.total >= minScore) {
        usedSlots.add(slot.id);
        globalScore += score.total;
        assignments.push({
          candidateId: c.id, slotId: slot.id, roleId: slot.roleId,
          score, locked: lockedPairs.has(`${c.id}:${slot.id}`), vacant: false,
        });
        continue;
      }
    }
    assignments.push({ candidateId: c.id, slotId: null, roleId: null, score: null, locked: false, vacant: false });
  }

  slots.forEach(slot => {
    if (!usedSlots.has(slot.id)) {
      assignments.push({ candidateId: null, slotId: slot.id, roleId: slot.roleId, score: null, locked: false, vacant: true });
    }
  });

  return { assignments, globalScore };
}

function isSwappable(a) {
  return a.slotId && a.candidateId && !a.locked;
}

export function localSearch(assignments, scoreMatrix, opts = {}) {
  const minScore = opts.minScore ?? 55;
  const maxIter = opts.maxIterations ?? 100;

  let current = assignments.map(a => ({ ...a }));
  const sumScore = (arr) => arr.reduce((s, a) => s + (a.score?.total || 0), 0);
  let best = sumScore(current);

  let improved = true;
  let iter = 0;
  while (improved && iter < maxIter) {
    improved = false;
    iter++;

    for (let i = 0; i < current.length; i++) {
      const a = current[i];
      if (!isSwappable(a)) continue;

      for (let j = i + 1; j < current.length; j++) {
        const b = current[j];
        if (!isSwappable(b)) continue;
        if (a.roleId === b.roleId) continue;

        const sAonB = scoreMatrix.get(a.candidateId)?.get(b.roleId)?.total || 0;
        const sBonA = scoreMatrix.get(b.candidateId)?.get(a.roleId)?.total || 0;
        if (sAonB < minScore || sBonA < minScore) continue;

        const gain = (sAonB + sBonA) - (a.score.total + b.score.total);
        if (gain > 0.5) {
          const tmpA = { slotId: a.slotId, roleId: a.roleId, score: a.score };
          a.slotId = b.slotId; a.roleId = b.roleId;
          a.score = scoreMatrix.get(a.candidateId)?.get(a.roleId) || null;
          b.slotId = tmpA.slotId; b.roleId = tmpA.roleId;
          b.score = scoreMatrix.get(b.candidateId)?.get(b.roleId) || null;
          best += gain;
          improved = true;
        }
      }
    }

    for (let i = 0; i < current.length && !improved; i++) {
      const a = current[i];
      if (!isSwappable(a)) continue;

      for (let j = 0; j < current.length; j++) {
        if (j === i) continue;
        const b = current[j];
        if (!isSwappable(b)) continue;

        for (let k = 0; k < current.length; k++) {
          if (k === i || k === j) continue;
          const c = current[k];
          if (!isSwappable(c)) continue;

          const sAonB = scoreMatrix.get(a.candidateId)?.get(b.roleId)?.total || 0;
          const sBonC = scoreMatrix.get(b.candidateId)?.get(c.roleId)?.total || 0;
          const sConA = scoreMatrix.get(c.candidateId)?.get(a.roleId)?.total || 0;
          if (sAonB < minScore || sBonC < minScore || sConA < minScore) continue;

          const gain = (sAonB + sBonC + sConA) - (a.score.total + b.score.total + c.score.total);
          if (gain > 0.5) {
            const origA = { slotId: a.slotId, roleId: a.roleId };
            const origB = { slotId: b.slotId, roleId: b.roleId };
            const origC = { slotId: c.slotId, roleId: c.roleId };

            a.slotId = origB.slotId; a.roleId = origB.roleId;
            a.score = scoreMatrix.get(a.candidateId)?.get(a.roleId) || null;

            b.slotId = origC.slotId; b.roleId = origC.roleId;
            b.score = scoreMatrix.get(b.candidateId)?.get(b.roleId) || null;

            c.slotId = origA.slotId; c.roleId = origA.roleId;
            c.score = scoreMatrix.get(c.candidateId)?.get(c.roleId) || null;

            best += gain;
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  return { assignments: current, globalScore: best };
}

/**
 * Hongrois + recherche locale.
 * @param {object} [opts]  { minScore, lockedPairs, catalog }
 */
export function runSolver(candidates, capacities, scoreMatrix, opts = {}) {
  const slots = buildSlots(capacities, opts.catalog);
  const { assignments } = solveAssignment(candidates, slots, scoreMatrix, opts);
  return localSearch(assignments, scoreMatrix, opts);
}
