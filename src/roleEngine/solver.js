import { ROLE_CATALOG } from './config.js';
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

export function solveAssignment(candidates, slots, scoreMatrix, opts = {}) {
  const minScore = opts.minScore ?? 55;
  const lockedPairs = opts.lockedPairs ?? new Set();

  const N = candidates.length;
  const M = slots.length;
  const size = N + M;
  const cost = Array.from({ length: size }, () => new Float64Array(size));

  for (let i = 0; i < N; i++) {
    const c = candidates[i];
    const byRole = scoreMatrix.get(c.id);
    for (let j = 0; j < M; j++) {
      const slot = slots[j];
      const roleId = slot.roleId;
      const sb = byRole.get(roleId);
      const score = sb ? sb.total : 0;

      const key = `${c.id}:${slot.id}`;
      if (lockedPairs.has(key)) { cost[i][j] = -1; continue; }

      let blockedByLock = false;
      for (const lp of lockedPairs) {
        const [lockedCid, lockedSid] = lp.split(':');
        if (lockedSid === slot.id && lockedCid !== c.id) { blockedByLock = true; break; }
      }
      if (blockedByLock) { cost[i][j] = INELIGIBLE_COST; continue; }

      let candidateLocked = false;
      for (const lp of lockedPairs) {
        const [lockedCid] = lp.split(':');
        if (lockedCid === c.id) { candidateLocked = true; break; }
      }
      if (candidateLocked) { cost[i][j] = INELIGIBLE_COST; continue; }

      cost[i][j] = score >= minScore ? (100 - score) : INELIGIBLE_COST;
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = M; j < size; j++) {
      let candidateLocked = false;
      for (const lp of lockedPairs) {
        const [lockedCid] = lp.split(':');
        if (lockedCid === candidates[i].id) { candidateLocked = true; break; }
      }
      cost[i][j] = candidateLocked ? INELIGIBLE_COST : NOT_ASSIGNED_COST;
    }
  }

  for (let i = N; i < size; i++) {
    for (let j = 0; j < M; j++) {
      let blockedByLock = false;
      for (const lp of lockedPairs) {
        const [, lockedSid] = lp.split(':');
        if (lockedSid === slots[j].id) { blockedByLock = true; break; }
      }
      cost[i][j] = blockedByLock ? INELIGIBLE_COST : VACANT_SLOT_COST;
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
      const byRole = scoreMatrix.get(c.id);
      const score = byRole.get(slot.roleId) || null;
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
  const lockedPairs = opts.lockedPairs ?? new Set();
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

export function runSolver(candidates, capacities, scoreMatrix, opts = {}) {
  const slots = buildSlots(capacities);
  const { assignments, globalScore } = solveAssignment(candidates, slots, scoreMatrix, opts);
  return localSearch(assignments, scoreMatrix, opts);
}

export { ROLE_CATALOG };