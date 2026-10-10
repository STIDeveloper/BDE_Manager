import { useState, useMemo } from 'react';
import { Search, Folder, User, X, ChevronRight } from 'lucide-react';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getFolderColor, getFolderTag,
} from '../../store';
import { memberRoleLabel } from '../../core/useCatalog';

const LEVEL_ORDER = { editor: 0, commenter: 1, reader: 2, none: 3 };

export default function SearchInverse() {
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const folderTags = useStore(s => s.folderTags);
  const drivePermissions = useStore(s => s.drivePermissions);
  const roles = useStore(s => s.roles);
  const roleText = (m) => memberRoleLabel(m, roles) || 'Sans rôle';
  const [mode, setMode] = useState('folder');
  const [folderQuery, setFolderQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');

  const matchedFolders = useMemo(() => {
    if (!folderQuery.trim()) return [];
    const q = folderQuery.toLowerCase();
    return folders.filter(f =>
      f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [folderQuery, folders]);

  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const selectedFolder = folders.find(f => f.id === selectedFolderId);

  const membersWithAccess = useMemo(() => {
    if (!selectedFolder) return [];
    return members.map(m => {
      const level = (drivePermissions[m.id] || {})[selectedFolder.id] || 'none';
      return { member: m, level };
    })
      .filter(x => levelFilter === 'all' || x.level === levelFilter)
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  }, [selectedFolder, members, drivePermissions, levelFilter]);

  const matchedMembers = useMemo(() => {
    if (!memberQuery.trim()) return [];
    const q = memberQuery.toLowerCase();
    return members.filter(m =>
      m.firstName.toLowerCase().includes(q) || (m.lastName || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [memberQuery, members]);

  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const selectedMember = members.find(m => m.id === selectedMemberId);

  const memberFolders = useMemo(() => {
    if (!selectedMember) return [];
    const userPerms = drivePermissions[selectedMember.id] || {};
    return folders
      .map(f => ({ folder: f, level: userPerms[f.id] || 'none' }))
      .filter(x => levelFilter === 'all' || x.level === levelFilter)
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  }, [selectedMember, folders, drivePermissions, levelFilter]);

  const folderStats = useMemo(() => {
    if (!selectedFolder) return null;
    const stats = { editor: 0, commenter: 0, reader: 0, none: 0 };
    members.forEach(m => {
      const lvl = (drivePermissions[m.id] || {})[selectedFolder.id] || 'none';
      stats[lvl]++;
    });
    return stats;
  }, [selectedFolder, members, drivePermissions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-purple-500/10 p-2 rounded-lg"><Search size={18} className="text-purple-500" /></div>
          <div>
            <h3 className="text-sm font-bold text-ink">Recherche inversée</h3>
            <p className="text-[10px] text-dim">Trouve qui a accès à quoi, en une recherche</p>
          </div>
        </div>

        <div className="ml-auto flex bg-elevated p-1 rounded-xl">
          <button onClick={() => setMode('folder')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'folder' ? 'bg-surface text-ink shadow' : 'text-dim hover:text-ink'
            }`}>
            <Folder size={12} /> Par dossier
          </button>
          <button onClick={() => setMode('member')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mode === 'member' ? 'bg-surface text-ink shadow' : 'text-dim hover:text-ink'
            }`}>
            <User size={12} /> Par membre
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <span className="text-dim font-medium mr-1">Niveau :</span>
        <button onClick={() => setLevelFilter('all')}
          className={`px-2 py-1 rounded-lg transition-all border ${
            levelFilter === 'all' ? 'bg-surface border-line' : 'bg-elevated border-transparent hover:border-line'
          }`}>
          Tous
        </button>
        {PERMISSION_LEVELS.map(l => (
          <button key={l.id} onClick={() => setLevelFilter(l.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg transition-all border ${
              levelFilter === l.id
                ? `${l.bg} ${l.text} border-current`
                : 'bg-elevated border-transparent hover:border-line text-dim'
            }`}>
            {l.id === 'none' ? '—' : l.short} {l.label}
          </button>
        ))}
      </div>

      {mode === 'folder' && (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
          <div className="bg-surface border border-line rounded-2xl p-3 max-h-[65vh] overflow-y-auto">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input type="text" value={folderQuery} onChange={(e) => setFolderQuery(e.target.value)}
                placeholder="Rechercher un dossier..."
                className="w-full bg-elevated border border-line rounded-lg pl-8 pr-2 py-1.5 text-ink placeholder-dim focus:outline-none focus:border-purple-500 text-sm" />
            </div>

            {!folderQuery ? (
              <div className="text-center py-8 text-dim text-xs">
                <Folder size={24} className="mx-auto mb-2 opacity-30" />
                Tape pour rechercher un dossier
              </div>
            ) : matchedFolders.length === 0 ? (
              <div className="text-center py-8 text-dim text-xs">Aucun dossier trouvé.</div>
            ) : (
              <div className="space-y-1">
                {matchedFolders.map(f => {
                  const color = getFolderColor(f.color);
                  const isSelected = selectedFolderId === f.id;
                  return (
                    <button key={f.id} onClick={() => setSelectedFolderId(f.id)}
                      className={`w-full text-left p-2 rounded-lg transition-colors flex items-center gap-2 ${
                        isSelected
                          ? 'bg-purple-500/10 border border-purple-500/30'
                          : 'hover:bg-elevated border border-transparent'
                      }`}>
                      <span className={`w-2 h-2 rounded-full ${color.dot} shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-mono text-dim">{f.code}</div>
                        <div className={`text-sm font-medium truncate ${isSelected ? 'text-purple-500' : 'text-ink'}`}>
                          {f.name}
                        </div>
                      </div>
                      <ChevronRight size={12} className="text-dim shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 max-h-[65vh] overflow-y-auto">
            {!selectedFolder ? (
              <div className="text-center py-16 text-dim">
                <Search size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sélectionne un dossier à gauche</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-line">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-dim">{selectedFolder.code}</span>
                      {(selectedFolder.tags || []).map(tid => {
                        const t = getFolderTag(tid, folderTags);
                        if (!t) return null;
                        const tc = FOLDER_COLORS.find(c => c.id === t.color) || FOLDER_COLORS[0];
                        return <span key={tid} className={`text-[9px] px-1.5 py-0.5 rounded border ${tc.accent}`}>{t.label}</span>;
                      })}
                    </div>
                    <h3 className="text-lg font-bold text-ink">{selectedFolder.name}</h3>
                    {folderStats && (
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <span className="text-emerald-500">✏️ {folderStats.editor}</span>
                        <span className="text-amber-500">💬 {folderStats.commenter}</span>
                        <span className="text-blue-500">👁 {folderStats.reader}</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setSelectedFolderId(null); setFolderQuery(''); }}
                    className="text-dim hover:text-ink p-1 shrink-0"><X size={14} /></button>
                </div>

                {membersWithAccess.length === 0 ? (
                  <p className="text-dim text-sm text-center py-8">Aucun membre pour ce filtre.</p>
                ) : (
                  <div className="space-y-1">
                    {membersWithAccess.map(({ member, level }) => {
                      const l = PERMISSION_LEVELS.find(x => x.id === level);
                      return (
                        <div key={member.id} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg ${
                          level === 'none' ? 'opacity-40' : 'bg-elevated/40'
                        }`}>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate">{member.firstName} {member.lastName}</div>
                            <div className="text-[10px] text-dim truncate">{roleText(member)}</div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${l.bg} ${l.text}`}>
                            {level === 'none' ? '—' : l.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {mode === 'member' && (
        <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
          <div className="bg-surface border border-line rounded-2xl p-3 max-h-[65vh] overflow-y-auto">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
              <input type="text" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Rechercher un membre..."
                className="w-full bg-elevated border border-line rounded-lg pl-8 pr-2 py-1.5 text-ink placeholder-dim focus:outline-none focus:border-purple-500 text-sm" />
            </div>

            {!memberQuery ? (
              <div className="text-center py-8 text-dim text-xs">
                <User size={24} className="mx-auto mb-2 opacity-30" />
                Tape pour rechercher un membre
              </div>
            ) : matchedMembers.length === 0 ? (
              <div className="text-center py-8 text-dim text-xs">Aucun membre trouvé.</div>
            ) : (
              <div className="space-y-1">
                {matchedMembers.map(m => {
                  const isSelected = selectedMemberId === m.id;
                  return (
                    <button key={m.id} onClick={() => setSelectedMemberId(m.id)}
                      className={`w-full text-left p-2 rounded-lg transition-colors flex items-center gap-2 ${
                        isSelected
                          ? 'bg-purple-500/10 border border-purple-500/30'
                          : 'hover:bg-elevated border border-transparent'
                      }`}>
                      <User size={14} className={isSelected ? 'text-purple-500' : 'text-dim'} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-medium truncate ${isSelected ? 'text-purple-500' : 'text-ink'}`}>
                          {m.firstName} {m.lastName}
                        </div>
                        <div className="text-[10px] text-dim truncate">{roleText(m)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 max-h-[65vh] overflow-y-auto">
            {!selectedMember ? (
              <div className="text-center py-16 text-dim">
                <User size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sélectionne un membre à gauche</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b border-line">
                  <div>
                    <h3 className="text-lg font-bold text-ink">{selectedMember.firstName} {selectedMember.lastName}</h3>
                    <span className="text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold inline-block mt-1">
                      {roleText(selectedMember)}
                    </span>
                  </div>
                  <button onClick={() => { setSelectedMemberId(null); setMemberQuery(''); }}
                    className="text-dim hover:text-ink p-1 shrink-0"><X size={14} /></button>
                </div>

                {memberFolders.length === 0 ? (
                  <p className="text-dim text-sm text-center py-8">Aucun dossier pour ce filtre.</p>
                ) : (
                  <div className="space-y-1">
                    {memberFolders.map(({ folder, level }) => {
                      const l = PERMISSION_LEVELS.find(x => x.id === level);
                      const color = getFolderColor(folder.color);
                      return (
                        <div key={folder.id} className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg ${
                          level === 'none' ? 'opacity-40' : 'bg-elevated/40'
                        }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full ${color.dot} shrink-0`} />
                            <span className="text-[10px] font-mono text-dim shrink-0">{folder.code}</span>
                            <span className="text-sm text-ink truncate">{folder.name}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${l.bg} ${l.text}`}>
                            {level === 'none' ? '—' : l.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}