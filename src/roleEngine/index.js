import { parseResponses } from './parser.js';
import {
  normalizeDisplay, parseName, parseAvailability, parseSwissKnife,
  hashString, parseTimestamp,
} from './normalizer.js';
import { buildCandidate } from './scoring.js';
import { extractSignals } from './signals.js';
import {
  ROLE_CATALOG, DEFAULT_CAPACITIES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE,
} from './config.js';
import { runScenario, compareScenarios, SCENARIO_PRESETS, computePoleTargets } from './scenarios.js';
import { analyzeStability, detectBlockingPairs, sensitivityAnalysis } from './stability.js';
import { detectAlerts, groupAlerts, computeHealthScore } from './alerts.js';
import { explainAssignment, explainVacant, generateScenarioReport, generateMemberCard } from './explain.js';
import { DEFAULT_CONSTRAINTS } from './constraints.js';

export function importResponses(csvText) {
  const { candidates: rawCandidates, report } = parseResponses(csvText);
  const candidates = rawCandidates.map(({ _raw, _dedupChoices }) => {
    const displayName = normalizeDisplay(_raw.fullName);
    const { firstName, lastName } = parseName(displayName);
    const email = (_raw.email || '').trim();
    const id = email ? hashString(email.toLowerCase()) : hashString(displayName.toLowerCase());
    const signals = extractSignals(_raw);
    const parsed = {
      id, displayName, firstName, lastName,
      availability: parseAvailability(_raw.availabilityRaw),
      swissKnife: parseSwissKnife(_raw.swissKnifeRaw),
      submittedAt: parseTimestamp(_raw.timestamp),
      signals, _dedupChoices,
    };
    return buildCandidate(_raw, parsed);
  });
  return { candidates, report };
}

export function computeAssignments(candidates, opts = {}) {
  const {
    capacities = DEFAULT_CAPACITIES,
    weights = DEFAULT_WEIGHTS,
    penalties = DEFAULT_PENALTIES,
    minScore = DEFAULT_MIN_SCORE,
    lockedPairs = new Set(),
    poleTargets = undefined,
    constraints = DEFAULT_CONSTRAINTS,
    scenarioName = 'Personnalisé',
    scenarioDescription = '',
  } = opts;
  return runScenario({
    candidates, capacities, weights, penalties, poleTargets,
    minScore, lockedPairs, constraints,
    scenarioName, scenarioDescription,
  });
}

export function compareAllScenarios(candidates, opts = {}) {
  const {
    capacities = DEFAULT_CAPACITIES,
    minScore = DEFAULT_MIN_SCORE,
    lockedPairs = new Set(),
    constraints = DEFAULT_CONSTRAINTS,
  } = opts;
  return compareScenarios({ candidates, capacities, minScore, lockedPairs, constraints });
}

export function checkStability(candidates, opts = {}) {
  const {
    capacities = DEFAULT_CAPACITIES,
    weights = DEFAULT_WEIGHTS,
    penalties = DEFAULT_PENALTIES,
    iterations = 200, jitter = 0.20, seed = 0xBDE_2026,
    minScore = DEFAULT_MIN_SCORE,
    lockedPairs = new Set(),
    constraints = DEFAULT_CONSTRAINTS,
  } = opts;
  return analyzeStability({
    candidates, capacities, weights, penalties,
    iterations, jitter, seed, minScore, lockedPairs, constraints,
  });
}

export { detectBlockingPairs, sensitivityAnalysis };
export { detectAlerts, groupAlerts, computeHealthScore };
export { explainAssignment, explainVacant, generateScenarioReport, generateMemberCard };
export { computePoleTargets, SCENARIO_PRESETS };
export { ROLE_CATALOG, DEFAULT_CAPACITIES, DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_MIN_SCORE, DEFAULT_CONSTRAINTS };

export function runFullPipeline(csvText, opts = {}) {
  const { candidates, report } = importResponses(csvText);
  const { scenarios, ranking } = compareAllScenarios(candidates, opts);
  const best = scenarios.find(s => s.name === ranking.bestAvg) || scenarios[0];
  const stability = checkStability(candidates, { ...opts });
  return {
    candidates, importReport: report, scenarios, ranking, best, stability,
    reports: scenarios.map(s => ({
      name: s.name,
      text: generateScenarioReport(s, candidates),
      healthScore: computeHealthScore(s.alerts, candidates.length),
    })),
  };
}

export function whatIf({ candidates, baseline, change, opts = {} }) {
  const merged = {
    capacities: change.capacities || opts.capacities || DEFAULT_CAPACITIES,
    weights: change.weights || opts.weights || DEFAULT_WEIGHTS,
    penalties: change.penalties || opts.penalties || DEFAULT_PENALTIES,
    minScore: opts.minScore || DEFAULT_MIN_SCORE,
    lockedPairs: change.lockedPairs || opts.lockedPairs || new Set(),
    constraints: change.constraints || opts.constraints || DEFAULT_CONSTRAINTS,
  };
  const after = computeAssignments(candidates, merged);

  const beforeMap = new Map();
  baseline.assignments.forEach(a => { if (a.candidateId) beforeMap.set(a.candidateId, a.roleId); });
  const afterMap = new Map();
  after.assignments.forEach(a => { if (a.candidateId) afterMap.set(a.candidateId, a.roleId); });

  const moved = [];
  const allIds = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  allIds.forEach(cid => {
    const b = beforeMap.get(cid);
    const a = afterMap.get(cid);
    if (b !== a) moved.push({ candidateId: cid, from: b, to: a });
  });

  const newAlerts = after.alerts.filter(a => !baseline.alerts.some(b => b.code === a.code));
  const resolvedAlerts = baseline.alerts.filter(b => !after.alerts.some(a => a.code === b.code));

  return {
    before: baseline, after,
    diff: {
      moved,
      scoreDiff: after.globalScore - baseline.globalScore,
      avgDiff: after.avgSatisfaction - baseline.avgSatisfaction,
      worstDiff: after.worstSatisfaction - baseline.worstSatisfaction,
      newAlerts, resolvedAlerts,
    },
  };
}