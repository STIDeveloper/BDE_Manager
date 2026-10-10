// ============================================================
// CONVERSION DU SEED BDE → IDs DU CATALOGUE (pur)
// ============================================================
// Le seed (src/data/bdeSeed.js) utilise les libellés historiques. Au
// chargement on les convertit avec le résolveur « catalogue-aware » :
//  - membres : mainRole → id (ancien libellé conservé dans legacyMainRole) ;
//    un libellé non résolu reste tel quel (affiché « hors catalogue ») ;
//  - presets : clés → ids ; une clé non résolue ou en collision est
//    conservée telle quelle (jamais supprimée).

import { migrateMemberRole, migratePresets } from '../../core/roleAliases.js';
import { buildBDEConfig, BDE_NEW_PRESETS } from '../../data/bdeSeed.js';

export function convertSeedMembers(members, catalog) {
  return (members || []).map(m => migrateMemberRole(m, catalog));
}

export function convertSeedPresets(presets, catalog) {
  return migratePresets(presets, catalog);
}

/**
 * Config BDE prête à charger dans le store.
 * @param {{poles: object, levels: object, roles: object}} catalog
 * @returns {{ members: object[], columns: object[], drivePermissions: object, rolePresets: object }}
 *   `rolePresets` : presets officiels (ids) à fusionner dans le store.
 */
export function buildConvertedBDEConfig(catalog) {
  const raw = buildBDEConfig();
  return {
    columns: raw.columns,
    drivePermissions: raw.drivePermissions,
    members: convertSeedMembers(raw.members, catalog),
    rolePresets: convertSeedPresets(BDE_NEW_PRESETS, catalog),
  };
}
