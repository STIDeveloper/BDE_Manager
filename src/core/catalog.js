// ============================================================
// CATALOGUE DES RÔLES — module PUR (aucune dépendance)
// ============================================================
// Source de vérité unique pour les pôles, niveaux et rôles.
//
// Architecture :
//  - Les données vivent dans le store principal (src/store.js : clés
//    `poles`, `levels`, `roles`) → persistées + incluses dans les backups.
//  - Ce module fournit les valeurs par défaut, la normalisation/validation
//    et un « catalogue actif » que le moteur de rôles lit sans dépendre de
//    Zustand (il reste ainsi testable sous Node et sans import circulaire).
//  - Le store principal appelle setActiveCatalog() à chaque changement.
//  - Les composants React n'utilisent PAS ces getters (non réactifs) :
//    ils passent par les hooks de src/core/useCatalog.js.
//
// Règle d'or : l'`id` d'un rôle/pôle/niveau est IMMUABLE. Renommer ne
// modifie que `label` → presets Drive, membres et contraintes restent liés.
// ============================================================

/** Comportements moteur possibles pour un niveau (utilisés par le scoring). */
export const LEVEL_KINDS = [
  { id: 'bureau',      label: 'Bureau (direction)',  description: 'Postes de direction : exigence d\'expérience et d\'ambition forte.' },
  { id: 'responsable', label: 'Responsable de pôle', description: 'Encadrement d\'un pôle : ambition et disponibilité attendues.' },
  { id: 'adjoint',     label: 'Adjoint',             description: 'Postes de seconde ligne, propices à la succession.' },
  { id: 'membre',      label: 'Membre',              description: 'Postes opérationnels, accessibles aux débutants.' },
];
const LEVEL_KIND_IDS = new Set(LEVEL_KINDS.map(k => k.id));

/** Palette de couleurs des pôles (valeurs hex utilisées en style inline). */
export const POLE_PALETTE = {
  red: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308',
  lime: '#84cc16', emerald: '#10b981', teal: '#14b8a6', cyan: '#06b6d4',
  sky: '#0ea5e9', blue: '#3b82f6', indigo: '#6366f1', violet: '#8b5cf6',
  purple: '#a855f7', pink: '#ec4899', rose: '#f43f5e', zinc: '#71717a',
};

const HEX_RX = /^#[0-9a-f]{6}$/i;

/** Couleur hex d'un pôle (accepte une clé de palette ou un hex). */
export function poleColorHex(color) {
  if (typeof color === 'string' && HEX_RX.test(color)) return color;
  return POLE_PALETTE[color] || POLE_PALETTE.zinc;
}

// ------------------------------------------------------------
// VALEURS PAR DÉFAUT (catalogue BDE historique)
// ------------------------------------------------------------

// Affinité formation → pôle (0..1), reprise de l'ancien FORMATION_AFFINITY.
const AFF = (InfoCOM, Informatique, GACO, QLIO) => ({ InfoCOM, Informatique, GACO, QLIO });

export const DEFAULT_POLES = {
  bureau:                { id: 'bureau',                label: 'Bureau',                short: 'Bureau',   color: 'red',     emoji: '🏛️', order: 0, affinity: AFF(0.6, 0.7, 0.9, 0.7) },
  communication:         { id: 'communication',         label: 'Communication',         short: 'Com',      color: 'blue',    emoji: '📣', order: 1, affinity: AFF(1.0, 0.5, 0.7, 0.5) },
  communication_interne: { id: 'communication_interne', label: 'Communication Interne', short: 'Com Int.', color: 'cyan',    emoji: '🏫', order: 2, affinity: AFF(1.0, 0.5, 0.6, 0.5) },
  projets:               { id: 'projets',               label: 'Projets',               short: 'Projets',  color: 'violet',  emoji: '📋', order: 3, affinity: AFF(0.7, 0.8, 0.8, 0.8) },
  event:                 { id: 'event',                 label: 'Événementiel',          short: 'Event',    color: 'pink',    emoji: '🎉', order: 4, affinity: {} },
  sport:                 { id: 'sport',                 label: 'Sport',                 short: 'Sport',    color: 'emerald', emoji: '🏅', order: 5, affinity: AFF(0.4, 0.5, 0.5, 0.5) },
  esport:                { id: 'esport',                label: 'E-Sport',               short: 'E-Sport',  color: 'amber',   emoji: '🎮', order: 6, affinity: AFF(0.5, 1.0, 0.5, 0.6) },
  partenariats:          { id: 'partenariats',          label: 'Partenariats',          short: 'Parten.',  color: 'orange',  emoji: '🤝', order: 7, affinity: AFF(0.6, 0.6, 1.0, 0.7) },
  transversal:           { id: 'transversal',           label: 'Transversal',           short: 'Transv.',  color: 'zinc',    emoji: '🧩', order: 8, affinity: {} },
};

export const DEFAULT_LEVELS = {
  bureau:      { id: 'bureau',      label: 'Bureau',      order: 1, requirement: 0.7, kind: 'bureau' },
  responsable: { id: 'responsable', label: 'Responsable', order: 2, requirement: 0.7, kind: 'responsable' },
  adjoint:     { id: 'adjoint',     label: 'Adjoint',     order: 3, requirement: 0.5, kind: 'adjoint' },
  membre:      { id: 'membre',      label: 'Membre',      order: 4, requirement: 0.3, kind: 'membre' },
};

const R = (id, label, level, pole, leadership, essential, capacity, order) =>
  ({ id, label, level, pole, leadership, essential, capacity, order, aliases: [] });

export const DEFAULT_ROLES = Object.fromEntries([
  R('president',                        'Président(e)',              'bureau',      'bureau',                true,  true,  1, 0),
  R('vice_president',                   'Vice-Président(e)',         'bureau',      'bureau',                true,  true,  1, 1),
  R('secretaire',                       'Secrétaire',                'bureau',      'bureau',                false, true,  1, 2),
  R('secretaire_adjoint',               'Secrétaire adjoint(e)',     'adjoint',     'bureau',                false, false, 1, 3),
  R('tresorier',                        'Trésorier(ère)',            'bureau',      'bureau',                false, true,  1, 4),
  R('responsable_communication',        'Responsable Communication', 'responsable', 'communication',         true,  true,  2, 0),
  R('membre_communication',             'Membre Communication',      'membre',      'communication',         false, false, 10, 1),
  R('responsable_communication_interne','Responsable Com. Interne',  'responsable', 'communication_interne', true,  false, 1, 0),
  R('membre_communication_interne',     'Membre Com. Interne',       'membre',      'communication_interne', false, false, 5, 1),
  R('responsable_projets',              'Responsable Projets',       'responsable', 'projets',               true,  false, 2, 0),
  R('membre_projets',                   'Membre Projets',            'membre',      'projets',               false, false, 8, 1),
  R('responsable_sport',                'Responsable Sport',         'responsable', 'sport',                 true,  false, 1, 0),
  R('membre_sport',                     'Membre Sport',              'membre',      'sport',                 false, false, 4, 1),
  R('responsable_esport',               'Responsable E-Sport',       'responsable', 'esport',                true,  false, 1, 0),
  R('membre_esport',                    'Membre E-Sport',            'membre',      'esport',                false, false, 4, 1),
  R('responsable_partenariats',         'Responsable Partenariats',  'responsable', 'partenariats',          true,  false, 1, 0),
  R('membre_partenariats',              'Membre Partenariats',       'membre',      'partenariats',          false, false, 4, 1),
].map(r => [r.id, r]));

export function createDefaultCatalog() {
  // Copie profonde : les objets par défaut ne doivent jamais être mutés.
  return JSON.parse(JSON.stringify({ poles: DEFAULT_POLES, levels: DEFAULT_LEVELS, roles: DEFAULT_ROLES }));
}

export const DEFAULT_CATALOG = Object.freeze(createDefaultCatalog());

export const CATALOG_LIMITS = { maxCapacity: 99, maxLabel: 60, maxShort: 12, maxAliases: 20 };

// ------------------------------------------------------------
// IDENTIFIANTS
// ------------------------------------------------------------

/** Slug lisible ("Responsable Design" → "responsable_design"). */
export function slugify(label) {
  return String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Génère un id unique et lisible, jamais réutilisé dans `existing`. */
export function makeUniqueId(label, existing, prefix = 'item') {
  const base = slugify(label) || prefix;
  const taken = existing instanceof Set ? existing : new Set(Object.keys(existing || {}));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

// ------------------------------------------------------------
// NORMALISATION / VALIDATION
// ------------------------------------------------------------

const clampNumber = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const cleanText = (v, fallback, max) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || fallback).slice(0, max);
};
const toMap = (v) => {
  if (Array.isArray(v)) return Object.fromEntries(v.filter(x => x && x.id).map(x => [x.id, x]));
  return v && typeof v === 'object' ? v : {};
};

function normalizePole(id, p, index) {
  const label = cleanText(p.label, id, CATALOG_LIMITS.maxLabel);
  const affinity = {};
  if (p.affinity && typeof p.affinity === 'object') {
    Object.entries(p.affinity).forEach(([k, v]) => {
      const n = Number(v);
      if (Number.isFinite(n)) affinity[k] = Math.min(1, Math.max(0, n));
    });
  }
  const out = {
    id,
    label,
    short: cleanText(p.short, label, CATALOG_LIMITS.maxShort),
    color: (typeof p.color === 'string' && (POLE_PALETTE[p.color] || HEX_RX.test(p.color))) ? p.color : 'zinc',
    emoji: typeof p.emoji === 'string' && p.emoji.trim() ? p.emoji.trim().slice(0, 8) : '📌',
    order: clampNumber(p.order, -1e6, 1e6, index),
    affinity,
  };
  if (typeof p.columnId === 'string' && p.columnId) out.columnId = p.columnId;
  if (p.custom) out.custom = true;
  return out;
}

function normalizeLevel(id, l, index) {
  const kind = LEVEL_KIND_IDS.has(l.kind) ? l.kind : (LEVEL_KIND_IDS.has(id) ? id : 'membre');
  const out = {
    id,
    label: cleanText(l.label, id, CATALOG_LIMITS.maxLabel),
    order: clampNumber(l.order, -1e6, 1e6, index + 1),
    requirement: clampNumber(l.requirement, 0, 1, 0.5),
    kind,
  };
  if (l.custom) out.custom = true;
  return out;
}

function normalizeRole(id, r, index, poles, levels, fallbackPole, fallbackLevel) {
  const aliases = Array.isArray(r.aliases)
    ? [...new Set(r.aliases.filter(a => typeof a === 'string').map(a => a.trim()).filter(Boolean))].slice(0, CATALOG_LIMITS.maxAliases)
    : [];
  const out = {
    id,
    label: cleanText(r.label, id, CATALOG_LIMITS.maxLabel),
    pole: poles[r.pole] ? r.pole : fallbackPole,
    level: levels[r.level] ? r.level : fallbackLevel,
    leadership: !!r.leadership,
    essential: !!r.essential,
    capacity: Math.round(clampNumber(r.capacity, 0, CATALOG_LIMITS.maxCapacity, 1)),
    order: clampNumber(r.order, -1e6, 1e6, index),
    aliases,
  };
  if (r.custom) out.custom = true;
  return out;
}

/**
 * Normalise un catalogue quelconque (import JSON, état persisté…) :
 * champs manquants complétés, valeurs bornées, références réparées.
 * Ne supprime jamais un rôle : un rôle rattaché à un pôle/niveau inexistant
 * est rattaché au pôle « transversal » (ou au premier) / au niveau le plus bas.
 * @returns {{ poles: object, levels: object, roles: object }}
 */
export function normalizeCatalog(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rawPoles = toMap(src.poles);
  const rawLevels = toMap(src.levels);
  const rawRoles = toMap(src.roles);

  const poles = {};
  Object.entries(rawPoles).forEach(([id, p], i) => {
    if (id && p && typeof p === 'object') poles[id] = normalizePole(id, p, i);
  });
  const levels = {};
  Object.entries(rawLevels).forEach(([id, l], i) => {
    if (id && l && typeof l === 'object') levels[id] = normalizeLevel(id, l, i);
  });

  // Garanties minimales : au moins un pôle et un niveau.
  if (Object.keys(poles).length === 0) poles.transversal = normalizePole('transversal', DEFAULT_POLES.transversal, 0);
  if (Object.keys(levels).length === 0) levels.membre = normalizeLevel('membre', DEFAULT_LEVELS.membre, 0);

  const fallbackPole = poles.transversal ? 'transversal' : sortByOrder(Object.values(poles))[0].id;
  const fallbackLevel = sortByOrder(Object.values(levels)).at(-1).id;

  const roles = {};
  Object.entries(rawRoles).forEach(([id, r], i) => {
    if (id && r && typeof r === 'object') roles[id] = normalizeRole(id, r, i, poles, levels, fallbackPole, fallbackLevel);
  });

  return { poles, levels, roles };
}

/** Liste les incohérences d'un catalogue (pour affichage / tests). */
export function validateCatalog(cat) {
  const issues = [];
  const { poles = {}, levels = {}, roles = {} } = cat || {};
  Object.values(roles).forEach(r => {
    if (!poles[r.pole]) issues.push({ type: 'role_missing_pole', id: r.id, message: `Le rôle "${r.label}" référence un pôle inexistant (${r.pole}).` });
    if (!levels[r.level]) issues.push({ type: 'role_missing_level', id: r.id, message: `Le rôle "${r.label}" référence un niveau inexistant (${r.level}).` });
  });
  const labels = new Map();
  Object.values(roles).forEach(r => {
    const k = r.label.trim().toLowerCase();
    if (labels.has(k)) issues.push({ type: 'duplicate_label', id: r.id, message: `Deux rôles portent le libellé "${r.label}".` });
    labels.set(k, r.id);
  });
  return issues;
}

// ------------------------------------------------------------
// HELPERS PURS (prennent un catalogue en argument)
// ------------------------------------------------------------

export function sortByOrder(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.label).localeCompare(String(b.label), 'fr'));
}

export const listPoles  = (cat) => sortByOrder(Object.values(cat?.poles || {}));
export const listLevels = (cat) => sortByOrder(Object.values(cat?.levels || {}));

/** Rôles triés : ordre du pôle → ordre du rôle → ordre du niveau. */
export function listRoles(cat) {
  const poles = cat?.poles || {};
  const levels = cat?.levels || {};
  return Object.values(cat?.roles || {}).sort((a, b) =>
    (poles[a.pole]?.order ?? 1e9) - (poles[b.pole]?.order ?? 1e9) ||
    (a.order ?? 0) - (b.order ?? 0) ||
    (levels[a.level]?.order ?? 1e9) - (levels[b.level]?.order ?? 1e9) ||
    a.label.localeCompare(b.label, 'fr'));
}

export const rolesOfPole  = (cat, poleId)  => listRoles(cat).filter(r => r.pole === poleId);
export const rolesOfLevel = (cat, levelId) => listRoles(cat).filter(r => r.level === levelId);

/** { roleId: capacity } — format attendu par le solveur. */
export function capacitiesOf(cat) {
  return Object.fromEntries(Object.values(cat?.roles || {}).map(r => [r.id, r.capacity ?? 0]));
}

/**
 * Rang hiérarchique d'un niveau : plus la valeur est haute, plus le niveau
 * est élevé (bureau > responsable > adjoint > membre). Dérivé de `order`
 * (order 1 = plus haut niveau).
 */
export function levelRank(cat, levelId) {
  const list = listLevels(cat);
  const idx = list.findIndex(l => l.id === levelId);
  return idx === -1 ? 0 : list.length - idx;
}

/** Comportement moteur d'un niveau ('bureau' | 'responsable' | 'adjoint' | 'membre'). */
export function levelKind(cat, levelId) {
  const l = cat?.levels?.[levelId];
  if (l && LEVEL_KIND_IDS.has(l.kind)) return l.kind;
  return LEVEL_KIND_IDS.has(levelId) ? levelId : 'membre';
}

export function roleLabelIn(cat, roleId) {
  if (!roleId) return '';
  return cat?.roles?.[roleId]?.label || roleId;
}

export function poleLabelIn(cat, poleId) {
  return cat?.poles?.[poleId]?.label || poleId || '';
}

/** Rôle "de direction" au sens moteur (niveau bureau ou responsable). */
export function isSeniorRole(cat, role) {
  const k = levelKind(cat, role?.level);
  return k === 'bureau' || k === 'responsable';
}

// ------------------------------------------------------------
// CATALOGUE ACTIF (lu par le moteur et les utilitaires non-React)
// ------------------------------------------------------------

let active = createDefaultCatalog();
const listeners = new Set();

/** Appelé par le store principal ; ne doit pas être appelé ailleurs. */
export function setActiveCatalog(cat) {
  if (!cat || (cat.poles === active.poles && cat.levels === active.levels && cat.roles === active.roles)) return;
  active = { poles: cat.poles || {}, levels: cat.levels || {}, roles: cat.roles || {} };
  listeners.forEach(fn => { try { fn(active); } catch (e) { console.error('[catalog] listener', e); } });
}

export function getActiveCatalog() { return active; }

/** Abonnement aux changements du catalogue actif. Retourne la fonction de désabonnement. */
export function subscribeCatalog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Raccourcis non réactifs (moteur, exports, utilitaires).
export const getRoles      = () => listRoles(active);
export const getPoles      = () => listPoles(active);
export const getLevels     = () => listLevels(active);
export const getRoleById   = (id) => active.roles[id] || null;
export const getPole       = (id) => active.poles[id] || null;
export const getLevel      = (id) => active.levels[id] || null;
export const getRoleLabel  = (id) => roleLabelIn(active, id);
export const getPoleLabel  = (id) => poleLabelIn(active, id);
export const getLevelLabel = (id) => active.levels[id]?.label || id || '';
export const isValidRoleId = (id) => !!active.roles[id];
