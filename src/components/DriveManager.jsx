import { useState, useMemo } from 'react';
import {
  FolderTree, Grid3x3, User, Folder, Search, X, Info, Settings2,
  Sparkles, Wand2, CheckCircle2, AlertCircle, AlertTriangle, Circle,
  Shield, Eye, GitCompare, Code2, Download,
} from 'lucide-react';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getRootFolder, getFolderColor, getFolderTag, getMemberConfigStatus, CONFIG_STATUS_META,
} from '../store';
import { useCatalogMaps, memberRoleLabel } from '../core/useCatalog';
import { presetKeyForMember } from '../utils/memberRoles';
import { analyzeDriveState } from '../utils/driveAnalyzer';
import { confirmDialog } from './ui/confirmStore';
import FolderManagerModal from './drive/FolderManagerModal';
import RolePresetsModal from './drive/RolePresetsModal';
import InsightsPanel from './drive/InsightsPanel';
import SearchInverse from './drive/SearchInverse';
import ShareSimulation from './drive/ShareSimulation';
import ExportModal from './drive/ExportModal';
import ShareScriptModal from './drive/ShareScriptModal';
import DiffView from './drive/DiffView';
import MatrixView from './drive/MatrixView';
import { toast } from './ui/toastStore';

const getPerm = (drivePermissions, memberId, folderId) =>
  drivePermissions[memberId]?.[folderId] || 'none';

const dotClass = (colorId) =>
  (FOLDER_COLORS.find(c => c.id === colorId) || FOLDER_COLORS[FOLDER_COLORS.length - 1]).dot;

// Couleur de texte Tailwind d'une couleur de dossier (FOLDER_COLORS n'a pas de clé `text`).
const FOLDER_TEXT = {
  red: 'text-red-500', blue: 'text-blue-500', purple: 'text-purple-500',
  amber: 'text-amber-500', emerald: 'text-emerald-500', zinc: 'text-dim',
};

const StatusIcon = ({ status }) => {
  const meta = CONFIG_STATUS_META[status] || CONFIG_STATUS_META.empty;
  const common = { size: 12, role: 'img', 'aria-label': `Statut : ${meta.label}` };
  if (status === 'complete') return <CheckCircle2 {...common} className="text-emerald-500 shrink-0" />;
  if (status === 'partial') return <AlertCircle {...common} className="text-amber-500 shrink-0" />;
  if (status === 'mismatch') return <AlertTriangle {...common} className="text-red-500 shrink-0" />;
  return <Circle {...common} className="text-dim/40 shrink-0" />;
};

/** Boutons de niveau (—/L/C/E) accessibles pour une cellule membre × dossier. */
function LevelPicker({ value, onChange, label }) {
  return (
    <div className="flex gap-0.5 shrink-0" role="group" aria-label={label}>
      {PERMISSION_LEVELS.map(l => (
        <button key={l.id} type="button" onClick={() => onChange(l.id)}
          title={l.label} aria-label={l.label} aria-pressed={value === l.id}
          className={`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${
            value === l.id ? `${l.bg} ${l.text} ring-2 ring-current` : 'bg-elevated text-dim hover:bg-line'
          }`}>
          {l.id === 'none' ? '—' : l.short}
        </button>
      ))}
    </div>
  );
}

function ByMemberView() {
  // Sélecteurs atomiques (Zustand v5) : pas de re-rendu sur les autres clés.
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const folderTags = useStore(s => s.folderTags);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const setPermission = useStore(s => s.setPermission);
  const clearMemberPermissions = useStore(s => s.clearMemberPermissions);
  const applyRolePresetToMember = useStore(s => s.applyRolePresetToMember);
  const catalog = useCatalogMaps();
  const [selectedId, setSelectedId] = useState(members[0]?.id || null);
  const [search, setSearch] = useState('');

  const selected = members.find(m => m.id === selectedId);
  const filtered = members.filter(m =>
    !search ||
    m.firstName.toLowerCase().includes(search.toLowerCase()) ||
    (m.lastName || '').toLowerCase().includes(search.toLowerCase())
  );

  const groupedFolders = useMemo(() => {
    const groups = {};
    folders.forEach(f => {
      const root = getRootFolder(f, folders);
      if (!groups[root.id]) groups[root.id] = { root, items: [] };
      groups[root.id].items.push(f);
    });
    return Object.values(groups);
  }, [folders]);

  // ⚠️ FIX #19 : batch atomique pour "Tout en X"
  const setAll = async (level) => {
    if (!selected) return;
    const { runBatch } = useStore.getState();
    await runBatch(async () => {
      folders.forEach(f => setPermission(selected.id, f.id, level));
    });
    toast.success(`Toutes les permissions en ${level}`, selected.firstName);
  };

  const roleText = (m) => memberRoleLabel(m, catalog.roles) || 'Sans rôle';
  // Clé du preset : id du rôle (mainRole), ou id résolu pour un ancien rôle libre.
  const presetKey = selected ? presetKeyForMember(selected, rolePresets, catalog) : null;
  const presetLabel = presetKey ? (catalog.roles[presetKey]?.label || presetKey) : '';

  const handleApplyPreset = async () => {
    if (!selected || !presetKey) return;
    const ok = await confirmDialog({
      title: `Appliquer le preset « ${presetLabel} » ?`,
      message: `Les permissions actuelles de ${selected.firstName} seront REMPLACÉES par celles du preset (annulable).`,
      confirmLabel: 'Appliquer',
      tone: 'warning',
    });
    if (!ok) return;
    applyRolePresetToMember(selected.id, presetKey);
    toast.success('Preset appliqué', `${selected.firstName} → ${presetLabel}`);
  };

  const handleClearMember = async () => {
    if (!selected) return;
    const ok = await confirmDialog({
      title: `Effacer toutes les permissions de ${selected.firstName} ?`,
      message: 'Tous ses accès Drive seront retirés (annulable).',
      confirmLabel: 'Tout effacer',
      tone: 'danger',
    });
    if (!ok) return;
    clearMemberPermissions(selected.id);
    toast.info('Permissions effacées', selected.firstName);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      <div className="bg-surface border border-line rounded-2xl p-3 flex flex-col max-h-[70vh]">
        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..." aria-label="Rechercher un membre"
            className="w-full bg-elevated border border-line rounded-lg pl-8 pr-2 py-1.5 text-ink placeholder-dim focus:outline-none focus:border-blue-500 text-sm" />
        </div>
        <div className="overflow-y-auto flex-1 space-y-1">
          {filtered.map(m => {
            const userPerms = drivePermissions[m.id] || {};
            const count = Object.values(userPerms).filter(v => v !== 'none').length;
            const status = getMemberConfigStatus(m, drivePermissions, rolePresets, folders);
            return (
              <button key={m.id} type="button" onClick={() => setSelectedId(m.id)} aria-pressed={selectedId === m.id}
                className={`w-full text-left p-2 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                  selectedId === m.id ? 'bg-blue-500/10 border border-blue-500/30' : 'hover:bg-elevated border border-transparent'
                }`}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <StatusIcon status={status} />
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium text-sm truncate ${selectedId === m.id ? 'text-blue-500' : 'text-ink'}`}>
                      {m.firstName}
                    </div>
                    <div className="text-[10px] text-dim truncate">{roleText(m)}</div>
                  </div>
                </div>
                {count > 0 && (
                  <span className="text-[10px] bg-elevated text-dim rounded px-1.5 py-0.5 font-mono shrink-0">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 overflow-y-auto max-h-[70vh]">
        {!selected ? (
          <div className="text-center text-dim py-16">
            <User size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sélectionne un membre pour gérer ses accès Drive.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <h3 className="text-xl font-bold text-ink">{selected.firstName} {selected.lastName}</h3>
                <span className="text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold inline-block mt-1">
                  {roleText(selected)}
                </span>
              </div>
              <button type="button" onClick={handleClearMember}
                className="text-xs text-dim hover:text-red-500 flex items-center gap-1 border border-line rounded-lg px-2 py-1 shrink-0">
                <X size={12} /> Tout effacer
              </button>
            </div>

            {presetKey && (
              <div className="mb-4 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-dim">
                  <Wand2 size={14} className="text-purple-500 shrink-0" />
                  <span>Un preset est défini pour le rôle <strong className="text-ink">« {presetLabel} »</strong>.</span>
                </div>
                <button type="button" onClick={handleApplyPreset}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                  <Sparkles size={12} /> Appliquer le preset
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-dim font-medium">Raccourcis :</span>
              <button type="button" onClick={() => setAll('reader')}
                className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 font-semibold transition-colors">
                Tout en Lecteur
              </button>
              <button type="button" onClick={() => setAll('commenter')}
                className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 font-semibold transition-colors">
                Tout en Commentateur
              </button>
              <button type="button" onClick={() => setAll('editor')}
                className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 font-semibold transition-colors">
                Tout en Éditeur
              </button>
            </div>

            <div className="space-y-5">
              {groupedFolders.map(({ root, items }) => (
                <div key={root.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2 h-2 rounded-full ${dotClass(root.color)}`} />
                    <h4 className="text-sm font-bold text-ink">{root.code} — {root.name}</h4>
                  </div>
                  <div className="space-y-1.5 pl-4">
                    {items.map(f => {
                      const perm = getPerm(drivePermissions, selected.id, f.id);
                      const expected = presetKey ? (rolePresets[presetKey]?.[f.id] || 'none') : null;
                      const isMismatch = expected !== null && expected !== perm;
                      const folderTagList = (f.tags || []).map(tid => getFolderTag(tid, folderTags)).filter(Boolean);
                      return (
                        <div key={f.id} className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg transition-colors ${
                          isMismatch ? 'bg-red-500/5' : 'hover:bg-elevated/60'
                        }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-mono text-dim shrink-0">{f.code}</span>
                            <span className="text-sm text-ink truncate">{f.name}</span>
                            {folderTagList.slice(0, 1).map((t, i) => {
                              const tagColor = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
                              return (
                                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${tagColor.accent}`}>
                                  {t.label}
                                </span>
                              );
                            })}
                          </div>
                          <LevelPicker value={perm} label={`Accès de ${selected.firstName} à ${f.code} ${f.name}`}
                            onChange={(lvl) => setPermission(selected.id, f.id, lvl)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ByFolderView() {
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const folderTags = useStore(s => s.folderTags);
  const drivePermissions = useStore(s => s.drivePermissions);
  const setPermission = useStore(s => s.setPermission);
  const clearFolderPermissions = useStore(s => s.clearFolderPermissions);
  const roles = useStore(s => s.roles);
  const [selectedId, setSelectedId] = useState(folders[0]?.id || null);

  const selected = folders.find(f => f.id === selectedId);
  const root = selected ? getRootFolder(selected, folders) : null;
  const folderTagList = selected ? (selected.tags || []).map(tid => getFolderTag(tid, folderTags)).filter(Boolean) : [];

  const orderedFolders = useMemo(() => {
    const result = [];
    const addBranch = (parentId, depth) => {
      folders.filter(f => (f.parent ?? null) === parentId).forEach(f => {
        result.push({ folder: f, depth });
        addBranch(f.id, depth + 1);
      });
    };
    addBranch(null, 0);
    return result;
  }, [folders]);

  const hasSelection = !!selected;
  const membersWithPerm = useMemo(() => {
    if (!hasSelection) return [];
    return members.map(m => ({ member: m, perm: getPerm(drivePermissions, m.id, selectedId) }))
      .sort((a, b) => {
        const order = { editor: 0, commenter: 1, reader: 2, none: 3 };
        return order[a.perm] - order[b.perm];
      });
  }, [members, hasSelection, selectedId, drivePermissions]);

  const stats = useMemo(() => {
    const s = { reader: 0, commenter: 0, editor: 0 };
    membersWithPerm.forEach(({ perm }) => { if (perm !== 'none') s[perm]++; });
    return s;
  }, [membersWithPerm]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
      <div className="bg-surface border border-line rounded-2xl p-3 max-h-[70vh] overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-3 px-2">Arborescence Drive</div>
        {orderedFolders.map(({ folder, depth }) => {
          const isSelected = selectedId === folder.id;
          const color = getFolderColor(folder.color);
          const isRoot = !folder.parent;
          return (
            <button key={folder.id} type="button" onClick={() => setSelectedId(folder.id)} aria-pressed={isSelected}
              className={`w-full text-left rounded-lg flex items-center gap-2 transition-colors ${
                isSelected ? 'bg-blue-500/10 text-blue-500' : 'text-dim hover:bg-elevated/60 hover:text-ink'
              }`}
              style={{ paddingLeft: 8 + depth * 16, paddingTop: depth === 0 ? 6 : 4, paddingBottom: depth === 0 ? 6 : 4, paddingRight: 8, marginBottom: 2 }}>
              {isRoot ? (
                <>
                  <span className={`w-2 h-2 rounded-full ${color.dot} shrink-0`} />
                  <span className="text-sm font-semibold text-ink truncate">{folder.code} — {folder.name}</span>
                </>
              ) : (
                <>
                  <Folder size={depth === 1 ? 12 : 10} className={`shrink-0 ${FOLDER_TEXT[color.id] || 'text-dim'}`} aria-hidden="true" />
                  <span className={`truncate ${depth === 1 ? 'text-xs' : 'text-[11px]'}`}>{folder.code} {folder.name}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 max-h-[70vh] overflow-y-auto">
        {!selected ? (
          <div className="text-center text-dim py-16">
            <FolderTree size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sélectionne un dossier.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-line">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`w-3 h-3 rounded-full ${dotClass(root.color)}`} />
                  <span className="text-xs font-mono text-dim">{selected.code}</span>
                  {folderTagList.map((t, i) => {
                    const tagColor = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
                    return <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${tagColor.accent}`}>{t.label}</span>;
                  })}
                </div>
                <h3 className="text-xl font-bold text-ink">{selected.name}</h3>
                <div className="flex gap-3 mt-2 text-xs">
                  <span className="text-emerald-500">✏️ {stats.editor} éditeur{stats.editor > 1 ? 's' : ''}</span>
                  <span className="text-amber-500">💬 {stats.commenter} commentateur{stats.commenter > 1 ? 's' : ''}</span>
                  <span className="text-blue-500">👁 {stats.reader} lecteur{stats.reader > 1 ? 's' : ''}</span>
                </div>
              </div>
              <button type="button" onClick={async () => {
                const ok = await confirmDialog({
                  title: `Vider le dossier « ${selected.name} » ?`,
                  message: `Les ${stats.editor + stats.commenter + stats.reader} accès de ce dossier seront retirés pour tous les membres (annulable).`,
                  confirmLabel: 'Vider le dossier',
                  tone: 'danger',
                });
                if (!ok) return;
                clearFolderPermissions(selected.id);
                toast.info('Permissions effacées', selected.name);
              }}
                className="text-xs text-dim hover:text-red-500 flex items-center gap-1 border border-line rounded-lg px-2 py-1 shrink-0">
                <X size={12} /> Vider ce dossier
              </button>
            </div>

            <div className="space-y-1">
              {membersWithPerm.map(({ member, perm }) => (
                <div key={member.id} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg transition-colors ${
                  perm === 'none' ? 'opacity-50' : 'bg-elevated/40'
                }`}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{member.firstName} {member.lastName}</div>
                    <div className="text-[10px] text-dim truncate">{memberRoleLabel(member, roles) || 'Sans rôle'}</div>
                  </div>
                  <LevelPicker value={perm} label={`Accès de ${member.firstName} à ${selected.code} ${selected.name}`}
                    onChange={(lvl) => setPermission(member.id, selected.id, lvl)} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DriveManager() {
  const [view, setView] = useState('matrix');
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [highlight, setHighlight] = useState({ memberId: null, folderId: null });
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const catalog = useCatalogMaps();

  const totalPerms = useMemo(() =>
    Object.values(drivePermissions).reduce((sum, p) =>
      sum + Object.values(p).filter(v => v !== 'none').length, 0), [drivePermissions]);

  const presetCount = Object.keys(rolePresets || {}).length;

  // Badge « Vérifications » : alertes critiques de l'analyseur (mêmes règles que l'onglet).
  const alertCount = useMemo(() =>
    analyzeDriveState({ members, folders, drivePermissions, rolePresets }, catalog)
      .filter(a => a.severity === 'danger').length,
  [members, folders, drivePermissions, rolePresets, catalog]);

  const tabs = [
    { id: 'matrix',     label: 'Matrice',            icon: Grid3x3 },
    { id: 'member',     label: 'Par membre',         icon: User },
    { id: 'folder',     label: 'Par dossier',        icon: FolderTree },
    { id: 'insights',   label: 'Vérifications',      icon: Shield, badge: alertCount },
    { id: 'search',     label: 'Recherche inversée', icon: Search },
    { id: 'simulation', label: 'Simulation',         icon: Eye },
    { id: 'diff',       label: 'Comparaison',        icon: GitCompare },
  ];

  const handleNavigateFromAlert = (alert) => {
    setHighlight({ memberId: alert.memberId || null, folderId: alert.folderId || null });
    setView('matrix');
    setTimeout(() => setHighlight({ memberId: null, folderId: null }), 3000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-3 rounded-xl">
            <FolderTree size={24} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">Droits Google Drive</h2>
            <p className="text-xs text-dim">
              {members.length} membres • {folders.length} dossiers • {totalPerms} permissions • {presetCount} presets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-2 bg-elevated hover:bg-line text-ink border border-line text-sm font-medium px-3 py-2 rounded-xl transition-colors">
            <Download size={14} className="text-emerald-500" /> Exporter
          </button>
          <button type="button" onClick={() => setScriptModalOpen(true)}
            className="flex items-center gap-2 bg-elevated hover:bg-line text-ink border border-line text-sm font-medium px-3 py-2 rounded-xl transition-colors">
            <Code2 size={14} className="text-purple-500" /> Script Drive
          </button>
          <button type="button" onClick={() => setPresetsModalOpen(true)}
            className="flex items-center gap-2 bg-elevated hover:bg-line text-ink border border-line text-sm font-medium px-3 py-2 rounded-xl transition-colors">
            <Wand2 size={14} className="text-purple-500" /> Presets
          </button>
          <button type="button" onClick={() => setFolderModalOpen(true)}
            className="flex items-center gap-2 bg-elevated hover:bg-line text-ink border border-line text-sm font-medium px-3 py-2 rounded-xl transition-colors">
            <Settings2 size={14} /> Dossiers
          </button>
        </div>
      </div>

      <div role="tablist" aria-label="Vues des droits Drive" className="flex bg-elevated p-1 rounded-xl mb-4 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = view === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={isActive} onClick={() => setView(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive ? 'bg-surface text-ink shadow' : 'text-dim hover:text-ink'
              }`}>
              <Icon size={14} /> {t.label}
              {t.badge > 0 && (
                <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold min-w-[18px] text-center"
                  aria-label={`${t.badge} alerte${t.badge > 1 ? 's' : ''} critique${t.badge > 1 ? 's' : ''}`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-2 text-xs text-dim">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <span>
          Section <strong className="text-ink">indépendante</strong> des badges et rôles.
          Filtre par pôle, focus sur un dossier, ajoute des notes et utilise la mini-map pour naviguer.
        </span>
      </div>

      {view === 'matrix' && <MatrixView highlightMemberId={highlight.memberId} highlightFolderId={highlight.folderId} />}
      {view === 'member' && <ByMemberView />}
      {view === 'folder' && <ByFolderView />}
      {view === 'insights' && <InsightsPanel onNavigate={handleNavigateFromAlert} />}
      {view === 'search' && <SearchInverse />}
      {view === 'simulation' && <ShareSimulation />}
      {view === 'diff' && <DiffView />}

      <FolderManagerModal isOpen={folderModalOpen} onClose={() => setFolderModalOpen(false)} />
      <RolePresetsModal isOpen={presetsModalOpen} onClose={() => setPresetsModalOpen(false)} />
      <ExportModal isOpen={exportModalOpen} onClose={() => setExportModalOpen(false)} />
      <ShareScriptModal isOpen={scriptModalOpen} onClose={() => setScriptModalOpen(false)} />
    </div>
  );
}
