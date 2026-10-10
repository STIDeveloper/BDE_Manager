// ============================================================
// MIGRATIONS AUTOMATIQUES DU STORE
// ============================================================

import { migrateMemberRole, migratePresets, resolveRoleId } from './roleAliases.js';
import { isValidRoleId } from './roles.js';

export function migrateMainStore(store) {
  const migrated = { ...store };

  if (Array.isArray(migrated.members)) {
    migrated.members = migrated.members.map(m => migrateMemberRole(m));
  }

  if (migrated.rolePresets) {
    migrated.rolePresets = migratePresets(migrated.rolePresets);
  }

  if (Array.isArray(migrated.availableRoles)) {
    const ids = new Set();
    migrated.availableRoles.forEach(r => {
      const id = resolveRoleId(r);
      if (id && isValidRoleId(id)) ids.add(id);
    });
    migrated.availableRoles = Array.from(ids);
  }

  migrated._migrationVersion = (migrated._migrationVersion || 0) + 1;
  migrated._migratedAt = new Date().toISOString();

  return migrated;
}

export function needsMigration(store) {
  if (!store) return false;
  if ((store._migrationVersion || 0) < 1) return true;
  if (Array.isArray(store.members)) {
    for (const m of store.members) {
      if (m.mainRole && !isValidRoleId(m.mainRole)) return true;
    }
  }
  return false;
}

export function getMigrationSummary(storeBefore, storeAfter) {
  if (!storeBefore || !storeAfter) return null;
  const before = storeBefore.members || [];
  const after = storeAfter.members || [];
  let changed = 0;
  before.forEach((m, i) => {
    if (after[i] && m.mainRole !== after[i].mainRole) changed++;
  });
  return {
    membersMigrated: changed,
    totalMembers: after.length,
    presetsMigrated: Object.keys(storeAfter.rolePresets || {}).length,
  };
}