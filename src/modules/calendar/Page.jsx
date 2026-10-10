import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus, Settings, AlertTriangle, BellRing } from 'lucide-react';
import { useCan } from '../../core/permissions.js';
import { toast } from '../../components/ui/toastStore.js';
import { getAgendaItems, collapseRecurring, CATEGORIES, ymd, addDays, addMonths, startOfWeek } from './agenda.js';
import { useAgendaSources, hasEventsModule, hasMembershipModule } from './sources.js';
import { monthLabel, shortDay } from './format.js';
import { buildIcs, downloadIcs } from './ics.js';
import { recordDirigeantsChange } from './scheduler.js';
import { MonthView, WeekView, ListView } from './Views.jsx';
import ReminderModal from './ReminderModal.jsx';
import ItemDetailModal from './ItemDetailModal.jsx';
import { SettingsModal, ExportModal } from './SettingsModal.jsx';

const VIEWS = [
  { id: 'month', label: 'Mois' },
  { id: 'week', label: 'Semaine' },
  { id: 'list', label: 'À venir' },
];

const initialView = () => {
  try { return window.matchMedia('(max-width: 639px)').matches ? 'list' : 'month'; } catch { return 'month'; }
};

export default function CalendarPage() {
  const canWrite = useCan('calendar', 'write');
  const [today, setToday] = useState(() => ymd(new Date()));
  const [view, setView] = useState(initialView);
  const [cursor, setCursor] = useState(today);
  const [selectedDay, setSelectedDay] = useState(today);
  const [hidden, setHidden] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // { reminder? } | null
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const src = useAgendaSources();

  // Passage à minuit : la date du jour se met à jour sans recharger.
  useEffect(() => {
    const t = setInterval(() => setToday(ymd(new Date())), 60000);
    return () => clearInterval(t);
  }, []);

  // Mémorise la date d'un changement de bureau (échéance de déclaration).
  useEffect(() => {
    try { recordDirigeantsChange(today); } catch { /* sans incidence sur l'affichage */ }
  }, [src.main.members, src.main.roles, src.main.levels, src.documentLog, today]);

  const monthStart = `${cursor.slice(0, 7)}-01`;
  const from = [addDays(monthStart, -7), addDays(today, -60)].sort()[0];
  const to = [addDays(monthStart, 49), addDays(today, 400)].sort()[1];

  const allItems = useMemo(() => getAgendaItems({ ...src, today, from, to }), [src, today, from, to]);
  const items = useMemo(() => allItems.filter(i => !hidden.has(i.category)), [allItems, hidden]);
  const overdueCount = useMemo(() => allItems.filter(i => i.severity === 'overdue').length, [allItems]);

  const counts = useMemo(() => {
    const c = {};
    collapseRecurring(allItems, today).forEach(i => { if (!i.done && (i.date >= today || i.severity === 'overdue')) c[i.category] = (c[i.category] || 0) + 1; });
    return c;
  }, [allItems, today]);

  const toggleCat = (id) => setHidden(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const move = (dir) => {
    const next = view === 'week' ? addDays(cursor, 7 * dir) : addMonths(`${cursor.slice(0, 7)}-01`, dir);
    setCursor(next);
    if (view === 'month') setSelectedDay(null);
  };
  const goToday = () => { setCursor(today); setSelectedDay(today); };

  const periodLabel = view === 'week'
    ? `${shortDay(startOfWeek(cursor))} – ${shortDay(addDays(startOfWeek(cursor), 6))} ${startOfWeek(cursor).slice(0, 4)}`
    : monthLabel(cursor);

  const exportItems = () => getAgendaItems({ ...src, today, from: addDays(today, -90), to: addDays(today, 730) });
  const doExport = () => {
    try {
      const list = exportItems();
      const content = buildIcs({ items: list, reminders: src.reminders, calendarName: `${src.main.organization?.shortName || src.main.organization?.name || 'BDE'} — Agenda`, host: window.location.hostname || 'bde-manager.local' });
      downloadIcs(content, `agenda-${ymd(new Date())}.ics`);
      toast.success('Agenda exporté', 'Fichier .ics téléchargé : importe-le dans Google Agenda ou Apple Calendrier.');
      setExportOpen(false);
    } catch (e) {
      toast.error('Export impossible', e.message);
    }
  };
  const exportCount = exportOpen ? exportItems().filter(i => i.source !== 'reminder').length + Object.keys(src.reminders || {}).length : 0;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink flex items-center gap-2"><CalendarDays size={20} aria-hidden="true" /> Agenda & rappels</h2>
          <p className="text-sm text-dim mt-0.5">
            Événements, mandats, AG, déclarations, cotisations et rappels réunis au même endroit.
            {!hasEventsModule && ' (Module Événements non installé.)'}
            {!hasMembershipModule && ' (Module Adhésions non installé.)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setSettingsOpen(true)} aria-label="Réglages de l'agenda et notifications">
            <Settings size={15} aria-hidden="true" /> <span className="hidden sm:inline">Réglages</span>
          </button>
          <button type="button" className="btn-secondary" onClick={() => setExportOpen(true)}>
            <Download size={15} aria-hidden="true" /> <span className="hidden sm:inline">Exporter</span> .ics
          </button>
          {canWrite && (
            <button type="button" className="btn-primary" onClick={() => setEditing({ reminder: null })}>
              <Plus size={15} aria-hidden="true" /> Nouveau rappel
            </button>
          )}
        </div>
      </header>

      {overdueCount > 0 && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle size={16} aria-hidden="true" />
          <span><strong>{overdueCount}</strong> échéance{overdueCount > 1 ? 's' : ''} en retard.</span>
          {view !== 'list' && <button type="button" className="ml-auto underline font-medium" onClick={() => setView('list')}>Voir</button>}
        </div>
      )}
      {!src.settings.notifications && (
        <button type="button" onClick={() => setSettingsOpen(true)} className="w-full text-left flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-dim hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
          <BellRing size={16} aria-hidden="true" /> Active les notifications pour être prévenu des échéances du jour quand l'app est ouverte.
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Vue de l'agenda" className="inline-flex rounded-xl border border-line bg-elevated p-0.5">
          {VIEWS.map(v => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${view === v.id ? 'bg-surface text-ink shadow-sm' : 'text-dim hover:text-ink'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'list' && (
          <div className="flex items-center gap-1 ml-auto sm:ml-0">
            <button type="button" className="btn-ghost px-2" onClick={() => move(-1)} aria-label={view === 'week' ? 'Semaine précédente' : 'Mois précédent'}><ChevronLeft size={18} aria-hidden="true" /></button>
            <button type="button" className="btn-secondary" onClick={goToday}>Aujourd'hui</button>
            <button type="button" className="btn-ghost px-2" onClick={() => move(1)} aria-label={view === 'week' ? 'Semaine suivante' : 'Mois suivant'}><ChevronRight size={18} aria-hidden="true" /></button>
            <h3 className="text-base font-semibold text-ink ml-1" aria-live="polite">{periodLabel}</h3>
          </div>
        )}
      </div>

      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Filtrer par catégorie</legend>
        {CATEGORIES.map(c => {
          const on = !hidden.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleCat(c.id)}
              className={`chip ${on ? 'chip-active' : 'chip-idle opacity-60'} inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} aria-hidden="true" />
              {c.label}
              {counts[c.id] ? <span className="text-dim text-xs">{counts[c.id]}</span> : null}
            </button>
          );
        })}
      </fieldset>

      {view === 'month' && (
        <MonthView cursor={cursor} items={items} today={today} selectedDay={selectedDay} onSelectDay={setSelectedDay} onSelect={setDetail} />
      )}
      {view === 'week' && <WeekView cursor={cursor} items={items} today={today} onSelect={setDetail} />}
      {view === 'list' && <ListView items={items} today={today} onSelect={setDetail} />}

      {detail && (
        <ItemDetailModal
          item={detail}
          today={today}
          onClose={() => setDetail(null)}
          onEdit={(reminder) => { setDetail(null); setEditing({ reminder }); }}
        />
      )}
      {editing && (
        <ReminderModal
          reminder={editing.reminder}
          defaultDate={(view === 'month' && selectedDay) || today}
          onClose={() => setEditing(null)}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} onExport={doExport} count={exportCount} />}
    </div>
  );
}
