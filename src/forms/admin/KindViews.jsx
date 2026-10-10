// Vues propres à un type de formulaire : quiz (scores, réussite par
// question), enquêtes (comparaison entre formulaires / éditions),
// réservations (planning par créneau).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { useFormsStore } from '../../modules/forms/store.js';
import { quizStats, slotPlanning, matchQuestions, questionStats, headline, fmtNum } from './analytics.js';
import { ColumnChart, HBarChart, DataTable, StatTile } from './charts.jsx';
import { createResponsesRepo } from './responsesRepo.js';
import { respondentLabel } from './columns.js';
import { formsApi, useBackendState } from './integrations.js';

export function QuizView({ ctx }) {
  const { def, filtered } = ctx;
  const [passPct, setPassPct] = useState(50);
  const qs = useMemo(() => quizStats(def, filtered, passPct), [def, filtered, passPct]);
  if (!qs.n) return <p className="text-sm text-dim p-6 text-center bg-surface border border-line rounded-2xl">Aucun score calculable (vérifie les bonnes réponses dans l'éditeur, ou les filtres).</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <StatTile label="Participants notés" value={qs.n} />
        <StatTile label="Score moyen" value={`${fmtNum(qs.mean)} / ${fmtNum(qs.maxScore)}`} hint={`Médiane ${fmtNum(qs.median)}`} />
        <StatTile label="Min · max" value={`${fmtNum(qs.min)} · ${fmtNum(qs.max)}`} />
        <StatTile label="Taux de réussite" value={qs.passRate === null ? '—' : `${fmtNum(qs.passRate, 0)} %`} hint={`Seuil : ${fmtNum(qs.threshold)} pts`} />
      </div>
      <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Distribution des scores</h3>
          <label className="text-xs text-dim inline-flex items-center gap-1">Seuil de réussite
            <input type="number" min="0" max="100" className="input !w-20 !py-1" value={passPct} onChange={e => setPassPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /> %
          </label>
        </div>
        <ColumnChart title="Distribution des scores" items={qs.bins.map(b => ({ label: fmtNum(b.from, 1), value: b.count }))} />
        <DataTable columns={[{ key: 'r', label: 'Score' }, { key: 'n', label: 'Participants', align: 'right' }]} rows={qs.bins.map(b => ({ r: `${fmtNum(b.from, 1)} – ${fmtNum(b.to, 1)}`, n: b.count }))} />
      </section>
      <section className="bg-surface border border-line rounded-2xl p-4 space-y-2">
        <h3 className="text-sm font-semibold text-ink">Réussite par question</h3>
        <HBarChart title="Réussite par question" unit="réussites" items={qs.perQuestion.map(p => ({ label: p.label, value: p.success, pct: p.successPct }))} />
        <DataTable columns={[{ key: 'q', label: 'Question' }, { key: 's', label: 'Réussite', align: 'right' }, { key: 'p', label: 'Points moyens', align: 'right' }]}
          rows={qs.perQuestion.map(p => ({ q: p.label, s: `${fmtNum(p.successPct, 0)} %`, p: `${fmtNum(p.avgPoints, 2)} / ${fmtNum(p.max)}` }))} />
      </section>
    </div>
  );
}

const selectWorkspace = s => s.workspaceId;
const useWorkspaceId = useBackendState ? () => useBackendState(selectWorkspace) : () => null;

/** Comparaison d'enquêtes (ex. satisfaction WEI 2026 vs 2027) : questions appariées par clé ou intitulé. */
export function CompareView({ ctx }) {
  const uid = useId();
  const { def, filtered, labelFor } = ctx;
  const definitions = useFormsStore(s => s.definitions);
  const publications = useFormsStore(s => s.publications);
  const workspaceId = useWorkspaceId();
  const others = useMemo(() => Object.values(definitions).filter(d => d.id !== def.id).sort((a, b) => (a.kind === def.kind ? -1 : 1) - (b.kind === def.kind ? -1 : 1) || String(b.updatedAt).localeCompare(String(a.updatedAt))), [definitions, def.id, def.kind]);
  const [picked, setPicked] = useState([]);
  const [data, setData] = useState({});
  const requested = useRef(new Set());

  useEffect(() => {
    let alive = true;
    picked.filter(id => !requested.current.has(id)).forEach(id => {
      const d = definitions[id];
      if (!d) return;
      const serverFormId = publications[id]?.serverFormId;
      const mode = workspaceId && formsApi && serverFormId ? 'server' : 'local';
      requested.current.add(id);
      Promise.resolve().then(() => createResponsesRepo({ def: d, mode, serverFormId }).loadAll({}))
        .then(res => { if (alive) setData(p => ({ ...p, [id]: { rows: res.rows } })); })
        .catch(err => { if (alive) setData(p => ({ ...p, [id]: { error: err?.message || String(err) } })); })
        .finally(() => { if (!alive) requested.current.delete(id); });
    });
    return () => { alive = false; };
  }, [picked, definitions, publications, workspaceId]);

  const pickedDefs = picked.map(id => definitions[id]).filter(Boolean);
  const matched = useMemo(() => matchQuestions(def, pickedDefs), [def, pickedDefs]);
  return (
    <div className="space-y-3">
      <section className="bg-surface border border-line rounded-2xl p-3 space-y-2">
        <p className="text-xs text-dim">Compare ce formulaire (réponses filtrées) avec d'autres éditions : les questions sont appariées par clé, sinon par intitulé identique.</p>
        <fieldset className="flex flex-wrap gap-2"><legend className="sr-only">Formulaires à comparer</legend>
          {others.length === 0 && <p className="text-sm text-dim">Aucun autre formulaire.</p>}
          {others.slice(0, 30).map(o => (
            <label key={o.id} className="inline-flex items-center gap-1.5 text-sm text-ink px-2 py-1 rounded-lg border border-line">
              <input type="checkbox" checked={picked.includes(o.id)} disabled={!picked.includes(o.id) && picked.length >= 3}
                onChange={e => setPicked(p => (e.target.checked ? [...p, o.id] : p.filter(x => x !== o.id)))} /> {o.title}
            </label>
          ))}
        </fieldset>
        {picked.length >= 3 && <p className="text-[11px] text-muted">3 formulaires maximum.</p>}
      </section>
      {pickedDefs.length > 0 && (
        <section className="bg-surface border border-line rounded-2xl overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">Comparaison</caption>
            <thead><tr className="text-xs text-dim border-b border-line">
              <th scope="col" className="text-left p-2">Question</th>
              <th scope="col" className="text-left p-2">{def.title} <span className="font-normal">({filtered.length})</span></th>
              {pickedDefs.map(d => <th key={d.id} scope="col" className="text-left p-2">{d.title} <span className="font-normal">{data[d.id]?.rows ? `(${data[d.id].rows.length})` : ''}</span></th>)}
            </tr></thead>
            <tbody>
              {matched.map(({ question, matches }) => {
                const base = headline(questionStats(question, filtered, { labelFor }));
                return (
                  <tr key={question.key} className="border-b border-line/60 align-top">
                    <th scope="row" className="text-left p-2 font-normal text-ink">{question.label}</th>
                    <td className="p-2 text-ink">{base.text}</td>
                    {pickedDefs.map((d, i) => {
                      const st = data[d.id];
                      const m = matches[i];
                      if (!st) return <td key={d.id} className="p-2"><Loader2 size={13} className="animate-spin text-dim" aria-label="Chargement" /></td>;
                      if (st.error) return <td key={d.id} className="p-2 text-xs text-red-600">{st.error}</td>;
                      if (!m) return <td key={d.id} className="p-2 text-xs text-muted">Question absente</td>;
                      const h = headline(questionStats(m, st.rows, { labelFor }));
                      const delta = typeof base.value === 'number' && typeof h.value === 'number' && ['scale', 'nps', 'number'].includes(question.group) ? base.value - h.value : null;
                      return <td key={d.id} className="p-2 text-ink">{h.text}{delta !== null && <span className={`block text-[11px] ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>écart : {delta >= 0 ? '+' : ''}{fmtNum(delta)} pour ce formulaire</span>}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {matched.length === 0 && <p className="p-3 text-sm text-dim">Aucune question comparable (notes, NPS, nombres, choix).</p>}
          <p className="sr-only" id={`${uid}-n`}>Fin de la comparaison</p>
        </section>
      )}
    </div>
  );
}

/** Planning des réservations : remplissage par créneau + inscrits. */
export function PlanningView({ ctx }) {
  const { def, filtered, questions, memberName } = ctx;
  const plans = useMemo(() => slotPlanning(def, filtered), [def, filtered]);
  if (!plans.length) return <p className="text-sm text-dim p-6 text-center bg-surface border border-line rounded-2xl">Aucune question de créneaux (ou d'options à capacité) dans ce formulaire.</p>;
  return (
    <div className="space-y-3">
      {plans.map(p => (
        <section key={p.key} className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-label={p.label}>
          <h3 className="text-sm font-semibold text-ink">{p.label}</h3>
          <HBarChart title={p.label} unit="inscrits" showPct={false} items={p.slots.map(s => ({ label: s.label, value: s.count, capacity: s.capacity }))} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {p.slots.map(s => {
              const full = s.capacity !== null && s.count >= s.capacity;
              return (
                <details key={s.value} className="rounded-xl border border-line p-2">
                  <summary className="cursor-pointer text-sm text-ink flex items-center gap-2">
                    <span className="flex-1 truncate">{s.label}</span>
                    <span className={`badge ${full ? 'badge-rose' : 'badge-emerald'}`}><Users size={11} aria-hidden="true" /> {s.count}{s.capacity !== null ? ` / ${s.capacity}` : ''}</span>
                    {s.waitlisted > 0 && <span className="badge badge-violet">+{s.waitlisted} attente</span>}
                  </summary>
                  <ul className="mt-1 text-xs text-dim max-h-48 overflow-auto">
                    {s.rows.map(r => (
                      <li key={r.id}><button type="button" className="hover:underline text-left" onClick={() => ctx.openRow(r.id)}>{respondentLabel(r, questions, memberName) || 'Anonyme'}{r.waitlisted ? ' (attente)' : ''}</button></li>
                    ))}
                    {!s.rows.length && <li>Aucun inscrit.</li>}
                  </ul>
                  {s.capacity !== null && <p className="text-[11px] text-muted mt-1">{Math.max(0, s.capacity - s.count)} place(s) restante(s)</p>}
                </details>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
