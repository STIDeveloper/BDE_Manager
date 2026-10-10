// Création / configuration d'un tableau : titre, pôle, colonnes
// (titre, couleur, limite WIP, colonne « terminé », ordre, suppression).
import { useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { useCatalog } from '../../core/useCatalog.js';
import { newId } from '../../core/createModuleStore.js';
import { useTasksStore } from './store.js';
import { COLUMN_COLORS, DEFAULT_COLUMNS, GENERAL_BOARD_ID } from './logic.js';

/**
 * @param {{ board?: object|null, onClose: () => void, onCreated?: (id) => void, onDeleted?: () => void }} props
 *   `board` absent → création.
 */
export default function BoardSettings({ board, onClose, onCreated, onDeleted }) {
  const uid = useId();
  const isNew = !board;
  const tasks = useTasksStore(s => s.tasks);
  const { createBoard, updateBoard, setColumns, deleteBoard } = useTasksStore.getState();
  const { poleList } = useCatalog();
  const [title, setTitle] = useState(board?.title || '');
  const [description, setDescription] = useState(board?.description || '');
  const [poleId, setPoleId] = useState(board?.poleId || '');
  const [cols, setCols] = useState(() => (board?.columns || DEFAULT_COLUMNS.map(c => ({ ...c, id: newId() }))).map(c => ({ ...c, wipLimit: c.wipLimit || '' })));
  const [error, setError] = useState('');

  const counts = useMemo(() => {
    const out = {};
    if (!board) return out;
    Object.values(tasks).forEach(t => { if (t.boardId === board.id) out[t.columnId] = (out[t.columnId] || 0) + 1; });
    return out;
  }, [tasks, board]);

  const patchCol = (id, patch) => setCols(list => list.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const moveCol = (i, d) => setCols(list => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const removeCol = async (c) => {
    if (cols.length <= 1) { setError('Un tableau garde au moins une colonne.'); return; }
    const n = counts[c.id] || 0;
    if (n) {
      const target = cols.find(x => x.id !== c.id);
      const ok = await confirmDialog({
        title: `Supprimer la colonne « ${c.title || 'sans titre'} » ?`,
        message: `Ses ${n} carte(s) seront déplacées dans « ${target?.title} » à l'enregistrement.`,
        confirmLabel: 'Supprimer la colonne', tone: 'danger',
      });
      if (!ok) return;
    }
    setCols(list => list.filter(x => x.id !== c.id));
  };

  const save = (e) => {
    e.preventDefault();
    if (!title.trim()) { setError('Donne un titre au tableau.'); document.getElementById(`${uid}-title`)?.focus(); return; }
    if (cols.some(c => !String(c.title).trim())) { setError('Chaque colonne doit avoir un titre.'); return; }
    const columns = cols.map(c => ({ ...c, wipLimit: c.wipLimit === '' ? undefined : Number(c.wipLimit) }));
    if (isNew) {
      const id = createBoard({ title, description, poleId, columns });
      toast.success('Tableau créé', title.trim());
      onCreated?.(id);
    } else {
      updateBoard(board.id, { title, description, poleId });
      setColumns(board.id, columns);
      toast.success('Tableau enregistré', title.trim());
    }
    onClose();
  };

  const toggleArchive = async () => {
    if (!board.archived) {
      const ok = await confirmDialog({
        title: `Archiver « ${board.title} » ?`,
        message: 'Le tableau disparaît de la liste principale (ses tâches sont conservées et ses échéances quittent l\'agenda). Tu pourras le désarchiver.',
        confirmLabel: 'Archiver', tone: 'warning',
      });
      if (!ok) return;
    }
    updateBoard(board.id, { archived: !board.archived });
    toast.success(board.archived ? 'Tableau désarchivé' : 'Tableau archivé', board.title);
    onClose();
  };

  const remove = async () => {
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    const ok = await confirmDialog({
      title: `Supprimer définitivement « ${board.title} » ?`,
      message: `Le tableau et ses ${n} tâche(s) seront supprimés. Action irréversible.`,
      confirmLabel: 'Supprimer', tone: 'danger', requireWord: 'SUPPRIMER',
    });
    if (!ok) return;
    deleteBoard(board.id);
    toast.success('Tableau supprimé', board.title);
    onDeleted?.();
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isNew ? 'Nouveau tableau' : `Configurer « ${board.title} »`}
      maxWidth="max-w-2xl"
      footer={(
        <div className="flex flex-wrap gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <button type="button" className="btn-secondary" onClick={toggleArchive}>
                {board.archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                {board.archived ? 'Désarchiver' : 'Archiver'}
              </button>
            )}
            {!isNew && board.archived && board.id !== GENERAL_BOARD_ID && (
              <button type="button" className="btn-danger" onClick={remove}><Trash2 size={16} aria-hidden="true" /> Supprimer</button>
            )}
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" form={`${uid}-form`} className="btn-primary">{isNew ? 'Créer le tableau' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
    >
      <form id={`${uid}-form`} onSubmit={save} className="space-y-4">
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-title`} className="block text-xs font-medium text-dim mb-1">Titre</label>
            <input id={`${uid}-title`} data-autofocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Communication, WEI 2027…" />
          </div>
          <div>
            <label htmlFor={`${uid}-pole`} className="block text-xs font-medium text-dim mb-1">Pôle (facultatif)</label>
            <select id={`${uid}-pole`} className="input" value={poleId} onChange={(e) => setPoleId(e.target.value)}>
              <option value="">— Aucun —</option>
              {poleList.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${uid}-desc`} className="block text-xs font-medium text-dim mb-1">Description</label>
          <textarea id={`${uid}-desc`} rows={2} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink mb-1">Colonnes</legend>
          <p className="text-xs text-dim">La limite WIP (travail en cours) déclenche une alerte quand la colonne la dépasse. Les cartes d'une colonne « terminé » comptent comme achevées.</p>
          <ol className="space-y-2">
            {cols.map((c, i) => {
              const n = counts[c.id] || 0;
              const over = c.wipLimit !== '' && Number(c.wipLimit) >= 1 && n > Number(c.wipLimit);
              return (
                <li key={c.id} className="border border-line rounded-xl p-2.5 grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_8rem_6rem_auto_auto] gap-2 items-end">
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`${uid}-c-${c.id}`} className="block text-[11px] text-dim mb-0.5">Titre de la colonne {i + 1}{n ? ` (${n} carte${n > 1 ? 's' : ''})` : ''}</label>
                    <input id={`${uid}-c-${c.id}`} className="input py-1.5" value={c.title} onChange={(e) => patchCol(c.id, { title: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-col-${c.id}`} className="block text-[11px] text-dim mb-0.5">Couleur</label>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} aria-hidden="true" />
                      <select id={`${uid}-col-${c.id}`} className="input py-1.5" value={c.color} onChange={(e) => patchCol(c.id, { color: e.target.value })}>
                        {COLUMN_COLORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        {!COLUMN_COLORS.some(o => o.id === c.color) && <option value={c.color}>Personnalisée</option>}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-wip-${c.id}`} className="block text-[11px] text-dim mb-0.5">Limite WIP</label>
                    <input id={`${uid}-wip-${c.id}`} type="number" min="1" inputMode="numeric" placeholder="Aucune"
                      className={`input py-1.5 ${over ? 'border-rose-500/60' : ''}`} value={c.wipLimit}
                      aria-describedby={over ? `${uid}-over-${c.id}` : undefined}
                      onChange={(e) => patchCol(c.id, { wipLimit: e.target.value === '' ? '' : Math.max(1, Math.floor(Number(e.target.value)) || 1) })} />
                    {over && <span id={`${uid}-over-${c.id}`} className="text-[10px] text-rose-600 dark:text-rose-400">Déjà {n} cartes</span>}
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-ink pb-2">
                    <input type="checkbox" className="w-4 h-4" aria-label={`Colonne « ${c.title} » : colonne « terminé »`} checked={!!c.done} onChange={(e) => patchCol(c.id, { done: e.target.checked })} />
                    Terminé
                  </label>
                  <div className="flex gap-0.5 pb-0.5 col-span-2 sm:col-span-1 justify-end">
                    <button type="button" className="btn-ghost p-1.5" disabled={i === 0} aria-label={`Monter la colonne « ${c.title} »`} onClick={() => moveCol(i, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost p-1.5" disabled={i === cols.length - 1} aria-label={`Descendre la colonne « ${c.title} »`} onClick={() => moveCol(i, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                    <button type="button" className="btn-ghost p-1.5 text-rose-600" disabled={cols.length <= 1} aria-label={`Supprimer la colonne « ${c.title} »`} onClick={() => removeCol(c)}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn-secondary" onClick={() => setCols(list => [...list, { id: newId(), title: `Colonne ${list.length + 1}`, color: COLUMN_COLORS[(list.length) % COLUMN_COLORS.length].id, wipLimit: '' }])}>
            <Plus size={16} aria-hidden="true" /> Ajouter une colonne
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
