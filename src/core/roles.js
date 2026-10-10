// ============================================================
// CATALOGUE CANONIQUE DES RÔLES — Source de vérité unique
// ============================================================

export const POLES = {
  bureau:                { id: 'bureau',                label: 'Bureau',                 short: 'Bureau',   color: 'red',     emoji: '🏛️', order: 0 },
  communication:         { id: 'communication',         label: 'Communication',          short: 'Com',      color: 'blue',    emoji: '📣', order: 1 },
  communication_interne: { id: 'communication_interne', label: 'Communication Interne',  short: 'Com Int.', color: 'cyan',    emoji: '🏫', order: 2 },
  projets:               { id: 'projets',               label: 'Projets',                short: 'Projets',  color: 'violet',  emoji: '📋', order: 3 },
  event:                 { id: 'event',                 label: 'Événementiel',           short: 'Event',    color: 'pink',    emoji: '🎉', order: 4 },
  sport:                 { id: 'sport',                 label: 'Sport',                  short: 'Sport',    color: 'emerald', emoji: '🏅', order: 5 },
  esport:                { id: 'esport',                label: 'E-Sport',                short: 'E-Sport',  color: 'amber',   emoji: '🎮', order: 6 },
  partenariats:          { id: 'partenariats',          label: 'Partenariats',           short: 'Parten.',  color: 'orange',  emoji: '🤝', order: 7 },
  transversal:           { id: 'transversal',           label: 'Transversal',            short: 'Transv.',  color: 'zinc',    emoji: '🧩', order: 8 },
};

export const LEVELS = {
  bureau:      { id: 'bureau',      label: 'Bureau',      order: 1, requirement: 0.7 },
  responsable: { id: 'responsable', label: 'Responsable', order: 2, requirement: 0.7 },
  adjoint:     { id: 'adjoint',     label: 'Adjoint',     order: 3, requirement: 0.5 },
  membre:      { id: 'membre',      label: 'Membre',      order: 4, requirement: 0.3 },
};

export const ROLES = [
  // ---------- BUREAU ----------
  { id: 'president',          label: 'Président(e)',           level: 'bureau',      pole: 'bureau',                leadership: true,  essential: true },
  { id: 'vice_president',     label: 'Vice-Président(e)',      level: 'bureau',      pole: 'bureau',                leadership: true,  essential: true },
  { id: 'secretaire',         label: 'Secrétaire',             level: 'bureau',      pole: 'bureau',                leadership: false, essential: true },
  { id: 'secretaire_adjoint', label: 'Secrétaire adjoint(e)',  level: 'adjoint',     pole: 'bureau',                leadership: false, essential: false },
  { id: 'tresorier',          label: 'Trésorier(ère)',         level: 'bureau',      pole: 'bureau',                leadership: false, essential: true },

  // ---------- COMMUNICATION ----------
  { id: 'responsable_communication',         label: 'Responsable Communication',  level: 'responsable', pole: 'communication',         leadership: true,  essential: true },
  { id: 'responsable_communication_interne', label: 'Responsable Com. Interne',   level: 'responsable', pole: 'communication_interne', leadership: true,  essential: false },
  { id: 'membre_communication',              label: 'Membre Communication',       level: 'membre',      pole: 'communication',         leadership: false, essential: false },
  { id: 'membre_communication_interne',      label: 'Membre Com. Interne',        level: 'membre',      pole: 'communication_interne', leadership: false, essential: false },

  // ---------- PROJETS ----------
  { id: 'responsable_projets', label: 'Responsable Projets',  level: 'responsable', pole: 'projets', leadership: true,  essential: false },
  { id: 'membre_projets',      label: 'Membre Projets',       level: 'membre',      pole: 'projets', leadership: false, essential: false },

  // ---------- SPORT ----------
  { id: 'responsable_sport',   label: 'Responsable Sport',    level: 'responsable', pole: 'sport',   leadership: true,  essential: false },
  { id: 'membre_sport',        label: 'Membre Sport',         level: 'membre',      pole: 'sport',   leadership: false, essential: false },

  // ---------- E-SPORT ----------
  { id: 'responsable_esport',  label: 'Responsable E-Sport',  level: 'responsable', pole: 'esport',  leadership: true,  essential: false },
  { id: 'membre_esport',       label: 'Membre E-Sport',       level: 'membre',      pole: 'esport',  leadership: false, essential: false },

  // ---------- PARTENARIATS ----------
  { id: 'responsable_partenariats', label: 'Responsable Partenariats', level: 'responsable', pole: 'partenariats', leadership: true,  essential: false },
  { id: 'membre_partenariats',      label: 'Membre Partenariats',      level: 'membre',      pole: 'partenariats', leadership: false, essential: false },
];

const ROLE_BY_ID = Object.fromEntries(ROLES.map(r => [r.id, r]));
const POLES_BY_ID = POLES;

export function getRoleById(id)         { return ROLE_BY_ID[id] || null; }
export function getRolesByPole(poleId)  { return ROLES.filter(r => r.pole === poleId); }
export function getRolesByLevel(levelId){ return ROLES.filter(r => r.level === levelId); }
export function getRoleLabel(id)        { return ROLE_BY_ID[id]?.label || id; }
export function getPole(id)             { return POLES_BY_ID[id] || null; }
export function getPoleLabel(id)        { return POLES_BY_ID[id]?.label || id; }

export const DEFAULT_CAPACITIES = {
  president: 1,
  vice_president: 1,
  secretaire: 1,
  secretaire_adjoint: 1,
  tresorier: 1,
  responsable_communication: 2,
  responsable_communication_interne: 1,
  responsable_projets: 2,
  responsable_sport: 1,
  responsable_esport: 1,
  responsable_partenariats: 1,
  membre_communication: 10,
  membre_communication_interne: 5,
  membre_projets: 8,
  membre_sport: 4,
  membre_esport: 4,
  membre_partenariats: 4,
};

export function isValidRoleId(id) { return !!ROLE_BY_ID[id]; }
export function assertRoleId(id) {
  if (!isValidRoleId(id)) throw new Error(`Rôle inconnu : "${id}"`);
}