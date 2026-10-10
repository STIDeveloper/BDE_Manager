// ============================================================
// STORE DU MODULE TÂCHES
// ============================================================
// Forme : section « tasks » de src/modules/contracts.js.
// Les autres modules (formulaires, automatisations…) passent par l'API
// d'actions de ./actions.js et lisent via ./selectors.js.

import { createModuleStore, newId, nowIso } from '../../core/createModuleStore.js';
import { can } from '../../core/permissions.js';
import { deleteAttachment } from '../../core/attachments.js';
import {
  COLUMN_COLORS, DEFAULT_COLUMNS, GENERAL_BOARD_ID, PRIORITY_IDS, SOURCES,
  needsApproval, str, tasksInColumn,
} from './logic.js';

const COLOR_IDS = COLUMN_COLORS.map(c => c.id);
const uniq = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter(Boolean))];

function cleanColumn(c = {}, i = 0) {
  const out = {
    id: c.id || newId(),
    title: str(c.title) || `Colonne ${i + 1}`,
    color: COLOR_IDS.includes(c.color) || /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : COLUMN_COLORS[0].id,
  };
  const wip = Math.floor(Number(c.wipLimit));
  if (Number.isFinite(wip) && wip >= 1) out.wipLimit = wip;
  if (c.done) out.done = true;
  return out;
}

function cleanBoard(data, prev = {}) {
  const out = { ...prev };
  if ('title' in data) out.title = str(data.title) || 'Tableau sans titre';
  if ('description' in data) out.description = String(data.description ?? '');
  if ('columns' in data) out.columns = (data.columns || []).map(cleanColumn);
  if ('poleId' in data) { if (data.poleId) out.poleId = data.poleId; else delete out.poleId; }
  if ('archived' in data) out.archived = !!data.archived;
  return out;
}

const cleanItem = (i) => ({ id: i.id || newId(), text: str(i.text), done: !!i.done });
const LINK_KEYS = ['eventId', 'formId', 'responseId', 'transactionId', 'memberId'];

/** Normalise les champs modifiables d'une tâche. */
function cleanTask(data, prev = {}) {
  const out = { ...prev };
  if ('title' in data) out.title = str(data.title) || prev.title || 'Sans titre';
  if ('description' in data) out.description = String(data.description ?? '');
  if ('assigneeIds' in data) out.assigneeIds = uniq(data.assigneeIds);
  if ('dueDate' in data) { if (/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || '')) out.dueDate = data.dueDate; else delete out.dueDate; }
  if ('priority' in data) out.priority = PRIORITY_IDS.includes(data.priority) ? data.priority : 'normal';
  if ('labels' in data) out.labels = uniq((data.labels || []).map(str));
  if ('checklist' in data) out.checklist = (data.checklist || []).map(cleanItem).filter(i => i.text);
  if ('attachments' in data) out.attachments = Array.isArray(data.attachments) ? data.attachments : [];
  if ('links' in data) {
    const links = {};
    LINK_KEYS.forEach(k => { if (data.links?.[k]) links[k] = data.links[k]; });
    out.links = links;
  }
  if ('requiresApproval' in data) {
    out.requiresApproval = !!data.requiresApproval;
    if (!out.requiresApproval) { delete out.approvedBy; delete out.approvedAt; }
  }
  if ('source' in data) out.source = SOURCES.includes(data.source) ? data.source : 'manuel';
  return out;
}

const now = nowIso();
const GENERAL_BOARD = {
  id: GENERAL_BOARD_ID,
  title: 'Général',
  description: 'Tableau par défaut du BDE.',
  columns: DEFAULT_COLUMNS.map(c => ({ ...c })),
  archived: false,
  createdAt: now,
  updatedAt: now,
};

export const useTasksStore = createModuleStore({
  name: 'tasks',
  label: 'Tâches',
  version: 1,
  initialState: { boards: { [GENERAL_BOARD_ID]: GENERAL_BOARD }, tasks: {} },
  slices: [
    { key: 'boards', kind: 'map', capability: 'tasks' },
    { key: 'tasks', kind: 'map', capability: 'tasks', sensitive: true },
  ],
  migrate: (persisted) => persisted,
  actions: (set, get, h) => {
    const board = (id) => get().boards[id];
    // Remplacement complet (upsert fusionnerait et garderait les champs effacés).
    const replace = (key, rec) => {
      const t = nowIso();
      const next = { ...rec, createdAt: rec.createdAt || t, updatedAt: t };
      set(s => ({ [key]: { ...s[key], [rec.id]: next } }));
      return next;
    };
    const saveBoard = (b) => replace('boards', b);
    const saveTask = (t) => replace('tasks', t);
    const firstBoard = () => {
      const all = Object.values(get().boards);
      return all.find(b => b.id === GENERAL_BOARD_ID && !b.archived) || all.find(b => !b.archived) || all[0] || null;
    };
    const ensureGeneral = () => {
      if (board(GENERAL_BOARD_ID)) return board(GENERAL_BOARD_ID);
      return saveBoard({ ...GENERAL_BOARD, createdAt: nowIso() });
    };

    /** Réécrit l'ordre d'une colonne (seules les tâches modifiées sont réenregistrées). */
    const reorder = (list) => {
      list.forEach((t, i) => { if (t.order !== i) saveTask({ ...get().tasks[t.id], order: i }); });
    };

    return {
      // ── Tableaux ──
      createBoard: (data = {}) => {
        const id = newId();
        const cols = Array.isArray(data.columns) && data.columns.length
          ? data.columns
          : DEFAULT_COLUMNS.map(({ id: _id, ...c }) => c);
        saveBoard({ ...cleanBoard({ title: '', description: '', archived: false, ...data, columns: cols }), id });
        return id;
      },
      updateBoard: (id, patch) => {
        const b = board(id);
        if (!b) return null;
        return saveBoard(cleanBoard(patch, b));
      },
      /** Supprime un tableau ET ses tâches (le tableau Général est seulement archivable). */
      deleteBoard: (id) => {
        if (id === GENERAL_BOARD_ID) return false;
        Object.values(get().tasks).filter(t => t.boardId === id).forEach(t => {
          (t.attachments || []).forEach(a => { deleteAttachment(a.id); });
          h.remove('tasks', t.id);
        });
        h.remove('boards', id);
        return true;
      },
      ensureGeneralBoard: ensureGeneral,
      firstBoard,

      // ── Colonnes ──
      addColumn: (boardId, col = {}) => {
        const b = board(boardId);
        if (!b) return null;
        const c = cleanColumn(col, b.columns.length);
        saveBoard({ ...b, columns: [...b.columns, c] });
        return c.id;
      },
      updateColumn: (boardId, colId, patch) => {
        const b = board(boardId);
        if (!b) return;
        const columns = b.columns.map((c, i) => (c.id === colId ? cleanColumn({ ...c, ...patch, id: c.id }, i) : c));
        const before = b.columns.find(c => c.id === colId);
        const after = columns.find(c => c.id === colId);
        saveBoard({ ...b, columns });
        // Bascule « terminé » : on (dé)date les tâches de la colonne.
        if (before && after && !!before.done !== !!after.done) {
          tasksInColumn(get().tasks, boardId, colId).forEach(t => {
            const n = { ...t };
            if (after.done) n.completedAt = n.completedAt || nowIso(); else delete n.completedAt;
            saveTask(n);
          });
        }
      },
      moveColumn: (boardId, colId, delta) => {
        const b = board(boardId);
        if (!b) return;
        const i = b.columns.findIndex(c => c.id === colId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= b.columns.length) return;
        const columns = [...b.columns];
        [columns[i], columns[j]] = [columns[j], columns[i]];
        saveBoard({ ...b, columns });
      },
      /**
       * Remplace toutes les colonnes (éditeur de tableau). Les tâches des colonnes
       * supprimées passent en bas de la 1re colonne ; (dé)datage « terminé ».
       */
      setColumns: (boardId, cols) => {
        const b = board(boardId);
        if (!b || !Array.isArray(cols) || !cols.length) return false;
        const columns = cols.map(cleanColumn);
        const ids = new Set(columns.map(c => c.id));
        const fallback = columns[0];
        let offset = tasksInColumn(get().tasks, boardId, fallback.id).length;
        b.columns.filter(c => !ids.has(c.id)).forEach(c => {
          tasksInColumn(get().tasks, boardId, c.id).forEach(t => { saveTask({ ...t, columnId: fallback.id, order: offset++ }); });
        });
        saveBoard({ ...b, columns });
        columns.forEach(c => {
          tasksInColumn(get().tasks, boardId, c.id).forEach(t => {
            if (c.done && !t.completedAt) saveTask({ ...t, completedAt: nowIso() });
            else if (!c.done && t.completedAt) { const { completedAt: _x, ...rest } = t; saveTask(rest); }
          });
        });
        return true;
      },
      /** Supprime une colonne ; ses tâches vont dans `targetColId` (par défaut la 1re colonne restante). */
      removeColumn: (boardId, colId, targetColId) => {
        const b = board(boardId);
        if (!b || b.columns.length <= 1) return false;
        const columns = b.columns.filter(c => c.id !== colId);
        const target = columns.find(c => c.id === targetColId) || columns[0];
        const offset = tasksInColumn(get().tasks, boardId, target.id).length;
        tasksInColumn(get().tasks, boardId, colId).forEach((t, i) => {
          const n = { ...t, columnId: target.id, order: offset + i };
          if (target.done) n.completedAt = n.completedAt || nowIso(); else delete n.completedAt;
          saveTask(n);
        });
        saveBoard({ ...b, columns });
        return true;
      },

      // ── Tâches ──
      /**
       * Crée une tâche. `boardId` / `columnId` facultatifs (Général, 1re colonne).
       * @returns {object} la tâche créée
       */
      createTask: (input = {}) => {
        const b = board(input.boardId) || firstBoard() || ensureGeneral();
        const col = b.columns.find(c => c.id === input.columnId) || b.columns[0];
        const order = tasksInColumn(get().tasks, b.id, col.id).length;
        const t = cleanTask({
          title: '', description: '', assigneeIds: [], priority: 'normal', labels: [], checklist: [],
          attachments: [], links: {}, source: 'manuel', ...input,
        });
        const task = { ...t, id: newId(), boardId: b.id, columnId: col.id, order };
        if (col.done) task.completedAt = nowIso();
        return saveTask(task);
      },

      updateTask: (id, patch) => {
        const t = get().tasks[id];
        if (!t) return null;
        return saveTask(cleanTask(patch, t));
      },

      /**
       * Déplace une tâche (colonne + position, éventuellement dans un autre tableau
       * via `boardId`). Refusé si la colonne cible est « terminé » et que la
       * tâche attend une validation.
       * @returns {{ ok: boolean, error?: string, task?: object, wipExceeded?: boolean, column?: object }}
       */
      moveTask: (id, columnId, index, boardId) => {
        const t = get().tasks[id];
        if (!t) return { ok: false, error: 'Tâche introuvable.' };
        const b = board(boardId || t.boardId);
        const col = b?.columns.find(c => c.id === columnId);
        if (!col) return { ok: false, error: 'Colonne introuvable.' };
        const fromCol = board(t.boardId)?.columns.find(c => c.id === t.columnId);
        if (col.done && !fromCol?.done && needsApproval(t)) {
          return { ok: false, error: 'Cette tâche doit être approuvée avant de passer en « terminé ».' };
        }
        const moving = b.id !== t.boardId || col.id !== t.columnId;
        const others = tasksInColumn(get().tasks, b.id, col.id).filter(x => x.id !== id);
        const at = Math.max(0, Math.min(Number.isFinite(index) ? index : others.length, others.length));
        const next = { ...t, boardId: b.id, columnId: col.id };
        if (col.done) next.completedAt = fromCol?.done && t.completedAt ? t.completedAt : nowIso();
        else delete next.completedAt;
        const ids = others.map(x => x.id);
        ids.splice(at, 0, id);
        saveTask({ ...next, order: at });
        ids.forEach((tid, i) => {
          const cur = get().tasks[tid];
          if (tid !== id && cur && cur.order !== i) saveTask({ ...cur, order: i });
        });
        if (moving) reorder(tasksInColumn(get().tasks, t.boardId, t.columnId));
        const wipExceeded = !!col.wipLimit && moving && ids.length > col.wipLimit;
        return { ok: true, task: get().tasks[id], wipExceeded, column: col };
      },

      removeTask: (id) => {
        const t = get().tasks[id];
        if (!t) return;
        h.remove('tasks', id);
        reorder(tasksInColumn(get().tasks, t.boardId, t.columnId));
      },

      /** Approbation (droit tasks.validate requis). */
      approveTask: (id, approverId) => {
        const t = get().tasks[id];
        if (!t) return { ok: false, error: 'Tâche introuvable.' };
        if (!can('tasks', 'validate')) return { ok: false, error: 'Tu n\'as pas le droit de valider les tâches.' };
        return { ok: true, task: saveTask({ ...t, approvedBy: approverId || 'local', approvedAt: nowIso() }) };
      },
      revokeApproval: (id) => {
        const t = get().tasks[id];
        if (!t) return { ok: false };
        if (!can('tasks', 'validate')) return { ok: false, error: 'Tu n\'as pas le droit de valider les tâches.' };
        const { approvedBy: _a, approvedAt: _b, ...rest } = t;
        return { ok: true, task: saveTask(rest) };
      },
    };
  },
});
