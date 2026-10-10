import React, { useState, useMemo, useRef } from 'react';
import {
  GitCompare, Upload, ArrowRight, Plus, Minus, Pencil, AlertTriangle,
  CheckCircle2, X, User,
} from 'lucide-react';
import { useStore, PERMISSION_LEVELS } from '../../store';

const LEVEL_LABEL = (lvl) => {
  if (!lvl || lvl === 'none') return '—';
  return PERMISSION_LEVELS.find(l => l.id === lvl)?.short || lvl;
};

export default function DiffView() {
  const { members, folders, drivePermissions } = useStore();
  const [imported, setImported] = useState(null);
  const [importError, setImportError] = useState('');
  const [filter, setFilter] = useState('all');
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const payload = JSON.parse(ev.target.result);
        const data = payload.data || payload;
        if (!data.members || !data.drivePermissions) throw new Error('Fichier non reconnu');
        setImported({
          label: file.name,
          members: data.members,
          folders: data.folders || folders,
          drivePermissions: data.drivePermissions,
          exportedAt: payload.exportedAt,
        });
        setImportError('');
      } catch (err) {
        setImportError(err.message);
        setImported(null);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const diff = useMemo(() => {
    if (!imported) return null;
    const changes = [];
    const memberMapOld = Object.fromEntries(imported.members.map(m => [m.id, m]));
    const memberMapNew = Object.fromEntries(members.map(m => [m.id, m]));

    members.forEach(m => {
      if (!memberMapOld[m.id]) {
        changes.push({
          type: 'member-added', member: m,
          description: `${m.firstName} ${m.lastName || ''} a été ajouté(e)`,
        });
      }
    });

    imported.members.forEach(m => {
      if (!memberMapNew[m.id]) {
        changes.push({
          type: 'member-removed', member: m,
          description: `${m.firstName} ${m.lastName || ''} a été retiré(e)`,
        });
      }
    });

    const allMemberIds = new Set([...Object.keys(imported.drivePermissions || {}), ...Object.keys(drivePermissions || {})]);
    const folderMap = Object.fromEntries(folders.map(f => [f.id, f]));

    allMemberIds.forEach(mid => {
      const oldPerms = (imported.drivePermissions || {})[mid] || {};
      const newPerms = (drivePermissions || {})[mid] || {};
      const member = memberMapNew[mid] || memberMapOld[mid];
      if (!member) return;

      const allFolderIds = new Set([...Object.keys(oldPerms), ...Object.keys(newPerms)]);
      allFolderIds.forEach(fid => {
        const oldLvl = oldPerms[fid] || 'none';
        const newLvl = newPerms[fid] || 'none';
        if (oldLvl === newLvl) return;
        const folder = folderMap[fid];
        if (!folder) return;
        let type = 'changed';
        if (oldLvl === 'none') type = 'added';
        else if (newLvl === 'none') type = 'removed';
        changes.push({
          type, member, folder, oldLevel: oldLvl, newLevel: newLvl,
          description: `${member.firstName} ${member.lastName || ''} → ${folder.code} ${folder.name}`,
        });
      });
    });

    const counts = {
      added: changes.filter(c => c.type === 'added').length,
      removed: changes.filter(c => c.type === 'removed').length,
      changed: changes.filter(c => c.type === 'changed').length,
      'member-added': changes.filter(c => c.type === 'member-added').length,
      'member-removed': changes.filter(c => c.type === 'member-removed').length,
    };

    return { changes, counts, memberMapOld, memberMapNew };
  }, [imported, members, folders, drivePermissions]);

  const filtered = useMemo(() => {
    if (!diff) return [];
    if (filter === 'all') return diff.changes;
    return diff.changes.filter(c => c.type === filter);
  }, [diff, filter]);

  const typeMeta = {
    'added':          { icon: Plus,  color: 'emerald', label: 'Permission ajoutée' },
    'removed':        { icon: Minus, color: 'red',     label: 'Permission retirée' },
    'changed':        { icon: Pencil, color: 'amber',  label: 'Permission modifiée' },
    'member-added':   { icon: User,  color: 'blue',    label: 'Membre ajouté' },
    'member-removed': { icon: User,  color: 'purple',  label: 'Membre retiré' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/10 p-2 rounded-lg"><GitCompare size={18} className="text-indigo-500" /></div>
          <div>
            <h3 className="text-sm font-bold text-ink">Comparaison de backups</h3>
            <p className="text-[10px] text-dim">Importe un ancien backup pour voir les changements</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Upload size={14} /> Importer un backup
          </button>
          {imported && (
            <button onClick={() => { setImported(null); setImportError(''); }}
              className="text-dim hover:text-ink p-2 rounded-lg border border-line">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {importError && (
        <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/30 rounded-lg p-3 text-xs">
          <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
          <div><strong className="text-red-500">Erreur :</strong> {importError}</div>
        </div>
      )}

      {!imported ? (
        <div className="text-center py-16 bg-surface border border-line rounded-2xl">
          <GitCompare size={48} className="mx-auto text-dim mb-3 opacity-30" />
          <p className="text-dim text-sm mb-1">Aucun backup chargé</p>
          <p className="text-dim text-xs">
            Sélectionne un fichier <code className="bg-elevated px-1 rounded">BDE_Backup_YYYY-MM-DD.json</code>.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-xs text-dim">
                Comparaison : <strong className="text-ink">{imported.label}</strong>
                {imported.exportedAt && <> (exporté le {new Date(imported.exportedAt).toLocaleDateString('fr-FR')})</>}
                <ArrowRight size={12} className="inline mx-1" />
                <strong className="text-ink">État actuel</strong>
              </div>
              {diff.changes.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
                  <CheckCircle2 size={14} /> Aucun changement
                </div>
              )}
            </div>

            {diff.changes.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.entries(typeMeta).map(([type, meta]) => {
                  const count = diff.counts[type] || 0;
                  if (count === 0) return null;
                  const Icon = meta.icon;
                  const colors = {
                    emerald: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500',
                    red: 'bg-red-500/10 border-red-500/50 text-red-500',
                    amber: 'bg-amber-500/10 border-amber-500/50 text-amber-500',
                    blue: 'bg-blue-500/10 border-blue-500/50 text-blue-500',
                    purple: 'bg-purple-500/10 border-purple-500/50 text-purple-500',
                  };
                  return (
                    <button key={type} onClick={() => setFilter(filter === type ? 'all' : type)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                        filter === type ? `${colors[meta.color]} font-semibold` : 'bg-elevated border-line text-dim hover:text-ink'
                      }`}>
                      <Icon size={12} />
                      {count}
                      <span className="opacity-70">{meta.label}</span>
                    </button>
                  );
                })}
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="text-xs text-blue-500 hover:text-blue-400 font-medium px-2">
                    Tout afficher
                  </button>
                )}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-dim text-sm">
              {diff.changes.length === 0
                ? 'La matrice actuelle est identique au backup importé.'
                : 'Aucun changement pour ce filtre.'}
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {filtered.map((change, idx) => {
                const meta = typeMeta[change.type];
                const Icon = meta.icon;
                const colors = {
                  emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
                  red: 'text-red-500 bg-red-500/10 border-red-500/30',
                  amber: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
                  blue: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
                  purple: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
                };
                return (
                  <div key={idx} className="flex items-center gap-3 p-2.5 bg-surface border border-line rounded-xl hover:border-dim transition-colors">
                    <div className={`shrink-0 p-1.5 rounded-lg border ${colors[meta.color]}`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink truncate">
                        {change.member.firstName} {change.member.lastName}
                      </div>
                      <div className="text-[10px] text-dim flex items-center gap-1.5 flex-wrap">
                        {change.folder ? (
                          <>
                            <span className="font-mono">{change.folder.code}</span>
                            <span>{change.folder.name}</span>
                          </>
                        ) : (
                          <span>{change.member.mainRole || 'Sans rôle'}</span>
                        )}
                      </div>
                    </div>
                    {(change.type === 'added' || change.type === 'removed' || change.type === 'changed') && (
                      <div className="shrink-0 flex items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          change.oldLevel === 'none' ? 'bg-elevated text-dim'
                          : change.oldLevel === 'reader' ? 'bg-blue-500/20 text-blue-500'
                          : change.oldLevel === 'commenter' ? 'bg-amber-500/20 text-amber-500'
                          : 'bg-emerald-500/20 text-emerald-500'
                        }`}>{LEVEL_LABEL(change.oldLevel)}</span>
                        <ArrowRight size={10} className="text-dim" />
                        <span className={`px-2 py-0.5 rounded font-bold ${
                          change.newLevel === 'none' ? 'bg-elevated text-dim'
                          : change.newLevel === 'reader' ? 'bg-blue-500/20 text-blue-500'
                          : change.newLevel === 'commenter' ? 'bg-amber-500/20 text-amber-500'
                          : 'bg-emerald-500/20 text-emerald-500'
                        }`}>{LEVEL_LABEL(change.newLevel)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}