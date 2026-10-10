import { useMemo, useState, useEffect, useRef } from 'react';
import {
  ArrowRight, UserPlus, RefreshCw, AlertTriangle, Users,
  CheckCircle2, Info, PlayCircle, Undo2,
} from 'lucide-react';
import { useStore } from '../../store';
import { useRolesStore } from '../../roleEngine/store.js';
import { buildApplyDiff, applyDiffToStore, resolveColumnId, poleColumnTitle } from '../../core/bridge.js';
import { useCatalog } from '../../core/useCatalog.js';
import { toast } from '../ui/toastStore';
import Modal from '../Modal';

// ============================================================
// Sélecteur de rôle : <select> natif groupé par pôle
// (accessible au clavier / lecteur d'écran, natif sur mobile)
// ============================================================
function RoleSelect({ value, onChange, label, disabled }) {
  const { poleList, rolesByPole, roles, levelLabel } = useCatalog();
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      disabled={disabled}
      className="max-w-[55%] sm:max-w-[240px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-md px-2 py-1 text-[11px] font-medium border border-transparent focus:outline-none focus:border-blue-500 disabled:opacity-50"
    >
      {value && !roles[value] && <option value={value}>{value} (rôle supprimé)</option>}
      {poleList.filter(p => (rolesByPole[p.id] || []).length > 0).map(p => (
        <optgroup key={p.id} label={`${p.emoji ? p.emoji + ' ' : ''}${p.label}`}>
          {rolesByPole[p.id].map(r => (
            <option key={r.id} value={r.id}>{r.label} · {levelLabel(r.level)}</option>
          ))}
        </optgroup>
      ))}
    </select>
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
  const { roles } = useCatalog();

  // Calcule le diff brut
  const rawDiff = useMemo(() => {
    if (!scenario || !candidates.length) return null;
    return buildApplyDiff({ candidates, scenario, members, columns });
  }, [scenario, candidates, members, columns]);

  // État éditable : chaque ligne peut être modifiée ou exclue
  const [editedUpdates, setEditedUpdates] = useState([]);
  const [editedCreations, setEditedCreations] = useState([]);

  // Initialise les lignes éditables UNIQUEMENT à l'ouverture : une
  // modification du store pendant l'édition ne doit pas effacer les choix
  // manuels de l'utilisateur.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && rawDiff && !wasOpen.current) {
      wasOpen.current = true;
      // Initialisation à l'ouverture uniquement
      setEditedUpdates(rawDiff.updates.map(u => ({ ...u, _active: true })));
      setEditedCreations(rawDiff.creations.map(c => ({ ...c, _active: true })));
    }
    if (!isOpen) wasOpen.current = false;
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
      const role = roles[newRoleId];
      return {
        ...u,
        newRole: newRoleId,
        newRoleLabel: role?.label || newRoleId,
        newColumnId: resolveColumnId(role, columns),
        newColumnTitle: role ? poleColumnTitle(role.pole) : '—',
      };
    }));
  };

  const changeCreationRole = (idx, newRoleId) => {
    setEditedCreations(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const role = roles[newRoleId];
      return {
        ...c,
        newRole: newRoleId,
        newRoleLabel: role?.label || newRoleId,
        newColumnId: resolveColumnId(role, columns),
        newColumnTitle: role ? poleColumnTitle(role.pole) : '—',
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
      updates: editedUpdates.filter(u => u._active).map(stripActive),
      creations: editedCreations.filter(c => c._active).map(stripActive),
      unassigned,
      missingColumns,
      stats: {
        updates: activeUpdates,
        creations: activeCreations,
        unassigned: unassigned.length,
        unchanged: stats.unchanged,
      },
    };

    // Pas de confirmation supplémentaire : cette fenêtre EST la confirmation
    // (récapitulatif au-dessus du bouton) et l'application est annulable
    // d'un coup (Ctrl+Z = une seule étape d'historique).
    try {
      // ⚠️ CORRECTIF : on passe le HOOK Zustand (avec .getState()), pas son résultat
      const result = applyDiffToStore(useStore, finalDiff, { createMissingColumns: true });
      toast.success(
        `${result.applied + result.created} membre${(result.applied + result.created) > 1 ? 's' : ''} mis à jour`,
        (result.createdColumns.length > 0
          ? `${result.createdColumns.length} colonne${result.createdColumns.length > 1 ? 's' : ''} créée${result.createdColumns.length > 1 ? 's' : ''}. `
          : 'Kanban synchronisé. ') + 'Ctrl+Z pour tout annuler.',
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Application impossible', err.message);
    }
  };

  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  const footer = (
    <div className="space-y-2.5">
      {totalChanges > 0 && (
        <p className="text-[11px] text-dim flex items-start gap-1.5">
          <Undo2 size={12} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Récapitulatif : <strong className="text-ink">{plural(activeUpdates, 'mise à jour', 'mises à jour')}</strong>,{' '}
            <strong className="text-ink">{plural(activeCreations, 'création', 'créations')}</strong>,{' '}
            <strong className="text-ink">{plural(unassigned.length, 'déplacement', 'déplacements')}</strong> en transversal.
            L'application compte pour <strong className="text-ink">une seule étape</strong> : Ctrl+Z annule tout.
          </span>
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 btn-secondary text-sm">
          Annuler
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={totalChanges === 0}
          className="flex-1 btn-primary text-sm disabled:opacity-50">
          <PlayCircle size={13} aria-hidden="true" />
          {totalChanges === 0 ? 'Aucun changement' : `Appliquer ${totalChanges} changement${totalChanges > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={(
        <span className="flex items-center gap-2">
          <PlayCircle size={18} className="text-blue-500" aria-hidden="true" />
          Appliquer le scénario
        </span>
      )}
      description={`${scenario.name} · ${candidates.length} candidats analysés · intervention manuelle possible`}
      footer={footer}
    >
        {/* Body */}
        <div className="space-y-4">

          {/* Résumé (recalculé dynamiquement) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              Tu peux <strong className="text-ink">modifier le rôle cible</strong> de chaque ligne (liste déroulante),
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
                      type="button"
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
                        <div key={u.memberId} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                          u._active ? 'bg-elevated border border-line' : 'bg-elevated/40 border border-line/50 opacity-50'
                        }`}>
                          <input
                            type="checkbox"
                            checked={u._active}
                            onChange={() => toggleUpdate(i)}
                            aria-label={`Inclure ${member?.firstName || ''} ${member?.lastName || ''}`.trim()}
                            className="shrink-0 w-4 h-4 accent-blue-500 cursor-pointer"
                          />
                          <span className="font-medium text-ink truncate flex-1 min-w-0">
                            {member?.firstName} {member?.lastName}
                          </span>
                          <span className="text-dim font-mono text-[10px] shrink-0 hidden sm:inline">
                            {u.oldRole ? (roles[u.oldRole]?.label || u.oldRole) : '—'}
                          </span>
                          <ArrowRight size={11} className="text-dim shrink-0" />
                          <RoleSelect value={u.newRole} onChange={(rid) => changeUpdateRole(i, rid)} disabled={!u._active}
                            label={`Nouveau rôle de ${member?.firstName || ''} ${member?.lastName || ''}`.trim()} />
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
                      type="button"
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
                      <div key={c.candidate.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                        c._active ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-elevated/40 border border-line/50 opacity-50'
                      }`}>
                        <input
                          type="checkbox"
                          checked={c._active}
                          onChange={() => toggleCreation(i)}
                          aria-label={`Créer ${c.candidate.firstName} ${c.candidate.lastName}`}
                          className="shrink-0 w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                        <UserPlus size={11} className={`shrink-0 ${c._active ? 'text-emerald-500' : 'text-dim'}`} />
                        <span className="font-medium text-ink truncate flex-1 min-w-0">
                          {c.candidate.firstName} {c.candidate.lastName}
                        </span>
                        <RoleSelect value={c.newRole} onChange={(rid) => changeCreationRole(i, rid)} disabled={!c._active}
                          label={`Rôle de ${c.candidate.firstName} ${c.candidate.lastName}`} />
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
                    {unassigned.slice(0, 30).map((u) => {
                      const member = members.find(m => m.id === u.memberId);
                      return (
                        <div key={u.memberId} className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-2 text-xs">
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

    </Modal>
  );
}

// ============================================================
// Sous-composants
// ============================================================
/** Retire le drapeau d'édition `_active` d'une ligne avant application. */
function stripActive(row) {
  const out = { ...row };
  delete out._active;
  return out;
}

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
