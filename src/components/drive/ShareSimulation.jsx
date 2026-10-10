import React, { useState, useMemo } from 'react';
import { Eye, User, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  useStore, PERMISSION_LEVELS, FOLDER_COLORS,
  getFolderColor, getRootFolder, getMemberConfigStatus, CONFIG_STATUS_META,
} from '../../store';
import { simulateMemberView } from '../../utils/driveAnalyzer';

export default function ShareSimulation() {
  const { members, folders, drivePermissions, rolePresets } = useStore();
  const [selectedId, setSelectedId] = useState(members[0]?.id || null);
  const selected = members.find(m => m.id === selectedId);

  const simulation = useMemo(() => {
    if (!selected) return [];
    return simulateMemberView(selected.id, folders, drivePermissions);
  }, [selected, folders, drivePermissions]);

  const groupedByRoot = useMemo(() => {
    const groups = {};
    simulation.forEach(item => {
      const root = getRootFolder(item.folder, folders);
      if (!groups[root.id]) groups[root.id] = { root, items: [] };
      groups[root.id].items.push(item);
    });
    return Object.values(groups);
  }, [simulation, folders]);

  const stats = useMemo(() => {
    const s = { editor: 0, commenter: 0, reader: 0, none: 0, inherited: 0 };
    simulation.forEach(item => {
      s[item.effective] = (s[item.effective] || 0) + 1;
      if (item.source === 'inherited') s.inherited++;
    });
    return s;
  }, [simulation]);

  const memberStatus = useMemo(() => {
    if (!selected) return null;
    return getMemberConfigStatus(selected, drivePermissions, rolePresets, folders);
  }, [selected, drivePermissions, rolePresets, folders]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 p-2 rounded-lg"><Eye size={18} className="text-emerald-500" /></div>
          <div>
            <h3 className="text-sm font-bold text-ink">Simulation de partage</h3>
            <p className="text-[10px] text-dim">Vois exactement ce qu'un membre peut faire sur Drive (avec héritage)</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div className="bg-surface border border-line rounded-2xl p-3 max-h-[68vh] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-wider font-bold text-dim mb-3 px-2">Choisir un membre</div>
          <div className="space-y-1">
            {members.map(m => {
              const isSelected = selectedId === m.id;
              return (
                <button key={m.id} onClick={() => setSelectedId(m.id)}
                  className={`w-full text-left p-2 rounded-lg transition-colors flex items-center gap-2 ${
                    isSelected
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'hover:bg-elevated border border-transparent'
                  }`}>
                  <User size={14} className={isSelected ? 'text-emerald-500' : 'text-dim'} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium truncate ${isSelected ? 'text-emerald-500' : 'text-ink'}`}>
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-[10px] text-dim truncate">{m.mainRole || 'Sans rôle'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5 max-h-[68vh] overflow-y-auto">
          {!selected ? (
            <div className="text-center py-16 text-dim">
              <Eye size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sélectionne un membre</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-line flex-wrap">
                <div>
                  <h3 className="text-xl font-bold text-ink">{selected.firstName} {selected.lastName}</h3>
                  <span className="text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold inline-block mt-1">
                    {selected.mainRole || 'Sans rôle'}
                  </span>
                </div>
                {memberStatus && (
                  <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-elevated border border-line">
                    <span className="text-dim">{CONFIG_STATUS_META[memberStatus].icon}</span>
                    <span className="text-dim">{CONFIG_STATUS_META[memberStatus].label}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="bg-elevated border border-line rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-emerald-500">{stats.editor}</div>
                  <div className="text-[9px] uppercase tracking-wider text-dim">Éditeur</div>
                </div>
                <div className="bg-elevated border border-line rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-500">{stats.commenter}</div>
                  <div className="text-[9px] uppercase tracking-wider text-dim">Commentateur</div>
                </div>
                <div className="bg-elevated border border-line rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-blue-500">{stats.reader}</div>
                  <div className="text-[9px] uppercase tracking-wider text-dim">Lecteur</div>
                </div>
                <div className="bg-elevated border border-line rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-purple-500">{stats.inherited}</div>
                  <div className="text-[9px] uppercase tracking-wider text-dim">Héritées</div>
                </div>
              </div>

              {stats.inherited > 0 && (
                <div className="mb-4 p-2.5 bg-purple-500/5 border border-purple-500/20 rounded-lg flex items-start gap-2 text-xs">
                  <Info size={12} className="text-purple-500 shrink-0 mt-0.5" />
                  <span className="text-dim">
                    <strong className="text-ink">{stats.inherited} permission{stats.inherited > 1 ? 's' : ''}</strong> héritée{stats.inherited > 1 ? 's' : ''} d'un dossier parent.
                    Les niveaux ci-dessous montrent l'accès <strong className="text-ink">effectif</strong> (avec héritage).
                  </span>
                </div>
              )}

              <div className="space-y-5">
                {groupedByRoot.map(({ root, items }) => {
                  const color = getFolderColor(root.color);
                  return (
                    <div key={root.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                        <h4 className="text-sm font-bold text-ink">{root.code} — {root.name}</h4>
                      </div>
                      <div className="space-y-1 pl-4">
                        {items.map(item => {
                          const f = item.folder;
                          const effectiveLevel = PERMISSION_LEVELS.find(l => l.id === item.effective);
                          const isInherited = item.source === 'inherited';
                          const showDiff = isInherited && item.direct === 'none';

                          return (
                            <div key={f.id} className={`flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg transition-colors ${
                              showDiff ? 'bg-purple-500/5' : 'hover:bg-elevated/60'
                            }`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[10px] font-mono text-dim shrink-0">{f.code}</span>
                                <span className="text-sm text-ink truncate">{f.name}</span>
                                {isInherited && (
                                  <span className="text-[9px] text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded shrink-0">
                                    ↑ hérité de {item.from?.code}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {showDiff && <span className="text-[9px] text-dim">direct: —</span>}
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${effectiveLevel.bg} ${effectiveLevel.text}`}>
                                  {item.effective === 'none' ? '—' : effectiveLevel.label}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 pt-4 border-t border-line">
                {stats.editor === 0 && stats.commenter === 0 && stats.reader === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                    <AlertTriangle size={14} />
                    <span>{selected.firstName} n'a <strong>aucun accès</strong> à un seul dossier Drive.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-emerald-500 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                    <CheckCircle2 size={14} />
                    <span>
                      {selected.firstName} a un accès <strong>effectif</strong> à{' '}
                      <strong>{stats.editor + stats.commenter + stats.reader}</strong> dossier{stats.editor + stats.commenter + stats.reader > 1 ? 's' : ''}
                      {' '}({stats.editor} en éditeur).
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}