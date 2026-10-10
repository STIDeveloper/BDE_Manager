// Historique des versions de brouillon (instantanés) avec restauration.
import { useMemo, useState } from 'react';
import { History, RotateCcw, Trash2, Camera } from 'lucide-react';
import Modal from '../../../components/Modal.jsx';
import { confirmDialog } from '../../../components/ui/confirmStore.js';
import { toast } from '../../../components/ui/toastStore.js';
import { useFormsStore, MAX_SNAPSHOTS } from '../store.js';
import { flattenItems } from '../../../forms/engine/index.js';
import { formatDateTime, relativeTime } from '../utils.js';

const EMPTY = [];

function summary(def) {
  const q = flattenItems(def).filter(e => e.item.kind === 'question').length;
  return `${def.pages?.length || 0} page(s) · ${q} question(s) · « ${def.title} »`;
}

export default function HistoryModal({ formId, onClose, canWrite }) {
  const list = useFormsStore(s => s.history[formId]) || EMPTY;
  const restoreSnapshot = useFormsStore(s => s.restoreSnapshot);
  const deleteSnapshot = useFormsStore(s => s.deleteSnapshot);
  const snapshot = useFormsStore(s => s.snapshot);
  const [label, setLabel] = useState('');
  const items = useMemo(() => [...list].reverse(), [list]);

  const restore = async (snap) => {
    const ok = await confirmDialog({
      title: 'Restaurer cette version ?',
      message: `Le brouillon reviendra à l'état du ${formatDateTime(snap.at)} (« ${snap.label} »). L'état actuel est d'abord sauvegardé dans l'historique : tu pourras revenir en arrière.`,
      confirmLabel: 'Restaurer', tone: 'warning',
    });
    if (!ok) return;
    restoreSnapshot(formId, snap.id);
    toast.success('Version restaurée', snap.label);
    onClose();
  };
  const remove = async (snap) => {
    if (!(await confirmDialog({ title: 'Supprimer cet instantané ?', message: snap.label, confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    deleteSnapshot(formId, snap.id);
  };
  const create = () => {
    snapshot(formId, label.trim() || 'Instantané manuel');
    setLabel('');
    toast.success('Instantané enregistré');
  };

  return (
    <Modal isOpen onClose={onClose} title="Historique du brouillon" description={`Instantanés enregistrés à chaque étape importante (${MAX_SNAPSHOTS} au maximum, les plus anciens sont supprimés).`} maxWidth="max-w-xl">
      <div className="space-y-3">
        {canWrite && (
          <div className="flex gap-2">
            <label htmlFor="snap-label" className="sr-only">Nom de l'instantané</label>
            <input id="snap-label" className="input" placeholder="Nom de l'instantané (facultatif)" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} />
            <button type="button" className="btn-secondary shrink-0" onClick={create}><Camera size={15} aria-hidden="true" /> Enregistrer</button>
          </div>
        )}
        {!items.length ? <p className="text-sm text-dim flex items-center gap-2"><History size={16} aria-hidden="true" /> Aucun instantané.</p> : (
          <ol className="divide-y divide-line border border-line rounded-xl">
            {items.map((s, i) => (
              <li key={s.id} className="p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{s.label}{i === 0 ? <span className="badge badge-neutral ml-2">le plus récent</span> : null}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(s.at)} ({relativeTime(s.at)}) · {summary(s.definition)}</p>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={() => restore(s)}><RotateCcw size={13} aria-hidden="true" /> Restaurer</button>
                    <button type="button" className="btn-ghost !p-1.5" aria-label={`Supprimer l'instantané ${s.label}`} onClick={() => remove(s)}><Trash2 size={13} aria-hidden="true" /></button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
