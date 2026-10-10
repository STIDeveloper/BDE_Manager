// ============================================================
// ARBORESCENCE DRIVE — helpers PURS (aucune dépendance au store)
// ============================================================
// Dupliqués volontairement depuis src/store.js pour que les utilitaires
// (analyseur, organigramme, exports) restent testables sous Node sans
// charger Zustand ni le middleware de persistance.

/** Dossier racine d'un dossier (protégé contre les cycles). */
export function getRootFolder(folder, folders) {
  let f = folder;
  const seen = new Set();
  while (f && f.parent && !seen.has(f.id)) {
    seen.add(f.id);
    const parent = folders.find(x => x.id === f.parent);
    if (!parent) break;
    f = parent;
  }
  return f;
}

/** Tag d'un dossier par id. */
export function getFolderTag(tagId, folderTags) {
  return (folderTags || []).find(t => t.id === tagId);
}

/** Dossiers dans l'ordre de l'arborescence (parcours en profondeur). */
export function orderedFolders(folders, withDepth = false) {
  const result = [];
  const visited = new Set();
  const addBranch = (parentId, depth) => {
    folders
      .filter(f => (f.parent ?? null) === parentId && !visited.has(f.id))
      .forEach(f => {
        visited.add(f.id);
        result.push(withDepth ? { folder: f, depth } : f);
        addBranch(f.id, depth + 1);
      });
  };
  addBranch(null, 0);
  return result;
}

/** Ensemble des ids descendants d'un dossier (le dossier lui-même exclu). */
export function folderDescendantIds(folderId, folders) {
  const out = new Set();
  let frontier = [folderId];
  while (frontier.length) {
    const next = [];
    folders.forEach(f => {
      if (f.parent && frontier.includes(f.parent) && !out.has(f.id) && f.id !== folderId) {
        out.add(f.id);
        next.push(f.id);
      }
    });
    frontier = next;
  }
  return out;
}
