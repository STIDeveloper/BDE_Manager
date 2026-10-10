import { normalizeKey } from './normalizer.js';
import { resolveCatalog } from './config.js';
import { levelRank, roleLabelIn } from '../core/catalog.js';

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

/**
 * Évalue les contraintes manuelles d'un candidat sur un rôle.
 * Les références pendantes (rôle ou niveau absent du catalogue) sont
 * IGNORÉES : une contrainte vers un rôle supprimé ne bloque jamais un candidat.
 * Le plafond de niveau (maxLevels) compare les rangs hiérarchiques via
 * levelRank(catalog, levelId) (plus haut = plus élevé).
 * @param {import('./types.js').Candidate} candidate
 * @param {{id:string, level:string}} role
 * @param {object} [constraints]
 * @param {object} [catalog]  défaut : catalogue actif
 * @returns {{action:'force'|'block'|'bonus'|null, score?:number, bonus?:number, reason?:string}}
 */
export function evaluateConstraints(candidate, role, constraints = DEFAULT_CONSTRAINTS, catalog) {
  const cat = resolveCatalog(catalog);
  const c = constraints || DEFAULT_CONSTRAINTS;
  const forceScore = c.forceScore ?? DEFAULT_CONSTRAINTS.forceScore;
  const preferredBonus = c.preferredBonus ?? DEFAULT_CONSTRAINTS.preferredBonus;

  const forcedKey = findConstraintKey(candidate, c.forcedRoles);
  if (forcedKey) {
    const forcedRoleId = c.forcedRoles[forcedKey];
    // Rôle forcé inexistant → contrainte ignorée (sinon le candidat serait inplaçable)
    if (cat.roles?.[forcedRoleId]) {
      if (forcedRoleId === role.id) {
        return { action: 'force', score: forceScore, reason: `Placement prioritaire : ${forcedKey}` };
      }
      return { action: 'block', score: 0, reason: `Rôle verrouillé sur ${roleLabelIn(cat, forcedRoleId)}` };
    }
  }

  const maxKey = findConstraintKey(candidate, c.maxLevels);
  if (maxKey) {
    const maxLvl = c.maxLevels[maxKey];
    // Niveau plafond inexistant → contrainte ignorée
    if (cat.levels?.[maxLvl]) {
      const maxRank = levelRank(cat, maxLvl);
      const roleRank = levelRank(cat, role.level);
      if (roleRank > maxRank) {
        const lvlLabel = cat.levels[maxLvl].label || maxLvl;
        return { action: 'block', score: 0, reason: `Niveau plafonné à "${lvlLabel}"` };
      }
    }
  }

  const forbKey = findConstraintKey(candidate, c.forbiddenRoles);
  if (forbKey) {
    const list = Array.isArray(c.forbiddenRoles[forbKey]) ? c.forbiddenRoles[forbKey] : [];
    if (list.includes(role.id)) {
      return { action: 'block', score: 0, reason: `Rôle interdit` };
    }
  }

  const prefKey = findConstraintKey(candidate, c.preferredRoles);
  if (prefKey && c.preferredRoles[prefKey] === role.id) {
    return { action: 'bonus', bonus: preferredBonus, reason: `Rôle préféré (+${preferredBonus})` };
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