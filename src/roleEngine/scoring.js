import {
  DEFAULT_WEIGHTS, DEFAULT_PENALTIES, LEVEL_REQUIREMENT,
  FORMATION_AFFINITY, DEFAULT_SUCCESSION, DEFAULT_MIN_SCORE,
} from './config.js';
import { getRole, parseRoleLabel } from './roles.js';
import { normalizeKey } from './normalizer.js';
import { signalStrength, detectContradictions } from './signals.js';
import { DEFAULT_CONSTRAINTS, evaluateConstraints } from './constraints.js';

export function buildCandidate(rawRow, parsed) {
  const id = parsed.id;
  const dedup = parsed._dedupChoices || [];
  const choices = dedup.map(c => parseRoleLabel(c)).filter(Boolean);

  const candidate = {
    id,
    displayName: parsed.displayName,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    phone: rawRow.phone || '',
    email: rawRow.email || '',
    formation: rawRow.formation || '',
    alternance: /oui/i.test(rawRow.alternance || ''),
    year: rawRow.year || '',
    choices, rawChoices: dedup,
    whyText: rawRow.whyText || '',
    discoverText: rawRow.discoverText || '',
    contributeText: rawRow.contributeText || '',
    availability: parsed.availability.value,
    availabilityLabel: parsed.availability.label,
    swissKnife: parsed.swissKnife.value,
    swissKnifeLabel: parsed.swissKnife.label,
    submittedAt: parsed.submittedAt,
    signals: parsed.signals,
  };

  candidate.contradictions = detectContradictions(candidate);
  return candidate;
}

export function getChoiceRank(candidate, roleId) {
  const idx = candidate.choices.indexOf(roleId);
  if (idx === -1) {
    const disc = normalizeKey(candidate.discoverText || '');
    const role = getRole(roleId);
    if (role && disc.includes(normalizeKey(role.label).split(' ')[0])) return 'discover';
    return null;
  }
  return idx + 1;
}

function computeP(candidate, roleId) {
  const rank = getChoiceRank(candidate, roleId);
  if (rank === 1) return 1.0;
  if (rank === 2) return 0.7;
  if (rank === 3) return 0.45;
  if (rank === 'discover') return 0.5;
  return 0;
}

function computeD(candidate, role) {
  const exigence = LEVEL_REQUIREMENT[role.level] ?? 0.3;
  return Math.min(1, candidate.availability / Math.max(0.01, exigence));
}

function computeE(candidate, role) {
  const expSignal = signalStrength(candidate.signals, 'experience');
  const yearScore = { 'BUT 1': 0.2, 'BUT 2': 0.5, 'BUT 3': 0.8, 'Master': 1.0 }[candidate.year] ?? 0.3;
  const isJunior = candidate.year === 'BUT 1';
  const isSenior = role.level === 'bureau';
  const yearPenalty = isJunior && isSenior ? 0.3 : 0;
  if (role.level === 'membre') {
    return Math.max(0.3, Math.min(1, 0.4 + expSignal * 0.6 + yearScore * 0.2));
  }
  return Math.max(0, Math.min(1, expSignal * 0.7 + yearScore * 0.5 - yearPenalty));
}

function computeA(candidate, role) {
  const amb = signalStrength(candidate.signals, 'ambition');
  const ret = signalStrength(candidate.signals, 'retrait');
  if (role.level === 'bureau' || role.level === 'responsable') {
    return Math.max(0, Math.min(1, 0.3 + amb * 0.7 - ret * 0.5));
  }
  if (role.level === 'adjoint') return 0.6 + amb * 0.2 - ret * 0.2;
  return 0.7 - amb * 0.1 + ret * 0.2;
}

function computeM(candidate) {
  let score = 0;
  const whyLen = (candidate.whyText || '').trim().length;
  const contLen = (candidate.contributeText || '').trim().length;
  if (whyLen > 20) score += 0.35;
  if (whyLen > 80) score += 0.15;
  if (contLen > 20) score += 0.25;
  if (candidate.signals.length >= 2) score += 0.15;
  if (candidate.signals.some(s => s.type === 'role_pricis')) score += 0.10;
  return Math.min(1, score);
}

function computeF(candidate, role) {
  const map = FORMATION_AFFINITY[candidate.formation] || FORMATION_AFFINITY.default;
  return map[role.pole] ?? 0.5;
}

const EMPTY_BREAKDOWN = (total, reason) => ({
  total, raw: total,
  P: 0, D: 0, E: 0, A: 0, M: 0, F: 0,
  penalty: 0,
  penaltyReasons: reason ? [reason] : [],
  rank: null,
  constraintApplied: true,
});

export function computeScore(candidate, role, weights = DEFAULT_WEIGHTS, penalties = DEFAULT_PENALTIES, constraints = DEFAULT_CONSTRAINTS) {
  const constraintResult = evaluateConstraints(candidate, role, constraints);

  if (constraintResult.action === 'force') {
    return { ...EMPTY_BREAKDOWN(constraints.forceScore), rank: getChoiceRank(candidate, role.id), penaltyReasons: [constraintResult.reason], constraintApplied: true };
  }
  if (constraintResult.action === 'block') {
    return { ...EMPTY_BREAKDOWN(0), rank: getChoiceRank(candidate, role.id), penaltyReasons: [constraintResult.reason], constraintApplied: true };
  }

  const P = computeP(candidate, role.id);
  const D = computeD(candidate, role);
  const E = computeE(candidate, role);
  const A = computeA(candidate, role);
  const M = computeM(candidate);
  const F = computeF(candidate, role);

  let raw = 100 * (weights.P * P + weights.D * D + weights.E * E + weights.A * A + weights.M * M + weights.F * F);

  const penaltyReasons = [];
  let penalty = 0;

  if (candidate.alternance && role.level === 'bureau') {
    penalty += penalties.alternanceOnBureau;
    penaltyReasons.push(`Alternance + poste Bureau (−${penalties.alternanceOnBureau})`);
  } else if (candidate.alternance && role.level === 'responsable') {
    penalty += penalties.alternanceOnResponsable;
    penaltyReasons.push(`Alternance + poste Responsable (−${penalties.alternanceOnResponsable})`);
  }

  if (candidate.availability <= 0.4 && (role.level === 'bureau' || role.level === 'responsable')) {
    penalty += penalties.lowAvailabilityOnLeadership;
    penaltyReasons.push(`Disponibilité faible sur poste exigeant (−${penalties.lowAvailabilityOnLeadership})`);
  }

  if (candidate.contradictions.length > 0) {
    penalty += penalties.contradiction * candidate.contradictions.length;
    penaltyReasons.push(`Contradiction détectée (−${penalties.contradiction * candidate.contradictions.length})`);
  }

  if (P === 0 && role.level !== 'membre') {
    penalty += penalties.nonRequested;
    penaltyReasons.push(`Poste non demandé (−${penalties.nonRequested})`);
  }

  if (DEFAULT_SUCCESSION.enabled) {
    const isJunior = candidate.year === 'BUT 1' || candidate.year === 'BUT 2';
    const isAdjointRole = role.level === 'adjoint' || role.id === 'vice_president';
    if (isJunior && isAdjointRole) {
      raw += DEFAULT_SUCCESSION.boostJuniorAdjoint;
      penaltyReasons.push(`Bonus succession junior sur adjoint (+${DEFAULT_SUCCESSION.boostJuniorAdjoint})`);
    }
  }

  if (constraintResult.action === 'bonus') {
    raw += constraintResult.bonus;
    penaltyReasons.push(constraintResult.reason);
  }

  const total = Math.max(0, Math.min(100, raw - penalty));
  return {
    total, raw, P, D, E, A, M, F,
    penalty, penaltyReasons,
    rank: getChoiceRank(candidate, role.id),
    constraintApplied: constraintResult.action !== null,
  };
}

export function buildScoreMatrix(candidates, roles, weights, penalties, constraints = DEFAULT_CONSTRAINTS) {
  const matrix = new Map();
  candidates.forEach(c => {
    const byRole = new Map();
    roles.forEach(r => {
      byRole.set(r.id, computeScore(c, r, weights, penalties, constraints));
    });
    matrix.set(c.id, byRole);
  });
  return matrix;
}

export { DEFAULT_MIN_SCORE };