import { useId, useState } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import Modal from '../Modal';

/**
 * Suppression d'une colonne Kanban : les membres qu'elle contient sont soit
 * déplacés vers une autre colonne (choix par défaut), soit supprimés avec
 * leurs permissions Drive. Annulable par Ctrl+Z dans les deux cas.
 *
 * Monté uniquement quand il est ouvert (état interne remis à zéro).
 */
export default function DeleteColumnDialog({ column, memberCount, otherColumns, onCancel, onConfirm }) {
  const groupId = useId();
  const canMove = otherColumns.length > 0;
  const [mode, setMode] = useState(memberCount > 0 && canMove ? 'move' : 'delete');
  const [target, setTarget] = useState(otherColumns[0]?.id || '');
  const n = memberCount;
  const plural = n > 1 ? 's' : '';

  const confirm = () => onConfirm(mode === 'move' && n > 0 ? { moveMembersTo: target } : {});
  const danger = n > 0 && mode === 'delete';

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={`Supprimer la colonne « ${column.title} » ?`}
      maxWidth="max-w-md"
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onCancel} data-autofocus
            className="flex-1 bg-elevated hover:bg-line text-ink font-medium py-2.5 rounded-lg transition-colors border border-line">
            Annuler
          </button>
          <button type="button" onClick={confirm} disabled={mode === 'move' && n > 0 && !target}
            className={`flex-1 font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-white ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            {n === 0 ? 'Supprimer la colonne' : danger ? `Supprimer colonne + ${n} membre${plural}` : 'Déplacer et supprimer'}
          </button>
        </div>
      }
    >
      {n === 0 ? (
        <p className="text-sm text-dim">La colonne est vide. Tu peux annuler avec Ctrl+Z.</p>
      ) : (
        <fieldset className="space-y-3">
          <legend id={groupId} className="text-sm text-ink mb-2">
            Cette colonne contient <strong>{n} membre{plural}</strong>{' '}
            (filtres ignorés). Que faire de {n > 1 ? 'ces membres' : 'ce membre'} ?
          </legend>

          <label className={`flex gap-3 items-start border rounded-xl p-3 cursor-pointer ${
            mode === 'move' ? 'border-blue-500 bg-blue-500/5' : 'border-line'
          } ${canMove ? '' : 'opacity-50 cursor-not-allowed'}`}>
            <input type="radio" name={groupId} value="move" checked={mode === 'move'}
              disabled={!canMove} onChange={() => setMode('move')} className="mt-1" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ArrowRightLeft size={14} aria-hidden="true" /> Déplacer les {n} membre{plural} vers…
              </span>
              {canMove ? (
                <select value={target} aria-label="Colonne de destination"
                  onChange={(e) => { setTarget(e.target.value); setMode('move'); }}
                  className="mt-2 w-full bg-elevated border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-blue-500">
                  {otherColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              ) : (
                <span className="block text-xs text-dim mt-1">Aucune autre colonne disponible.</span>
              )}
            </span>
          </label>

          <label className={`flex gap-3 items-start border rounded-xl p-3 cursor-pointer ${
            mode === 'delete' ? 'border-red-500 bg-red-500/5' : 'border-line'
          }`}>
            <input type="radio" name={groupId} value="delete" checked={mode === 'delete'}
              onChange={() => setMode('delete')} className="mt-1" />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-red-500">
                <Trash2 size={14} aria-hidden="true" /> Supprimer aussi les {n} membre{plural}
              </span>
              <span className="block text-xs text-dim mt-1">
                Leurs permissions Drive et notes sont supprimées. Annulable avec Ctrl+Z.
              </span>
            </span>
          </label>
        </fieldset>
      )}
    </Modal>
  );
}
