import { useMemo, useState, useId } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, MapPin, PartyPopper, Plus, Search, Users, Wallet, ListChecks,
} from 'lucide-react';
import { useEventsStore, listEvents } from './store.js';
import { useCan } from '../../core/permissions.js';
import { navigate, useRoute } from '../../core/router.js';
import { useCatalog } from '../../core/useCatalog.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatMoney } from '../../documents/context.js';
import { EVENT_TYPES, EVENT_STATUSES } from '../contracts.js';
import { eventBucket, eventStats, formatRange, typeOf } from './logic.js';
import { EmptyState, Progress, StatusBadge } from './ui.jsx';
import EventFormModal from './EventFormModal.jsx';
import EventDetail from './EventDetail.jsx';

const VIEWS = [
  { id: 'upcoming', label: 'À venir' },
  { id: 'past', label: 'Passés' },
  { id: 'draft', label: 'Brouillons' },
];

export default function EventsPage() {
  const route = useRoute();
  const eventsMap = useEventsStore(s => s.events);
  const eventId = route.rest[0];

  if (eventId) {
    const ev = eventsMap[eventId];
    if (!ev) {
      return (
        <main className="max-w-5xl mx-auto p-4">
          <EmptyState icon={PartyPopper} title="Événement introuvable"
            action={<button type="button" className="btn-secondary" onClick={() => navigate('events')}>Retour aux événements</button>}>
            Il a peut-être été supprimé.
          </EmptyState>
        </main>
      );
    }
    return <EventDetail key={ev.id} event={ev} initialTab={route.rest[1]} />;
  }
  return <EventList eventsMap={eventsMap} />;
}

function EventList({ eventsMap }) {
  const uid = useId();
  const canWrite = useCan('events', 'write');
  const createEvent = useEventsStore(s => s.createEvent);
  const { poleList, poleLabel, poleColor } = useCatalog();
  const [view, setView] = useState('upcoming');
  const [layout, setLayout] = useState('cards');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [pole, setPole] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);

  const all = useMemo(() => listEvents(eventsMap), [eventsMap]);
  const counts = useMemo(() => {
    const c = { upcoming: 0, past: 0, draft: 0 };
    all.forEach(e => { c[eventBucket(e)]++; });
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr');
    return all.filter(e => {
      if (type && e.type !== type) return false;
      if (pole && e.poleId !== pole) return false;
      if (status && e.status !== status) return false;
      if (needle && !`${e.title} ${e.location} ${e.description}`.toLocaleLowerCase('fr').includes(needle)) return false;
      return true;
    });
  }, [all, q, type, pole, status]);

  const shown = useMemo(() => {
    const list = layout === 'calendar' ? filtered : filtered.filter(e => eventBucket(e) === view);
    return view === 'past' && layout === 'cards' ? [...list].reverse() : list;
  }, [filtered, view, layout]);

  const create = (data) => {
    const id = createEvent(data);
    setCreating(false);
    toast.success('Événement créé', data.title);
    navigate('events', id);
  };

  const filtering = !!(q || type || pole || status);

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2"><PartyPopper size={20} aria-hidden="true" /> Événements</h2>
          <p className="text-sm text-dim">Organisation, inscriptions, bénévoles, budget et bilan.</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={layout === 'cards'} onClick={() => setLayout('cards')}
              className={`px-3 py-2 text-sm flex items-center gap-1.5 ${layout === 'cards' ? 'bg-elevated text-ink' : 'text-dim'}`}>
              <LayoutGrid size={14} aria-hidden="true" /> Liste
            </button>
            <button type="button" aria-pressed={layout === 'calendar'} onClick={() => setLayout('calendar')}
              className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-line ${layout === 'calendar' ? 'bg-elevated text-ink' : 'text-dim'}`}>
              <CalendarDays size={14} aria-hidden="true" /> Calendrier
            </button>
          </div>
          {canWrite && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden="true" /> Nouvel événement
            </button>
          )}
        </div>
      </div>

      {layout === 'cards' && (
        <div role="tablist" aria-label="Période" className="flex gap-1 border-b border-line overflow-x-auto">
          {VIEWS.map(v => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${view === v.id ? 'border-blue-500 text-ink' : 'border-transparent text-dim hover:text-ink'}`}>
              {v.label} <span className="text-xs text-muted">({counts[v.id]})</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un événement</label>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input id={`${uid}-q`} type="search" className="input pl-8" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Filtrer par type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
        </select>
        <select aria-label="Filtrer par pôle" className="input" value={pole} onChange={(e) => setPole(e.target.value)}>
          <option value="">Tous les pôles</option>
          {poleList.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select aria-label="Filtrer par statut" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {EVENT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {layout === 'calendar' ? (
        <MonthCalendar events={shown} />
      ) : shown.length === 0 ? (
        <EmptyState icon={PartyPopper}
          title={all.length === 0 ? 'Aucun événement pour l\'instant' : filtering ? 'Aucun résultat' : `Aucun événement ${VIEWS.find(v => v.id === view).label.toLowerCase()}`}
          action={all.length === 0 && canWrite ? <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> Créer le premier</button>
            : filtering ? <button type="button" className="btn-secondary" onClick={() => { setQ(''); setType(''); setPole(''); setStatus(''); }}>Effacer les filtres</button> : null}>
          {all.length === 0 ? 'Crée une soirée, un WEI, une AG… puis gère inscriptions, bénévoles et budget.' : null}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map(ev => <EventCard key={ev.id} ev={ev} poleLabel={poleLabel} poleColor={poleColor} />)}
        </ul>
      )}

      {creating && <EventFormModal onClose={() => setCreating(false)} onSave={create} />}
    </main>
  );
}

function EventCard({ ev, poleLabel, poleColor }) {
  const st = eventStats(ev);
  const t = typeOf(ev.type);
  return (
    <li>
      <a href={`#/events/${encodeURIComponent(ev.id)}`}
        className="block h-full bg-surface border border-line rounded-2xl p-4 hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-ink leading-snug"><span aria-hidden="true">{t.emoji}</span> {ev.title}</h3>
          <StatusBadge status={ev.status} />
        </div>
        <p className="text-sm text-dim mt-1 flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> {formatRange(ev.start, ev.end)}</p>
        {ev.location && <p className="text-sm text-dim flex items-center gap-1.5"><MapPin size={13} aria-hidden="true" /> {ev.location}</p>}
        {ev.poleId && (
          <p className="text-xs mt-2 flex items-center gap-1.5 text-dim">
            <span className="w-2 h-2 rounded-full" style={{ background: poleColor(ev.poleId) }} aria-hidden="true" /> {poleLabel(ev.poleId)}
          </p>
        )}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-dim">
            <span className="flex items-center gap-1"><Users size={12} aria-hidden="true" /> {st.seats}{st.capacity ? ` / ${st.capacity}` : ''} inscrit{st.seats > 1 ? 's' : ''}{st.waitlist ? ` · ${st.waitlist} en attente` : ''}</span>
            {st.tasksTotal > 0 && <span className="flex items-center gap-1"><ListChecks size={12} aria-hidden="true" /> {st.tasksDone}/{st.tasksTotal}</span>}
          </div>
          {st.capacity && <Progress value={st.fillRate} label={`Remplissage ${st.fillRate} %`} tone={st.fillRate >= 100 ? 'bg-amber-500' : 'bg-blue-500'} />}
        </div>
        <div className="flex justify-between text-xs text-dim mt-3">
          <span>{Number(ev.price) > 0 ? formatMoney(ev.price) : 'Gratuit'}</span>
          {ev.budgetId && <span className="flex items-center gap-1"><Wallet size={12} aria-hidden="true" /> Budget lié</span>}
        </div>
      </a>
    </li>
  );
}

const WEEK = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function MonthCalendar({ events }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const days = useMemo(() => {
    const first = new Date(cursor);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);
  const byDay = useMemo(() => {
    const m = new Map();
    events.forEach(e => {
      const s = new Date(e.start); const en = new Date(e.end || e.start);
      if (Number.isNaN(s.getTime())) return;
      const d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      const last = Number.isNaN(en.getTime()) ? d : new Date(en.getFullYear(), en.getMonth(), en.getDate());
      for (let i = 0; d <= last && i < 31; i++) {
        const k = d.toDateString();
        m.set(k, [...(m.get(k) || []), e]);
        d.setDate(d.getDate() + 1);
      }
    });
    return m;
  }, [events]);
  const today = new Date().toDateString();
  const move = (n) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const title = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <section className="bg-surface border border-line rounded-2xl p-3" aria-label={`Calendrier ${title}`}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" className="btn-ghost" aria-label="Mois précédent" onClick={() => move(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <h3 className="font-semibold text-ink capitalize" aria-live="polite">{title}</h3>
        <button type="button" className="btn-ghost" aria-label="Mois suivant" onClick={() => move(1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <div className="grid grid-cols-7 gap-px text-[11px] text-muted text-center mb-1">
        {WEEK.map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-line rounded-lg overflow-hidden">
        {days.map(d => {
          const list = byDay.get(d.toDateString()) || [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={d.toISOString()} className={`min-h-[64px] sm:min-h-[84px] p-1 ${inMonth ? 'bg-surface' : 'bg-elevated'}`}>
              <div className={`text-[11px] mb-0.5 ${d.toDateString() === today ? 'text-blue-500 font-bold' : inMonth ? 'text-dim' : 'text-muted'}`}>{d.getDate()}</div>
              <ul className="space-y-0.5">
                {list.slice(0, 3).map(e => (
                  <li key={e.id}>
                    <a href={`#/events/${encodeURIComponent(e.id)}`} title={e.title}
                      className={`block truncate text-[10px] sm:text-[11px] px-1 py-0.5 rounded ${e.status === 'draft' ? 'bg-elevated text-dim border border-dashed border-line' : e.status === 'cancelled' ? 'bg-rose-500/10 text-rose-500 line-through' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}>
                      <span aria-hidden="true">{typeOf(e.type).emoji}</span> {e.title}
                    </a>
                  </li>
                ))}
                {list.length > 3 && <li className="text-[10px] text-muted">+{list.length - 3}</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
