// Vue liste (mobile, « Mes tâches ») : regroupements, case « terminé »,
// changement de colonne par liste déroulante (alternative au glisser-déposer).
import { useId } from 'react';
import { CalendarClock, CheckSquare, Paperclip, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTasksStore } from './store.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort } from '../../documents/context.js';
import { checklistProgress, isOverdue, isTaskDone, priorityOf, todayIso } from './logic.js';
import { completeTask } from './actions.js';

/**
 * @param {{ groups: { id: string, title: string, color?: string, tasks: object[] }[],
 *   members, canWrite: boolean, onOpen: (id) => void, showBoard?: boolean, emptyText?: string }} props
 */
export default function ListView({ groups, members, canWrite, onOpen, showBoard = false, emptyText = 'Aucune tâche.' }) {
  const uid = useId();
  const boards = useTasksStore(s => s.boards);
  const moveTask = useTasksStore(s => s.moveTask);
  const today = todayIso();
  const nonEmpty = groups.filter(g => g.tasks.length);

  const toggleDone = (t, checked) => {
    if (checked) {
      const r = completeTask(t.id);
      if (!r.ok) toast.error('Impossible de terminer', r.error);
      else toast.success('Tâche terminée', t.title);
      return;
    }
    const first = boards[t.boardId]?.columns.find(c => !c.done);
    if (first) moveTask(t.id, first.id, Infinity);
  };

  const changeColumn = (t, columnId) => {
    const r = moveTask(t.id, columnId, Infinity);
    if (!r.ok) toast.error('Déplacement refusé', r.error);
    else if (r.wipExceeded) toast.warn('Limite de travail en cours dépassée', `« ${r.column.title} » contient plus de ${r.column.wipLimit} carte(s).`);
  };

  if (!nonEmpty.length) {
    return <p className="text-center text-sm text-dim py-10 border border-dashed border-line rounded-2xl">{emptyText}</p>;
  }

  return (
    <div className="space-y-4">
      {nonEmpty.map(g => (
        <section key={g.id} aria-labelledby={`${uid}-${g.id}`} className="bg-surface border border-line rounded-2xl overflow-hidden">
          <h2 id={`${uid}-${g.id}`} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-ink border-b border-line bg-elevated/40">
            {g.color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} aria-hidden="true" />}
            {g.title}
            <span className="badge badge-neutral ml-auto">{g.tasks.length}</span>
          </h2>
          <ul className="divide-y divide-line">
            {g.tasks.map(t => {
              const board = boards[t.boardId];
              const done = isTaskDone(t, boards);
              const late = isOverdue(t, boards, today);
              const prio = priorityOf(t.priority);
              const cl = checklistProgress(t);
              return (
                <li key={t.id} className="p-3 flex flex-wrap items-start gap-x-3 gap-y-2">
                  <input
                    type="checkbox"
                    className="w-5 h-5 mt-0.5 shrink-0"
                    checked={done}
                    disabled={!canWrite}
                    aria-label={`${done ? 'Rouvrir' : 'Terminer'} « ${t.title} »`}
                    onChange={(e) => toggleDone(t, e.target.checked)}
                  />
                  <button type="button" aria-haspopup="dialog" onClick={() => onOpen(t.id)}
                    className="flex-1 min-w-[10rem] text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                    <span className={`block text-sm font-medium break-words ${done ? 'line-through text-muted' : 'text-ink'}`}>{t.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-dim">
                      {showBoard && board && <span className="badge badge-neutral">{board.title}</span>}
                      {t.priority !== 'normal' && <span className={`badge ${prio.badge}`}>{prio.label}</span>}
                      {(t.labels || []).map(l => <span key={l} className="badge badge-neutral">{l}</span>)}
                      {t.dueDate && (
                        <span className={`inline-flex items-center gap-1 ${late ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
                          <CalendarClock size={12} aria-hidden="true" />{formatDateShort(t.dueDate)}{late ? ' · en retard' : ''}
                        </span>
                      )}
                      {cl.total > 0 && <span className="inline-flex items-center gap-1"><CheckSquare size={12} aria-hidden="true" />{cl.done}/{cl.total}</span>}
                      {(t.attachments || []).length > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={12} aria-hidden="true" />{t.attachments.length}</span>}
                      {t.requiresApproval && (t.approvedAt
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck size={12} aria-hidden="true" />Approuvée</span>
                        : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><ShieldAlert size={12} aria-hidden="true" />À valider</span>)}
                      {(t.assigneeIds || []).length > 0 && <span>{t.assigneeIds.map(id => members.name(id)).join(', ')}</span>}
                    </span>
                  </button>
                  {board && (
                    <select
                      className="input w-auto py-1 text-xs max-w-[11rem]"
                      value={t.columnId}
                      disabled={!canWrite}
                      aria-label={`Colonne de « ${t.title} »`}
                      onChange={(e) => changeColumn(t, e.target.value)}
                    >
                      {board.columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
