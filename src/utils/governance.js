// ============================================================
// MATRICE DE GOUVERNANCE — catégorisation des membres (module PUR)
// ============================================================
// Colonnes dérivées du catalogue :
//  1. Bureau          : rôles dont le niveau a le comportement « bureau » ;
//  2. Encadrement     : une colonne par pôle (ordre du catalogue) pour les
//                       rôles d'encadrement (leadership ou niveau responsable) ;
//  3. Autres membres  : adjoints / membres de tous les pôles ;
//  4. Hors catalogue  : rôle libre non reconnu ou absent.

import { getActiveCatalog, LEVEL_KINDS, levelKind, listLevels, listPoles } from '../core/catalog.js';
import { resolveMemberRole, isLeaderRole } from './memberRoles.js';

const kindLabel = (catalog, kind, fallback) => {
  const levels = listLevels(catalog).filter(l => levelKind(catalog, l.id) === kind);
  return levels.length ? levels.map(l => l.label).join(' / ') : fallback;
};

/**
 * @returns {{ id: string, label: string, hint?: string, color?: string, members: object[] }[]}
 *   uniquement les catégories non vides, dans l'ordre d'affichage.
 */
export function buildGovernanceCategories(members, catalog = getActiveCatalog()) {
  const bureau = [];
  const others = [];
  const unknown = [];
  const leadersByPole = new Map();

  members.forEach(m => {
    const role = resolveMemberRole(m, catalog);
    if (!role) { unknown.push(m); return; }
    const kind = levelKind(catalog, role.level);
    if (kind === 'bureau') bureau.push(m);
    else if (isLeaderRole(role, catalog)) {
      if (!leadersByPole.has(role.pole)) leadersByPole.set(role.pole, []);
      leadersByPole.get(role.pole).push(m);
    } else others.push(m);
  });

  const fallbackBureau = LEVEL_KINDS.find(k => k.id === 'bureau')?.label || 'Bureau';
  const cats = [
    { id: 'kind:bureau', label: `🏛️ ${kindLabel(catalog, 'bureau', fallbackBureau)}`, hint: 'Niveau de direction', members: bureau },
  ];
  listPoles(catalog).forEach(p => {
    const list = leadersByPole.get(p.id);
    if (list?.length) {
      cats.push({ id: `lead:${p.id}`, label: `${p.emoji || '📌'} Encadrement ${p.label}`, hint: `Responsables du pôle ${p.label}`, color: p.color, members: list });
    }
  });
  cats.push({ id: 'kind:others', label: '👥 Autres membres', hint: 'Adjoints et membres de tous les pôles', members: others });
  cats.push({ id: 'unknown', label: '❔ Hors catalogue', hint: 'Rôle absent ou non reconnu', members: unknown });
  return cats.filter(c => c.members.length > 0);
}

const LEVEL_RANK = { none: 0, reader: 1, commenter: 2, editor: 3 };

/** Niveau d'accès DOMINANT d'un groupe de membres sur un dossier. */
export function dominantLevel(membersInCategory, folderId, drivePermissions) {
  let max = 'none';
  membersInCategory.forEach(m => {
    const lvl = (drivePermissions[m.id] || {})[folderId] || 'none';
    if ((LEVEL_RANK[lvl] ?? 0) > LEVEL_RANK[max]) max = lvl;
  });
  return max;
}
