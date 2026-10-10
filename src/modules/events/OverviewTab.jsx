import { CalendarDays, Clock, ListChecks, MapPin, Users, UserCheck, Wallet } from 'lucide-react';
import { useCatalog } from '../../core/useCatalog.js';
import { formatMoney } from '../../documents/context.js';
import { durationLabel, eventStats, formatRange } from './logic.js';
import { useMembers } from './hooks.js';
import { Progress } from './ui.jsx';
import DocumentsPanel from './DocumentsPanel.jsx';
import CommsPanel from './CommsPanel.jsx';

export default function OverviewTab({ ev, canWrite, goTab }) {
  const st = eventStats(ev);
  const members = useMembers();
  const { poleLabel } = useCatalog();

  const tiles = [
    { id: 'participants', icon: Users, label: 'Inscrits', value: `${st.seats}${st.capacity ? ` / ${st.capacity}` : ''}`, sub: st.waitlist ? `${st.waitlist} en liste d'attente` : st.capacity ? `${Math.max(0, st.capacity - st.seats)} place(s) libre(s)` : 'Capacité illimitée' },
    { id: 'taches', icon: ListChecks, label: 'Tâches', value: st.tasksTotal ? `${st.taskProgress} %` : '—', sub: `${st.tasksDone}/${st.tasksTotal} terminée(s)`, progress: st.tasksTotal ? st.taskProgress : null },
    { id: 'benevoles', icon: UserCheck, label: 'Bénévoles', value: String(st.volunteers), sub: 'créneaux et rôles' },
    { id: 'budget', icon: Wallet, label: 'Prix', value: Number(ev.price) > 0 ? formatMoney(ev.price) : 'Gratuit', sub: Number(ev.price) > 0 ? `${st.paid} payé(s)` : ev.budgetId ? 'Budget lié' : 'Voir le budget' },
  ];

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(tl => (
          <li key={tl.id}>
            <button type="button" onClick={() => goTab(tl.id)}
              className="w-full text-left bg-surface border border-line rounded-2xl p-3 hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
              <span className="text-xs text-dim flex items-center gap-1.5"><tl.icon size={13} aria-hidden="true" /> {tl.label}</span>
              <span className="block text-lg font-bold text-ink mt-0.5">{tl.value}</span>
              <span className="block text-[11px] text-muted">{tl.sub}</span>
              {tl.progress !== undefined && tl.progress !== null && <div className="mt-2"><Progress value={tl.progress} label={`Progression des tâches ${tl.progress} %`} tone="bg-emerald-500" /></div>}
            </button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby="ev-infos">
          <h3 id="ev-infos" className="font-semibold text-ink">Informations</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-xs text-dim flex items-center gap-1"><CalendarDays size={12} aria-hidden="true" /> Quand</dt><dd className="text-ink">{formatRange(ev.start, ev.end)}</dd></div>
            <div><dt className="text-xs text-dim flex items-center gap-1"><Clock size={12} aria-hidden="true" /> Durée</dt><dd className="text-ink">{durationLabel(ev.start, ev.end) || '—'}</dd></div>
            <div><dt className="text-xs text-dim flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> Lieu</dt><dd className="text-ink">{ev.location || '—'}</dd></div>
            <div><dt className="text-xs text-dim">Pôle</dt><dd className="text-ink">{ev.poleId ? poleLabel(ev.poleId) : '—'}</dd></div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-dim">Responsables</dt>
              <dd className="text-ink">{ev.responsibleIds?.length ? ev.responsibleIds.map(members.name).join(', ') : '—'}</dd>
            </div>
          </dl>
          <div>
            <h4 className="text-xs text-dim mb-1">Description</h4>
            <p className="text-sm text-ink whitespace-pre-wrap">{ev.description || <span className="text-muted">Aucune description.</span>}</p>
          </div>
        </section>
        <CommsPanel ev={ev} />
      </div>

      <DocumentsPanel ev={ev} canWrite={canWrite} />
    </div>
  );
}
