// ============================================================
// BACKUP COMPLET — format & inspection (helpers purs)
// ============================================================
// Format du fichier exporté par BackupButtons :
// {
//   app: 'bde-manager',
//   version: <STORE_VERSION>,
//   exportedAt: ISO 8601,
//   data: { ...état du store principal (coffre uniquement chiffré) },
//   rolesEngine: {             // OPTIONNEL — configuration du moteur de rôles
//     version, exportedAt,     // (useRolesStore.exportConfig()) : poids,
//     config: { weights, penalties, capacities, minScore, lockedPairs, constraints }
//   }                          // pénalités, contraintes, verrous.
// }
// Les candidats importés (CSV) du moteur NE sont PAS inclus (données perso).

/** Assemble le fichier de backup complet. */
export function buildFullBackup(mainExport, engineExport) {
  const out = { ...mainExport };
  if (engineExport && typeof engineExport === 'object') out.rolesEngine = engineExport;
  return out;
}

const countOf = (v) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

/**
 * Vérifie qu'un objet JSON ressemble à un backup BDE Manager et en
 * extrait un résumé pour la confirmation.
 * @returns {{ ok: true, summary: object } | { ok: false, error: string }}
 */
export function inspectBackup(payload, currentVersion) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Le fichier ne contient pas un objet JSON.' };
  }
  if (payload.app && payload.app !== 'bde-manager') {
    return { ok: false, error: `Ce fichier provient d'une autre application (« ${String(payload.app).slice(0, 40)} »).` };
  }
  const d = payload.data;
  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return { ok: false, error: 'Ce fichier n\'est pas un backup BDE Manager (section « data » absente).' };
  }
  const looksLikeBde = ['members', 'columns', 'drivePermissions', 'roles', 'rolePresets', 'folders']
    .some(k => k in d);
  if (!looksLikeBde) {
    return { ok: false, error: 'Ce fichier ne contient aucune donnée BDE Manager reconnue.' };
  }
  if (d.members !== undefined && !Array.isArray(d.members)) {
    return { ok: false, error: 'Backup corrompu : la liste des membres est invalide.' };
  }

  const version = Number(payload.version) || 1;
  const exportedAt = payload.exportedAt ? new Date(payload.exportedAt) : null;
  return {
    ok: true,
    summary: {
      version,
      newerThanApp: Number.isFinite(currentVersion) && version > currentVersion,
      exportedAt: exportedAt && !Number.isNaN(exportedAt.getTime()) ? exportedAt : null,
      members: countOf(d.members),
      columns: countOf(d.columns),
      // Avant la v11 : pas de catalogue → les rôles par défaut seront utilisés.
      roles: d.roles ? countOf(d.roles) : null,
      hasVault: !!(d.vaultEntriesBlob || d._legacyVaultEntries),
      hasEngine: !!(payload.rolesEngine && typeof payload.rolesEngine === 'object' && payload.rolesEngine.config),
    },
  };
}

/** Lignes lisibles du résumé (pour confirmDialog.details). */
export function backupSummaryLines(summary) {
  const date = summary.exportedAt
    ? summary.exportedAt.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    : 'inconnue';
  const lines = [
    `Exporté le : ${date}`,
    `Version du format : ${summary.version}${summary.newerThanApp ? ' (plus récente que l\'application !)' : ''}`,
    `${summary.members} membre${summary.members > 1 ? 's' : ''} · ${summary.columns} colonne${summary.columns > 1 ? 's' : ''}`,
    summary.roles === null
      ? 'Catalogue de rôles : absent (ancien format → rôles par défaut)'
      : `Catalogue : ${summary.roles} rôle${summary.roles > 1 ? 's' : ''}`,
    summary.hasVault ? 'Coffre-fort : présent (chiffré, à déverrouiller après import)' : 'Coffre-fort : absent',
    summary.hasEngine ? 'Configuration du moteur de rôles : présente' : 'Configuration du moteur de rôles : absente',
  ];
  return lines;
}

/** Nom de fichier horodaté (sans « : », interdit sous Windows). */
export function backupFileName(prefix = 'BDE_Backup', date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}h${pad(date.getMinutes())}`;
  return `${prefix}_${stamp}.json`;
}
