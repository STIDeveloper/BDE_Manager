export function generateAppsScript({ members, folders, drivePermissions, folderIdsByCode = {} }) {
  const ordered = (function () {
    const result = [];
    const addBranch = (parentId) => {
      folders
        .filter(f => (f.parent ?? null) === parentId)
        .forEach(f => { result.push(f); addBranch(f.id); });
    };
    addBranch(null);
    return result;
  })();

  const foldersTable = ordered.map(f => ({
    code: f.code,
    name: f.name,
    id: folderIdsByCode[f.id] || folderIdsByCode[f.code] || `TODO_ID_${f.code.replace(/\./g, '_')}`,
  }));

  const membersTable = members
    .filter(m => m.email && m.email.trim())
    .map(m => {
      const perms = {};
      const userPerms = drivePermissions[m.id] || {};
      ordered.forEach(f => {
        const lvl = userPerms[f.id] || 'none';
        if (lvl !== 'none') perms[f.code] = lvl;
      });
      return {
        name: `${m.firstName}${m.lastName ? ' ' + m.lastName : ''}`,
        email: m.email.trim(),
        role: m.mainRole || '',
        permissions: perms,
      };
    });

  const membersWithoutEmail = members.filter(m => !m.email || !m.email.trim());

  const script = `/**
 * ============================================================
 * SCRIPT DE PARTAGE DRIVE — BDE
 * ============================================================
 * Généré par BDE Manager
 * Date : ${new Date().toLocaleString('fr-FR')}
 *
 * MODE D'EMPLOI :
 * 1. Va sur https://script.google.com/
 * 2. Crée un nouveau projet
 * 3. Colle CE SCRIPT intégralement
 * 4. IMPORTANT : Complète la table FOLDERS_ID ci-dessous
 *    en remplaçant les "TODO_ID_XX" par les vrais IDs Google Drive
 * 5. Exécute d'abord previewChanges() pour vérifier (mode simulation)
 * 6. Puis exécute applySharing() pour appliquer réellement
 * ============================================================
 */

const FOLDERS_ID = {
${foldersTable.map(f => `  '${f.code}': '${f.id}',  // ${f.name}`).join('\n')}
};

const MEMBERS = ${JSON.stringify(membersTable, null, 2)};

const ROLE_MAP = {
  'reader': 'VIEWER',
  'commenter': 'COMMENTER',
  'editor': 'EDITOR'
};

function previewChanges() {
  const log = [];
  log.push('=== SIMULATION DE PARTAGE ===');
  log.push(\`\${MEMBERS.length} membre(s) à traiter\`);
  log.push(\`\${Object.keys(FOLDERS_ID).length} dossier(s) configuré(s)\`);
  log.push('');

  Object.entries(FOLDERS_ID).forEach(([code, id]) => {
    if (id.startsWith('TODO_ID_')) log.push(\`⚠️  Dossier \${code} : ID manquant (\${id})\`);
  });

  log.push('');
  MEMBERS.forEach(m => {
    log.push(\`👤 \${m.name} <\${m.email}>\`);
    Object.entries(m.permissions).forEach(([code, lvl]) => {
      const folderId = FOLDERS_ID[code];
      if (!folderId || folderId.startsWith('TODO_ID_')) log.push(\`   ⏭️  \${code} : ignoré (ID manquant)\`);
      else log.push(\`   → \${code} : \${ROLE_MAP[lvl]}\`);
    });
    log.push('');
  });

  Logger.log(log.join('\\n'));
  return log.join('\\n');
}

function applySharing() {
  let applied = 0, errors = 0;

  MEMBERS.forEach(m => {
    Object.entries(m.permissions).forEach(([code, lvl]) => {
      const folderId = FOLDERS_ID[code];
      if (!folderId || folderId.startsWith('TODO_ID_')) return;

      try {
        const folder = DriveApp.getFolderById(folderId);
        const role = ROLE_MAP[lvl];

        try { folder.removeEditor(m.email); } catch (e) {}
        try { folder.removeViewer(m.email); } catch (e) {}

        if (role === 'EDITOR') folder.addEditor(m.email);
        else if (role === 'COMMENTER') folder.addCommenter(m.email);
        else folder.addViewer(m.email);

        applied++;
        Logger.log(\`✓ \${m.name} → \${code} (\${role})\`);
      } catch (err) {
        errors++;
        Logger.log(\`✗ \${m.name} → \${code} : \${err.message}\`);
      }
    });
  });

  Logger.log(\`\\n=== TERMINÉ ===\`);
  Logger.log(\`\${applied} permission(s) appliquée(s), \${errors} erreur(s)\`);
}
`;

  return { script, membersWithoutEmail, membersTable, foldersTable };
}

export function generateInstructionsText({ membersTable, foldersTable, membersWithoutEmail }) {
  const lines = [];
  lines.push('📋 ACTIONS À EFFECTUER SUR GOOGLE DRIVE');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push('MODE D\'EMPLOI :');
  lines.push('1. Ouvre https://script.google.com/');
  lines.push('2. Nouveau projet → colle le fichier .gs généré');
  lines.push('3. Complète la table FOLDERS_ID avec les vrais IDs');
  lines.push('4. Exécute previewChanges() pour vérifier');
  lines.push('5. Exécute applySharing() pour appliquer');
  lines.push('');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push('📁 DOSSIERS À CONFIGURER :');
  lines.push('');
  foldersTable.forEach(f => {
    lines.push(`  [${f.code}] ${f.name}`);
    lines.push(`       ID : ${f.id}`);
    lines.push('');
  });
  lines.push('');
  lines.push('='.repeat(50));
  lines.push('');
  lines.push('👥 PERMISSIONS À APPLIQUER :');
  lines.push('');
  membersTable.forEach(m => {
    lines.push(`  ${m.name} <${m.email}>`);
    if (m.role) lines.push(`    Rôle : ${m.role}`);
    Object.entries(m.permissions).forEach(([code, lvl]) => {
      lines.push(`    ${code} : ${lvl.toUpperCase()}`);
    });
    lines.push('');
  });
  if (membersWithoutEmail.length > 0) {
    lines.push('');
    lines.push('⚠️ MEMBRES SANS EMAIL (à compléter) :');
    membersWithoutEmail.forEach(m => {
      lines.push(`  - ${m.firstName} ${m.lastName || ''} (${m.mainRole || 'Sans rôle'})`);
    });
  }
  return lines.join('\n');
}