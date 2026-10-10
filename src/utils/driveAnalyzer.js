// ============================================================
// ANALYSEUR DRIVE — vérifications automatiques de la matrice
// ============================================================
// Module PUR : la sémantique des rôles vient du catalogue (paramètre
// `catalog`, par défaut le catalogue actif). Aucun libellé de rôle ni nom
// de pôle n'est codé en dur.
//
// Portée des règles :
//  - 'cell'   : évaluée pour chaque couple (membre, dossier) ;
//  - 'member' : une fois par membre ;
//  - 'folder' : une fois par dossier.

import { getActiveCatalog } from '../core/catalog.js';
import { getRootFolder } from './folderTree.js';
import {
  memberRoleText, isBureauMember, memberPoleId, matchFolderPole,
  presetKeyForMember, resolveMemberRole,
} from './memberRoles.js';
import { normalizeKey } from '../roleEngine/normalizer.js';

const LEVEL_WEIGHT = { none: 0, reader: 1, commenter: 2, editor: 3 };

const fullName = (m) => `${m.firstName || ''}${m.lastName ? ' ' + m.lastName : ''}`.trim();
const roleOf = (ctx) => memberRoleText(ctx.member, ctx.catalog) || 'sans rôle';
const isConfidential = (folder) => (folder.tags || []).includes('confidential');
const presetOf = (ctx) => {
  const key = presetKeyForMember(ctx.member, ctx.rolePresets, ctx.catalog);
  return key ? ctx.rolePresets[key] : null;
};
// Dossier de trésorerie : id historique, ou nom contenant « trésorerie ».
const isTreasuryFolder = (folder) =>
  folder.id === 'f00.2' || /\btresorerie\b/.test(normalizeKey(folder.name));

const RULES = [
  {
    id: 'confidential-editor-too-many',
    scope: 'folder',
    severity: 'danger',
    title: 'Dossier confidentiel ouvert à trop de personnes',
    description: (ctx) => `Le dossier "${ctx.folder.name}" est marqué confidentiel mais ${ctx.editors.length} personnes ont un accès éditeur.`,
    fix: 'Vérifier si toutes ces personnes ont réellement besoin d\'un accès éditeur.',
    test: (ctx) => isConfidential(ctx.folder) && ctx.editors.length >= 4,
    data: (ctx) => ({ members: ctx.editors.map(p => p.member), count: ctx.editors.length, folder: ctx.folder }),
  },
  {
    id: 'confidential-non-bureau',
    scope: 'cell',
    severity: 'warning',
    title: 'Non-membre du Bureau avec accès éditeur sur un dossier confidentiel',
    description: (ctx) => `${fullName(ctx.member)} (${roleOf(ctx)}) a un accès éditeur sur "${ctx.folder.name}" qui est confidentiel, mais son rôle n'est pas un rôle du Bureau.`,
    fix: 'Vérifier si son accès est justifié ou s\'il devrait être en lecteur.',
    test: (ctx) => ctx.level === 'editor' && isConfidential(ctx.folder) && !isBureauMember(ctx.member, ctx.catalog),
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, level: ctx.level }),
  },
  {
    id: 'editor-out-of-pole',
    scope: 'cell',
    severity: 'warning',
    title: 'Accès éditeur sur un dossier hors de son pôle',
    description: (ctx) => `${fullName(ctx.member)} (${roleOf(ctx)}) a un accès éditeur sur "${ctx.folder.name}" qui appartient à « ${ctx.root.name} ».`,
    fix: 'Un accès éditeur devrait être limité au pôle de rattachement, sauf exception justifiée (dans ce cas, ajoute-la au preset du rôle).',
    test: (ctx) => {
      if (ctx.level !== 'editor') return false;
      // Les dossiers confidentiels sont couverts par la règle dédiée.
      if (isConfidential(ctx.folder)) return false;
      // Le Bureau supervise tous les pôles.
      if (isBureauMember(ctx.member, ctx.catalog)) return false;
      const memberPole = memberPoleId(ctx.member, ctx.catalog);
      if (!memberPole) return false;
      const folderPole = matchFolderPole(ctx.root, ctx.catalog);
      if (!folderPole || folderPole === memberPole) return false;
      // Accès explicitement prévu par le preset du rôle → politique assumée.
      return presetOf(ctx)?.[ctx.folder.id] !== 'editor';
    },
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, root: ctx.root, level: ctx.level }),
  },
  {
    id: 'permission-outside-preset',
    scope: 'cell',
    severity: 'info',
    title: 'Permission non prévue par le preset du rôle',
    description: (ctx) => `${fullName(ctx.member)} (${roleOf(ctx)}) a une permission "${ctx.level}" sur "${ctx.folder.name}" alors que le preset de son rôle ne la prévoit pas.`,
    fix: 'Soit le preset doit être mis à jour, soit cette permission est en trop.',
    test: (ctx) => {
      if (ctx.level === 'none') return false;
      const preset = presetOf(ctx);
      if (!preset) return false;
      return (preset[ctx.folder.id] || 'none') === 'none';
    },
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, level: ctx.level }),
  },
  {
    id: 'member-no-permissions',
    scope: 'member',
    severity: 'info',
    title: 'Membre sans aucune permission Drive',
    description: (ctx) => `${fullName(ctx.member)} (${roleOf(ctx)}) n'a accès à aucun dossier.`,
    fix: 'Appliquer le preset de son rôle ou définir manuellement ses accès.',
    test: (ctx) => {
      if (!ctx.member.mainRole) return false;
      const userPerms = ctx.drivePermissions[ctx.member.id] || {};
      return Object.values(userPerms).filter(v => v && v !== 'none').length === 0;
    },
    data: (ctx) => ({ member: ctx.member }),
  },
  {
    id: 'member-unknown-role',
    scope: 'member',
    severity: 'info',
    title: 'Rôle hors catalogue',
    description: (ctx) => `${fullName(ctx.member)} a pour rôle « ${ctx.member.mainRole} », qui ne correspond à aucun rôle du catalogue.`,
    fix: 'Associe ce membre à un rôle du catalogue (fiche membre) pour que les presets et vérifications s\'appliquent.',
    test: (ctx) => !!ctx.member.mainRole && !resolveMemberRole(ctx.member, ctx.catalog),
    data: (ctx) => ({ member: ctx.member }),
  },
  {
    id: 'parent-child-incoherence',
    scope: 'cell',
    severity: 'warning',
    title: 'Permission incohérente parent/enfant',
    description: (ctx) => `${fullName(ctx.member)} a un accès "${ctx.level}" sur "${ctx.folder.name}" mais un accès "${ctx.parentLevel}" sur le dossier parent "${ctx.parent.name}".`,
    fix: 'L\'enfant devrait généralement avoir un niveau ≤ au parent.',
    test: (ctx) => {
      if (ctx.level === 'none' || !ctx.folder.parent) return false;
      const parent = ctx.folders.find(f => f.id === ctx.folder.parent);
      if (!parent) return false;
      const parentLevel = (ctx.drivePermissions[ctx.member.id] || {})[parent.id] || 'none';
      if (parentLevel === 'none') return false;
      ctx.parent = parent;
      ctx.parentLevel = parentLevel;
      return LEVEL_WEIGHT[ctx.level] > LEVEL_WEIGHT[parentLevel];
    },
    data: (ctx) => ({
      member: ctx.member, child: ctx.folder, parent: ctx.parent,
      childLevel: ctx.level, parentLevel: ctx.parentLevel,
    }),
  },
  {
    id: 'tresorerie-too-open',
    scope: 'folder',
    severity: 'danger',
    title: 'Dossier Trésorerie accessible par trop de personnes',
    description: (ctx) => `Le dossier "${ctx.folder.name}" est accessible par ${ctx.withAccess.length} personnes, ce qui est très sensible.`,
    fix: 'Le dossier Trésorerie ne devrait être accessible qu\'aux quelques postes du Bureau qui en ont besoin.',
    test: (ctx) => isTreasuryFolder(ctx.folder) && ctx.withAccess.length > 4,
    data: (ctx) => ({
      members: ctx.withAccess.map(p => p.member),
      count: ctx.withAccess.length,
      folder: ctx.folder,
    }),
  },
  {
    id: 'folder-empty',
    scope: 'folder',
    severity: 'info',
    title: 'Dossier sans aucun accès configuré',
    description: (ctx) => `Le dossier "${ctx.folder.name}" n'a aucun utilisateur ayant une permission.`,
    fix: 'Vérifier qu\'il n\'a pas été oublié ou qu\'il est bien volontairement vide.',
    test: (ctx) => {
      if (ctx.folder.parent == null && ctx.folder.id === 'f04') return false;
      if (ctx.folders.some(f => f.parent === ctx.folder.id)) return false;
      return ctx.withAccess.length === 0;
    },
    data: (ctx) => ({ folder: ctx.folder }),
  },
];

const SEVERITY_ORDER = { danger: 0, warning: 1, info: 2 };

/** Liste des identifiants de règles (documentation / tests). */
export const RULE_IDS = RULES.map(r => r.id);

/**
 * Analyse la matrice et retourne les alertes triées par gravité.
 * @param {{members: object[], folders: object[], drivePermissions: object, rolePresets: object}} state
 * @param {{poles: object, levels: object, roles: object}} [catalog]
 */
export function analyzeDriveState(
  { members = [], folders = [], drivePermissions = {}, rolePresets = {} },
  catalog = getActiveCatalog(),
) {
  const alerts = [];
  const base = { members, folders, drivePermissions, rolePresets, catalog };

  const run = (rule, ctx, id, extra) => {
    try {
      if (!rule.test(ctx)) return;
      alerts.push({
        id,
        ruleId: rule.id,
        severity: rule.severity,
        title: rule.title,
        description: rule.description(ctx),
        fix: rule.fix,
        data: rule.data(ctx),
        ...extra,
      });
    } catch (err) {
      console.warn(`Règle ${rule.id} :`, err);
    }
  };

  const byScope = (scope) => RULES.filter(r => r.scope === scope);
  const roots = new Map(folders.map(f => [f.id, getRootFolder(f, folders)]));

  // Règles par dossier
  folders.forEach(folder => {
    const withAccess = members
      .map(m => ({ member: m, level: (drivePermissions[m.id] || {})[folder.id] || 'none' }))
      .filter(p => p.level !== 'none');
    const ctx = {
      ...base, folder, root: roots.get(folder.id), withAccess,
      editors: withAccess.filter(p => p.level === 'editor'),
    };
    byScope('folder').forEach(rule => run(rule, ctx, `${rule.id}-${folder.id}`, { folderId: folder.id }));
  });

  // Règles par membre et par cellule
  members.forEach(member => {
    const mctx = { ...base, member };
    byScope('member').forEach(rule => run(rule, mctx, `${rule.id}-${member.id}`, { memberId: member.id }));

    const userPerms = drivePermissions[member.id] || {};
    folders.forEach(folder => {
      const ctx = { ...mctx, folder, root: roots.get(folder.id), level: userPerms[folder.id] || 'none' };
      byScope('cell').forEach(rule =>
        run(rule, ctx, `${rule.id}-${member.id}-${folder.id}`, { memberId: member.id, folderId: folder.id }));
    });
  });

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function simulateMemberView(memberId, folders, drivePermissions) {
  const userPerms = drivePermissions[memberId] || {};

  const getEffectiveLevel = (folderId) => {
    const direct = userPerms[folderId];
    if (direct) return { level: direct, source: 'direct' };
    let current = folders.find(f => f.id === folderId);
    let safety = 0;
    while (current && current.parent && safety < 50) {
      const parent = folders.find(f => f.id === current.parent);
      if (!parent) break;
      const parentLevel = userPerms[parent.id];
      if (parentLevel) return { level: parentLevel, source: 'inherited', from: parent };
      current = parent;
      safety++;
    }
    return { level: 'none', source: 'none' };
  };

  return folders.map(f => {
    const effective = getEffectiveLevel(f.id);
    const direct = userPerms[f.id] || 'none';
    return {
      folder: f,
      direct,
      effective: effective.level,
      source: effective.source,
      from: effective.from,
      diff: direct !== effective.level,
    };
  });
}

export function getGlobalStats(members, folders, drivePermissions) {
  let totalPerms = 0;
  const perLevel = { reader: 0, commenter: 0, editor: 0 };
  Object.values(drivePermissions).forEach(perms => {
    Object.values(perms).forEach(lvl => {
      if (lvl !== 'none') {
        totalPerms++;
        perLevel[lvl] = (perLevel[lvl] || 0) + 1;
      }
    });
  });
  return { totalPerms, perLevel };
}
