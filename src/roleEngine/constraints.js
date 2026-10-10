import { normalizeKey } from './normalizer.js';

// ============================================================
// Contraintes par défaut — VIDES
// ============================================================
export const DEFAULT_CONSTRAINTS = {
  forcedRoles: {},
  maxLevels: {},
  forbiddenRoles: {},
  preferredRoles: {},
  forceScore: 100,
  preferredBonus: 8,
  forbiddenPenalty: 100,
};

// Preset BDE IUT Montreuil — proposé en un clic dans l'UI
export const BDE_MONTREUIL_PRESET = {
  forcedRoles: {
    'kenzo': 'president',
    'bilal': 'tresorier',
    'marchetti': 'responsable_communication',
  },
  maxLevels: {
    'ferrandi': 'membre',
  },
  forbiddenRoles: {},
  preferredRoles: {
    'hachemi': 'membre_esport',
    'valentin': 'responsable_communication',
  },
  forceScore: 100,
  preferredBonus: 8,
  forbiddenPenalty: 100,
};

const LEVEL_ORDER = { membre: 1, adjoint: 2, responsable: 3, bureau: 4 };

export function findConstraintKey(candidate, dict) {
  if (!dict) return null;
  const keys = Object.keys(dict);
  if (keys.length === 0) return null;

  const cFirst = normalizeKey(candidate.firstName || '');
  const cLast = normalizeKey(candidate.lastName || '');
  const cFull = normalizeKey(candidate.displayName || '');

  for (const key of keys) {
    const k = normalizeKey(key);
    if (!k) continue;
    if (
      cFirst === k || cFirst.startsWith(k) ||
      cLast === k || cLast.startsWith(k) ||
      cFull.includes(k)
    ) {
      return key;
    }
  }
  return null;
}

export function evaluateConstraints(candidate, role, constraints = DEFAULT_CONSTRAINTS) {
  const forcedKey = findConstraintKey(candidate, constraints.forcedRoles);
  if (forcedKey) {
    const forcedRoleId = constraints.forcedRoles[forcedKey];
    if (forcedRoleId === role.id) {
      return { action: 'force', score: constraints.forceScore, reason: `Placement prioritaire : ${forcedKey}` };
    }
    return { action: 'block', score: 0, reason: `Rôle verrouillé sur ${forcedRoleId}` };
  }

  const maxKey = findConstraintKey(candidate, constraints.maxLevels);
  if (maxKey) {
    const maxLvl = constraints.maxLevels[maxKey];
    const maxOrder = LEVEL_ORDER[maxLvl] || 0;
    const roleOrder = LEVEL_ORDER[role.level] || 0;
    if (roleOrder > maxOrder) {
      return { action: 'block', score: 0, reason: `Niveau plafonné à "${maxLvl}"` };
    }
  }

  const forbKey = findConstraintKey(candidate, constraints.forbiddenRoles);
  if (forbKey) {
    const list = constraints.forbiddenRoles[forbKey] || [];
    if (list.includes(role.id)) {
      return { action: 'block', score: 0, reason: `Rôle interdit` };
    }
  }

  const prefKey = findConstraintKey(candidate, constraints.preferredRoles);
  if (prefKey && constraints.preferredRoles[prefKey] === role.id) {
    return { action: 'bonus', bonus: constraints.preferredBonus, reason: `Rôle préféré (+${constraints.preferredBonus})` };
  }

  return { action: null };
}

export function countConstraints(constraints = DEFAULT_CONSTRAINTS) {
  return (
    Object.keys(constraints.forcedRoles || {}).length +
    Object.keys(constraints.maxLevels || {}).length +
    Object.keys(constraints.forbiddenRoles || {}).length +
    Object.keys(constraints.preferredRoles || {}).length
  );
}