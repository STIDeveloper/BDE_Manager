// ============================================================
// RÔLE D'UN MEMBRE ↔ CATALOGUE — helpers PURS
// ============================================================
// Toute la sémantique « bureau / responsable / pôle » est dérivée du
// catalogue (rôle → niveau → kind, rôle → pôle). Aucun libellé n'est codé
// en dur : un rôle renommé ou un pôle créé depuis l'interface est pris en
// compte immédiatement.
//
// Membres « hors catalogue » (mainRole = ancien texte libre non migré) :
// on tente de les rattacher via resolveRoleId (libellés historiques,
// alias, mots-clés). Sans correspondance, ils restent « sans rôle connu ».

import { getActiveCatalog, levelKind, sortByOrder } from '../core/catalog.js';
import { resolveRoleId } from '../core/roleAliases.js';
import { normalizeKey } from '../roleEngine/normalizer.js';

/**
 * Rôle du catalogue correspondant au membre (ou null).
 * @param {object} member
 * @param {{roles: object}} [catalog]
 */
export function resolveMemberRole(member, catalog = getActiveCatalog()) {
  if (!member) return null;
  const roles = catalog?.roles || {};
  if (member.mainRole && roles[member.mainRole]) return roles[member.mainRole];
  for (const raw of [member.mainRole, member.legacyMainRole]) {
    const id = raw ? resolveRoleId(raw, catalog) : null;
    if (id && roles[id]) return roles[id];
  }
  return null;
}

/** Libellé affichable du rôle d'un membre (catalogue, sinon texte libre). */
export function memberRoleText(member, catalog = getActiveCatalog()) {
  if (!member) return '';
  const direct = catalog?.roles?.[member.mainRole];
  if (direct) return direct.label;
  return member.mainRole || member.legacyMainRole || '';
}

/** Kind de niveau du rôle du membre ('bureau'|'responsable'|'adjoint'|'membre') ou null. */
export function memberLevelKind(member, catalog = getActiveCatalog()) {
  const role = resolveMemberRole(member, catalog);
  return role ? levelKind(catalog, role.level) : null;
}

/** Membre du Bureau = rôle dont le niveau a le comportement « bureau ». */
export function isBureauMember(member, catalog = getActiveCatalog()) {
  return memberLevelKind(member, catalog) === 'bureau';
}

/** Rôle d'encadrement : `leadership` explicite, ou niveau bureau/responsable. */
export function isLeaderRole(role, catalog = getActiveCatalog()) {
  if (!role) return false;
  if (role.leadership) return true;
  const k = levelKind(catalog, role.level);
  return k === 'bureau' || k === 'responsable';
}

/**
 * Pôle d'un membre : pôle de son rôle ; à défaut, pôle rattaché à sa
 * colonne Kanban (`pole.columnId`). Null si inconnu.
 */
export function memberPoleId(member, catalog = getActiveCatalog()) {
  const role = resolveMemberRole(member, catalog);
  if (role && catalog?.poles?.[role.pole]) return role.pole;
  if (member?.columnId) {
    const pole = Object.values(catalog?.poles || {}).find(p => p.columnId && p.columnId === member.columnId);
    if (pole) return pole.id;
  }
  return null;
}

/**
 * Clé de preset Drive applicable à un membre : son mainRole s'il existe un
 * preset sous cette clé (id ou ancien libellé), sinon l'id résolu.
 */
export function presetKeyForMember(member, rolePresets, catalog = getActiveCatalog()) {
  if (!member || !rolePresets) return null;
  if (member.mainRole && rolePresets[member.mainRole]) return member.mainRole;
  const role = resolveMemberRole(member, catalog);
  if (role && rolePresets[role.id]) return role.id;
  return null;
}

// ------------------------------------------------------------
// DOSSIER RACINE → PÔLE
// ------------------------------------------------------------

// Singulier approximatif : "partenariats" ≈ "partenariat".
const singular = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const tokens = (s) => normalizeKey(s).split(' ').filter(Boolean).map(singular);

/**
 * Pôle associé à un dossier (racine) : `folder.pole` s'il est défini,
 * sinon correspondance entre le nom du dossier et le libellé / l'id du
 * pôle (« Pôle Partenariat » ↔ « Partenariats »). En cas d'ambiguïté,
 * le pôle au libellé le plus spécifique l'emporte
 * (« Com Interne » plutôt que « Communication »). Null si aucun.
 */
export function matchFolderPole(folder, catalog = getActiveCatalog()) {
  if (!folder) return null;
  const poles = catalog?.poles || {};
  if (folder.pole && poles[folder.pole]) return folder.pole;
  const folderTokens = new Set(tokens(folder.name));
  if (folderTokens.size === 0) return null;
  let best = null;
  let bestScore = 0;
  sortByOrder(Object.values(poles)).forEach(p => {
    const candidates = [p.label, String(p.id).replace(/_/g, ' ')];
    candidates.forEach(c => {
      const t = tokens(c);
      if (t.length === 0 || !t.every(w => folderTokens.has(w))) return;
      if (t.length > bestScore) { best = p.id; bestScore = t.length; }
    });
  });
  return best;
}
