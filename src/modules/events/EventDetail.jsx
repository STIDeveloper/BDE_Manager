import { useId, useRef, useState } from 'react';
import {
  ArrowLeft, CalendarDays, Copy, MapPin, Pencil, Trash2,
} from 'lucide-react';
import { useEventsStore } from './store.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { useCatalog } from '../../core/useCatalog.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import Modal from '../../components/Modal.jsx';
import { eventStats, formatRange, shiftYears, typeOf } from './logic.js';
import { StatusBadge } from './ui.jsx';
import EventFormModal from './EventFormModal.jsx';
import OverviewTab from './OverviewTab.jsx';
import TasksTab from './TasksTab.jsx';
import VolunteersTab from './VolunteersTab.jsx';
import ParticipantsTab from './ParticipantsTab.jsx';
import BudgetTab from './BudgetTab.jsx';
import ReviewTab from './ReviewTab.jsx';

const TABS = [
  { id: 'apercu', label: 'Aperçu' },
  { id: 'taches', label: 'Tâches' },
  { id: 'benevoles', label: 'Bénévoles' },
  { id: 'participants', label: 'Participants' },
  { id: 'budget', label: 'Budget' },
  { id: 'bilan', label: 'Bilan' },
];

export default function EventDetail({ event: ev, initialTab }) {
  const uid = useId();
  const canWrite = useCan('events', 'write');
  const updateEvent = useEventsStore(s => s.updateEvent);
  const deleteEvent = useEventsStore(s => s.deleteEvent);
  const { poleLabel } = useCatalog();
  const [tab, setTab] = useState(TABS.some(t => t.id === initialTab) ? initialTab : 'apercu');
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const tabRefs = useRef({});
  const st = eventStats(ev);
  const t = typeOf(ev.type);

  const selectTab = (id, focus = false) => {
    setTab(id);
    window.history.replaceState(null, '', `#/events/${encodeURIComponent(ev.id)}/${id}`);
    if (focus) tabRefs.current[id]?.focus();
  };
  const onTabKey = (e) => {
    const i = TABS.findIndex(x => x.id === tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n !== null) { e.preventDefault(); selectTab(TABS[n].id, true); }
  };

  const save = (data) => {
    const { promoted } = updateEvent(ev.id, data);
    setEditing(false);
    toast.success('Événement enregistré', promoted.length ? `${promoted.length} personne(s) promue(s) depuis la liste d'attente.` : ev.title);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer « ${ev.title} » ?`,
      message: 'L\'événement, ses tâches, bénévoles, participants et son bilan seront supprimés.',
      details: [
        `${ev.participants?.length || 0} participant(s), ${ev.tasks?.length || 0} tâche(s).`,
        'Les opérations de trésorerie et les documents déjà émis ne sont pas supprimés.',
      ],
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    deleteEvent(ev.id);
    toast.success('Événement supprimé', ev.title);
    navigate('events');
  };

  const tasksLabel = st.tasksTotal ? ` (${st.tasksDone}/${st.tasksTotal})` : '';
  const counts = { taches: tasksLabel, benevoles: st.volunteers ? ` (${st.volunteers})` : '', participants: ` (${st.seats}${st.capacity ? `/${st.capacity}` : ''})` };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <button type="button" className="btn-ghost -ml-2" onClick={() => navigate('events')}>
        <ArrowLeft size={16} aria-hidden="true" /> Tous les événements
      </button>

      <header className="bg-surface border border-line rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="badge badge-neutral">{t.emoji} {t.label}</span>
              <StatusBadge status={ev.status} />
              {ev.poleId && <span className="badge badge-violet">{poleLabel(ev.poleId)}</span>}
            </div>
            <h2 className="text-xl font-bold text-ink break-words">{ev.title}</h2>
            <p className="text-sm text-dim mt-1 flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" /> {formatRange(ev.start, ev.end)}</p>
            {ev.location && <p className="text-sm text-dim flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> {ev.location}</p>}
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" /> Modifier</button>
              <button type="button" className="btn-secondary" onClick={() => setDuplicating(true)}><Copy size={14} aria-hidden="true" /> Dupliquer</button>
              <button type="button" className="btn-secondary text-rose-600" onClick={remove} aria-label="Supprimer l'événement"><Trash2 size={14} aria-hidden="true" /></button>
            </div>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Sections de l'événement" className="flex gap-1 border-b border-line overflow-x-auto" onKeyDown={onTabKey}>
        {TABS.map(x => (
          <button key={x.id} ref={el => { tabRefs.current[x.id] = el; }} id={`${uid}-tab-${x.id}`} type="button" role="tab"
            aria-selected={tab === x.id} aria-controls={`${uid}-panel`} tabIndex={tab === x.id ? 0 : -1}
            onClick={() => selectTab(x.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === x.id ? 'border-blue-500 text-ink' : 'border-transparent text-dim hover:text-ink'}`}>
            {x.label}<span className="text-xs text-muted">{counts[x.id] || ''}</span>
          </button>
        ))}
      </div>

      <section id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={-1}>
        {tab === 'apercu' && <OverviewTab ev={ev} canWrite={canWrite} goTab={selectTab} />}
        {tab === 'taches' && <TasksTab ev={ev} canWrite={canWrite} />}
        {tab === 'benevoles' && <VolunteersTab ev={ev} canWrite={canWrite} />}
        {tab === 'participants' && <ParticipantsTab ev={ev} canWrite={canWrite} />}
        {tab === 'budget' && <BudgetTab ev={ev} canWrite={canWrite} />}
        {tab === 'bilan' && <ReviewTab ev={ev} canWrite={canWrite} />}
      </section>

      {editing && <EventFormModal event={ev} onClose={() => setEditing(false)} onSave={save} />}
      {duplicating && <DuplicateModal ev={ev} onClose={() => setDuplicating(false)} />}
    </main>
  );
}

function DuplicateModal({ ev, onClose }) {
  const uid = useId();
  const duplicateEvent = useEventsStore(s => s.duplicateEvent);
  const [shiftYear, setShiftYear] = useState(true);
  const [keepTasks, setKeepTasks] = useState(true);
  const [keepVolunteers, setKeepVolunteers] = useState(false);
  const suggested = shiftYear ? ev.title.replace(/\b(20\d{2})\b/g, (y) => String(Number(y) + 1)) : `${ev.title} (copie)`;
  const [title, setTitle] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const id = duplicateEvent(ev.id, { shiftYear, keepTasks, keepVolunteers, title: title.trim() || suggested });
    if (!id) { toast.error('Duplication impossible'); return; }
    toast.success('Événement dupliqué', 'Créé en brouillon : vérifie dates et lieu.');
    onClose();
    navigate('events', id);
  };

  return (
    <Modal isOpen onClose={onClose} title="Dupliquer l'événement"
      description="Idéal pour les événements récurrents (WEI, gala, rentrée). Les inscriptions et le bilan ne sont pas copiés."
      footer={<div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={onClose}>Annuler</button><button type="submit" form={`${uid}-f`} className="btn-primary">Dupliquer</button></div>}>
      <form id={`${uid}-f`} onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor={`${uid}-t`} className="block text-xs font-medium text-dim mb-1">Titre de la copie</label>
          <input id={`${uid}-t`} className="input" value={title} placeholder={suggested} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" className="mt-1" checked={shiftYear} onChange={(e) => setShiftYear(e.target.checked)} />
          <span>Édition de l'année suivante<span className="block text-xs text-dim">{shiftYear ? `Début : ${formatRange(shiftYears(ev.start, 1), shiftYears(ev.end, 1))} (même jour de la semaine)` : 'Mêmes dates que l\'original.'}</span></span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={keepTasks} onChange={(e) => setKeepTasks(e.target.checked)} />
          Reprendre la checklist ({ev.tasks?.length || 0} tâche(s), décochées, échéances décalées)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={keepVolunteers} onChange={(e) => setKeepVolunteers(e.target.checked)} />
          Reprendre les bénévoles ({ev.volunteers?.length || 0})
        </label>
      </form>
    </Modal>
  );
}
