import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Layers, Copy, Info } from 'lucide-react';
import Modal from '../Modal';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getFolderColor, getRootFolder, getFolderTag,
} from '../../store';

function PresetEditor({ presetName, preset, folders, folderTags, onSave, onCancel }) {
  const [name, setName] = useState(presetName || '');
  const [levels, setLevels] = useState(() => ({ ...(preset || {}) }));
  const isEditing = !!presetName;

  const orderedFolders = useMemo(() => {
    const result = [];
    const addBranch = (parentId, depth) => {
      folders
        .filter(f => (f.parent ?? null) === parentId)
        .forEach(f => { result.push({ folder: f, depth }); addBranch(f.id, depth + 1); });
    };
    addBranch(null, 0);
    return result;
  }, [folders]);

  const setLevel = (folderId, level) => {
    setLevels(prev => {
      const copy = { ...prev };
      if (level === 'none') delete copy[folderId];
      else copy[folderId] = level;
      return copy;
    });
  };

  const setAllFolders = (level) => {
    const next = {};
    if (level !== 'none') folders.forEach(f => { next[f.id] = level; });
    setLevels(next);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim(), levels);
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink focus:outline-none focus:border-blue-500 text-sm";

  return (
    <form onSubmit={handleSubmit} className="bg-elevated/50 border border-line rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-ink text-sm">
          {isEditing ? `Modifier le preset "${presetName}"` : 'Nouveau preset'}
        </h4>
        <button type="button" onClick={onCancel} className="text-dim hover:text-ink p-1"><X size={16} /></button>
      </div>

      <div>
        <label className="text-[10px] text-dim uppercase font-semibold mb-1 block">Nom du preset (= nom du rôle) *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Respo Com" className={inputCls} required autoFocus />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-dim font-medium">Appliquer partout :</span>
        {PERMISSION_LEVELS.filter(l => l.id !== 'none').map(l => (
          <button key={l.id} type="button" onClick={() => setAllFolders(l.id)}
            className={`text-xs px-2.5 py-1 rounded-lg ${l.bg} ${l.text} hover:opacity-80 font-semibold transition-all`}>
            {l.icon} {l.label}
          </button>
        ))}
        <button type="button" onClick={() => setAllFolders('none')}
          className="text-xs px-2.5 py-1 rounded-lg bg-elevated text-dim hover:bg-line font-semibold transition-all border border-line">
          🚫 Tout retirer
        </button>
      </div>

      <div className="bg-surface border border-line rounded-lg max-h-[40vh] overflow-y-auto p-2">
        {orderedFolders.map(({ folder, depth }) => {
          const color = getFolderColor(folder.color);
          const current = levels[folder.id] || 'none';
          const tagList = (folder.tags || []).map(tid => getFolderTag(tid, folderTags)).filter(Boolean);
          return (
            <div key={folder.id}
              className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-elevated/60 transition-colors"
              style={{ paddingLeft: 8 + depth * 16 }}>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`w-2 h-2 rounded-full ${color.dot} shrink-0`} />
                <span className="text-[10px] font-mono text-dim shrink-0">{folder.code}</span>
                <span className="text-sm text-ink truncate">{folder.name}</span>
                {tagList.slice(0, 1).map((t, i) => {
                  const tc = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
                  return <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${tc.accent} shrink-0`}>{t.label}</span>;
                })}
              </div>
              <div className="flex gap-0.5 shrink-0">
                {PERMISSION_LEVELS.map(l => (
                  <button key={l.id} type="button" onClick={() => setLevel(folder.id, l.id)}
                    title={l.label}
                    className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${
                      current === l.id
                        ? `${l.bg} ${l.text} ring-2 ring-current`
                        : 'bg-elevated text-dim hover:bg-line'
                    }`}>
                    {l.id === 'none' ? '—' : l.short}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
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

function PresetCard({ name, preset, folders, memberCount, onEdit, onDelete, onDuplicate }) {
  const stats = useMemo(() => {
    const s = { reader: 0, commenter: 0, editor: 0 };
    Object.values(preset).forEach(v => { if (s[v] !== undefined) s[v]++; });
    return s;
  }, [preset]);

  const byRoot = useMemo(() => {
    const groups = {};
    folders.forEach(f => {
      if (!preset[f.id] || preset[f.id] === 'none') return;
      const root = getRootFolder(f, folders);
      if (!groups[root.id]) groups[root.id] = { root, items: [] };
      groups[root.id].items.push({ folder: f, level: preset[f.id] });
    });
    return Object.values(groups);
  }, [preset, folders]);

  return (
    <div className="bg-elevated/50 border border-line rounded-xl p-4 hover:border-dim transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="font-bold text-ink">{name}</h4>
          <div className="flex gap-2 mt-1 text-xs flex-wrap">
            <span className="text-emerald-500">✏️ {stats.editor}</span>
            <span className="text-amber-500">💬 {stats.commenter}</span>
            <span className="text-blue-500">👁 {stats.reader}</span>
            {memberCount > 0 && <span className="text-dim">• {memberCount} membre{memberCount > 1 ? 's' : ''}</span>}
          </div>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button onClick={onDuplicate} title="Dupliquer" className="p-1.5 text-dim hover:text-purple-500 transition-colors"><Copy size={14} /></button>
          <button onClick={onEdit} title="Modifier" className="p-1.5 text-dim hover:text-amber-500 transition-colors"><Pencil size={14} /></button>
          <button onClick={onDelete} title="Supprimer" className="p-1.5 text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        {byRoot.length === 0 ? (
          <p className="text-dim italic">Aucune permission définie.</p>
        ) : (
          byRoot.map(({ root, items }) => (
            <div key={root.id}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${getFolderColor(root.color).dot}`} />
                <span className="text-[10px] uppercase tracking-wider font-bold text-dim">{root.code}</span>
              </div>
              <div className="flex flex-wrap gap-1 pl-3">
                {items.map(({ folder, level }) => {
                  const l = PERMISSION_LEVELS.find(x => x.id === level);
                  return (
                    <span key={folder.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${l.bg} ${l.text} border-transparent`}
                      title={folder.name}>
                      {folder.code}:{l.short}
                    </span>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function RolePresetsModal({ isOpen, onClose }) {
  const {
    rolePresets, folders, folderTags, members,
    setRolePreset, deleteRolePreset, renameRolePreset,
  } = useStore();

  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');

  const memberCountByRole = useMemo(() => {
    const map = {};
    members.forEach(m => { if (m.mainRole) map[m.mainRole] = (map[m.mainRole] || 0) + 1; });
    return map;
  }, [members]);

  const filtered = useMemo(() => {
    if (!search) return Object.entries(rolePresets);
    const s = search.toLowerCase();
    return Object.entries(rolePresets).filter(([name]) => name.toLowerCase().includes(s));
  }, [rolePresets, search]);

  const handleSave = (name, levels) => {
    if (editing && editing !== name) {
      renameRolePreset(editing, name);
      setRolePreset(name, levels);
    } else {
      setRolePreset(name, levels);
    }
    setEditing(null);
  };

  const handleDelete = (name) => {
    const count = memberCountByRole[name] || 0;
    const msg = count > 0
      ? `⚠️ "${name}" est le rôle principal de ${count} membre(s).\n\nSupprimer ce preset ?\nLes permissions déjà attribuées ne seront pas modifiées.`
      : `Supprimer le preset "${name}" ?`;
    if (window.confirm(msg)) deleteRolePreset(name);
  };

  const handleDuplicate = (name, preset) => {
    let base = `${name} (copie)`;
    let i = 2;
    while (rolePresets[base]) { base = `${name} (copie ${i})`; i++; }
    setRolePreset(base, { ...preset });
  };

  const inputCls = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink placeholder-dim text-sm focus:outline-none focus:border-blue-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Presets de permissions par rôle">
      <div className="space-y-4">
        {editing !== null ? (
          <PresetEditor
            presetName={editing || null}
            preset={editing ? rolePresets[editing] : {}}
            folders={folders}
            folderTags={folderTags}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un preset..." className={`${inputCls} flex-1`} />
              <button onClick={() => setEditing('')}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
                <Plus size={14} /> Nouveau
              </button>
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2 text-xs text-dim">
              <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span>
                Un preset définit un <strong className="text-ink">modèle de permissions</strong> pour un rôle.
                Tu pourras l'appliquer en 1 clic à un membre ayant ce rôle (vue "Par membre").
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-10 text-dim">
                <Layers size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{search ? 'Aucun preset ne correspond.' : 'Aucun preset défini.'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto">
                {filtered.map(([name, preset]) => (
                  <PresetCard key={name} name={name} preset={preset} folders={folders}
                    memberCount={memberCountByRole[name] || 0}
                    onEdit={() => setEditing(name)}
                    onDelete={() => handleDelete(name)}
                    onDuplicate={() => handleDuplicate(name, preset)} />
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-line">
          <button onClick={onClose}
            className="bg-elevated hover:bg-line text-ink font-medium px-4 py-2 rounded-lg transition-colors border border-line text-sm">
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}