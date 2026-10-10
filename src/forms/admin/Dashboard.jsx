// Tableau de bord d'un formulaire : volumes, évolution, ouverture, quotas,
// places, liste d'attente, complétion (si mesurable), dernières réponses, alertes.
import { useId, useMemo, useState } from 'react';
import { Bell, Info, ChevronRight } from 'lucide-react';
import { perDay, quotaUsage, slotPlanning, statusesOf, STATUS_BADGE, fmtNum, dayKey } from './analytics.js';
import { LineChart, HBarChart, StatTile, DataTable } from './charts.jsx';
import { formatDateTimeFr, respondentLabel } from './columns.js';
import { readPref, writePref } from './prefs.js';
import { alertsKey } from './useResponses.js';
import { tryParse } from '../engine/index.js';
import { hasNotificationCenter } from './integrations.js';
import { toast } from '../../components/ui/toastStore.js';

function openState(def) {
  const now = Date.now();
  const s = def.settings || {};
  if (def.status === 'draft') return { label: 'Brouillon (non publié)', tone: 'neutral' };
  if (def.status === 'archived') return { label: 'Archivé', tone: 'neutral' };
  if (def.status === 'closed') return { label: 'Fermé', tone: 'amber' };
  if (s.opensAt && new Date(s.opensAt).getTime() > now) return { label: `Ouvre le ${formatDateTimeFr(s.opensAt)}`, tone: 'amber' };
  if (s.closesAt && new Date(s.closesAt).getTime() <= now) return { label: `Fermé depuis le ${formatDateTimeFr(s.closesAt)}`, tone: 'amber' };
  return { label: s.closesAt ? `Ouvert jusqu'au ${formatDateTimeFr(s.closesAt)}` : 'Ouvert', tone: 'emerald' };
}

export default function Dashboard({ ctx, loading, goTable }) {
  const { def, rows, questions, mode } = ctx;
  const [range, setRange] = useState(30);
  const [now] = useState(() => Date.now());
  const today = dayKey(new Date(now).toISOString());
  const weekAgo = now - 7 * 86400000;
  const active = rows.filter(r => !r.waitlisted);
  const series = useMemo(() => (range ? perDay(rows, { days: range }) : perDay(rows)), [rows, range]);
  const statuses = statusesOf(def);
  const statusItems = statuses.map(s => ({ label: s.label, value: rows.filter(r => r.status === s.id).length })).map(i => ({ ...i, pct: rows.length ? (i.value / rows.length) * 100 : 0 }));
  const quotas = useMemo(() => quotaUsage(def, rows), [def, rows]);
  const slots = useMemo(() => slotPlanning(def, rows), [def, rows]);
  const max = Number(def.settings?.maxResponses) || null;
  const open = openState(def);
  const pending = rows.filter(r => r.pending);
  const queueErrors = pending.filter(r => r.queueError);
  const latest = rows.slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Réponses" value={loading && !rows.length ? '…' : rows.length} hint={`${rows.filter(r => dayKey(r.submittedAt) === today).length} aujourd'hui · ${rows.filter(r => new Date(r.submittedAt).getTime() >= weekAgo).length} sur 7 jours`} />
        <StatTile label="Statut du formulaire" value={<span className={`badge badge-${open.tone} !text-sm`}>{open.label}</span>} hint={def.publishedVersion ? `Version publiée : v${def.publishedVersion}` : 'Jamais publié'} />
        <StatTile label="Places" value={max ? `${active.length} / ${max}` : '—'} hint={max ? `${Math.max(0, max - active.length)} place(s) restante(s)` : 'Aucune limite de réponses'} tone={max && active.length >= max ? 'warn' : undefined} />
        <StatTile label="Liste d'attente" value={rows.filter(r => r.waitlisted).length} hint={def.settings?.waitlist ? 'Liste d\'attente activée' : 'Liste d\'attente désactivée'} />
      </div>

      <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby="fa-evol">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="fa-evol" className="text-sm font-semibold text-ink">Évolution des réponses</h3>
          <div role="radiogroup" aria-label="Période" className="inline-flex gap-1 p-0.5 bg-elevated border border-line rounded-lg">
            {[[14, '14 j'], [30, '30 j'], [90, '90 j'], [0, 'Tout']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={range === v} onClick={() => setRange(v)} className={`px-2 py-0.5 text-xs rounded-md ${range === v ? 'bg-surface text-ink border border-line' : 'text-dim'}`}>{l}</button>
            ))}
          </div>
        </div>
        <LineChart points={series} title="Réponses par jour" />
        <DataTable columns={[{ key: 'd', label: 'Jour' }, { key: 'n', label: 'Réponses', align: 'right' }]} rows={series.filter(p => p.count).map(p => ({ d: p.day.split('-').reverse().join('/'), n: p.count }))} caption="Réponses par jour" />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby="fa-status">
          <h3 id="fa-status" className="text-sm font-semibold text-ink">Traitement</h3>
          <HBarChart items={statusItems} title="Réponses par statut" />
        </section>

        <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby="fa-compl">
          <h3 id="fa-compl" className="text-sm font-semibold text-ink">Complétion et abandons</h3>
          <p className="text-xs text-dim flex gap-1.5"><Info size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            {mode === 'server'
              ? 'Non mesurable : les brouillons de reprise des répondants ne sont pas lisibles par l\'administration (protection des données), et les formulaires commencés sans brouillon ne laissent aucune trace. Seuls les envois sont comptés.'
              : 'Non mesurable sur cet appareil : seules les réponses envoyées (ou mises en file par la borne) sont connues ; les saisies abandonnées ne sont pas enregistrées.'}
          </p>
          {questions.length > 0 && rows.length > 0 && (
            <p className="text-xs text-dim">Taux de réponse moyen par question (réponses envoyées) : <strong className="text-ink">{fmtNum(questions.reduce((a, q) => a + rows.filter(r => { const v = r.answers?.[q.key]; return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length); }).length / rows.length, 0) / questions.length * 100, 0)} %</strong></p>
          )}
          {pending.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">{pending.length} réponse(s) de la borne / hors ligne en attente d'envoi sur cet appareil{queueErrors.length ? `, dont ${queueErrors.length} refusée(s) par le serveur` : ''}.</p>
          )}
        </section>
      </div>

      {(quotas.length > 0 || slots.length > 0) && (
        <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-labelledby="fa-quota">
          <h3 id="fa-quota" className="text-sm font-semibold text-ink">Quotas et places</h3>
          {quotas.length > 0 && (
            <HBarChart title="Quotas" unit="inscrits" showPct={false} items={quotas.map(q => ({ label: q.message ? `${q.expr} (${q.message})` : q.expr, value: q.used, capacity: q.max }))} />
          )}
          {slots.map(p => (
            <div key={p.key}>
              <p className="text-xs font-medium text-dim mb-1">{p.label}</p>
              <HBarChart title={p.label} unit="inscrits" showPct={false} items={p.slots.map(s => ({ label: s.label, value: s.count, capacity: s.capacity }))} />
            </div>
          ))}
        </section>
      )}

      <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby="fa-latest">
        <div className="flex items-center justify-between">
          <h3 id="fa-latest" className="text-sm font-semibold text-ink">Dernières réponses</h3>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={goTable}>Tout voir <ChevronRight size={13} aria-hidden="true" /></button>
        </div>
        {latest.length === 0 ? <p className="text-sm text-dim">{loading ? 'Chargement…' : 'Aucune réponse pour l\'instant.'}</p> : (
          <ul className="divide-y divide-line">
            {latest.map(r => {
              const s = statuses.find(x => x.id === r.status);
              return (
                <li key={r.id}>
                  <button type="button" onClick={() => ctx.openRow(r.id)} className="w-full flex items-center gap-2 py-2 text-left rounded-lg hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 px-1">
                    <span className="text-sm text-ink truncate flex-1">{respondentLabel(r, questions, ctx.memberName) || 'Réponse anonyme'}</span>
                    <span className={`badge ${STATUS_BADGE[s?.color] || 'badge-neutral'}`}>{s?.label || r.status}</span>
                    <span className="text-xs text-muted shrink-0">{formatDateTimeFr(r.submittedAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertsPanel def={def} />
    </div>
  );
}

function AlertsPanel({ def }) {
  const uid = useId();
  const [alerts, setAlerts] = useState(() => readPref(alertsKey(def.id), { onNew: true, expr: '' }));
  const [expr, setExpr] = useState(alerts.expr || '');
  const parsed = expr.trim() ? tryParse(expr) : null;
  const save = (next) => { setAlerts(next); writePref(alertsKey(def.id), next); };
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-2" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="text-sm font-semibold text-ink flex items-center gap-1.5"><Bell size={15} aria-hidden="true" /> Alertes sur cet appareil</h3>
      <p className="text-xs text-dim">
        {hasNotificationCenter ? 'Les alertes arrivent dans le centre de notifications (cloche).' : 'Les alertes s\'affichent en notification dans l\'application.'}
        {' '}Vérification à chaque nouvelle réponse reçue pendant que l'application est ouverte (toutes les 30 s en mode connecté).
      </p>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={!!alerts.onNew} onChange={e => save({ ...alerts, onNew: e.target.checked })} /> M'avertir à chaque nouvelle réponse
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[14rem]">
          <label htmlFor={`${uid}-e`} className="block text-xs font-medium text-dim mb-1">M'avertir quand une réponse remplit la condition (formule)</label>
          <input id={`${uid}-e`} className="input font-mono text-xs" placeholder='ex. regime = "vegan" OU budget > 100' value={expr} onChange={e => setExpr(e.target.value)} />
          {parsed?.error && <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{parsed.error.message}</p>}
        </div>
        <button type="button" className="btn-secondary" disabled={!!parsed?.error} onClick={() => { save({ ...alerts, expr: expr.trim() }); toast.success('Alerte enregistrée', expr.trim() ? expr.trim() : 'Condition retirée'); }}>Enregistrer</button>
      </div>
    </section>
  );
}
