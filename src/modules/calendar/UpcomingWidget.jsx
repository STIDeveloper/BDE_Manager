import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays } from 'lucide-react';
import { navigate } from '../../core/router.js';
import { addDays, categoryOf, ymd, SOURCE_LABELS } from './agenda.js';
import { useAgendaItems, resolveLink } from './sources.js';
import { relativeLabel, shortDay, timeLabel } from './format.js';

/**
 * Prochaines échéances (en retard d'abord), réutilisable par le tableau de bord.
 * @param {{ limit?: number }} props
 */
export default function UpcomingWidget({ limit = 5 }) {
  const [today] = useState(() => ymd(new Date()));
  const items = useAgendaItems({ today, from: addDays(today, -60), to: addDays(today, 90) });
  const list = useMemo(() => {
    const open = items.filter(i => !i.done && (i.severity === 'overdue' || i.asap || i.date >= today));
    const rank = (i) => (i.severity === 'overdue' ? 0 : i.asap ? 1 : 2);
    return open.sort((a, b) => rank(a) - rank(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, limit);
  }, [items, today, limit]);

  const open = (item) => {
    const link = resolveLink(item);
    if (link && link.section !== 'calendar') navigate(link.section, link.path);
    else navigate('calendar');
  };

  return (
    <section className="bg-surface border border-line rounded-2xl p-4" aria-labelledby="upcoming-widget-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="upcoming-widget-title" className="font-semibold text-ink flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" /> Prochaines échéances</h3>
        <button type="button" className="btn-ghost text-xs" onClick={() => navigate('calendar')}>Agenda <ArrowRight size={13} aria-hidden="true" /></button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-dim">Aucune échéance dans les 90 prochains jours.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map(i => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => open(i)}
                className="w-full text-left flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${categoryOf(i.category).dot}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink truncate">{i.title}</span>
                  <span className="block text-xs text-dim truncate">{SOURCE_LABELS[i.source]}{i.time ? ` · ${timeLabel(i.time)}` : ''}</span>
                </span>
                <span className={`shrink-0 text-xs font-medium ${i.severity === 'overdue' ? 'text-rose-600 dark:text-rose-400' : i.severity === 'today' ? 'text-amber-600 dark:text-amber-400' : 'text-dim'}`}>
                  {i.severity === 'overdue' ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden="true" /> En retard</span>
                    : i.asap ? 'Dès que possible'
                      : i.date === today ? 'Aujourd\'hui' : (i.date <= addDays(today, 6) ? relativeLabel(i.date, today) : shortDay(i.date))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
