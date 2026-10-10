// ============================================================
// MODULE TÂCHES — écran principal
// ============================================================
// Routes : #/tasks/<boardId>[?task=<id>]   tableau (Kanban ou liste)
//          #/tasks/mine[?task=<id>]         « Mes tâches » (tous tableaux)
import { useId, useMemo, useState } from 'react';
import {
  AlertTriangle, Archive, KanbanSquare, LayoutList, Plus, Search, Settings2, UserRound, X,
} from 'lucide-react';
import { useTasksStore } from './store.js';
import { useCan } from '../../core/permissions.js';
import { navigate, useRoute } from '../../core/router.js';
import { useCatalog } from '../../core/useCatalog.js';
import {
  GENERAL_BOARD_ID, PRIORITIES, allLabels, filterTasks, groupByColumn, hasActiveFilter, isOverdue, isTaskDone, todayIso, addDaysIso,
} from './logic.js';
import { countOverdueTasks } from './selectors.js';
import { useMe, useMembers } from './hooks.js';
import BoardView from './BoardView.jsx';
import ListView from './ListView.jsx';
import BoardSettings from './BoardSettings.jsx';
import TaskDetail from './TaskDetail.jsx';

const EMPTY_FILTERS = { q: '', assigneeId: '', mineOnly: false, priority: '', label: '', overdueOnly: false };
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches;

export default function TasksPage() {
  const uid = useId();
  const route = useRoute();
  const boards = useTasksStore(s => s.boards);
  const tasks = useTasksStore(s => s.tasks);
  const canWrite = useCan('tasks', 'write');
  const canManage = useCan('tasks', 'manage');
  const members = useMembers();
  const { meId, isRemote, setLocalMe } = useMe();
  const { poleLabel } = useCatalog();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [layout, setLayout] = useState(() => (isNarrow() ? 'list' : 'board'));
  const [settings, setSettings] = useState(null); // null | 'new' | boardId

  const boardList = useMemo(() => Object.values(boards).sort((a, b) =>
    (a.id === GENERAL_BOARD_ID ? -1 : b.id === GENERAL_BOARD_ID ? 1 : a.title.localeCompare(b.title, 'fr'))), [boards]);
  const activeBoards = boardList.filter(b => !b.archived);
  const archivedBoards = boardList.filter(b => b.archived);

  const mine = route.rest[0] === 'mine';
  const requested = route.rest[0] && !mine ? boards[route.rest[0]] : null;
  const board = mine ? null : (requested || activeBoards[0] || boardList[0] || null);
  const openTaskId = route.query.get('task') || '';
  const here = mine ? 'mine' : board?.id;
  const openTask = (id) => navigate('tasks', here, { task: id });
  const closeTask = () => navigate('tasks', here);

  const today = todayIso();
  const labels = useMemo(() => allLabels(tasks), [tasks]);
  const overdueCount = useMemo(() => countOverdueTasks(tasks, boards, today), [tasks, boards, today]);
  const f = useMemo(() => ({ ...filters, meId, boardsMap: boards, today }), [filters, meId, boards, today]);
  const filtered = hasActiveFilter(filters);

  // Tableau courant : toutes les cartes groupées, puis filtrées.
  const grouped = useMemo(() => groupByColumn(tasks, board), [tasks, board]);
  const visible = useMemo(() => {
    const out = {};
    Object.entries(grouped).forEach(([col, list]) => { out[col] = filterTasks(list, f); });
    return out;
  }, [grouped, f]);
  const boardOverdue = useMemo(() => Object.values(grouped).flat().filter(t => isOverdue(t, boards, today)).length, [grouped, boards, today]);

  // « Mes tâches » : tous les tableaux actifs, groupées par urgence.
  const mineGroups = useMemo(() => {
    if (!mine) return [];
    const list = filterTasks(
      Object.values(tasks).filter(t => !boards[t.boardId]?.archived && meId && (t.assigneeIds || []).includes(meId)),
      { ...f, mineOnly: false },
    ).sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    const g = { late: [], soon: [], later: [], none: [], done: [] };
    const in7 = addDaysIso(today, 7);
    list.forEach(t => {
      if (isTaskDone(t, boards)) g.done.push(t);
      else if (!t.dueDate) g.none.push(t);
      else if (t.dueDate < today) g.late.push(t);
      else if (t.dueDate <= in7) g.soon.push(t);
      else g.later.push(t);
    });
    return [
      { id: 'late', title: 'En retard', color: '#ef4444', tasks: g.late },
      { id: 'soon', title: 'Cette semaine', color: '#f59e0b', tasks: g.soon },
      { id: 'later', title: 'Plus tard', color: '#3b82f6', tasks: g.later },
      { id: 'none', title: 'Sans échéance', color: '#64748b', tasks: g.none },
      { id: 'done', title: 'Terminées', color: '#10b981', tasks: g.done },
    ];
  }, [mine, tasks, boards, meId, f, today]);

  const listGroups = useMemo(() => (board ? board.columns.map(c => ({ id: c.id, title: c.title, color: c.color, tasks: visible[c.id] || [] })) : []), [board, visible]);
  const setF = (patch) => setFilters(prev => ({ ...prev, ...patch }));

  return (
    <main className="max-w-[1600px] mx-auto p-4 space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <KanbanSquare className="text-blue-500 shrink-0" size={24} aria-hidden="true" />
          <h1 className="text-xl font-bold text-ink">Tâches</h1>
          {overdueCount > 0 && (
            <button type="button" aria-pressed={filters.overdueOnly}
              className={`badge ${filters.overdueOnly ? 'badge-rose ring-2 ring-rose-500/40' : 'badge-rose'} text-xs cursor-pointer`}
              onClick={() => setF({ overdueOnly: !filters.overdueOnly })}
              title="Afficher uniquement les tâches en retard">
              <AlertTriangle size={12} aria-hidden="true" /> {overdueCount} en retard
            </button>
          )}
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Vue">
          <button type="button" role="tab" aria-selected={!mine} className={`chip ${!mine ? 'chip-active' : 'chip-idle'}`} onClick={() => navigate('tasks', board?.id || activeBoards[0]?.id)}>
            <KanbanSquare size={14} aria-hidden="true" /> Tableaux
          </button>
          <button type="button" role="tab" aria-selected={mine} className={`chip ${mine ? 'chip-active' : 'chip-idle'}`} onClick={() => navigate('tasks', 'mine')}>
            <UserRound size={14} aria-hidden="true" /> Mes tâches
          </button>
        </div>
      </div>

      {/* Sélection du tableau */}
      {!mine && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 sm:flex-none sm:w-72">
            <label htmlFor={`${uid}-board`} className="block text-xs text-dim mb-1">Tableau</label>
            <select id={`${uid}-board`} className="input" value={board?.id || ''} onChange={(e) => navigate('tasks', e.target.value)}>
              {activeBoards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
              {archivedBoards.length > 0 && (
                <optgroup label="Archivés">
                  {archivedBoards.map(b => <option key={b.id} value={b.id}>{b.title} (archivé)</option>)}
                </optgroup>
              )}
            </select>
          </div>
          {canManage && (
            <>
              <button type="button" className="btn-secondary" onClick={() => setSettings('new')}><Plus size={16} aria-hidden="true" /> Nouveau tableau</button>
              {board && <button type="button" className="btn-secondary" onClick={() => setSettings(board.id)}><Settings2 size={16} aria-hidden="true" /> Configurer</button>}
            </>
          )}
          <div className="flex gap-1 ml-auto" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={layout === 'board'} className={`chip ${layout === 'board' ? 'chip-active' : 'chip-idle'}`} onClick={() => setLayout('board')}>
              <KanbanSquare size={14} aria-hidden="true" /> Kanban
            </button>
            <button type="button" aria-pressed={layout === 'list'} className={`chip ${layout === 'list' ? 'chip-active' : 'chip-idle'}`} onClick={() => setLayout('list')}>
              <LayoutList size={14} aria-hidden="true" /> Liste
            </button>
          </div>
        </div>
      )}

      {!mine && board && (board.description || board.poleId || boardOverdue > 0) && (
        <p className="text-sm text-dim">
          {board.poleId && <span className="badge badge-violet mr-2">{poleLabel(board.poleId)}</span>}
          {board.description}
          {boardOverdue > 0 && <span className="text-rose-600 dark:text-rose-400 ml-2">{boardOverdue} tâche(s) en retard sur ce tableau.</span>}
        </p>
      )}

      {!mine && board?.archived && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-amber-800 dark:text-amber-200">
          <Archive size={16} aria-hidden="true" /> Ce tableau est archivé.
          {canManage && <button type="button" className="btn-secondary py-1 ml-auto" onClick={() => setSettings(board.id)}>Gérer</button>}
        </div>
      )}

      {/* « Moi » en mode local */}
      {(mine || filters.mineOnly) && !isRemote && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor={`${uid}-me`} className="text-dim">Je suis :</label>
          <select id={`${uid}-me`} className="input w-auto" value={meId} onChange={(e) => setLocalMe(e.target.value)}>
            <option value="">— Choisir —</option>
            {members.list.map(m => <option key={m.id} value={m.id}>{members.name(m.id)}</option>)}
          </select>
          <span className="text-xs text-muted">(mémorisé sur cet appareil)</span>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-surface border border-line rounded-2xl p-3 flex flex-wrap items-end gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher une tâche</label>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input id={`${uid}-q`} type="search" className="input pl-8" placeholder="Rechercher…" value={filters.q} onChange={(e) => setF({ q: e.target.value })} />
        </div>
        {!mine && (
          <>
            <label htmlFor={`${uid}-who`} className="sr-only">Filtrer par personne assignée</label>
            <select id={`${uid}-who`} className="input w-auto" value={filters.assigneeId} onChange={(e) => setF({ assigneeId: e.target.value })}>
              <option value="">Tous les assignés</option>
              <option value="__none__">Non assignées</option>
              {members.list.map(m => <option key={m.id} value={m.id}>{members.name(m.id)}</option>)}
            </select>
            <button type="button" aria-pressed={filters.mineOnly} className={`chip ${filters.mineOnly ? 'chip-active' : 'chip-idle'}`} onClick={() => setF({ mineOnly: !filters.mineOnly })}>
              <UserRound size={13} aria-hidden="true" /> Moi
            </button>
          </>
        )}
        <label htmlFor={`${uid}-prio`} className="sr-only">Filtrer par priorité</label>
        <select id={`${uid}-prio`} className="input w-auto" value={filters.priority} onChange={(e) => setF({ priority: e.target.value })}>
          <option value="">Toutes priorités</option>
          {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <label htmlFor={`${uid}-label`} className="sr-only">Filtrer par étiquette</label>
        <select id={`${uid}-label`} className="input w-auto" value={filters.label} onChange={(e) => setF({ label: e.target.value })} disabled={!labels.length}>
          <option value="">{labels.length ? 'Toutes étiquettes' : 'Aucune étiquette'}</option>
          {labels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" aria-pressed={filters.overdueOnly} className={`chip ${filters.overdueOnly ? 'chip-active' : 'chip-idle'}`} onClick={() => setF({ overdueOnly: !filters.overdueOnly })}>
          <AlertTriangle size={13} aria-hidden="true" /> En retard
        </button>
        {filtered && (
          <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
            <X size={14} aria-hidden="true" /> Réinitialiser
          </button>
        )}
      </div>
      {filters.mineOnly && !meId && !mine && <p className="text-xs text-amber-700 dark:text-amber-300">Choisis qui tu es pour utiliser le filtre « Moi ».</p>}

      {/* Contenu */}
      {mine ? (
        meId
          ? <ListView groups={mineGroups} members={members} canWrite={canWrite} onOpen={openTask} showBoard emptyText={filtered ? 'Aucune de tes tâches ne correspond aux filtres.' : 'Aucune tâche ne t\'est assignée. 🎉'} />
          : <p className="text-center text-sm text-dim py-10 border border-dashed border-line rounded-2xl">{isRemote ? 'Ton compte n\'est lié à aucune fiche membre.' : 'Choisis qui tu es pour voir tes tâches.'}</p>
      ) : !board ? (
        <div className="text-center py-10 border border-dashed border-line rounded-2xl">
          <p className="font-medium text-ink">Aucun tableau</p>
          {canManage && <button type="button" className="btn-primary mt-3" onClick={() => setSettings('new')}><Plus size={16} aria-hidden="true" /> Créer un tableau</button>}
        </div>
      ) : layout === 'board' ? (
        <BoardView
          board={board}
          grouped={grouped}
          visible={visible}
          members={members}
          canWrite={canWrite && !board.archived}
          canManage={canManage}
          onOpen={openTask}
          onConfigure={() => setSettings(board.id)}
          filtered={filtered}
        />
      ) : (
        <ListView groups={listGroups} members={members} canWrite={canWrite && !board.archived} onOpen={openTask}
          emptyText={filtered ? 'Aucune tâche ne correspond aux filtres.' : 'Aucune tâche sur ce tableau. Ajoute la première avec le formulaire ci-dessous.'} />
      )}

      {layout === 'list' && !mine && board && canWrite && !board.archived && <QuickAdd board={board} />}

      {settings && (
        <BoardSettings
          key={settings}
          board={settings === 'new' ? null : boards[settings]}
          onClose={() => setSettings(null)}
          onCreated={(id) => navigate('tasks', id)}
          onDeleted={() => navigate('tasks', GENERAL_BOARD_ID)}
        />
      )}
      {openTaskId && <TaskDetail key={openTaskId} taskId={openTaskId} members={members} allLabels={labels} onClose={closeTask} />}
    </main>
  );
}

/** Ajout rapide en vue liste (mobile) : titre + colonne. */
function QuickAdd({ board }) {
  const uid = useId();
  const createTask = useTasksStore(s => s.createTask);
  const [title, setTitle] = useState('');
  const [columnId, setColumnId] = useState('');
  const col = board.columns.find(c => c.id === columnId) || board.columns[0];
  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) { document.getElementById(`${uid}-t`)?.focus(); return; }
    createTask({ boardId: board.id, columnId: col.id, title, source: 'manuel' });
    setTitle('');
  };
  return (
    <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-[1fr_12rem_auto] gap-2 items-end">
      <div>
        <label htmlFor={`${uid}-t`} className="block text-xs text-dim mb-1">Nouvelle tâche</label>
        <input id={`${uid}-t`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Réserver la salle" />
      </div>
      <div>
        <label htmlFor={`${uid}-c`} className="block text-xs text-dim mb-1">Colonne</label>
        <select id={`${uid}-c`} className="input" value={col?.id || ''} onChange={(e) => setColumnId(e.target.value)}>
          {board.columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </div>
      <button type="submit" className="btn-primary"><Plus size={16} aria-hidden="true" /> Ajouter</button>
    </form>
  );
}
