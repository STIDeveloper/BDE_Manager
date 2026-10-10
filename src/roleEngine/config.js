// ============================================================
// Configuration du moteur de rôles
// ============================================================
// Le catalogue (pôles / niveaux / rôles) ne vit PLUS ici : la source de
// vérité unique est src/core/catalog.js. Le moteur lit le catalogue actif
// via getActiveCatalog(), ou un catalogue explicite passé en option
// (`opts.catalog`) — ce qui permet de tester sans état global.
// ============================================================

import {
  DEFAULT_CATALOG, getActiveCatalog, listRoles, capacitiesOf, poleLabelIn,
} from '../core/catalog.js';

// ------------------------------------------------------------
// ACCÈS AU CATALOGUE
// ------------------------------------------------------------

/**
 * Renvoie le catalogue à utiliser : celui passé explicitement, sinon le
 * catalogue actif (alimenté par le store principal).
 * @param {{poles:object, levels:object, roles:object}} [catalog]
 */
export function resolveCatalog(catalog) {
  return catalog && typeof catalog === 'object' && catalog.roles ? catalog : getActiveCatalog();
}

/**
 * Liste triée des rôles du catalogue (remplace l'ancien ROLE_CATALOG).
 * Ordre : ordre du pôle → ordre du rôle → ordre du niveau.
 */
export function getCatalogRoles(catalog) {
  return listRoles(resolveCatalog(catalog));
}

/**
 * Capacité effective d'un rôle : valeur de la map `capacities` si présente,
 * sinon capacité déclarée dans le catalogue (cas d'un rôle créé après que
 * l'appelant a figé sa map de capacités), sinon 0.
 */
export function capacityOf(role, capacities) {
  const v = capacities ? capacities[role.id] : undefined;
  const n = Number(v ?? role.capacity ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Capacités par défaut d'un catalogue ({ roleId: capacity }). */
export function defaultCapacities(catalog) {
  return capacitiesOf(resolveCatalog(catalog));
}

// ------------------------------------------------------------
// SHIMS DE COMPATIBILITÉ (DEPRECATED)
// ------------------------------------------------------------

/**
 * Capacités du catalogue PAR DÉFAUT (figées au chargement du module).
 * Les fonctions du moteur utilisent par défaut capacitiesOf(catalogue actif) ;
 * cette constante reste exportée pour l'UI / le store et les tests.
 */
export const DEFAULT_CAPACITIES = Object.freeze(capacitiesOf(DEFAULT_CATALOG));

/**
 * @deprecated Utiliser getCatalogRoles(catalog) (moteur) ou les hooks de
 * src/core/useCatalog.js (UI). Tableau STATIQUE dérivé du catalogue par
 * défaut : il ne reflète ni les rôles personnalisés ni les renommages.
 * ⚠️ `pole` est désormais l'ID du pôle (ex. 'communication'), plus son libellé ;
 * `poleLabel` est fourni pour l'affichage en attendant la migration de l'UI.
 */
export const ROLE_CATALOG = Object.freeze(listRoles(DEFAULT_CATALOG).map(r => Object.freeze({
  ...r,
  aliases: [...(r.aliases || [])],
  poleLabel: poleLabelIn(DEFAULT_CATALOG, r.pole),
})));

// ------------------------------------------------------------
// PARAMÈTRES DE SCORING
// ------------------------------------------------------------
// NB : l'exigence de disponibilité par niveau (ex-LEVEL_REQUIREMENT) est
// désormais `level.requirement`, et l'affinité formation → pôle
// (ex-FORMATION_AFFINITY) est `pole.affinity` (formation absente → 0.5).

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

// Affinité formation ↔ pôle quand la formation n'est pas renseignée dans le pôle
export const DEFAULT_FORMATION_AFFINITY = 0.5;

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
