import { useState, useMemo } from 'react';
import { Pencil, Trash2, X, Layers, Info, Plus, Link2, AlertTriangle } from 'lucide-react';
import Modal from '../Modal';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getFolderColor, getRootFolder, getFolderTag,
} from '../../store';
import { useCatalog } from '../../core/useCatalog';
import { resolveMemberRole } from '../../utils/memberRoles';
import { orderedFolders as orderFolders } from '../../utils/folderTree';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';

// ============================================================
// PRESETS DE PERMISSIONS PAR RÔLE
// ============================================================
// Choix UX : un preset est TOUJOURS rattaché à un rôle du catalogue (clé =
// id du rôle, immuable même si le rôle est renommé). On ne crée donc plus
// de preset « à nom libre » : la liste affiche chaque rôle du catalogue,
// groupé par pôle, avec « Créer » ou « Modifier ».
// Les anciennes clés non reconnues (libellés d'avant la migration) restent
// visibles dans « Presets hors catalogue » : on peut les modifier, les
// associer à un rôle (renommage de clé) ou les supprimer — jamais perdues
// silencieusement.

const countLevels = (preset) => {
  const s = { reader: 0, commenter: 0, editor: 0 };
  Object.values(preset || {}).forEach(v => { if (s[v] !== undefined) s[v]++; });
  return s;
};

function PresetStats({ preset }) {
  const s = countLevels(preset);
  return (
    <span className="flex gap-2 text-[11px]" aria-label={`${s.editor} éditeur, ${s.commenter} commentateur, ${s.reader} lecteur`}>
      <span className="text-emerald-500">✏️ {s.editor}</span>
      <span className="text-amber-500">💬 {s.commenter}</span>
      <span className="text-blue-500">👁 {s.reader}</span>
    </span>
  );
}

function PresetEditor({ title, preset, folders, folderTags, copySources, onSave, onCancel }) {
  const [levels, setLevels] = useState(() => ({ ...(preset || {}) }));
  const ordered = useMemo(() => orderFolders(folders, true), [folders]);

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

  const copyFrom = (key) => {
    const src = copySources.find(c => c.key === key);
    if (src) setLevels({ ...src.preset });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(levels);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-elevated/50 border border-line rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-ink text-sm">Preset du rôle « {title} »</h4>
        <button type="button" onClick={onCancel} aria-label="Fermer l'éditeur" className="text-dim hover:text-ink p-1"><X size={16} /></button>
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
        {copySources.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-dim ml-auto">
            Partir de :
            <select value="" onChange={(e) => copyFrom(e.target.value)}
              className="bg-surface border border-line rounded-lg px-2 py-1 text-ink text-xs focus:outline-none focus:border-blue-500">
              <option value="">— preset existant —</option>
              {copySources.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="bg-surface border border-line rounded-lg max-h-[40vh] overflow-y-auto p-2">
        {ordered.map(({ folder, depth }) => {
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
              <div className="flex gap-0.5 shrink-0" role="group" aria-label={`Niveau pour ${folder.code} ${folder.name}`}>
                {PERMISSION_LEVELS.map(l => (
                  <button key={l.id} type="button" onClick={() => setLevel(folder.id, l.id)}
                    title={l.label} aria-label={l.label} aria-pressed={current === l.id}
                    className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${
                      current === l.id ? `${l.bg} ${l.text} ring-2 ring-current` : 'bg-elevated text-dim hover:bg-line'
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
          Enregistrer
        </button>
      </div>
    </form>
  );
}

function PresetSummary({ preset, folders }) {
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

  if (byRoot.length === 0) return <p className="text-[11px] text-dim italic">Aucune permission définie.</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {byRoot.flatMap(({ items }) => items).map(({ folder, level }) => {
        const l = PERMISSION_LEVELS.find(x => x.id === level) || PERMISSION_LEVELS[0];
        return (
          <span key={folder.id} title={`${folder.name} : ${l.label}`}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${l.bg} ${l.text}`}>
            {folder.code}:{l.short}
          </span>
        );
      })}
    </div>
  );
}

export default function RolePresetsModal({ isOpen, onClose }) {
  // Sélecteurs atomiques (Zustand v5).
  const rolePresets = useStore(s => s.rolePresets);
  const folders = useStore(s => s.folders);
  const folderTags = useStore(s => s.folderTags);
  const members = useStore(s => s.members);
  const setRolePreset = useStore(s => s.setRolePreset);
  const deleteRolePreset = useStore(s => s.deleteRolePreset);
  const renameRolePreset = useStore(s => s.renameRolePreset);
  const catalog = useCatalog();

  const [editingKey, setEditingKey] = useState(null);
  const [associating, setAssociating] = useState(null); // { key, target }
  const [search, setSearch] = useState('');

  // Membres par rôle (id du catalogue, y compris rôles libres résolus) et par clé brute.
  const memberCount = useMemo(() => {
    const map = {};
    members.forEach(m => {
      const role = resolveMemberRole(m, catalog);
      const key = role ? role.id : m.mainRole;
      if (key) map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [members, catalog]);

  const legacyKeys = useMemo(
    () => Object.keys(rolePresets || {}).filter(k => !catalog.roles[k]).sort((a, b) => a.localeCompare(b, 'fr')),
    [rolePresets, catalog.roles]);

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => catalog.poleList
    .map(p => ({
      pole: p,
      roles: (catalog.rolesByPole[p.id] || []).filter(r =>
        !q || r.label.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)),
    }))
    .filter(g => g.roles.length > 0), [catalog, q]);
  const visibleLegacy = legacyKeys.filter(k => !q || k.toLowerCase().includes(q));

  const labelOfKey = (key) => catalog.roles[key]?.label || key;
  const copySources = (exceptKey) => Object.keys(rolePresets || {})
    .filter(k => k !== exceptKey)
    .map(k => ({ key: k, label: catalog.roles[k] ? catalog.roles[k].label : `${k} (hors catalogue)`, preset: rolePresets[k] }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  const handleSave = (levels) => {
    setRolePreset(editingKey, levels);
    toast.success('Preset enregistré', labelOfKey(editingKey));
    setEditingKey(null);
  };

  const handleDelete = async (key) => {
    const count = memberCount[key] || 0;
    const ok = await confirmDialog({
      title: `Supprimer le preset « ${labelOfKey(key)} » ?`,
      message: count > 0
        ? `${count} membre${count > 1 ? 's ont' : ' a'} ce rôle. Les permissions déjà attribuées ne seront pas modifiées.`
        : 'Les permissions déjà attribuées ne seront pas modifiées.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    deleteRolePreset(key);
    toast.info('Preset supprimé (annulable)', labelOfKey(key));
  };

  const handleAssociate = async () => {
    if (!associating?.target) return;
    const { key, target } = associating;
    if (rolePresets[target]) {
      const ok = await confirmDialog({
        title: 'Remplacer le preset existant ?',
        message: `Le rôle « ${labelOfKey(target)} » a déjà un preset. Il sera remplacé par le preset « ${key} ».`,
        confirmLabel: 'Remplacer',
        tone: 'warning',
      });
      if (!ok) return;
    }
    renameRolePreset(key, target);
    toast.success(`« ${key} » associé au rôle « ${labelOfKey(target)} »`);
    setAssociating(null);
  };

  const inputCls = 'w-full bg-elevated border border-line rounded-lg px-3 py-2 text-ink placeholder-dim text-sm focus:outline-none focus:border-blue-500';
  const iconBtn = 'p-1.5 rounded-md text-dim transition-colors';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Presets de permissions par rôle" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {editingKey !== null ? (
          <PresetEditor
            key={editingKey}
            title={labelOfKey(editingKey)}
            preset={rolePresets[editingKey] || {}}
            folders={folders}
            folderTags={folderTags}
            copySources={copySources(editingKey)}
            onSave={handleSave}
            onCancel={() => setEditingKey(null)}
          />
        ) : (
          <>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher un rôle ou un pôle"
              placeholder="Rechercher un rôle ou un pôle..." className={inputCls} />

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex items-start gap-2 text-xs text-dim">
              <Info size={14} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Chaque preset est lié à un <strong className="text-ink">rôle du catalogue</strong> : il reste valable
                si le rôle est renommé. Pour un nouveau preset, crée d'abord le rôle (Organisation → Moteur de rôles),
                puis clique sur <strong className="text-ink">Créer</strong> en face de lui.
              </span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
              {groups.length === 0 && visibleLegacy.length === 0 && (
                <div className="text-center py-10 text-dim">
                  <Layers size={32} className="mx-auto mb-2 opacity-30" aria-hidden="true" />
                  <p className="text-sm">{search ? 'Aucun rôle ne correspond.' : 'Aucun rôle dans le catalogue.'}</p>
                </div>
              )}

              {groups.map(({ pole, roles }) => (
                <section key={pole.id} aria-label={`Pôle ${pole.label}`}>
                  <h4 className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-dim mb-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: catalog.poleColor(pole.id) }} />
                    {pole.emoji} {pole.label}
                  </h4>
                  <div className="space-y-1.5">
                    {roles.map(role => {
                      const preset = rolePresets[role.id];
                      const count = memberCount[role.id] || 0;
                      return (
                        <div key={role.id}
                          className="bg-elevated/50 border border-line rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2"
                          style={{ borderLeft: `3px solid ${catalog.poleColor(pole.id)}` }}>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-ink text-sm">{role.label}</span>
                              <span className="text-[10px] text-dim">{catalog.levelLabel(role.level)}</span>
                              {count > 0 && <span className="text-[10px] text-dim">• {count} membre{count > 1 ? 's' : ''}</span>}
                              {preset ? <PresetStats preset={preset} /> : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated border border-line text-dim">Pas de preset</span>
                              )}
                            </div>
                            {preset && <PresetSummary preset={preset} folders={folders} />}
                          </div>
                          <div className="flex gap-0.5 shrink-0 self-end sm:self-center">
                            {preset ? (
                              <>
                                <button type="button" onClick={() => setEditingKey(role.id)}
                                  title="Modifier" aria-label={`Modifier le preset ${role.label}`}
                                  className={`${iconBtn} hover:text-amber-500`}><Pencil size={14} /></button>
                                <button type="button" onClick={() => handleDelete(role.id)}
                                  title="Supprimer" aria-label={`Supprimer le preset ${role.label}`}
                                  className={`${iconBtn} hover:text-red-500`}><Trash2 size={14} /></button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setEditingKey(role.id)}
                                aria-label={`Créer le preset ${role.label}`}
                                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                                <Plus size={12} aria-hidden="true" /> Créer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {visibleLegacy.length > 0 && (
                <section aria-label="Presets hors catalogue" className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3 space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold text-amber-500">
                    <AlertTriangle size={14} aria-hidden="true" /> Presets hors catalogue ({visibleLegacy.length})
                  </h4>
                  <p className="text-[11px] text-dim">
                    Ces presets portent un ancien nom qui ne correspond à aucun rôle. Associe-les à un rôle pour
                    pouvoir les appliquer, ou supprime-les.
                  </p>
                  {visibleLegacy.map(key => {
                    const isAssoc = associating?.key === key;
                    const count = memberCount[key] || 0;
                    return (
                      <div key={key} className="bg-surface border border-line rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ink text-sm">{key}</span>
                          {count > 0 && <span className="text-[10px] text-dim">• {count} membre{count > 1 ? 's' : ''}</span>}
                          <PresetStats preset={rolePresets[key]} />
                          <div className="flex gap-0.5 ml-auto">
                            <button type="button" onClick={() => setAssociating({ key, target: '' })}
                              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-dim hover:text-blue-500 transition-colors">
                              <Link2 size={12} aria-hidden="true" /> Associer à un rôle…
                            </button>
                            <button type="button" onClick={() => setEditingKey(key)}
                              title="Modifier" aria-label={`Modifier le preset ${key}`}
                              className={`${iconBtn} hover:text-amber-500`}><Pencil size={14} /></button>
                            <button type="button" onClick={() => handleDelete(key)}
                              title="Supprimer" aria-label={`Supprimer le preset ${key}`}
                              className={`${iconBtn} hover:text-red-500`}><Trash2 size={14} /></button>
                          </div>
                        </div>
                        {isAssoc && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <select value={associating.target} aria-label={`Rôle cible pour ${key}`}
                              onChange={(e) => setAssociating({ key, target: e.target.value })}
                              className="flex-1 min-w-[180px] bg-elevated border border-line rounded-lg px-2 py-1.5 text-ink text-xs focus:outline-none focus:border-blue-500">
                              <option value="">— Choisir un rôle —</option>
                              {catalog.poleList.map(p => (
                                <optgroup key={p.id} label={`${p.emoji} ${p.label}`}>
                                  {(catalog.rolesByPole[p.id] || []).map(r => (
                                    <option key={r.id} value={r.id}>{r.label}{rolePresets[r.id] ? ' (a déjà un preset)' : ''}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <button type="button" onClick={handleAssociate} disabled={!associating.target}
                              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors">
                              Associer
                            </button>
                            <button type="button" onClick={() => setAssociating(null)}
                              className="text-xs px-2 py-1.5 rounded-lg text-dim hover:text-ink">
                              Annuler
                            </button>
                          </div>
                        )}
                        <PresetSummary preset={rolePresets[key]} folders={folders} />
                      </div>
                    );
                  })}
                </section>
              )}
            </div>
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-line">
          <button type="button" onClick={onClose}
            className="bg-elevated hover:bg-line text-ink font-medium px-4 py-2 rounded-lg transition-colors border border-line text-sm">
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
