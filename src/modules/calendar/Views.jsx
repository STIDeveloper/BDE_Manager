import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Repeat } from 'lucide-react';
import { addDays, categoryOf, collapseRecurring, coversDay, startOfWeek, parseYmd, SEVERITY_LABELS, SOURCE_LABELS } from './agenda.js';
import { dayLabel, dayLabelYear, relativeLabel, timeLabel, weekdayShort, WEEKDAY_HEADERS, SEVERITY_STYLES } from './format.js';

const itemsOn = (items, d) => items.filter(i => coversDay(i, d));

/** Pastille compacte (grilles mois / semaine). */
export function ItemPill({ item, onSelect }) {
  const cat = categoryOf(item.category);
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full text-left truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${cat.pill} ${item.done ? 'line-through opacity-60' : ''} ${item.severity === 'overdue' ? 'ring-1 ring-rose-500/60' : ''}`}
      title={item.title}
    >
      {item.time ? `${timeLabel(item.time)} · ` : ''}{item.title}{item.done && <span className="sr-only"> (fait)</span>}
    </button>
  );
}

/** Ligne détaillée (liste / jour sélectionné). */
export function ItemRow({ item, onSelect, today, showDate = false }) {
  const cat = categoryOf(item.category);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="w-full text-left flex items-start gap-3 rounded-xl border border-line bg-surface hover:bg-elevated px-3 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${cat.dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold text-ink ${item.done ? 'line-through opacity-60' : ''}`}>{item.title}</span>
          <span className="block text-xs text-dim mt-0.5">
            {showDate && !item.asap && <>{dayLabel(item.date)} · </>}
            {item.asap ? 'Dès que possible' : item.time ? timeLabel(item.time) : 'Toute la journée'}
            {' · '}{SOURCE_LABELS[item.source] || 'Agenda'}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </span>
        </span>
        <span className="shrink-0 flex flex-col items-end gap-1">
          {item.severity === 'overdue' && <span className="badge badge-rose"><AlertTriangle size={11} aria-hidden="true" /> En retard</span>}
          {item.severity === 'done' && <span className="badge badge-emerald"><CheckCircle2 size={11} aria-hidden="true" /> Fait</span>}
          {(item.severity === 'today' || item.severity === 'soon') && !item.asap && <span className={`badge ${SEVERITY_STYLES[item.severity]}`}>{relativeLabel(item.date, today)}</span>}
          {item.recurrence && item.recurrence !== 'none' && <Repeat size={12} className="text-muted" aria-label="Récurrent" />}
        </span>
      </button>
    </li>
  );
}

export function MonthView({ cursor, items, today, selectedDay, onSelectDay, onSelect }) {
  const days = useMemo(() => {
    const first = `${cursor.slice(0, 7)}-01`;
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor]);
  const month = cursor.slice(0, 7);
  const selItems = selectedDay ? itemsOn(items, selectedDay) : [];

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-2xl overflow-hidden" aria-label="Calendrier du mois" role="group">
        <div className="grid grid-cols-7 border-b border-line bg-elevated/50">
          {WEEKDAY_HEADERS.map(w => <div key={w} aria-hidden="true" className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-dim">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map(d => {
            const list = itemsOn(items, d);
            const inMonth = d.slice(0, 7) === month;
            const isToday = d === today;
            const isSel = d === selectedDay;
            const overdue = list.some(i => i.severity === 'overdue');
            return (
              <div
                key={d}
                className={`min-h-[64px] sm:min-h-[104px] border-b border-r border-line p-1 flex flex-col gap-1 ${inMonth ? '' : 'bg-elevated/40'} ${isSel ? 'bg-blue-500/[0.06]' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectDay(d)}
                  aria-label={`${dayLabelYear(d)}${list.length ? `, ${list.length} élément${list.length > 1 ? 's' : ''}` : ''}`}
                  aria-pressed={isSel}
                  className={`self-start text-xs font-semibold h-6 min-w-6 px-1 rounded-full grid place-items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${isToday ? 'bg-blue-600 text-white' : inMonth ? 'text-ink hover:bg-elevated' : 'text-muted hover:bg-elevated'}`}
                >
                  {parseYmd(d).getDate()}
                </button>
                {/* Mobile : pastilles de couleur ; écran large : titres cliquables */}
                <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden="true">
                  {list.slice(0, 4).map(i => <span key={i.key} className={`h-1.5 w-1.5 rounded-full ${categoryOf(i.category).dot} ${i.done ? 'opacity-40' : ''}`} />)}
                  {overdue && <span className="h-1.5 w-1.5 rounded-full bg-rose-600 ring-1 ring-rose-300" />}
                </div>
                <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
                  {list.slice(0, 3).map(i => <ItemPill key={i.key} item={i} onSelect={onSelect} />)}
                  {list.length > 3 && (
                    <button type="button" onClick={() => onSelectDay(d)} className="text-[11px] text-dim hover:text-ink text-left px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 rounded">
                      + {list.length - 3} autre{list.length - 3 > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <section aria-label={`Échéances du ${dayLabel(selectedDay)}`}>
          <h3 className="text-sm font-semibold text-ink mb-2">{dayLabelYear(selectedDay)}</h3>
          {selItems.length ? (
            <ul className="space-y-2">{selItems.map(i => <ItemRow key={i.key} item={i} onSelect={onSelect} today={today} />)}</ul>
          ) : <p className="text-sm text-dim">Rien de prévu ce jour-là.</p>}
        </section>
      )}
    </div>
  );
}

export function WeekView({ cursor, items, today, onSelect }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map(d => {
        const list = itemsOn(items, d);
        const isToday = d === today;
        return (
          <section key={d} aria-label={dayLabelYear(d)} className={`bg-surface border rounded-2xl p-2 md:min-h-[260px] ${isToday ? 'border-blue-500/60' : 'border-line'}`}>
            <h3 className="flex items-baseline gap-1.5 px-1 pb-2 border-b border-line mb-2">
              <span className="text-[11px] uppercase tracking-wide font-semibold text-dim">{weekdayShort(d)}</span>
              <span className={`text-sm font-bold ${isToday ? 'text-blue-600 dark:text-blue-400' : 'text-ink'}`}>{parseYmd(d).getDate()}</span>
              {isToday && <span className="badge badge-brand ml-auto">Aujourd'hui</span>}
            </h3>
            {list.length ? (
              <ul className="space-y-1">
                {list.map(i => (
                  <li key={i.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(i)}
                      className={`w-full text-left rounded-lg border px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${categoryOf(i.category).pill} ${i.severity === 'overdue' ? 'ring-1 ring-rose-500/60' : ''}`}
                    >
                      <span className="flex items-center gap-1 text-[11px] opacity-80">
                        <Clock size={10} aria-hidden="true" />{i.time ? timeLabel(i.time) : 'Journée'}
                        {i.severity === 'overdue' && <span className="ml-auto font-semibold">{SEVERITY_LABELS.overdue}</span>}
                      </span>
                      <span className={`block text-xs font-semibold leading-snug ${i.done ? 'line-through opacity-60' : ''}`}>{i.title}{i.done && <span className="sr-only"> (fait)</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted px-1">—</p>}
          </section>
        );
      })}
    </div>
  );
}

export function ListView({ items, today, onSelect, horizonDays = 120 }) {
  const { overdue, asap, groups } = useMemo(() => {
    const limit = addDays(today, horizonDays);
    const all = collapseRecurring(items, today);
    const od = all.filter(i => i.severity === 'overdue');
    const as = all.filter(i => i.asap && !i.done);
    const up = all.filter(i => !i.asap && i.date >= today && i.date <= limit && i.severity !== 'overdue');
    const g = new Map();
    up.forEach(i => { if (!g.has(i.date)) g.set(i.date, []); g.get(i.date).push(i); });
    return { overdue: od, asap: as, groups: [...g.entries()] };
  }, [items, today, horizonDays]);

  if (!overdue.length && !asap.length && !groups.length) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <CheckCircle2 size={28} className="mx-auto text-emerald-500" aria-hidden="true" />
        <p className="mt-3 font-semibold text-ink">Rien à l'horizon</p>
        <p className="text-sm text-dim mt-1">Aucune échéance dans les {horizonDays} prochains jours. Ajoute un rappel ou planifie un événement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {overdue.length > 0 && (
        <section aria-labelledby="cal-overdue">
          <h3 id="cal-overdue" className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} aria-hidden="true" /> En retard ({overdue.length})
          </h3>
          <ul className="space-y-2">{overdue.map(i => <ItemRow key={i.key} item={i} onSelect={onSelect} today={today} showDate />)}</ul>
        </section>
      )}
      {asap.length > 0 && (
        <section aria-labelledby="cal-asap">
          <h3 id="cal-asap" className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">À planifier / dès que possible</h3>
          <ul className="space-y-2">{asap.map(i => <ItemRow key={i.key} item={i} onSelect={onSelect} today={today} />)}</ul>
        </section>
      )}
      {groups.map(([d, list]) => (
        <section key={d} aria-label={dayLabelYear(d)}>
          <h3 className="text-sm font-semibold text-ink mb-2">
            {dayLabel(d)} <span className="text-dim font-normal">· {relativeLabel(d, today)}</span>
          </h3>
          <ul className="space-y-2">{list.map(i => <ItemRow key={i.key} item={i} onSelect={onSelect} today={today} />)}</ul>
        </section>
      ))}
    </div>
  );
}
