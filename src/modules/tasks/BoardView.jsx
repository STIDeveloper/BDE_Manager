// Vue Kanban d'un tableau : colonnes + cartes avec glisser-déposer
// (pointeur, tactile, clavier) et annonces pour lecteur d'écran en français.
import { useId, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, TouchSensor,
  useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { AlertTriangle, CheckCircle2, Plus, Settings2, X } from 'lucide-react';
import { useTasksStore } from './store.js';
import { toast } from '../../components/ui/toastStore.js';
import { isOverdue, todayIso } from './logic.js';
import { SortableTaskCard, TaskCardBody } from './TaskCard.jsx';

const INSTRUCTIONS = 'Pour déplacer une carte : place le focus sur sa poignée, appuie sur Espace ou Entrée pour la saisir, '
  + 'utilise les flèches pour changer de position ou de colonne, Espace ou Entrée pour la déposer, Échap pour annuler.';

/**
 * @param {{ board, grouped: Record<string, object[]>, visible: Record<string, object[]>, members,
 *   canWrite: boolean, canManage: boolean, onOpen: (id) => void, onConfigure: () => void, filtered: boolean }} props
 */
export default function BoardView({ board, grouped, visible, members, canWrite, canManage, onOpen, onConfigure, filtered }) {
  const tasks = useTasksStore(s => s.tasks);
  const boards = useTasksStore(s => s.boards);
  const moveTask = useTasksStore(s => s.moveTask);
  const [activeId, setActiveId] = useState(null);
  const today = todayIso();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const colTitle = (id) => board.columns.find(c => c.id === id)?.title || '';
  const targetOf = (over) => {
    if (!over) return null;
    if (over.data.current?.type === 'column') return { columnId: over.data.current.columnId, overTaskId: null };
    const t = tasks[over.id];
    return t ? { columnId: t.columnId, overTaskId: t.id } : null;
  };

  const announcements = {
    onDragStart: ({ active }) => `Carte « ${tasks[active.id]?.title} » saisie, colonne « ${colTitle(tasks[active.id]?.columnId)} ».`,
    onDragOver: ({ active, over }) => {
      const tg = targetOf(over);
      if (!tg) return `La carte « ${tasks[active.id]?.title} » n'est au-dessus d'aucune colonne.`;
      if (tg.overTaskId && tg.overTaskId !== active.id) {
        const list = grouped[tg.columnId] || [];
        return `Position ${list.findIndex(t => t.id === tg.overTaskId) + 1} sur ${list.length}, colonne « ${colTitle(tg.columnId)} ».`;
      }
      return `Colonne « ${colTitle(tg.columnId)} ».`;
    },
    onDragEnd: ({ active, over }) => {
      const tg = targetOf(over);
      return tg ? `Carte « ${tasks[active.id]?.title} » déposée dans la colonne « ${colTitle(tg.columnId)} ».`
        : `Déplacement de « ${tasks[active.id]?.title} » annulé.`;
    },
    onDragCancel: ({ active }) => `Déplacement de « ${tasks[active.id]?.title} » annulé, la carte reprend sa place.`,
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveId(null);
    const task = tasks[active.id];
    const tg = targetOf(over);
    if (!task || !tg) return;
    const full = grouped[tg.columnId] || [];
    let index = full.filter(t => t.id !== task.id).length;
    if (tg.overTaskId) {
      if (tg.overTaskId === task.id) return;
      index = full.findIndex(t => t.id === tg.overTaskId);
    }
    if (tg.columnId === task.columnId && full.findIndex(t => t.id === task.id) === index) return;
    const res = moveTask(task.id, tg.columnId, index);
    if (!res.ok) { toast.error('Déplacement refusé', res.error); return; }
    if (res.wipExceeded) {
      toast.warn('Limite de travail en cours dépassée', `« ${res.column.title} » contient plus de ${res.column.wipLimit} carte(s).`);
    }
  };

  const active = activeId ? tasks[activeId] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => setActiveId(a.id)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
    >
      <div className="relative flex gap-3 sm:gap-4 overflow-x-auto pb-6 items-start snap-x snap-mandatory sm:snap-none -mx-4 px-4 sm:mx-0 sm:px-0">
        {board.columns.map(col => (
          <Column
            key={col.id}
            board={board}
            column={col}
            total={(grouped[col.id] || []).length}
            items={visible[col.id] || []}
            members={members}
            boards={boards}
            today={today}
            canWrite={canWrite}
            canManage={canManage}
            onOpen={onOpen}
            onConfigure={onConfigure}
            filtered={filtered}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          // Mêmes dimensions que la carte d'origine (pas de rotation : le
          // repérage clavier de dnd-kit compare les bords des rectangles).
          <div className="bg-surface border border-blue-500/50 rounded-xl shadow-xl p-3 pl-6 w-full h-full" data-task-overlay>
            <TaskCardBody task={active} members={members} overdue={isOverdue(active, boards, today)} done={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({ board, column, total, items, members, boards, today, canWrite, canManage, onOpen, onConfigure, filtered }) {
  const uid = useId();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.id}`, data: { type: 'column', columnId: column.id }, disabled: !canWrite });
  const createTask = useTasksStore(s => s.createTask);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);
  const ids = useMemo(() => items.map(t => t.id), [items]);
  const overWip = !!column.wipLimit && total > column.wipLimit;
  const atWip = !!column.wipLimit && total === column.wipLimit;

  const submit = (e) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) { inputRef.current?.focus(); return; }
    createTask({ boardId: board.id, columnId: column.id, title: t, source: 'manuel' });
    setTitle('');
    inputRef.current?.focus();
    if (column.wipLimit && total + 1 > column.wipLimit) {
      toast.warn('Limite de travail en cours dépassée', `« ${column.title} » : ${total + 1} cartes pour une limite de ${column.wipLimit}.`);
    }
  };

  return (
    <section
      aria-labelledby={`${uid}-h`}
      className={`relative w-[85vw] max-w-80 sm:w-72 shrink-0 snap-start rounded-2xl border flex flex-col max-h-[calc(100vh-15rem)] min-h-[8rem]
        ${overWip ? 'border-rose-500/50 bg-rose-500/[0.04]' : 'border-line bg-elevated/40'} ${isOver ? 'ring-2 ring-blue-500/40' : ''}`}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: column.color }} aria-hidden="true" />
        <h2 id={`${uid}-h`} className="font-semibold text-sm text-ink truncate flex-1">
          {column.title}
          {column.done && <CheckCircle2 size={13} className="inline ml-1 text-emerald-500 align-[-2px]" aria-label="(colonne terminée)" />}
        </h2>
        <span
          className={`badge ${overWip ? 'badge-rose' : atWip ? 'badge-amber' : 'badge-neutral'}`}
          title={column.wipLimit ? `Limite de travail en cours : ${column.wipLimit}` : undefined}
        >
          {filtered && items.length !== total ? `${items.length} / ` : ''}{total}{column.wipLimit ? ` (max ${column.wipLimit})` : ''}
          {overWip && <span className="sr-only"> — limite dépassée</span>}
        </span>
        {canManage && (
          <button type="button" className="btn-ghost p-1.5" aria-label={`Configurer les colonnes (depuis « ${column.title} »)`} onClick={onConfigure}>
            <Settings2 size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      {overWip && (
        <p role="status" className="mx-3 mb-2 text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
          <AlertTriangle size={12} aria-hidden="true" /> Limite dépassée ({total}/{column.wipLimit}) : termine avant d'en commencer d'autres.
        </p>
      )}
      <SortableContext id={column.id} items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[3rem]" aria-label={`Cartes de « ${column.title} »`}>
          {items.map(t => (
            <SortableTaskCard
              key={t.id}
              task={t}
              members={members}
              overdue={isOverdue(t, boards, today)}
              done={!!column.done}
              onOpen={onOpen}
              disabled={!canWrite}
            />
          ))}
          {items.length === 0 && (
            <li className="text-xs text-muted text-center py-4 border border-dashed border-line rounded-xl list-none">
              {filtered && total ? 'Aucune carte dans ce filtre' : 'Aucune carte'}
            </li>
          )}
        </ul>
      </SortableContext>
      {canWrite && (
        <div className="p-2 border-t border-line">
          {adding ? (
            <form onSubmit={submit} className="space-y-2">
              <label htmlFor={`${uid}-new`} className="sr-only">Titre de la nouvelle carte dans « {column.title} »</label>
              <input
                id={`${uid}-new`}
                ref={inputRef}
                autoFocus
                className="input"
                value={title}
                placeholder="Titre de la carte…"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setTitle(''); } }}
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1 py-1.5"><Plus size={14} aria-hidden="true" /> Ajouter</button>
                <button type="button" className="btn-ghost p-1.5" aria-label="Fermer l'ajout rapide" onClick={() => { setAdding(false); setTitle(''); }}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn-ghost w-full justify-start text-xs py-1.5" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden="true" /> Ajouter une carte
            </button>
          )}
        </div>
      )}
    </section>
  );
}
