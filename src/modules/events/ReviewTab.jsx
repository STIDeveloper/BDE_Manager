import { useId, useState } from 'react';
import { Star } from 'lucide-react';
import { useEventsStore } from './store.js';
import { toast } from '../../components/ui/toastStore.js';
import { eventStats } from './logic.js';

export default function ReviewTab({ ev, canWrite }) {
  const uid = useId();
  const setReview = useEventsStore(s => s.setReview);
  const updateEvent = useEventsStore(s => s.updateEvent);
  const st = eventStats(ev);
  const r = ev.review || {};
  const [summary, setSummary] = useState(r.summary || '');
  const [attendance, setAttendance] = useState(r.attendance ?? (st.present || ''));
  const [satisfaction, setSatisfaction] = useState(r.satisfaction || 0);
  const [lessons, setLessons] = useState(r.lessons || '');
  const isPast = new Date(ev.end || ev.start) < new Date();

  const save = (e) => {
    e.preventDefault();
    setReview(ev.id, { summary, attendance: attendance === '' ? st.present : attendance, satisfaction, lessons });
    toast.success('Bilan enregistré', ev.title);
  };

  const markDone = () => { updateEvent(ev.id, { status: 'done' }); toast.success('Événement marqué terminé'); };

  const metrics = [
    ['Présents', st.present],
    ['Absents', st.absent],
    ['Taux de présence', st.attendanceRate !== null ? `${st.attendanceRate} %` : '—'],
    ['Remplissage', st.fillRate !== null ? `${st.fillRate} %` : '—'],
    ['Liste d\'attente', st.waitlist],
    ['Annulations', st.cancelled],
    ['Tâches réalisées', st.tasksTotal ? `${st.tasksDone}/${st.tasksTotal}` : '—'],
    ['Bénévoles', st.volunteers],
  ];

  return (
    <div className="space-y-4">
      <section className="bg-surface border border-line rounded-2xl p-4" aria-labelledby={`${uid}-f`}>
        <h3 id={`${uid}-f`} className="font-semibold text-ink mb-2">Fréquentation (calculée)</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {metrics.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-dim">{k}</dt><dd className="text-lg font-bold text-ink">{v}</dd></div>
          ))}
        </dl>
        {st.present + st.absent === 0 && st.seats > 0 && <p className="text-xs text-dim mt-2">Astuce : pointe les présences (Participants › Pointage) pour un taux de présence exact.</p>}
      </section>

      {isPast && ev.status !== 'done' && ev.status !== 'cancelled' && canWrite && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink">L'événement est passé mais pas encore marqué terminé.</span>
          <button type="button" className="btn-secondary" onClick={markDone}>Marquer terminé</button>
        </div>
      )}

      <form onSubmit={save} className="bg-surface border border-line rounded-2xl p-4 space-y-3">
        <h3 className="font-semibold text-ink">Bilan qualitatif</h3>
        <div>
          <label htmlFor={`${uid}-s`} className="block text-xs text-dim mb-1">Résumé</label>
          <textarea id={`${uid}-s`} rows={4} className="input" value={summary} disabled={!canWrite} onChange={(e) => setSummary(e.target.value)} placeholder="Déroulé, temps forts, incidents…" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-a`} className="block text-xs text-dim mb-1">Fréquentation retenue (personnes)</label>
            <input id={`${uid}-a`} type="number" min="0" className="input" value={attendance} disabled={!canWrite} onChange={(e) => setAttendance(e.target.value)} />
            <p className="text-[11px] text-muted mt-1">Pré-remplie avec les présents pointés ({st.present}).</p>
          </div>
          <fieldset>
            <legend className="block text-xs text-dim mb-1">Satisfaction</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" disabled={!canWrite} aria-label={`${n} sur 5`} aria-pressed={satisfaction === n}
                  onClick={() => setSatisfaction(satisfaction === n ? 0 : n)} className="p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <Star size={24} aria-hidden="true" className={n <= satisfaction ? 'fill-amber-400 text-amber-400' : 'text-muted'} />
                </button>
              ))}
              <span className="text-sm text-dim self-center ml-1">{satisfaction ? `${satisfaction}/5` : 'Non notée'}</span>
            </div>
          </fieldset>
        </div>
        <div>
          <label htmlFor={`${uid}-l`} className="block text-xs text-dim mb-1">Leçons pour la prochaine édition</label>
          <textarea id={`${uid}-l`} rows={4} className="input" value={lessons} disabled={!canWrite} onChange={(e) => setLessons(e.target.value)} placeholder="À refaire, à éviter, contacts utiles…" />
        </div>
        {canWrite && <div className="flex justify-end"><button type="submit" className="btn-primary">Enregistrer le bilan</button></div>}
      </form>
    </div>
  );
}
