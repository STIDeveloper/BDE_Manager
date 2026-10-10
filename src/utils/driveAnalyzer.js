import { getRootFolder, PERMISSION_LEVELS } from '../store';

const LEVEL_WEIGHT = { none: 0, reader: 1, commenter: 2, editor: 3 };

const RULES = [
  {
    id: 'confidential-editor-too-many',
    severity: 'danger',
    title: 'Dossier confidentiel ouvert à trop de personnes',
    description: (ctx) => `Le dossier "${ctx.folder.name}" est marqué confidentiel mais ${ctx.count} personnes ont un accès éditeur.`,
    fix: 'Vérifier si toutes ces personnes ont réellement besoin d\'un accès éditeur.',
    test: (ctx) => {
      const isConfidential = (ctx.folder.tags || []).includes('confidential');
      if (!isConfidential) return false;
      const count = ctx.permissionsForFolder.filter(p => p.level === 'editor').length;
      return count >= 4;
    },
    data: (ctx) => {
      const members = ctx.permissionsForFolder
        .filter(p => p.level === 'editor')
        .map(p => p.member);
      return { members, count: members.length, folder: ctx.folder };
    },
  },
  {
    id: 'confidential-non-bureau',
    severity: 'warning',
    title: 'Non-membre du Bureau avec accès éditeur sur un dossier confidentiel',
    description: (ctx) => `${ctx.member.firstName} ${ctx.member.lastName} (${ctx.member.mainRole}) a un accès éditeur sur "${ctx.folder.name}" qui est confidentiel, mais son rôle n'est pas dans le Bureau.`,
    fix: 'Vérifier si son accès est justifié ou s\'il devrait être en lecteur.',
    test: (ctx) => {
      const isConfidential = (ctx.folder.tags || []).includes('confidential');
      if (!isConfidential) return false;
      const bureauRoles = ['Président', 'Vice-Président', 'Trésorier', 'Secrétaire Général'];
      return !bureauRoles.includes(ctx.member.mainRole) && ctx.level === 'editor';
    },
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, level: ctx.level }),
  },
  {
    id: 'editor-out-of-pole',
    severity: 'warning',
    title: 'Accès éditeur sur un dossier hors de son pôle',
    description: (ctx) => `${ctx.member.firstName} ${ctx.member.lastName} (${ctx.member.mainRole}) a un accès éditeur sur "${ctx.folder.name}" qui appartient au ${ctx.root.name}.`,
    fix: 'Un accès éditeur devrait être limité au pôle de rattachement, sauf exception justifiée.',
    test: (ctx) => {
      if (ctx.level !== 'editor') return false;
      const memberPole = getMemberPoleFromRole(ctx.member.mainRole);
      if (!memberPole) return false;
      const folderPole = ctx.root.code;
      if (['00'].includes(folderPole)) return false;
      return memberPole !== folderPole;
    },
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, root: ctx.root, level: ctx.level }),
  },
  {
    id: 'permission-outside-preset',
    severity: 'info',
    title: 'Permission non prévue par le preset du rôle',
    description: (ctx) => `${ctx.member.firstName} (${ctx.member.mainRole}) a une permission "${ctx.level}" sur "${ctx.folder.name}" alors que son preset ne la prévoit pas.`,
    fix: 'Soit le preset doit être mis à jour, soit cette permission est en trop.',
    test: (ctx) => {
      const preset = ctx.rolePresets[ctx.member.mainRole];
      if (!preset) return false;
      const expected = preset[ctx.folder.id] || 'none';
      return expected === 'none' && ctx.level !== 'none';
    },
    data: (ctx) => ({ member: ctx.member, folder: ctx.folder, level: ctx.level }),
  },
  {
    id: 'member-no-permissions',
    severity: 'info',
    title: 'Membre sans aucune permission Drive',
    description: (ctx) => `${ctx.member.firstName} ${ctx.member.lastName} (${ctx.member.mainRole}) n'a accès à aucun dossier.`,
    fix: 'Appliquer un preset ou définir manuellement ses accès.',
    test: (ctx) => {
      if (!ctx.member.mainRole) return false;
      const userPerms = ctx.drivePermissions[ctx.member.id] || {};
      const count = Object.values(userPerms).filter(v => v !== 'none').length;
      return count === 0;
    },
    data: (ctx) => ({ member: ctx.member }),
  },
  {
    id: 'parent-child-incoherence',
    severity: 'warning',
    title: 'Permission incohérente parent/enfant',
    description: (ctx) => `${ctx.member.firstName} a un accès "${ctx.childLevel}" sur "${ctx.child.name}" mais un accès "${ctx.parentLevel}" sur le dossier parent "${ctx.parent.name}".`,
    fix: 'L\'enfant devrait généralement avoir un niveau ≤ au parent.',
    test: (ctx) => {
      const userPerms = ctx.drivePermissions[ctx.member.id] || {};
      const childLevel = userPerms[ctx.folder.id] || 'none';
      if (childLevel === 'none') return false;
      if (!ctx.folder.parent) return false;
      const parent = ctx.folders.find(f => f.id === ctx.folder.parent);
      if (!parent) return false;
      const parentLevel = userPerms[parent.id] || 'none';
      if (parentLevel === 'none') return false;
      return LEVEL_WEIGHT[childLevel] > LEVEL_WEIGHT[parentLevel];
    },
    data: (ctx) => {
      const userPerms = ctx.drivePermissions[ctx.member.id] || {};
      const parent = ctx.folders.find(f => f.id === ctx.folder.parent);
      return {
        member: ctx.member,
        child: ctx.folder,
        parent,
        childLevel: userPerms[ctx.folder.id],
        parentLevel: userPerms[parent.id],
      };
    },
  },
  {
    id: 'trésorerie-too-open',
    severity: 'danger',
    title: 'Dossier Trésorerie accessible par trop de personnes',
    description: (ctx) => `Le dossier "${ctx.folder.name}" est accessible par ${ctx.count} personnes, ce qui est très sensible.`,
    fix: 'Le dossier Trésorerie ne devrait être accessible qu\'au Trésorier, Président et VP.',
    test: (ctx) => {
      if (ctx.folder.id !== 'f00.2') return false;
      const count = ctx.permissionsForFolder.filter(p => p.level !== 'none').length;
      return count > 4;
    },
    data: (ctx) => {
      const members = ctx.permissionsForFolder.map(p => ({ member: p.member, level: p.level }));
      return { members, count: members.length, folder: ctx.folder };
    },
  },
  {
    id: 'folder-empty',
    severity: 'info',
    title: 'Dossier sans aucun accès configuré',
    description: (ctx) => `Le dossier "${ctx.folder.name}" n'a aucun utilisateur ayant une permission.`,
    fix: 'Vérifier qu\'il n\'a pas été oublié ou qu\'il est bien volontairement vide.',
    test: (ctx) => {
      if (ctx.folder.parent === null && ctx.folder.id === 'f04') return false;
      const count = ctx.permissionsForFolder.filter(p => p.level !== 'none').length;
      const hasChildren = ctx.folders.some(f => f.parent === ctx.folder.id);
      if (hasChildren) return false;
      return count === 0;
    },
    data: (ctx) => ({ folder: ctx.folder }),
  },
];

function getMemberPoleFromRole(role) {
  if (!role) return null;
  if (role.startsWith('Respo Com') || role.startsWith('Respo Insta') || role.startsWith('Respo TikTok')) return '01';
  if (role.startsWith('Respo Event') || role.startsWith('Respo Sport')) return '02';
  if (role.startsWith('Respo Partenariat')) return '03';
  return null;
}

export function analyzeDriveState({ members, folders, drivePermissions, rolePresets }) {
  const alerts = [];
  const baseCtx = { members, folders, drivePermissions, rolePresets };

  const permissionsByFolder = {};
  folders.forEach(f => {
    permissionsByFolder[f.id] = members
      .map(m => ({
        member: m,
        level: (drivePermissions[m.id] || {})[f.id] || 'none',
      }))
      .filter(p => p.level !== 'none');
  });

  members.forEach(m => {
    folders.forEach(f => {
      const level = (drivePermissions[m.id] || {})[f.id] || 'none';
      const root = getRootFolder(f, folders);

      const ctx = {
        ...baseCtx, member: m, folder: f, root, level,
        permissionsForFolder: permissionsByFolder[f.id] || [],
      };

      RULES.forEach(rule => {
        try {
          if (rule.test(ctx)) {
            alerts.push({
              id: `${rule.id}-${m.id}-${f.id}`,
              ruleId: rule.id,
              severity: rule.severity,
              title: rule.title,
              description: rule.description(ctx),
              fix: rule.fix,
              data: rule.data(ctx),
              memberId: m.id,
              folderId: f.id,
            });
          }
        } catch (err) { console.warn(`Règle ${rule.id} :`, err); }
      });
    });
  });

  folders.forEach(f => {
    const root = getRootFolder(f, folders);
    const ctx = {
      ...baseCtx, folder: f, root,
      permissionsForFolder: permissionsByFolder[f.id] || [],
    };

    RULES.forEach(rule => {
      if (rule.id.includes('member-') || rule.id.includes('parent-child')) return;
      if (rule.id === 'confidential-editor-too-many' || rule.id === 'trésorerie-too-open' || rule.id === 'folder-empty') {
        try {
          if (rule.test(ctx)) {
            alerts.push({
              id: `${rule.id}-${f.id}`,
              ruleId: rule.id,
              severity: rule.severity,
              title: rule.title,
              description: rule.description(ctx),
              fix: rule.fix,
              data: rule.data(ctx),
              folderId: f.id,
            });
          }
        } catch (err) { console.warn(`Règle globale ${rule.id} :`, err); }
      }
    });
  });

  const seen = new Set();
  const unique = alerts.filter(a => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const order = { danger: 0, warning: 1, info: 2 };
  return unique.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function simulateMemberView(memberId, folders, drivePermissions) {
  const userPerms = drivePermissions[memberId] || {};

  const getEffectiveLevel = (folderId) => {
    const direct = userPerms[folderId];
    if (direct) return { level: direct, source: 'direct' };
    let current = folders.find(f => f.id === folderId);
    let safety = 0;
    while (current && current.parent && safety < 10) {
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