import React, { useMemo, useState, useEffect } from 'react';
import {
  X, ArrowRight, UserPlus, RefreshCw, AlertTriangle, Users,
  CheckCircle2, Info, PlayCircle, ChevronDown, Check, Ban,
} from 'lucide-react';
import { useStore } from '../../store';
import { useRolesStore } from '../../roleEngine/store.js';
import { buildApplyDiff, applyDiffToStore, POLE_TO_COLUMN_TITLE } from '../../core/bridge.js';
import { ROLES, getRoleById, getRoleLabel } from '../../core/roles.js';
import { toast } from '../ui/toastStore';

// ============================================================
// Éditeur de rôle inline (dropdown)
// ============================================================
function RoleDropdown({ value, onChange, size = 'sm' }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-md px-2 py-1 font-medium transition-colors ${
          size === 'sm' ? 'text-[11px]' : 'text-xs'
        }`}>
        {getRoleLabel(value)}
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface border border-line rounded-lg shadow-xl z-40 min-w-[240px] max-h-[300px] overflow-y-auto py-1">
            {ROLES.map(r => (
              <button
                key={r.id}
                onClick={() => { onChange(r.id); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  r.id === value ? 'bg-blue-500/10 text-blue-500 font-medium' : 'text-ink hover:bg-elevated'
                }`}>
                {r.id === value && <Check size={11} />}
                {r.id !== value && <span className="w-[11px]" />}
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-[9px] text-muted uppercase">{r.level}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Modale principale
// ============================================================
export default function ApplyChangesModal({ isOpen, onClose }) {
  const members = useStore(s => s.members);
  const columns = useStore(s => s.columns);

  const candidates = useRolesStore(s => s.candidates);
  const scenarios = useRolesStore(s => s.scenarios);
  const selectedScenarioIndex = useRolesStore(s => s.selectedScenarioIndex);

  const scenario = scenarios[selectedScenarioIndex];

  // Calcule le diff brut
  const rawDiff = useMemo(() => {
    if (!scenario || !candidates.length) return null;
    return buildApplyDiff({ candidates, scenario, members, columns });
  }, [scenario, candidates, members, columns]);

  // État éditable : chaque ligne peut être modifiée ou exclue
  const [editedUpdates, setEditedUpdates] = useState([]);
  const [editedCreations, setEditedCreations] = useState([]);

  // Synchronise à l'ouverture
  useEffect(() => {
    if (!isOpen || !rawDiff) return;
    setEditedUpdates(rawDiff.updates.map(u => ({ ...u, _active: true })));
    setEditedCreations(rawDiff.creations.map(c => ({ ...c, _active: true })));
  }, [isOpen, rawDiff]);

  if (!isOpen || !scenario || !rawDiff) return null;

  const { unassigned, stats, missingColumns } = rawDiff;

  // Compte seulement les lignes actives
  const activeUpdates = editedUpdates.filter(u => u._active).length;
  const activeCreations = editedCreations.filter(c => c._active).length;
  const totalChanges = activeUpdates + activeCreations + stats.unassigned;

  const toggleUpdate = (idx) => {
    setEditedUpdates(prev => prev.map((u, i) => i === idx ? { ...u, _active: !u._active } : u));
  };

  const toggleCreation = (idx) => {
    setEditedCreations(prev => prev.map((c, i) => i === idx ? { ...c, _active: !c._active } : c));
  };

  const changeUpdateRole = (idx, newRoleId) => {
    setEditedUpdates(prev => prev.map((u, i) => {
      if (i !== idx) return u;
      const role = getRoleById(newRoleId);
      return {
        ...u,
        newRole: newRoleId,
        newRoleLabel: role?.label || newRoleId,
        newColumnId: resolveNewColumnId(role, columns),
        newColumnTitle: POLE_TO_COLUMN_TITLE[role?.pole] || '—',
      };
    }));
  };

  const changeCreationRole = (idx, newRoleId) => {
    setEditedCreations(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const role = getRoleById(newRoleId);
      return {
        ...c,
        newRole: newRoleId,
        newRoleLabel: role?.label || newRoleId,
        newColumnId: resolveNewColumnId(role, columns),
        newColumnTitle: POLE_TO_COLUMN_TITLE[role?.pole] || '—',
      };
    }));
  };

  const handleApply = () => {
    if (totalChanges === 0) {
      toast.info('Aucun changement à appliquer');
      onClose();
      return;
    }

    // Construit le diff final (uniquement les lignes actives)
    const finalDiff = {
      updates: editedUpdates.filter(u => u._active).map(({ _active, ...rest }) => rest),
      creations: editedCreations.filter(c => c._active).map(({ _active, ...rest }) => rest),
      unassigned,
      missingColumns,
      stats: {
        updates: activeUpdates,
        creations: activeCreations,
        unassigned: unassigned.length,
        unchanged: stats.unchanged,
      },
    };

    if (!window.confirm(
      `Appliquer ${totalChanges} changement${totalChanges > 1 ? 's' : ''} au BDE ?\n\n` +
      `• ${activeUpdates} mise${activeUpdates > 1 ? 's' : ''} à jour\n` +
      `• ${activeCreations} création${activeCreations > 1 ? 's' : ''}\n` +
      `• ${unassigned.length} déplacement${unassigned.length > 1 ? 's' : ''} en transversal`
    )) return;

    try {
      // ⚠️ CORRECTIF : on passe le HOOK Zustand (avec .getState()), pas son résultat
      const result = applyDiffToStore(useStore, finalDiff, { createMissingColumns: true });
      toast.success(
        `${result.applied + result.created} membre${(result.applied + result.created) > 1 ? 's' : ''} mis à jour`,
        result.createdColumns.length > 0
          ? `${result.createdColumns.length} colonne${result.createdColumns.length > 1 ? 's' : ''} créée${result.createdColumns.length > 1 ? 's' : ''}`
          : 'Kanban synchronisé'
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Application impossible', err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-start p-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink flex items-center gap-2">
              <PlayCircle size={18} className="text-blue-500" />
              Appliquer le scénario
            </h3>
            <p className="text-xs text-dim mt-0.5 truncate">
              {scenario.name} · {candidates.length} candidats analysés · <span className="text-ink">intervention manuelle possible</span>
            </p>
          </div>
          <button onClick={onClose} className="text-dim hover:text-ink p-1 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Résumé (recaculé dynamiquement) */}
          <div className="grid grid-cols-4 gap-2">
            <StatBox icon={RefreshCw} label="Mises à jour" value={activeUpdates} total={editedUpdates.length} tone="blue" />
            <StatBox icon={UserPlus} label="Créations" value={activeCreations} total={editedCreations.length} tone="emerald" />
            <StatBox icon={Users} label="Transversaux" value={stats.unassigned} tone="amber" />
            <StatBox icon={CheckCircle2} label="Inchangés" value={stats.unchanged} tone="zinc" />
          </div>

          {/* Colonnes manquantes */}
          {missingColumns.length > 0 && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="text-amber-500 font-semibold">
                  {missingColumns.length} colonne{missingColumns.length > 1 ? 's' : ''} manquante{missingColumns.length > 1 ? 's' : ''}
                </p>
                <p className="text-dim mt-0.5">
                  Seront créées automatiquement : {missingColumns.join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Info intervention */}
          <div className="flex items-start gap-2 text-[11px] text-muted bg-blue-500/5 border border-blue-500/20 rounded-lg p-2.5">
            <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
            <span>
              Tu peux <strong className="text-ink">modifier le rôle cible</strong> de chaque ligne (cliquer sur le rôle),
              ou <strong className="text-ink">décocher</strong> une ligne pour l'exclure de l'application.
            </span>
          </div>

          {totalChanges === 0 ? (
            <div className="text-center py-8 text-dim text-sm">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500 opacity-50" />
              <p>Aucun changement à appliquer.</p>
            </div>
          ) : (
            <div className="space-y-4">

              {/* UPDATES */}
              {editedUpdates.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1.5 px-1 flex items-center justify-between">
                    <span>Mises à jour ({activeUpdates}/{editedUpdates.length})</span>
                    <button
                      onClick={() => {
                        const allActive = editedUpdates.every(u => u._active);
                        setEditedUpdates(prev => prev.map(u => ({ ...u, _active: !allActive })));
                      }}
                      className="text-[10px] text-blue-500 hover:text-blue-400 font-medium normal-case">
                      {editedUpdates.every(u => u._active) ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
                    {editedUpdates.map((u, i) => {
                      const member = members.find(m => m.id === u.memberId);
                      return (
                        <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                          u._active ? 'bg-elevated border border-line' : 'bg-elevated/40 border border-line/50 opacity-50'
                        }`}>
                          <button
                            onClick={() => toggleUpdate(i)}
                            className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                              u._active ? 'bg-blue-500 border-blue-500' : 'border-line-strong hover:border-dim'
                            }`}>
                            {u._active && <Check size={10} className="text-white" />}
                          </button>
                          <span className="font-medium text-ink truncate flex-1 min-w-0">
                            {member?.firstName} {member?.lastName}
                          </span>
                          <span className="text-dim font-mono text-[10px] shrink-0 hidden sm:inline">
                            {u.oldRole ? getRoleLabel(u.oldRole) : '—'}
                          </span>
                          <ArrowRight size={11} className="text-dim shrink-0" />
                          <RoleDropdown value={u.newRole} onChange={(rid) => changeUpdateRole(i, rid)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CREATIONS */}
              {editedCreations.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1.5 px-1 flex items-center justify-between">
                    <span>Nouveaux membres ({activeCreations}/{editedCreations.length})</span>
                    <button
                      onClick={() => {
                        const allActive = editedCreations.every(c => c._active);
                        setEditedCreations(prev => prev.map(c => ({ ...c, _active: !allActive })));
                      }}
                      className="text-[10px] text-emerald-500 hover:text-emerald-400 font-medium normal-case">
                      {editedCreations.every(c => c._active) ? 'Tout décocher' : 'Tout cocher'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                    {editedCreations.map((c, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        c._active ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-elevated/40 border border-line/50 opacity-50'
                      }`}>
                        <button
                          onClick={() => toggleCreation(i)}
                          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                            c._active ? 'bg-emerald-500 border-emerald-500' : 'border-line-strong hover:border-dim'
                          }`}>
                          {c._active && <Check size={10} className="text-white" />}
                        </button>
                        <UserPlus size={11} className={`shrink-0 ${c._active ? 'text-emerald-500' : 'text-dim'}`} />
                        <span className="font-medium text-ink truncate flex-1 min-w-0">
                          {c.candidate.firstName} {c.candidate.lastName}
                        </span>
                        <RoleDropdown value={c.newRole} onChange={(rid) => changeCreationRole(i, rid)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* UNASSIGNED */}
              {unassigned.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted font-bold mb-1.5 px-1">
                    Déplacés en transversal ({unassigned.length})
                  </div>
                  <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
                    {unassigned.slice(0, 30).map((u, i) => {
                      const member = members.find(m => m.id === u.memberId);
                      return (
                        <div key={i} className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-2 text-xs">
                          <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                          <span className="font-medium text-ink truncate flex-1">
                            {member?.firstName} {member?.lastName}
                          </span>
                          <span className="text-dim text-[10px] shrink-0">non placé</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-line">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={totalChanges === 0}
            className="flex-1 btn-primary text-sm disabled:opacity-50">
            <PlayCircle size={13} />
            {totalChanges === 0 ? 'Aucun changement' : `Appliquer ${totalChanges} changement${totalChanges > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Sous-composants
// ============================================================
function StatBox({ icon: Icon, label, value, total, tone }) {
  const tones = {
    blue: 'text-blue-500 bg-blue-500/10',
    emerald: 'text-emerald-500 bg-emerald-500/10',
    amber: 'text-amber-500 bg-amber-500/10',
    zinc: 'text-dim bg-elevated',
  };
  return (
    <div className="bg-surface border border-line rounded-lg p-2.5 text-center">
      <div className={`inline-flex p-1.5 rounded-lg mb-1 ${tones[tone]}`}>
        <Icon size={12} />
      </div>
      <div className="text-lg font-bold text-ink tabular-nums">
        {value}
        {typeof total === 'number' && total !== value && (
          <span className="text-xs text-muted font-normal"> / {total}</span>
        )}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

// Résout la colonne cible pour un rôle
function resolveNewColumnId(role, columns) {
  if (!role) return null;
  const POLE_TO_COLUMN = {
    bureau: 'direction',
    communication: 'com',
    communication_interne: 'com',
    projets: 'projet',
    event: 'event',
    sport: 'event',
    esport: 'event',
    partenariats: 'part',
    transversal: 'transverse',
  };
  const directId = POLE_TO_COLUMN[role.pole];
  if (directId && columns.some(c => c.id === directId)) return directId;
  const expectedTitle = POLE_TO_COLUMN_TITLE[role.pole];
  if (expectedTitle) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = norm(expectedTitle).split(' ')[0];
    const byTitle = columns.find(c => norm(c.title).includes(target));
    if (byTitle) return byTitle.id;
  }
  const transverse = columns.find(c => c.id === 'transverse' || /transver/i.test(c.title));
  return transverse?.id || columns[0]?.id || null;
}
