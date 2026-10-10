import { useId, useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { useEventsStore } from './store.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateShort, isoDate } from '../../documents/context.js';
import { eventStats } from './logic.js';
import { useMembers } from './hooks.js';
import { EmptyState, MemberSelect, Progress } from './ui.jsx';

export default function TasksTab({ ev, canWrite }) {
  const uid = useId();
  const addTask = useEventsStore(s => s.addTask);
  const updateTask = useEventsStore(s => s.updateTask);
  const removeTask = useEventsStore(s => s.removeTask);
  const members = useMembers();
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [filter, setFilter] = useState('all');
  const st = eventStats(ev);
  const today = isoDate();

  const tasks = useMemo(() => {
    const list = [...(ev.tasks || [])].sort((a, b) => (a.done - b.done) || String(a.due || '9999').localeCompare(String(b.due || '9999')));
    if (filter === 'todo') return list.filter(t => !t.done);
    if (filter === 'late') return list.filter(t => !t.done && t.due && t.due < today);
    return list;
  }, [ev.tasks, filter, today]);

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) { document.getElementById(`${uid}-title`)?.focus(); return; }
    addTask(ev.id, { title, assigneeId, due });
    setTitle(''); setDue('');
    document.getElementById(`${uid}-title`)?.focus();
  };

  const remove = async (t) => {
    if (!(await confirmDialog({ title: 'Supprimer la tâche ?', message: t.title, confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    removeTask(ev.id, t.id);
    toast.success('Tâche supprimée');
  };

  const late = (ev.tasks || []).filter(t => !t.done && t.due && t.due < today).length;

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-ink font-medium">Progression</span>
          <span className="text-dim">{st.tasksDone}/{st.tasksTotal} · {st.taskProgress} %{late ? ` · ${late} en retard` : ''}</span>
        </div>
        <Progress value={st.taskProgress} label={`Progression ${st.taskProgress} %`} tone="bg-emerald-500" />
      </div>

      {canWrite && (
        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-[1fr_200px_160px_auto] gap-2 items-end">
          <div>
            <label htmlFor={`${uid}-title`} className="block text-xs text-dim mb-1">Nouvelle tâche</label>
            <input id={`${uid}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Réserver la salle" />
          </div>
          <div>
            <label htmlFor={`${uid}-who`} className="block text-xs text-dim mb-1">Assignée à</label>
            <MemberSelect id={`${uid}-who`} value={assigneeId} onChange={setAssigneeId} members={members.list} placeholder="— Personne —" />
          </div>
          <div>
            <label htmlFor={`${uid}-due`} className="block text-xs text-dim mb-1">Échéance</label>
            <input id={`${uid}-due`} type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary"><Plus size={16} aria-hidden="true" /> Ajouter</button>
        </form>
      )}

      <div className="flex gap-1" role="group" aria-label="Filtrer les tâches">
        {[['all', 'Toutes'], ['todo', 'À faire'], ['late', 'En retard']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} className={`chip ${filter === id ? 'chip-active' : 'chip-idle'}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title={ev.tasks?.length ? 'Aucune tâche dans ce filtre' : 'Aucune tâche'}>
          {ev.tasks?.length ? null : 'Construis la checklist : réservation, communication, achats, sécurité…'}
        </EmptyState>
      ) : (
        <ul className="bg-surface border border-line rounded-2xl divide-y divide-line">
          {tasks.map(t => {
            const isLate = !t.done && t.due && t.due < today;
            return (
              <li key={t.id} className="p-3 flex flex-wrap items-center gap-2">
                <input type="checkbox" id={`${uid}-t-${t.id}`} className="w-5 h-5" checked={!!t.done} disabled={!canWrite}
                  onChange={(e) => updateTask(ev.id, t.id, { done: e.target.checked })} />
                <label htmlFor={`${uid}-t-${t.id}`} className={`flex-1 min-w-[140px] text-sm ${t.done ? 'line-through text-muted' : 'text-ink'}`}>{t.title}</label>
                {canWrite ? (
                  <>
                    <MemberSelect value={t.assigneeId} members={members.list} placeholder="— Personne —" ariaLabel={`Assigner « ${t.title} »`}
                      className="input w-auto py-1 text-xs max-w-[160px]" onChange={(v) => updateTask(ev.id, t.id, { assigneeId: v })} />
                    <input type="date" aria-label={`Échéance de « ${t.title} »`} className={`input w-auto py-1 text-xs ${isLate ? 'border-rose-500/60 text-rose-500' : ''}`}
                      value={t.due || ''} onChange={(e) => updateTask(ev.id, t.id, { due: e.target.value })} />
                    <button type="button" className="btn-ghost p-2" aria-label={`Supprimer « ${t.title} »`} onClick={() => remove(t)}><Trash2 size={14} aria-hidden="true" /></button>
                  </>
                ) : (
                  <span className="text-xs text-dim">{t.assigneeId ? members.name(t.assigneeId) : '—'}{t.due ? ` · ${formatDateShort(t.due)}` : ''}</span>
                )}
                {isLate && <span className="badge badge-rose">En retard</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
