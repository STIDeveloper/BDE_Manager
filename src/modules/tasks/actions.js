// ============================================================
// API D'ACTIONS DU MODULE TÂCHES (réutilisable hors React)
// ============================================================
// Appelée par l'interface du module ET par les autres modules
// (automatisations des formulaires, événements…) :
//
//   import { createTask, findBoard } from '../tasks/actions.js';
//   const board = findBoard('Communication');           // id ou titre (insensible à la casse)
//   const task = createTask({
//     boardId: board?.id, title: 'Rappeler le candidat', priority: 'high',
//     assigneeIds: [memberId], dueDate: '2026-11-02', labels: ['recrutement'],
//     links: { formId, responseId }, source: 'automatisation',
//   });
//
// Toutes les fonctions sont synchrones et persistées (store Zustand).
// ============================================================

import { useTasksStore } from './store.js';
import { str } from './logic.js';

const st = () => useTasksStore.getState();

/**
 * Retrouve un tableau par id ou par titre (insensible à la casse et aux accents).
 * Les tableaux non archivés sont prioritaires.
 * @returns {object|null}
 */
export function findBoard(idOrTitle) {
  const boards = st().boards;
  if (!idOrTitle) return null;
  if (boards[idOrTitle]) return boards[idOrTitle];
  const norm = (s) => str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('fr');
  const needle = norm(idOrTitle);
  const matches = Object.values(boards).filter(b => norm(b.title) === needle);
  return matches.find(b => !b.archived) || matches[0] || null;
}

/**
 * Crée une tâche.
 * @param {{ boardId?: string, board?: string, columnId?: string, column?: string, title: string,
 *   description?, assigneeIds?, dueDate?, priority?, labels?, checklist?: ({text,done?}|string)[],
 *   attachments?, links?, requiresApproval?, source? }} input
 *   `board` / `column` acceptent un titre (utile pour les automatisations).
 * @returns {object} la tâche créée
 */
export function createTask(input = {}) {
  const board = findBoard(input.boardId || input.board) || st().firstBoard() || st().ensureGeneralBoard();
  let columnId = input.columnId;
  if (!columnId && input.column) {
    const n = str(input.column).toLocaleLowerCase('fr');
    columnId = board.columns.find(c => c.id === input.column || c.title.toLocaleLowerCase('fr') === n)?.id;
  }
  const checklist = Array.isArray(input.checklist)
    ? input.checklist.map(i => (typeof i === 'string' ? { text: i, done: false } : i))
    : [];
  const { board: _b, column: _c, ...rest } = input;
  return st().createTask({ ...rest, checklist, boardId: board.id, columnId });
}

/**
 * Déplace une tâche à la position `index` (0 = en haut) de la colonne.
 * @returns {{ ok: boolean, error?: string, task?: object, wipExceeded?: boolean }}
 */
export function moveTask(id, columnId, index) {
  return st().moveTask(id, columnId, index);
}

/** Remplace la liste des assignés. @returns {object|null} */
export function assignTask(id, memberIds) {
  return st().updateTask(id, { assigneeIds: Array.isArray(memberIds) ? memberIds : [memberIds].filter(Boolean) });
}

/**
 * Termine une tâche : la place en bas de la première colonne « terminé » de son tableau
 * (refusé si elle attend une approbation ou si le tableau n'a pas de colonne « terminé »).
 * @returns {{ ok: boolean, error?: string, task?: object }}
 */
export function completeTask(id) {
  const t = st().tasks[id];
  if (!t) return { ok: false, error: 'Tâche introuvable.' };
  const board = st().boards[t.boardId];
  const done = board?.columns.find(c => c.done);
  if (!done) return { ok: false, error: 'Ce tableau n\'a pas de colonne « terminé ».' };
  if (t.columnId === done.id) return { ok: true, task: t };
  return st().moveTask(id, done.id, Infinity);
}

/**
 * Approuve une tâche soumise à validation (droit tasks.validate requis).
 * @returns {{ ok: boolean, error?: string, task?: object }}
 */
export function approveTask(id, approverId) {
  return st().approveTask(id, approverId);
}

/** Met à jour des champs d'une tâche. @returns {object|null} */
export function updateTask(id, patch) {
  return st().updateTask(id, patch);
}
