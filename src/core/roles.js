// ============================================================
// ADAPTATEUR DE COMPATIBILITÉ — catalogue des rôles
// ============================================================
// Les rôles ne sont plus codés en dur : ils vivent dans le store principal
// (éditables depuis « Gestion des rôles ») et sont exposés par
// src/core/catalog.js. Ce fichier conserve les anciens noms d'export.
//
// ⚠️ Fonctions NON réactives (lecture instantanée du catalogue actif) :
//    à utiliser dans le moteur, les exports et les gestionnaires
//    d'événements. Dans le rendu React, utiliser les hooks de
//    src/core/useCatalog.js.

export {
  getRoles, getPoles, getLevels,
  getRoleById, getPole, getLevel,
  getRoleLabel, getPoleLabel, getLevelLabel,
  isValidRoleId,
  DEFAULT_POLES, DEFAULT_LEVELS, DEFAULT_ROLES,
} from './catalog.js';

import { getActiveCatalog, rolesOfPole, rolesOfLevel, isValidRoleId } from './catalog.js';

export const getRolesByPole  = (poleId)  => rolesOfPole(getActiveCatalog(), poleId);
export const getRolesByLevel = (levelId) => rolesOfLevel(getActiveCatalog(), levelId);

export function assertRoleId(id) {
  if (!isValidRoleId(id)) throw new Error(`Rôle inconnu : "${id}"`);
}
