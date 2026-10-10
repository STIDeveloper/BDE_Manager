// Carte de tâche (présentation) + version déplaçable (@dnd-kit/sortable).
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarClock, CheckSquare, GripVertical, Link2, Paperclip, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatDateShort } from '../../documents/context.js';
import { checklistProgress, priorityOf } from './logic.js';
import { initials, memberLabel } from './hooks.js';

/** Contenu commun d'une carte (Kanban, superposition de glisser-déposer). */
export function TaskCardBody({ task, members, overdue, done }) {
  const prio = priorityOf(task.priority);
  const cl = checklistProgress(task);
  const assignees = (task.assigneeIds || []).map(id => members.byId.get(id)).filter(Boolean);
  const hasLink = task.links && Object.keys(task.links).length > 0;
  return (
    <>
      <span className={`block text-sm font-medium break-words ${done ? 'line-through text-muted' : 'text-ink'}`}>{task.title}</span>
      {(task.priority !== 'normal' || (task.labels || []).length > 0) && (
        <span className="flex flex-wrap gap-1 mt-1.5">
          {task.priority !== 'normal' && <span className={`badge ${prio.badge}`}>{prio.label}</span>}
          {(task.labels || []).slice(0, 4).map(l => <span key={l} className="badge badge-neutral">{l}</span>)}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[11px] text-dim">
        {task.dueDate && (
          <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
            <CalendarClock size={12} aria-hidden="true" />
            {formatDateShort(task.dueDate)}{overdue ? ' · en retard' : ''}
          </span>
        )}
        {cl.total > 0 && (
          <span className={`inline-flex items-center gap-1 ${cl.done === cl.total ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
            <CheckSquare size={12} aria-hidden="true" /> {cl.done}/{cl.total}
            <span className="sr-only"> éléments de checklist faits</span>
          </span>
        )}
        {(task.attachments || []).length > 0 && (
          <span className="inline-flex items-center gap-1"><Paperclip size={12} aria-hidden="true" />{task.attachments.length}<span className="sr-only"> pièce(s) jointe(s)</span></span>
        )}
        {hasLink && <span className="inline-flex items-center gap-1"><Link2 size={12} aria-hidden="true" /><span className="sr-only">Liée à un autre module</span></span>}
        {task.requiresApproval && (task.approvedAt
          ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><ShieldCheck size={12} aria-hidden="true" />Approuvée</span>
          : <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><ShieldAlert size={12} aria-hidden="true" />À valider</span>)}
        {assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1.5" aria-label={`Assignée à ${assignees.map(memberLabel).join(', ')}`}>
            {assignees.slice(0, 3).map(m => (
              <span key={m.id} title={memberLabel(m)} aria-hidden="true"
                className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-surface">
                {initials(m)}
              </span>
            ))}
            {assignees.length > 3 && <span aria-hidden="true" className="w-6 h-6 rounded-full bg-elevated text-dim text-[10px] flex items-center justify-center ring-2 ring-surface">+{assignees.length - 3}</span>}
          </span>
        )}
      </span>
    </>
  );
}

/** Nom accessible résumé d'une carte. */
function cardLabel(task, overdue, done) {
  const parts = [task.title];
  if (task.priority !== 'normal') parts.push(`priorité ${priorityOf(task.priority).label.toLowerCase()}`);
  if (task.dueDate) parts.push(`échéance ${formatDateShort(task.dueDate)}${overdue ? ' (en retard)' : ''}`);
  if (task.requiresApproval) parts.push(task.approvedAt ? 'approuvée' : 'à valider');
  if (done) parts.push('terminée');
  return `Ouvrir « ${parts[0]} »${parts.length > 1 ? ` — ${parts.slice(1).join(', ')}` : ''}`;
}

/** Carte déplaçable : poignée (clavier / souris) + zone cliquable qui ouvre la fiche. */
export function SortableTaskCard({ task, members, overdue, done, onOpen, disabled }) {
  const {
    setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging,
  } = useSortable({ id: task.id, data: { type: 'task', columnId: task.columnId }, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(disabled ? {} : listeners)}
      className={`group bg-surface border rounded-xl shadow-sm flex items-stretch ${overdue ? 'border-rose-500/40' : 'border-line'} ${isDragging ? 'opacity-40' : ''}`}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          aria-roledescription="carte déplaçable"
          aria-label={`Déplacer « ${task.title} »`}
          className="shrink-0 px-1 text-muted hover:text-ink cursor-grab active:cursor-grabbing rounded-l-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 touch-none"
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={`flex-1 min-w-0 text-left p-3 ${disabled ? '' : 'pl-1'} rounded-r-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}
        aria-haspopup="dialog"
        aria-label={cardLabel(task, overdue, done)}
      >
        <TaskCardBody task={task} members={members} overdue={overdue} done={done} />
      </button>
    </li>
  );
}
