// ============================================================
// MIGRATIONS DU STORE PRINCIPAL (fonctions pures)
// ============================================================
// Appelées depuis l'option `migrate` du middleware persist (src/store.js),
// c'est-à-dire AVANT l'hydratation : l'application démarre toujours sur des
// données migrées (l'ancienne migration lancée depuis App.jsx s'exécutait
// après l'hydratation et était écrasée à la première écriture).
//
// Toutes les migrations sont idempotentes et ne suppriment aucune donnée.

import { migrateMemberRole, migratePresets } from './roleAliases.js';
import { createDefaultCatalog, normalizeCatalog } from './catalog.js';

export const STORE_VERSION = 11;

/** Clé localStorage de l'ancien store du moteur (capacités par rôle). */
const ROLES_ENGINE_STORAGE_KEY = 'bde-roles-storage';

function readLegacyEngineCapacities(storage) {
  try {
    const raw = storage?.getItem?.(ROLES_ENGINE_STORAGE_KEY);
    if (!raw) return null;
    const caps = JSON.parse(raw)?.state?.capacities;
    return caps && typeof caps === 'object' ? caps : null;
  } catch {
    return null;
  }
}

/**
 * v10 → v11 : introduction du catalogue dynamique.
 *  - crée `poles` / `levels` / `roles` (catalogue par défaut) s'ils n'existent pas ;
 *  - reprend les capacités personnalisées de l'ancien store du moteur ;
 *  - convertit les rôles des membres (libellés → ids, ancien libellé conservé) ;
 *  - convertit les clés des presets Drive sans perte.
 * @param {object} state  état persisté (non hydraté)
 * @param {{ storage?: Storage }} [env]
 */
export function migrateToCatalog(state, env = {}) {
  const s = { ...(state || {}) };

  let catalog;
  if (s.roles && s.poles && s.levels) {
    catalog = normalizeCatalog({ poles: s.poles, levels: s.levels, roles: s.roles });
  } else {
    catalog = createDefaultCatalog();
    const caps = readLegacyEngineCapacities(env.storage);
    if (caps) {
      Object.entries(caps).forEach(([roleId, cap]) => {
        const n = Number(cap);
        if (catalog.roles[roleId] && Number.isFinite(n)) {
          catalog.roles[roleId].capacity = Math.max(0, Math.min(99, Math.round(n)));
        }
      });
    }
  }
  s.poles = catalog.poles;
  s.levels = catalog.levels;
  s.roles = catalog.roles;

  if (Array.isArray(s.members)) {
    s.members = s.members.map(m => migrateMemberRole(m, catalog));
  }
  if (s.rolePresets && typeof s.rolePresets === 'object') {
    s.rolePresets = migratePresets(s.rolePresets, catalog);
  }
  // Champs techniques de l'ancienne migration (App.jsx) devenus inutiles.
  delete s._migrationVersion;
  delete s._migratedAt;
  return s;
}

/**
 * Point d'entrée unique utilisé par persist.migrate.
 * @param {object} persisted
 * @param {number} fromVersion
 * @param {{ storage?: Storage }} [env]
 */
export function migrateMainStore(persisted, fromVersion, env = {}) {
  let s = persisted || {};

  if (fromVersion < 10) {
    // Ancien coffre (hash SHA-256 non salé + entrées en clair) : mis de côté
    // pour une migration explicite par l'utilisateur dans l'onglet Coffre.
    // Les entrées sont conservées même sans hash (aucune perte de données).
    const hasLegacyVault = Array.isArray(s.vaultEntries) && s.vaultEntries.length > 0;
    s = {
      ...s,
      _legacyMasterHash: hasLegacyVault ? (s.masterHash || null) : null,
      _legacyVaultEntries: hasLegacyVault ? s.vaultEntries : null,
      vaultSalt: null,
      vaultVerifier: null,
      vaultEntriesBlob: null,
      masterHash: null,
    };
    delete s.vaultEntries;
  }

  if (fromVersion < 11) {
    s = migrateToCatalog(s, env);
  }

  return s;
}
