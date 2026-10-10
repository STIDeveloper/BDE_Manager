// ============================================================
// SÉLECTEURS PURS DU MODULE TÂCHES (agenda, accueil, autres modules)
// ============================================================
// Usage dans un composant (Zustand v5 : sélectionner les maps brutes) :
//   const tasks = useTasksStore(s => s.tasks);
//   const boards = useTasksStore(s => s.boards);
//   const items = useMemo(() => getTaskDeadlines(tasks, boards), [tasks, boards]);

import { isTaskDone, todayIso, priorityOf } from './logic.js';

/**
 * Échéances des tâches (triées par date), pour l'agenda / l'accueil.
 * @param {object} tasksMap  état `tasks` du store
 * @param {object} boardsMap état `boards` du store
 * @param {{ includeDone?: boolean, includeArchived?: boolean, today?: string, memberId?: string }} [opts]
 * @returns {{ id: string, taskId: string, boardId: string, boardTitle: string, title: string,
 *   date: string, priority: string, priorityLabel: string, assigneeIds: string[],
 *   done: boolean, overdue: boolean, eventId?: string }[]}
 */
export function getTaskDeadlines(tasksMap, boardsMap, opts = {}) {
  const today = opts.today || todayIso();
  return Object.values(tasksMap || {})
    .filter(t => t.dueDate)
    .filter(t => opts.includeArchived || !boardsMap?.[t.boardId]?.archived)
    .filter(t => !opts.memberId || (t.assigneeIds || []).includes(opts.memberId))
    .map(t => {
      const done = isTaskDone(t, boardsMap);
      return {
        id: `task:${t.id}`,
        taskId: t.id,
        boardId: t.boardId,
        boardTitle: boardsMap?.[t.boardId]?.title || '',
        title: t.title,
        date: t.dueDate,
        priority: t.priority || 'normal',
        priorityLabel: priorityOf(t.priority).label,
        assigneeIds: t.assigneeIds || [],
        done,
        overdue: !done && t.dueDate < today,
        ...(t.links?.eventId ? { eventId: t.links.eventId } : {}),
      };
    })
    .filter(d => opts.includeDone || !d.done)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'fr'));
}

/** Nombre de tâches en retard (tableaux non archivés). */
export function countOverdueTasks(tasksMap, boardsMap, today = todayIso()) {
  return getTaskDeadlines(tasksMap, boardsMap, { today }).filter(d => d.overdue).length;
}

/** Tâches liées à un enregistrement d'un autre module (ex. ('eventId', id)). */
export function getTasksLinkedTo(tasksMap, key, id) {
  return Object.values(tasksMap || {}).filter(t => t.links?.[key] === id);
}
