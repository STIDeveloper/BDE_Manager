// ============================================================
// GESTION DES RÔLES — helpers PURS (aucune dépendance React / Zustand)
// ============================================================
// Testés sous Node (helpers.test.js). Les composants n'y mettent que de la
// logique de calcul : impact d'une suppression, réordonnancement, import…

import { normalizeCatalog, CATALOG_LIMITS } from '../../../core/catalog.js';

/** "1 rôle" / "3 rôles" (en français, 0 et 1 sont au singulier). */
export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

/** Nombre au format français (0,5 → "0,5"). */
export function formatDecimal(n, digits = 1) {
  return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: digits });
}

// ------------------------------------------------------------
// RÉORDONNANCEMENT
// ------------------------------------------------------------

/**
 * Déplace `dragId` avant/après `targetId` dans `ids` (glisser-déposer).
 * Retourne la liste inchangée (même référence) si le déplacement est impossible.
 */
export function reorderIds(ids, dragId, targetId, position = 'before') {
  if (!Array.isArray(ids) || dragId === targetId) return ids;
  if (!ids.includes(dragId) || !ids.includes(targetId)) return ids;
  const rest = ids.filter(id => id !== dragId);
  let to = rest.indexOf(targetId);
  if (position === 'after') to += 1;
  rest.splice(to, 0, dragId);
  return sameOrder(rest, ids) ? ids : rest;
}

export function sameOrder(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// ------------------------------------------------------------
// NOMS AFFICHÉS
// ------------------------------------------------------------

export function memberDisplayName(m) {
  return [m?.firstName, m?.lastName].filter(Boolean).join(' ').trim() || 'Membre sans nom';
}

export function candidateDisplayName(c) {
  if (!c) return 'Candidat inconnu';
  return c.displayName || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Candidat sans nom';
}

// ------------------------------------------------------------
// STATISTIQUES D'USAGE DES RÔLES
// ------------------------------------------------------------

const EMPTY_REFS = Object.freeze({ forced: [], preferred: [], forbidden: [] });
const EMPTY_ASSIGN = Object.freeze({ assigned: [], vacant: 0 });

/**
 * Calcule, pour chaque rôle, tout ce qui l'utilise dans l'application.
 * @param {{members?:object[], rolePresets?:object, candidates?:object[], constraints?:object, scenario?:object|null}} src
 */
export function computeUsage({ members = [], rolePresets = {}, candidates = [], constraints = {}, scenario = null } = {}) {
  // Membres actuels (rôle principal)
  const membersByRole = {};
  members.forEach(m => {
    if (m && m.mainRole) (membersByRole[m.mainRole] ||= []).push(m);
  });

  // Vœux des candidats (CSV) : rangs 1, 2, 3 + nombre total de candidats intéressés
  const choiceStats = {};
  candidates.forEach(c => {
    const seen = new Set();
    (c?.choices || []).forEach((roleId, idx) => {
      if (!roleId || seen.has(roleId)) return;
      seen.add(roleId);
      const s = (choiceStats[roleId] ||= { ranks: [0, 0, 0], total: 0 });
      if (idx < 3) s.ranks[idx]++;
      s.total++;
    });
  });

  // Presets Drive : nombre de dossiers par niveau
  const presetStats = {};
  Object.entries(rolePresets || {}).forEach(([roleId, preset]) => {
    const s = { reader: 0, commenter: 0, editor: 0, total: 0 };
    Object.values(preset || {}).forEach(level => {
      if (s[level] !== undefined) { s[level]++; s.total++; }
    });
    presetStats[roleId] = s;
  });

  // Contraintes du moteur qui citent le rôle
  const constraintRefs = {};
  const addRef = (roleId, kind, key) => {
    if (!roleId) return;
    const r = (constraintRefs[roleId] ||= { forced: [], preferred: [], forbidden: [] });
    r[kind].push(key);
  };
  Object.entries(constraints?.forcedRoles || {}).forEach(([key, roleId]) => addRef(roleId, 'forced', key));
  Object.entries(constraints?.preferredRoles || {}).forEach(([key, roleId]) => addRef(roleId, 'preferred', key));
  Object.entries(constraints?.forbiddenRoles || {}).forEach(([key, list]) => {
    (Array.isArray(list) ? list : []).forEach(roleId => addRef(roleId, 'forbidden', key));
  });

  // Affectation du scénario sélectionné
  const candidatesById = {};
  candidates.forEach(c => { if (c?.id) candidatesById[c.id] = c; });
  const assignmentsByRole = {};
  (scenario?.assignments || []).forEach(a => {
    if (!a || !a.roleId) return;
    const r = (assignmentsByRole[a.roleId] ||= { assigned: [], vacant: 0 });
    if (a.vacant || !a.candidateId) r.vacant++;
    else {
      r.assigned.push({
        candidateId: a.candidateId,
        slotId: a.slotId,
        score: a.score,
        name: candidateDisplayName(candidatesById[a.candidateId]),
      });
    }
  });

  return {
    membersByRole,
    choiceStats,
    presetStats,
    constraintRefs,
    assignmentsByRole,
    candidateCount: candidates.length,
    hasScenario: !!scenario,
    scenarioName: scenario?.name || null,
  };
}

/** Accès sûrs (valeurs vides par défaut). */
export const usageOf = {
  members: (usage, roleId) => usage?.membersByRole?.[roleId] || [],
  choices: (usage, roleId) => usage?.choiceStats?.[roleId] || { ranks: [0, 0, 0], total: 0 },
  preset: (usage, roleId) => usage?.presetStats?.[roleId] || null,
  refs: (usage, roleId) => usage?.constraintRefs?.[roleId] || EMPTY_REFS,
  assignment: (usage, roleId) => usage?.assignmentsByRole?.[roleId] || EMPTY_ASSIGN,
};

/**
 * Impact de la suppression d'un rôle (affiché AVANT confirmation).
 */
export function computeRoleImpact(roleId, usage) {
  const members = usageOf.members(usage, roleId);
  const choices = usageOf.choices(usage, roleId);
  const refs = usageOf.refs(usage, roleId);
  const asg = usageOf.assignment(usage, roleId);
  const impact = {
    memberCount: members.length,
    memberNames: members.map(m => (m.firstName || memberDisplayName(m)).trim()),
    presetFolders: usageOf.preset(usage, roleId)?.total || 0,
    candidateCount: choices.total,
    constraintCount: refs.forced.length + refs.preferred.length + refs.forbidden.length,
    constraintRefs: refs,
    assignedCount: asg.assigned.length,
  };
  impact.isUsed = impact.memberCount + impact.presetFolders + impact.candidateCount
    + impact.constraintCount + impact.assignedCount > 0;
  return impact;
}

// ------------------------------------------------------------
// TOTAUX / RÉSUMÉS
// ------------------------------------------------------------

export function catalogTotals(cat) {
  const roles = Object.values(cat?.roles || {});
  return {
    poles: Object.keys(cat?.poles || {}).length,
    levels: Object.keys(cat?.levels || {}).length,
    roles: roles.length,
    capacity: roles.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0),
  };
}

/** { poleId: { roleCount, capacity } } à partir de rolesByPole. */
export function poleSummaries(rolesByPole) {
  const out = {};
  Object.entries(rolesByPole || {}).forEach(([poleId, list]) => {
    out[poleId] = {
      roleCount: list.length,
      capacity: list.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0),
    };
  });
  return out;
}

/** { levelId: nombre de rôles } */
export function levelUsage(roles) {
  const out = {};
  Object.values(roles || {}).forEach(r => { out[r.level] = (out[r.level] || 0) + 1; });
  return out;
}

// ------------------------------------------------------------
// IMPORT / EXPORT / RÉINITIALISATION
// ------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

/** "BDE_Catalogue_2026-10-10.json" (date locale). */
export function catalogFileName(date = new Date()) {
  return `BDE_Catalogue_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Lit le texte d'un fichier catalogue (export de l'app ou JSON brut).
 * @returns {{ok:true, raw:object, catalog:object} | {ok:false, error:string}}
 */
export function parseCatalogText(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return { ok: false, error: 'Ce fichier n\'est pas un JSON valide.' };
  }
  const src = parsed && typeof parsed === 'object' && parsed.catalog && typeof parsed.catalog === 'object'
    ? parsed.catalog
    : parsed;
  if (!src || typeof src !== 'object' || !src.poles || !src.levels || !src.roles) {
    return { ok: false, error: 'Fichier invalide : un catalogue doit contenir « poles », « levels » et « roles ».' };
  }
  try {
    return { ok: true, raw: parsed, catalog: normalizeCatalog(src) };
  } catch (e) {
    return { ok: false, error: `Catalogue illisible : ${e.message}` };
  }
}

/**
 * Conséquences du remplacement du catalogue courant par `next`
 * (import ou réinitialisation) : mêmes règles que replaceCatalog().
 */
export function computeReplaceImpact(current, next, members = []) {
  const curRoles = current?.roles || {};
  const nextRoles = next?.roles || {};
  const detachedMembers = members.filter(m => m?.mainRole && curRoles[m.mainRole] && !nextRoles[m.mainRole]);
  return {
    totals: catalogTotals(next),
    removedRoles: Object.keys(curRoles).filter(id => !nextRoles[id]),
    addedRoles: Object.keys(nextRoles).filter(id => !curRoles[id]),
    keptRoles: Object.keys(nextRoles).filter(id => curRoles[id]),
    detachedMembers,
  };
}

// ------------------------------------------------------------
// ALIAS (noms alternatifs reconnus à l'import CSV)
// ------------------------------------------------------------

/** Forme comparable : minuscules, sans accents ni espaces superflus. */
export function normalizeAlias(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Rôle (autre que `exceptRoleId`) dont le libellé ou un alias correspond déjà. */
export function findAliasConflict(alias, roles, exceptRoleId) {
  const k = normalizeAlias(alias);
  if (!k) return null;
  return Object.values(roles || {}).find(r => r.id !== exceptRoleId && (
    normalizeAlias(r.label) === k || (r.aliases || []).some(a => normalizeAlias(a) === k)
  )) || null;
}

/**
 * Ajoute un alias à une liste (validation locale avant l'appel au store).
 * @returns {{ok:true, list:string[]} | {ok:false, error:string}}
 */
export function addAlias(list, alias) {
  const value = String(alias || '').trim().replace(/\s+/g, ' ');
  if (!value) return { ok: false, error: 'L\'alias est vide.' };
  if (value.length > CATALOG_LIMITS.maxLabel) return { ok: false, error: `${CATALOG_LIMITS.maxLabel} caractères maximum.` };
  const current = Array.isArray(list) ? list : [];
  if (current.some(a => normalizeAlias(a) === normalizeAlias(value))) {
    return { ok: false, error: `« ${value} » est déjà dans la liste.` };
  }
  if (current.length >= CATALOG_LIMITS.maxAliases) {
    return { ok: false, error: `${CATALOG_LIMITS.maxAliases} alias maximum par rôle.` };
  }
  return { ok: true, list: [...current, value] };
}

// ------------------------------------------------------------
// AFFINITÉS FORMATION
// ------------------------------------------------------------

/** Liste triée [{ name, value }] à partir de la map d'affinités. */
export function affinityEntries(affinity) {
  return Object.entries(affinity || {})
    .filter(([, v]) => Number.isFinite(Number(v)))
    .map(([name, v]) => ({ name, value: Math.min(1, Math.max(0, Number(v))) }));
}
