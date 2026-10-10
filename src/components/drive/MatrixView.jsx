import React, { useState, useMemo, useRef } from 'react';
import {
  User, Search, X, CheckCircle2, AlertCircle, AlertTriangle, Circle,
  StickyNote, ZoomIn, ZoomOut, Layers,
} from 'lucide-react';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getRootFolder, getFolderColor, getFolderTag, getMemberConfigStatus, CONFIG_STATUS_META,
} from '../../store';
import { toast } from '../ui/toastStore';
import PermissionNotePopover from './PermissionNotePopover';
import MiniMap from './MiniMap';

const getPerm = (drivePermissions, memberId, folderId) =>
  drivePermissions[memberId]?.[folderId] || 'none';

const getLevel = (id) =>
  PERMISSION_LEVELS.find(l => l.id === id) || PERMISSION_LEVELS[0];

const dotClass = (colorId) =>
  (FOLDER_COLORS.find(c => c.id === colorId) || FOLDER_COLORS[FOLDER_COLORS.length - 1]).dot;

const StatusIcon = ({ status }) => {
  const meta = CONFIG_STATUS_META[status];
  if (status === 'complete') return <CheckCircle2 size={12} className="text-emerald-500" title={meta.label} />;
  if (status === 'partial') return <AlertCircle size={12} className="text-amber-500" title={meta.label} />;
  if (status === 'mismatch') return <AlertTriangle size={12} className="text-red-500" title={meta.label} />;
  return <Circle size={12} className="text-dim/40" title={meta.label} />;
};

function Legend() {
  return (
    <div className="flex items-center gap-3 flex-wrap bg-elevated border border-line rounded-xl px-4 py-2.5 text-xs">
      <span className="text-dim font-medium">Légende :</span>
      {PERMISSION_LEVELS.map(l => (
        <span key={l.id} className="flex items-center gap-1.5">
          <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${l.bg} ${l.text}`}>
            {l.id === 'none' ? '—' : l.short}
          </span>
          <span className="text-dim">{l.label}</span>
        </span>
      ))}
      <span className="ml-2 flex items-center gap-1 text-dim">
        <span className="w-2 h-2 rounded-full bg-amber-500" /> = note
      </span>
      <span className="text-dim ml-auto italic">Clic : cycle • Clic droit : reculer</span>
    </div>
  );
}

export default function MatrixView({ highlightMemberId, highlightFolderId }) {
  const {
    members, folders, folderTags, drivePermissions, permissionNotes, rolePresets,
    setPermission, clearMemberPermissions, clearFolderPermissions,
  } = useStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rootFilter, setRootFilter] = useState('all');
  const [showNotes, setShowNotes] = useState(true);
  const [focusFolderId, setFocusFolderId] = useState(null);
  const [notePopover, setNotePopover] = useState(null);
  const scrollRef = useRef(null);

  const rootFolders = useMemo(() => folders.filter(f => !f.parent), [folders]);

  const visibleFolders = useMemo(() => {
    if (rootFilter === 'all') return folders;
    const rootId = rootFilter;
    const ids = new Set();
    const addBranch = (parentId) => {
      folders.filter(f => f.id === parentId || f.parent === parentId).forEach(f => {
        if (f.id === parentId) ids.add(f.id);
        if (f.parent === parentId) { ids.add(f.id); addBranch(f.id); }
      });
    };
    addBranch(rootId);
    return folders.filter(f => ids.has(f.id));
  }, [folders, rootFilter]);

  const effectiveFolders = useMemo(() => {
    if (focusFolderId) {
      const focused = folders.find(f => f.id === focusFolderId);
      return focused ? [focused] : visibleFolders;
    }
    return visibleFolders;
  }, [focusFolderId, folders, visibleFolders]);

  const memberStatuses = useMemo(() => {
    const map = {};
    members.forEach(m => { map[m.id] = getMemberConfigStatus(m, drivePermissions, rolePresets, folders); });
    return map;
  }, [members, drivePermissions, rolePresets, folders]);

  const statusCounts = useMemo(() => {
    const counts = { complete: 0, partial: 0, empty: 0, mismatch: 0 };
    Object.values(memberStatuses).forEach(s => { counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }, [memberStatuses]);

  const filteredMembers = useMemo(() =>
    members.filter(m => {
      const matchSearch = !search ||
        m.firstName.toLowerCase().includes(search.toLowerCase()) ||
        (m.lastName || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || memberStatuses[m.id] === statusFilter;
      return matchSearch && matchStatus;
    }), [members, search, statusFilter, memberStatuses]);

  const folderStats = useMemo(() => {
    const stats = {};
    folders.forEach(f => { stats[f.id] = { reader: 0, commenter: 0, editor: 0 }; });
    Object.values(drivePermissions).forEach(perms => {
      Object.entries(perms).forEach(([fid, lvl]) => {
        if (stats[fid] && lvl !== 'none') stats[fid][lvl]++;
      });
    });
    return stats;
  }, [folders, drivePermissions]);

  const cycle = (memberId, folderId, current, reverse = false) => {
    const idx = PERMISSION_LEVELS.findIndex(l => l.id === current);
    const nextIdx = reverse
      ? (idx - 1 + PERMISSION_LEVELS.length) % PERMISSION_LEVELS.length
      : (idx + 1) % PERMISSION_LEVELS.length;
    const nextLevel = PERMISSION_LEVELS[nextIdx].id;
    setPermission(memberId, folderId, nextLevel);

    if (nextLevel === 'editor' && current !== 'editor') {
      const folder = folders.find(f => f.id === folderId);
      const member = members.find(m => m.id === memberId);
      if (folder && member) toast.success(`Éditeur activé`, `${member.firstName} → ${folder.code}`);
    }
  };

  const openNotePopover = (e, member, folder) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setNotePopover({ member, folder, anchorRect: rect });
  };

  const statusFilterButtons = [
    { id: 'all', label: 'Tous', icon: null, count: members.length },
    { id: 'complete', label: 'Conforme', icon: <CheckCircle2 size={11} />, color: 'text-emerald-500', count: statusCounts.complete },
    { id: 'partial', label: 'Partiel', icon: <AlertCircle size={11} />, color: 'text-amber-500', count: statusCounts.partial },
    { id: 'empty', label: 'Vide', icon: <Circle size={11} />, color: 'text-dim', count: statusCounts.empty },
    { id: 'mismatch', label: 'Hors preset', icon: <AlertTriangle size={11} />, color: 'text-red-500', count: statusCounts.mismatch },
  ];

  return (
    <div className="space-y-3 relative">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les membres..."
            className="w-full bg-surface border border-line rounded-xl pl-9 pr-3 py-2 text-ink placeholder-dim focus:outline-none focus:border-blue-500 text-sm" />
        </div>
        <button onClick={() => setShowNotes(!showNotes)}
          title={showNotes ? 'Masquer les notes' : 'Afficher les notes'}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-xl border transition-colors ${
            showNotes ? 'bg-amber-500/10 border-amber-500/40 text-amber-500' : 'bg-elevated border-line text-dim hover:text-ink'
          }`}>
          <StickyNote size={14} /> Notes
        </button>
        <Legend />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-dim font-medium mr-1 flex items-center gap-1">
          <Layers size={12} /> Pôle :
        </span>
        <button onClick={() => setRootFilter('all')}
          className={`text-xs px-2.5 py-1 rounded-lg transition-all border ${
            rootFilter === 'all' ? 'bg-surface border-line text-ink shadow-sm' : 'bg-elevated border-transparent text-dim hover:text-ink'
          }`}>
          Tous
          <span className="ml-1 text-[10px] opacity-60 font-mono">{folders.length}</span>
        </button>
        {rootFolders.map(rf => {
          const color = getFolderColor(rf.color);
          const count = folders.filter(f => f.id === rf.id || getRootFolder(f, folders).id === rf.id).length;
          return (
            <button key={rf.id} onClick={() => setRootFilter(rf.id)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all border ${
                rootFilter === rf.id
                  ? `${color.accent} border-current shadow-sm`
                  : 'bg-elevated border-transparent text-dim hover:text-ink'
              }`}>
              <span className={`w-2 h-2 rounded-full ${color.dot}`} />
              {rf.code}
              <span className="text-[10px] opacity-60 font-mono">{count}</span>
            </button>
          );
        })}
        {focusFolderId && (
          <button onClick={() => setFocusFolderId(null)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/40 text-blue-500 font-medium transition-colors">
            <ZoomOut size={11} /> Quitter le focus
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-dim font-medium mr-1">Statut :</span>
        {statusFilterButtons.map(s => (
          <button key={s.id} onClick={() => setStatusFilter(s.id)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all border ${
              statusFilter === s.id ? 'bg-surface border-line text-ink shadow-sm' : 'bg-elevated border-transparent text-dim hover:text-ink'
            }`}>
            {s.icon && <span className={s.color}>{s.icon}</span>}
            {s.label}
            <span className="text-[10px] opacity-60 font-mono">{s.count}</span>
          </button>
        ))}
      </div>

      <div className="relative border border-line rounded-2xl bg-surface overflow-hidden">
        <div ref={scrollRef} className="overflow-auto max-h-[68vh]">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-surface border-b border-r border-line" />
                {effectiveFolders.map(f => {
                  const root = getRootFolder(f, folders);
                  const isRoot = !f.parent;
                  return (
                    <th key={f.id} className="border-b border-line p-0">
                      <div className={`h-1.5 ${dotClass(root.color)} ${isRoot ? '' : 'opacity-40'}`} />
                    </th>
                  );
                })}
              </tr>

              <tr>
                <th className="sticky left-0 z-30 bg-surface border-b border-r border-line p-2 text-left min-w-[220px]">
                  <div className="flex items-center gap-2 text-dim text-[10px] uppercase tracking-wider font-bold">
                    <User size={12} /> Membre
                    <span className="ml-auto text-[9px] normal-case opacity-60">
                      {filteredMembers.length}/{members.length}
                    </span>
                  </div>
                </th>
                {effectiveFolders.map(f => {
                  const root = getRootFolder(f, folders);
                  const color = getFolderColor(f.color || root.color);
                  const stats = folderStats[f.id];
                  const total = stats.reader + stats.commenter + stats.editor;
                  const folderTagList = (f.tags || []).map(tid => getFolderTag(tid, folderTags)).filter(Boolean);
                  const isHighlighted = highlightFolderId === f.id;
                  const isFocused = focusFolderId === f.id;

                  return (
                    <th key={f.id}
                      className={`group/header border-b border-r border-line p-1 align-bottom transition-all relative ${isHighlighted ? 'bg-blue-500/20' : ''} ${isFocused ? 'bg-blue-500/10' : ''}`}
                      style={{ minWidth: isFocused ? 200 : 60 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setFocusFolderId(focusFolderId === f.id ? null : f.id); }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (window.confirm(`Effacer TOUTES les permissions du dossier "${f.name}" ?`)) {
                            clearFolderPermissions(f.id);
                            toast.info('Permissions effacées', f.name);
                          }
                        }}
                        className="w-full flex flex-col items-center gap-0.5 rounded-md p-1 hover:bg-blue-500/10 transition-colors"
                        title={`${f.code} - ${f.name}\n${folderTagList.map(t => t.label).join(' • ') || 'Sans tag'}\n\nClic : focus  •  Clic droit : effacer\n${total} membre(s) concerné(s)`}>
                        <span className={`text-[10px] font-mono font-bold ${color.text}`}>{f.code}</span>
                        <span className={`text-[8px] text-dim truncate leading-tight ${isFocused ? 'max-w-none' : 'max-w-[54px]'}`}>
                          {isFocused ? f.name : f.name.split(' ').slice(0, 2).join(' ')}
                        </span>
                        {folderTagList.length > 0 && (
                          <div className="flex gap-0.5">
                            {folderTagList.slice(0, isFocused ? 5 : 3).map((t, i) => (
                              <span key={i} className={`w-1.5 h-1.5 rounded-full ${dotClass(t.color)}`} />
                            ))}
                          </div>
                        )}
                        {total > 0 && <span className="text-[8px] text-dim font-mono">{total}</span>}
                      </button>
                      {isFocused && (
                        <div className="absolute top-1 right-1 text-blue-500"><ZoomIn size={10} /></div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => {
                const userPerms = drivePermissions[m.id] || {};
                const totalPerms = Object.values(userPerms).filter(v => v !== 'none').length;
                const status = memberStatuses[m.id];
                const isHighlighted = highlightMemberId === m.id;

                return (
                  <tr key={m.id} className={`group/row hover:bg-elevated/40 ${isHighlighted ? 'bg-blue-500/10' : ''}`}>
                    <td className={`sticky left-0 z-10 bg-surface group-hover/row:bg-elevated border-b border-r border-line p-2 ${isHighlighted ? 'bg-blue-500/10' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <StatusIcon status={status} />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-ink truncate text-[12px]">
                              {m.firstName} {m.lastName && <span className="text-dim font-normal">{m.lastName}</span>}
                            </div>
                            <div className="text-[10px] text-dim truncate">{m.mainRole || 'Sans rôle'}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {totalPerms > 0 && (
                            <span className="text-[9px] bg-elevated text-dim rounded px-1.5 py-0.5 font-mono">{totalPerms}</span>
                          )}
                          <button
                            onClick={() => {
                              if (window.confirm(`Effacer toutes les permissions de ${m.firstName} ?`)) {
                                clearMemberPermissions(m.id);
                                toast.info('Permissions effacées', m.firstName);
                              }
                            }}
                            className="opacity-0 group-hover/row:opacity-100 text-dim hover:text-red-500 text-xs transition-opacity"
                            title="Effacer ses permissions">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </td>
                    {effectiveFolders.map(f => {
                      const perm = getPerm(drivePermissions, m.id, f.id);
                      const level = getLevel(perm);
                      const isCellHighlighted = isHighlighted && highlightFolderId === f.id;
                      const hasNote = showNotes && permissionNotes[m.id]?.[f.id];
                      const isFocused = focusFolderId === f.id;
                      return (
                        <td key={f.id}
                          className={`border-b border-r border-line p-0.5 text-center relative group/cell ${isCellHighlighted ? 'bg-blue-500/20' : ''}`}
                          style={{ minWidth: isFocused ? 200 : 60 }}>
                          <div className="relative">
                            <button
                              onClick={() => cycle(m.id, f.id, perm, false)}
                              onContextMenu={(e) => { e.preventDefault(); cycle(m.id, f.id, perm, true); }}
                              className={`w-full h-7 rounded transition-all flex items-center justify-center text-[10px] font-bold ${level.bg} ${level.text} ${level.hover} ${isFocused ? 'text-xs' : ''}`}
                              title={`${m.firstName} → ${f.code} ${f.name}\n${level.label}${hasNote ? '\n\n📝 ' + hasNote : ''}\n\nClic : avancer  •  Clic droit : reculer`}>
                              {perm !== 'none' ? level.short : ''}
                            </button>

                            {hasNote && (
                              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 pointer-events-none shadow-sm" />
                            )}

                            <button
                              onClick={(e) => openNotePopover(e, m, f)}
                              className={`absolute -top-0.5 left-0.5 p-0.5 rounded opacity-0 group-hover/cell:opacity-100 transition-opacity ${
                                hasNote ? 'text-amber-500 bg-amber-500/10' : 'text-dim bg-elevated'
                              }`}
                              title={hasNote ? 'Modifier la note' : 'Ajouter une note'}>
                              <StickyNote size={9} />
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={effectiveFolders.length + 1} className="p-8 text-center text-dim">
                    Aucun membre ne correspond à ces filtres.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <MiniMap
          members={filteredMembers}
          folders={effectiveFolders}
          drivePermissions={drivePermissions}
          scrollContainerRef={scrollRef}
        />
      </div>

      <PermissionNotePopover
        isOpen={!!notePopover}
        onClose={() => setNotePopover(null)}
        member={notePopover?.member}
        folder={notePopover?.folder}
        anchorRect={notePopover?.anchorRect}
      />
    </div>
  );
}
