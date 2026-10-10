import React, { useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown, Folder, FolderOpen,
  X, Check, Tag, ChevronRight, AlertTriangle, Layers
} from 'lucide-react';
import Modal from './Modal';
import { useStore, FOLDER_COLORS, getFolderColor, getRootFolder, getFolderTag } from '../store';

// ============================================================
// Formulaire d'édition / création
// ============================================================
function FolderForm({ folder, folders, onSave, onCancel, parentId }) {
  const { folderTags } = useStore();
  const [form, setForm] = useState(() => folder || {
    code: '', name: '', parent: parentId || null, color: 'blue', tags: [],
  });

  const isEditing = !!folder;

  // Calcule le prochain code dispo si parent fourni
  const suggestedCode = useMemo(() => {
    if (isEditing) return folder.code;
    if (!form.parent) {
      const roots = folders.filter(f => !f.parent);
      return String(roots.length).padStart(2, '0');
    }
    const parent = folders.find(f => f.id === form.parent);
    if (!parent) return '';
    const siblings = folders.filter(f => f.parent === form.parent);
    return `${parent.code}.${siblings.length + 1}`;
  }, [form.parent, folders, isEditing, folder]);

  const toggleTag = (tagId) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tagId) ? f.tags.filter(t => t !== tagId) : [...f.tags, tagId],
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({ ...form, code: form.code || suggestedCode });
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500 text-sm";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-elevated/50 border border-line rounded-xl p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-ink text-sm">
          {isEditing ? 'Modifier le dossier' : 'Nouveau dossier'}
        </h4>
        <button type="button" onClick={onCancel} className="text-dim hover:text-ink p-1">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2">
        <div>
          <label className="text-[10px] text-dim uppercase font-semibold mb-1 block">Code</label>
          <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder={suggestedCode} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="text-[10px] text-dim uppercase font-semibold mb-1 block">Nom du dossier *</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Pôle Communication" className={inputCls} required autoFocus />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-dim uppercase font-semibold mb-1 block">Dossier parent</label>
        <select value={form.parent || ''} onChange={(e) => setForm({ ...form, parent: e.target.value || null })}
          className={inputCls}>
          <option value="">— Aucun (racine) —</option>
          {folders
            .filter(f => f.id !== folder?.id)  // ne peut pas être son propre parent
            .map(f => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-[10px] text-dim uppercase font-semibold mb-2 block">Couleur</label>
        <div className="flex gap-2 flex-wrap">
          {FOLDER_COLORS.map(c => (
            <button key={c.id} type="button" onClick={() => setForm({ ...form, color: c.id })}
              className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${
                form.color === c.id ? 'ring-2 ring-offset-2 ring-offset-base ring-ink' : ''
              }`}
              title={c.label}>
              <span className={`w-5 h-5 rounded-full ${c.dot}`} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-[10px] text-dim uppercase font-semibold mb-2 block">
          <Tag size={10} className="inline mr-1" /> Tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {folderTags.map(t => {
            const color = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
            const active = form.tags.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                className={`text-[11px] px-2 py-1 rounded-md border transition-all ${
                  active ? color.accent : 'bg-surface border-line text-dim hover:border-dim'
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-surface hover:bg-elevated text-ink font-medium py-2 rounded-lg transition-colors border border-line text-sm">
          Annuler
        </button>
        <button type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg transition-colors text-sm">
          {isEditing ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Ligne d'un dossier dans l'arborescence
// ============================================================
function FolderRow({ folder, depth, onEdit, onDelete, onMoveUp, onMoveDown, onAddChild, isEditing }) {
  const { folders, folderTags, drivePermissions } = useStore();
  const root = getRootFolder(folder, folders);
  const color = getFolderColor(folder.color || root.color);
  const hasChildren = folders.some(f => f.parent === folder.id);

  // Compte les permissions
  const permCount = useMemo(() => {
    let count = 0;
    Object.values(drivePermissions).forEach(perms => {
      if (perms[folder.id] && perms[folder.id] !== 'none') count++;
    });
    return count;
  }, [drivePermissions, folder.id]);

  return (
    <div
      className={`group/row flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-elevated/60 transition-colors ${isEditing ? 'bg-blue-500/5 ring-1 ring-blue-500/30' : ''}`}
      style={{ paddingLeft: 8 + depth * 20 }}
    >
      {/* Indentation visuelle */}
      {depth > 0 && (
        <span className="text-dim/40 text-xs select-none" style={{ marginLeft: -14 }}>
          └
        </span>
      )}

      {/* Icône dossier */}
      {hasChildren ? (
        <FolderOpen size={14} className={color.text} />
      ) : (
        <Folder size={14} className={color.text} />
      )}

      {/* Code */}
      <span className="text-[10px] font-mono text-dim shrink-0 w-12">{folder.code}</span>

      {/* Nom */}
      <span className="text-sm text-ink font-medium truncate flex-1">{folder.name}</span>

      {/* Tags */}
      <div className="flex gap-1 shrink-0">
        {(folder.tags || []).map(tagId => {
          const tag = getFolderTag(tagId, folderTags);
          if (!tag) return null;
          const tagColor = FOLDER_COLORS.find(c => c.id === tag.color) || FOLDER_COLORS[0];
          return (
            <span key={tagId} className={`text-[9px] px-1.5 py-0.5 rounded border ${tagColor.accent}`}>
              {tag.label}
            </span>
          );
        })}
      </div>

      {/* Compteur permissions */}
      {permCount > 0 && (
        <span className="text-[10px] bg-elevated text-dim px-1.5 py-0.5 rounded font-mono shrink-0">
          {permCount} <span className="opacity-60">accès</span>
        </span>
      )}

      {/* Actions */}
      <div className="flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onMoveUp(folder.id)} title="Monter"
          className="p-1 text-dim hover:text-ink transition-colors">
          <ChevronUp size={12} />
        </button>
        <button onClick={() => onMoveDown(folder.id)} title="Descendre"
          className="p-1 text-dim hover:text-ink transition-colors">
          <ChevronDown size={12} />
        </button>
        <button onClick={() => onAddChild(folder.id)} title="Ajouter un sous-dossier"
          className="p-1 text-dim hover:text-blue-500 transition-colors">
          <Plus size={12} />
        </button>
        <button onClick={() => onEdit(folder)} title="Modifier"
          className="p-1 text-dim hover:text-amber-500 transition-colors">
          <Pencil size={12} />
        </button>
        <button onClick={() => onDelete(folder)} title="Supprimer"
          className="p-1 text-dim hover:text-red-500 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Modale principale
// ============================================================
export default function FolderManagerModal({ isOpen, onClose }) {
  const {
    folders, folderTags, addFolder, updateFolder, deleteFolder,
    moveFolderUp, moveFolderDown,
    addFolderTag, deleteFolderTag,
  } = useStore();

  const [editingId, setEditingId] = useState(null);
  const [creatingParentId, setCreatingParentId] = useState(undefined); // undefined = pas en création
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');

  // Reconstruit l'arbre ordonné
  const orderedTree = useMemo(() => {
    const result = [];
    const addBranch = (parentId, depth) => {
      folders
        .filter(f => (f.parent ?? null) === parentId)
        .forEach(f => {
          result.push({ folder: f, depth });
          addBranch(f.id, depth + 1);
        });
    };
    addBranch(null, 0);
    return result;
  }, [folders]);

  const handleSaveNew = (data) => {
    addFolder(data);
    setCreatingParentId(undefined);
  };

  const handleSaveEdit = (data) => {
    updateFolder(editingId, data);
    setEditingId(null);
  };

  const handleDelete = (folder) => {
    const childCount = folders.filter(f => f.parent === folder.id).length;
    const msg = childCount > 0
      ? `⚠️ "${folder.name}" contient ${childCount} sous-dossier(s).\n\nSupprimer ce dossier ET tous ses sous-dossiers ?\n\nToutes les permissions associées seront également perdues.`
      : `Supprimer "${folder.name}" ?\n\nToutes les permissions associées seront perdues.`;
    if (window.confirm(msg)) deleteFolder(folder.id);
  };

  const handleAddTag = () => {
    const label = newTagLabel.trim();
    if (!label) return;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) + '-' + Math.random().toString(36).slice(2, 6);
    addFolderTag({ id, label, color: newTagColor });
    setNewTagLabel('');
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:border-blue-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestion de l'arborescence Drive">
      <div className="space-y-4">
        {/* Barre d'action supérieure */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            onClick={() => { setCreatingParentId(null); setEditingId(null); }}
            disabled={creatingParentId === null}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Nouveau dossier racine
          </button>
          <button
            onClick={() => setShowTagManager(!showTagManager)}
            className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
              showTagManager ? 'bg-amber-500/10 border-amber-500/50 text-amber-500' : 'bg-elevated border-line text-dim hover:text-ink'
            }`}>
            <Tag size={14} /> Gérer les tags ({folderTags.length})
          </button>
        </div>

        {/* Gestionnaire de tags */}
        {showTagManager && (
          <div className="bg-elevated/50 border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink flex items-center gap-2">
                <Tag size={14} /> Tags disponibles
              </h4>
              <button onClick={() => setShowTagManager(false)} className="text-dim hover:text-ink">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {folderTags.map(t => {
                const color = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-surface rounded-lg border border-line">
                    <span className={`text-xs px-2 py-1 rounded border ${color.accent}`}>{t.label}</span>
                    <button onClick={() => {
                      if (window.confirm(`Supprimer le tag "${t.label}" ?\n\nIl sera retiré de tous les dossiers.`)) deleteFolderTag(t.id);
                    }} className="text-dim hover:text-red-500 p-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-2 border-t border-line">
              <input type="text" value={newTagLabel} onChange={(e) => setNewTagLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                placeholder="Nom du nouveau tag..." className={`${inputCls} flex-1`} />
              <div className="flex gap-1">
                {FOLDER_COLORS.slice(0, 5).map(c => (
                  <button key={c.id} type="button" onClick={() => setNewTagColor(c.id)}
                    className={`w-7 h-7 rounded-lg transition-all flex items-center justify-center ${
                      newTagColor === c.id ? 'ring-2 ring-offset-2 ring-offset-base ring-ink' : ''
                    }`}>
                    <span className={`w-4 h-4 rounded-full ${c.dot}`} />
                  </button>
                ))}
              </div>
              <button onClick={handleAddTag}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 rounded-lg text-sm font-medium transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Formulaire de création racine */}
        {creatingParentId === null && (
          <FolderForm
            folders={folders}
            parentId={null}
            onSave={handleSaveNew}
            onCancel={() => setCreatingParentId(undefined)}
          />
        )}

        {/* Arborescence */}
        <div className="bg-surface border border-line rounded-xl max-h-[50vh] overflow-y-auto">
          {orderedTree.length === 0 ? (
            <div className="p-8 text-center text-dim text-sm">
              <Layers size={32} className="mx-auto mb-2 opacity-30" />
              Aucun dossier. Clique sur "Nouveau dossier racine" pour commencer.
            </div>
          ) : (
            <div className="p-2">
              {orderedTree.map(({ folder, depth }) => {
                const isEditingThis = editingId === folder.id;
                const isCreatingChild = creatingParentId === folder.id;

                return (
                  <React.Fragment key={folder.id}>
                    {isEditingThis ? (
                      <div className="my-2">
                        <FolderForm
                          folder={folder}
                          folders={folders}
                          onSave={handleSaveEdit}
                          onCancel={() => setEditingId(null)}
                        />
                      </div>
                    ) : (
                      <FolderRow
                        folder={folder}
                        depth={depth}
                        onEdit={(f) => { setEditingId(f.id); setCreatingParentId(undefined); }}
                        onDelete={handleDelete}
                        onMoveUp={moveFolderUp}
                        onMoveDown={moveFolderDown}
                        onAddChild={(id) => { setCreatingParentId(id); setEditingId(null); }}
                        isEditing={false}
                      />
                    )}

                    {isCreatingChild && (
                      <div className="my-2" style={{ marginLeft: 8 + (depth + 1) * 20 }}>
                        <FolderForm
                          folders={folders}
                          parentId={folder.id}
                          onSave={handleSaveNew}
                          onCancel={() => setCreatingParentId(undefined)}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-start gap-2 text-xs text-dim bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
          <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <div>
            Les <strong className="text-ink">tags</strong> permettent d'identifier rapidement le type de contenu (confidentiel, public...).
            Ils apparaîtront dans la matrice de permissions et pourront alimenter des <strong className="text-ink">alertes automatiques</strong> à l'étape suivante.
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose}
            className="bg-elevated hover:bg-line text-ink font-medium px-4 py-2 rounded-lg transition-colors border border-line text-sm">
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}