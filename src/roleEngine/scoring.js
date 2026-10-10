import {
  DEFAULT_WEIGHTS, DEFAULT_PENALTIES, DEFAULT_SUCCESSION, DEFAULT_MIN_SCORE,
  DEFAULT_FORMATION_AFFINITY, resolveCatalog, getCatalogRoles,
} from './config.js';
import { levelKind } from '../core/catalog.js';
import { parseRoleLabel } from './roles.js';
import { normalizeKey } from './normalizer.js';
import { signalStrength, detectContradictions } from './signals.js';
import { DEFAULT_CONSTRAINTS, evaluateConstraints } from './constraints.js';

/**
 * Construit un candidat à partir d'une ligne CSV brute et des champs parsés.
 * Les choix sont convertis en ids de rôles du catalogue (non reconnus → ignorés).
 * @param {object} rawRow
 * @param {object} parsed
 * @param {object} [catalog]  défaut : catalogue actif
 */
export function buildCandidate(rawRow, parsed, catalog) {
  const cat = resolveCatalog(catalog);
  const id = parsed.id;
  const dedup = parsed._dedupChoices || [];
  const choices = dedup.map(c => parseRoleLabel(c, cat)).filter(Boolean);

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

  candidate.contradictions = detectContradictions(candidate, cat);
  return candidate;
}

/**
 * Rang du rôle dans les vœux du candidat : 1..3, 'discover' (rôle évoqué dans
 * « à découvrir »), ou null.
 * NB : l'heuristique 'discover' compare le 1er mot du LIBELLÉ du rôle au texte
 * libre ; elle dépend donc du libellé courant (les ids, eux, sont stables).
 */
export function getChoiceRank(candidate, roleId, catalog) {
  const idx = (candidate.choices || []).indexOf(roleId);
  if (idx === -1) {
    const disc = normalizeKey(candidate.discoverText || '');
    const role = resolveCatalog(catalog).roles?.[roleId];
    if (role && disc.includes(normalizeKey(role.label).split(' ')[0])) return 'discover';
    return null;
  }
  return idx + 1;
}

function computeP(rank) {
  if (rank === 1) return 1.0;
  if (rank === 2) return 0.7;
  if (rank === 3) return 0.45;
  if (rank === 'discover') return 0.5;
  return 0;
}

function computeD(candidate, role, cat) {
  const exigence = cat.levels?.[role.level]?.requirement ?? 0.3;
  return Math.min(1, candidate.availability / Math.max(0.01, exigence));
}

function computeE(candidate, kind) {
  const expSignal = signalStrength(candidate.signals, 'experience');
  const yearScore = { 'BUT 1': 0.2, 'BUT 2': 0.5, 'BUT 3': 0.8, 'Master': 1.0 }[candidate.year] ?? 0.3;
  const isJunior = candidate.year === 'BUT 1';
  const isSenior = kind === 'bureau';
  const yearPenalty = isJunior && isSenior ? 0.3 : 0;
  if (kind === 'membre') {
    return Math.max(0.3, Math.min(1, 0.4 + expSignal * 0.6 + yearScore * 0.2));
  }
  return Math.max(0, Math.min(1, expSignal * 0.7 + yearScore * 0.5 - yearPenalty));
}

function computeA(candidate, kind) {
  const amb = signalStrength(candidate.signals, 'ambition');
  const ret = signalStrength(candidate.signals, 'retrait');
  if (kind === 'bureau' || kind === 'responsable') {
    return Math.max(0, Math.min(1, 0.3 + amb * 0.7 - ret * 0.5));
  }
  if (kind === 'adjoint') return 0.6 + amb * 0.2 - ret * 0.2;
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

/** Affinité formation ↔ pôle (pole.affinity ; formation absente → 0.5). */
function computeF(candidate, role, cat) {
  const affinity = cat.poles?.[role.pole]?.affinity || {};
  const formation = candidate.formation || '';
  if (typeof affinity[formation] === 'number') return affinity[formation];
  // Tolérance casse / accents ("infocom" ≈ "InfoCOM")
  const fk = normalizeKey(formation);
  if (fk) {
    const key = Object.keys(affinity).find(k => normalizeKey(k) === fk);
    if (key && typeof affinity[key] === 'number') return affinity[key];
  }
  return DEFAULT_FORMATION_AFFINITY;
}

const EMPTY_BREAKDOWN = (total, reason) => ({
  total, raw: total,
  P: 0, D: 0, E: 0, A: 0, M: 0, F: 0,
  penalty: 0,
  penaltyReasons: reason ? [reason] : [],
  rank: null,
  constraintApplied: true,
});

/**
 * Score S (0..100) d'un candidat sur un rôle.
 * Le comportement par niveau (bureau / responsable / adjoint / membre) suit
 * `levelKind(catalog, role.level)` : un niveau personnalisé de type
 * 'responsable' est donc traité exactement comme « Responsable ».
 */
export function computeScore(candidate, role, weights = DEFAULT_WEIGHTS, penalties = DEFAULT_PENALTIES, constraints = DEFAULT_CONSTRAINTS, catalog) {
  const cat = resolveCatalog(catalog);
  const constraintResult = evaluateConstraints(candidate, role, constraints, cat);
  const rank = getChoiceRank(candidate, role.id, cat);

  if (constraintResult.action === 'force') {
    return { ...EMPTY_BREAKDOWN(constraintResult.score), rank, penaltyReasons: [constraintResult.reason], constraintApplied: true };
  }
  if (constraintResult.action === 'block') {
    return { ...EMPTY_BREAKDOWN(0), rank, penaltyReasons: [constraintResult.reason], constraintApplied: true };
  }

  const kind = levelKind(cat, role.level);
  const isLeadership = kind === 'bureau' || kind === 'responsable';

  const P = computeP(rank);
  const D = computeD(candidate, role, cat);
  const E = computeE(candidate, kind);
  const A = computeA(candidate, kind);
  const M = computeM(candidate);
  const F = computeF(candidate, role, cat);

  let raw = 100 * (weights.P * P + weights.D * D + weights.E * E + weights.A * A + weights.M * M + weights.F * F);

  const penaltyReasons = [];
  let penalty = 0;

  if (candidate.alternance && kind === 'bureau') {
    penalty += penalties.alternanceOnBureau;
    penaltyReasons.push(`Alternance + poste Bureau (−${penalties.alternanceOnBureau})`);
  } else if (candidate.alternance && kind === 'responsable') {
    penalty += penalties.alternanceOnResponsable;
    penaltyReasons.push(`Alternance + poste Responsable (−${penalties.alternanceOnResponsable})`);
  }

  if (candidate.availability <= 0.4 && isLeadership) {
    penalty += penalties.lowAvailabilityOnLeadership;
    penaltyReasons.push(`Disponibilité faible sur poste exigeant (−${penalties.lowAvailabilityOnLeadership})`);
  }

  if (candidate.contradictions.length > 0) {
    penalty += penalties.contradiction * candidate.contradictions.length;
    penaltyReasons.push(`Contradiction détectée (−${penalties.contradiction * candidate.contradictions.length})`);
  }

  if (P === 0 && kind !== 'membre') {
    penalty += penalties.nonRequested;
    penaltyReasons.push(`Poste non demandé (−${penalties.nonRequested})`);
  }

  if (DEFAULT_SUCCESSION.enabled) {
    const isJunior = candidate.year === 'BUT 1' || candidate.year === 'BUT 2';
    // 'vice_president' : id historique du catalogue par défaut (ignoré s'il a été supprimé)
    const isAdjointRole = kind === 'adjoint' || role.id === 'vice_president';
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
    rank,
    constraintApplied: constraintResult.action !== null,
  };
}

/**
 * Matrice des scores : Map<candidateId, Map<roleId, ScoreBreakdown>>.
 * @param {object[]} candidates
 * @param {object[]|null} roles  rôles à évaluer (null → tous les rôles du catalogue)
 * @param {object} weights
 * @param {object} penalties
 * @param {object} [constraints]
 * @param {object} [catalog]     défaut : catalogue actif
 */
export function buildScoreMatrix(candidates, roles, weights = DEFAULT_WEIGHTS, penalties = DEFAULT_PENALTIES, constraints = DEFAULT_CONSTRAINTS, catalog) {
  const cat = resolveCatalog(catalog);
  const roleList = roles || getCatalogRoles(cat);
  const matrix = new Map();
  candidates.forEach(c => {
    const byRole = new Map();
    roleList.forEach(r => {
      byRole.set(r.id, computeScore(c, r, weights, penalties, constraints, cat));
    });
    matrix.set(c.id, byRole);
  });
  return matrix;
}

export { DEFAULT_MIN_SCORE };
