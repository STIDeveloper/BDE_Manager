// ============================================================
// Catalogue de rôles — modifiable via l'UI de configuration
// ============================================================

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

export const ROLE_CATALOG = [
  // --- BUREAU ---
  { id: 'president',                        label: 'Président(e)',                level: 'bureau',      pole: 'Bureau',                leadership: true },
  { id: 'vice_president',                   label: 'Vice-Président(e)',           level: 'bureau',      pole: 'Bureau',                leadership: true },
  { id: 'secretaire',                       label: 'Secrétaire',                  level: 'bureau',      pole: 'Bureau',                leadership: false },
  { id: 'secretaire_adjoint',               label: 'Secrétaire adjoint(e)',       level: 'adjoint',     pole: 'Bureau',                leadership: false },
  { id: 'tresorier',                        label: 'Trésorier(ère)',              level: 'bureau',      pole: 'Bureau',                leadership: false },

  // --- COMMUNICATION ---
  { id: 'responsable_communication',        label: 'Responsable Communication',   level: 'responsable', pole: 'Communication',         leadership: true },
  { id: 'responsable_communication_interne',label: 'Responsable Com. Interne',    level: 'responsable', pole: 'Communication Interne', leadership: true },
  { id: 'membre_communication',             label: 'Membre Communication',        level: 'membre',      pole: 'Communication',         leadership: false },
  { id: 'membre_communication_interne',     label: 'Membre Com. Interne',         level: 'membre',      pole: 'Communication Interne', leadership: false },

  // --- PROJETS ---
  { id: 'responsable_projets',              label: 'Responsable Projets',         level: 'responsable', pole: 'Projets',               leadership: true },
  { id: 'membre_projets',                   label: 'Membre Projets',              level: 'membre',      pole: 'Projets',               leadership: false },

  // --- SPORT ---
  { id: 'responsable_sport',                label: 'Responsable Sport',           level: 'responsable', pole: 'Sport',                 leadership: true },
  { id: 'membre_sport',                     label: 'Membre Sport',                level: 'membre',      pole: 'Sport',                 leadership: false },

  // --- E-SPORT ---
  { id: 'responsable_esport',               label: 'Responsable E-Sport',         level: 'responsable', pole: 'E-Sport',               leadership: true },
  { id: 'membre_esport',                    label: 'Membre E-Sport',              level: 'membre',      pole: 'E-Sport',               leadership: false },

  // --- PARTENARIATS ---
  { id: 'responsable_partenariats',         label: 'Responsable Partenariats',    level: 'responsable', pole: 'Partenariats',          leadership: true },
  { id: 'membre_partenariats',              label: 'Membre Partenariats',         level: 'membre',      pole: 'Partenariats',          leadership: false },
];

// Exigence de disponibilité minimale par niveau
export const LEVEL_REQUIREMENT = {
  bureau: 0.7,
  responsable: 0.7,
  adjoint: 0.5,
  membre: 0.3,
};

// Pondérations par défaut du score S (somme = 1.00)
export const DEFAULT_WEIGHTS = {
  P: 0.40,  // préférence (rang du choix)
  D: 0.20,  // disponibilité vs exigence
  E: 0.15,  // expérience / continuité
  A: 0.10,  // cohérence ambition ↔ niveau du poste
  M: 0.10,  // motivation (spécificité du texte)
  F: 0.05,  // affinité formation ↔ pôle
};

// Pénalités (points retirés sur 100)
export const DEFAULT_PENALTIES = {
  alternanceOnBureau: 15,
  alternanceOnResponsable: 8,
  lowAvailabilityOnLeadership: 20,
  contradiction: 10,
  nonRequested: 25,       // candidat placé sur un poste hors de ses 3 choix
};

// Seuil d'éligibilité : si S < seuil → slot reste VACANT
export const DEFAULT_MIN_SCORE = 55;

// Affinité formation → pôle (0..1)
export const FORMATION_AFFINITY = {
  InfoCOM:        { Communication: 1.0, 'Communication Interne': 1.0, Projets: 0.7, Sport: 0.4, 'E-Sport': 0.5, Partenariats: 0.6, Bureau: 0.6 },
  Informatique:   { Communication: 0.5, 'Communication Interne': 0.5, Projets: 0.8, Sport: 0.5, 'E-Sport': 1.0, Partenariats: 0.6, Bureau: 0.7 },
  GACO:           { Communication: 0.7, 'Communication Interne': 0.6, Projets: 0.8, Sport: 0.5, 'E-Sport': 0.5, Partenariats: 1.0, Bureau: 0.9 },
  QLIO:           { Communication: 0.5, 'Communication Interne': 0.5, Projets: 0.8, Sport: 0.5, 'E-Sport': 0.6, Partenariats: 0.7, Bureau: 0.7 },
  default:        { Communication: 0.5, 'Communication Interne': 0.5, Projets: 0.5, Sport: 0.5, 'E-Sport': 0.5, Partenariats: 0.5, Bureau: 0.5 },
};

// Tailles cibles par pôle (plancher dur)
export const DEFAULT_POLE_TARGETS = {
  minPoleSize: 2,
  weightByDemand: 0.7,   // proportionnel à la demande observée
  weightByCapacity: 0.3, // vs capacités annoncées
};

// Règle de succession
export const DEFAULT_SUCCESSION = {
  enabled: true,
  boostJuniorAdjoint: 8,       // bonus pour un BUT1/BUT2 sur adjoint/VP
  penalizeSeniorOnAdjoint: 5,  // penalty pour un Master/BUT3 sur adjoint
};

// Graine pour la sensibilité (déterminisme garanti)
export const DEFAULT_SEED = 0xBDE_2026;