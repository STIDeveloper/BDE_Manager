// ============================================================
// MODULE TÂCHES — logique pure (sans React ni store)
// ============================================================
// Forme des données : section « tasks » de src/modules/contracts.js.

export const GENERAL_BOARD_ID = 'board-general';

export const PRIORITIES = [
  { id: 'low', label: 'Basse', badge: 'badge-neutral', rank: 0 },
  { id: 'normal', label: 'Normale', badge: 'badge-brand', rank: 1 },
  { id: 'high', label: 'Haute', badge: 'badge-amber', rank: 2 },
  { id: 'urgent', label: 'Urgente', badge: 'badge-rose', rank: 3 },
];
export const PRIORITY_IDS = PRIORITIES.map(p => p.id);
export const priorityOf = (id) => PRIORITIES.find(p => p.id === id) || PRIORITIES[1];

export const SOURCES = ['manuel', 'formulaire', 'automatisation', 'evenement'];

/** Couleurs proposées pour les colonnes (hex, lisibles en clair et sombre). */
export const COLUMN_COLORS = [
  { id: '#64748b', label: 'Ardoise' },
  { id: '#3b82f6', label: 'Bleu' },
  { id: '#8b5cf6', label: 'Violet' },
  { id: '#f59e0b', label: 'Ambre' },
  { id: '#ec4899', label: 'Rose' },
  { id: '#06b6d4', label: 'Cyan' },
  { id: '#10b981', label: 'Vert' },
  { id: '#ef4444', label: 'Rouge' },
];

/** Colonnes du tableau « Général » (ids fixes : pas de doublon entre appareils). */
export const DEFAULT_COLUMNS = [
  { id: 'col-todo', title: 'À faire', color: '#64748b' },
  { id: 'col-doing', title: 'En cours', color: '#3b82f6', wipLimit: 5 },
  { id: 'col-review', title: 'En validation', color: '#f59e0b' },
  { id: 'col-done', title: 'Terminé', color: '#10b981', done: true },
];

export const str = (v) => String(v ?? '').trim();

/** Date du jour 'AAAA-MM-JJ' (heure locale). */
export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ajoute n jours à une date 'AAAA-MM-JJ'. */
export function addDaysIso(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayIso(new Date(y, m - 1, d + n));
}

/** Colonne d'une tâche dans son tableau (ou null). */
export const columnOf = (task, boardsMap) => boardsMap?.[task?.boardId]?.columns?.find(c => c.id === task.columnId) || null;

/** Une tâche est terminée si elle est dans une colonne « terminé » (ou datée completedAt sans tableau connu). */
export function isTaskDone(task, boardsMap) {
  const col = columnOf(task, boardsMap);
  if (col) return !!col.done;
  return !!task?.completedAt;
}

export const isOverdue = (task, boardsMap, today = todayIso()) =>
  !!task?.dueDate && task.dueDate < today && !isTaskDone(task, boardsMap);

/** Tâches d'une colonne, triées par `order`. */
export function tasksInColumn(tasksMap, boardId, columnId) {
  return Object.values(tasksMap || {})
    .filter(t => t.boardId === boardId && t.columnId === columnId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

/** Tâches d'un tableau groupées par colonne : { [columnId]: task[] } (tâches orphelines → 1re colonne). */
export function groupByColumn(tasksMap, board) {
  const out = {};
  if (!board) return out;
  const ids = new Set(board.columns.map(c => c.id));
  board.columns.forEach(c => { out[c.id] = []; });
  Object.values(tasksMap || {}).forEach(t => {
    if (t.boardId !== board.id) return;
    const col = ids.has(t.columnId) ? t.columnId : board.columns[0]?.id;
    if (col) out[col].push(t);
  });
  Object.values(out).forEach(list => list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  return out;
}

/** Une tâche à valider ne peut entrer dans une colonne « terminé » qu'une fois approuvée. */
export const needsApproval = (task) => !!task?.requiresApproval && !task?.approvedAt;

/** Progression de la checklist { done, total }. */
export function checklistProgress(task) {
  const list = task?.checklist || [];
  return { done: list.filter(i => i.done).length, total: list.length };
}

/**
 * Filtre générique.
 * @param {object[]} list
 * @param {{ q?, assigneeId?, meId?, mineOnly?, priority?, label?, overdueOnly?, boardsMap?, today? }} f
 */
export function filterTasks(list, f = {}) {
  const needle = str(f.q).toLocaleLowerCase('fr');
  const today = f.today || todayIso();
  return list.filter(t => {
    if (f.assigneeId === '__none__' && (t.assigneeIds || []).length) return false;
    if (f.assigneeId && f.assigneeId !== '__none__' && !(t.assigneeIds || []).includes(f.assigneeId)) return false;
    if (f.mineOnly && (!f.meId || !(t.assigneeIds || []).includes(f.meId))) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.label && !(t.labels || []).includes(f.label)) return false;
    if (f.overdueOnly && !isOverdue(t, f.boardsMap, today)) return false;
    if (needle) {
      const hay = `${t.title} ${t.description || ''} ${(t.labels || []).join(' ')} ${(t.checklist || []).map(i => i.text).join(' ')}`.toLocaleLowerCase('fr');
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export const hasActiveFilter = (f) => !!(str(f.q) || f.assigneeId || f.mineOnly || f.priority || f.label || f.overdueOnly);

/** Toutes les étiquettes utilisées (triées). */
export function allLabels(tasksMap) {
  const set = new Set();
  Object.values(tasksMap || {}).forEach(t => (t.labels || []).forEach(l => set.add(l)));
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Couleur de texte lisible sur un fond hex. */
export function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#111827' : '#ffffff';
}
