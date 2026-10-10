// Statistiques par question (filtres appliqués) + analyse par segment.
import { useId, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { questionStats, groupRows, headline, fmtNum } from './analytics.js';
import { HBarChart, ColumnChart, WordCloud, DataTable, StatTile } from './charts.jsx';
import { formatDateTimeFr } from './columns.js';

export default function StatsView({ ctx }) {
  const { filtered, questions, revealed, labelFor } = ctx;
  const [mode, setMode] = useState('questions');
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Type d'analyse" className="inline-flex gap-1 p-1 bg-elevated border border-line rounded-xl">
        {[['questions', 'Par question'], ['segments', 'Par segment']].map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`px-3 py-1 text-sm rounded-lg ${mode === v ? 'bg-surface text-ink border border-line shadow-sm' : 'text-dim'}`}>{l}</button>
        ))}
      </div>
      {filtered.length === 0 ? <p className="text-sm text-dim p-6 text-center bg-surface border border-line rounded-2xl">Aucune réponse à analyser (vérifie les filtres).</p>
        : mode === 'questions' ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {questions.filter(q => q.type !== 'hidden').map(q => <QuestionCard key={q.key} q={q} rows={filtered} revealed={revealed} labelFor={labelFor} />)}
          </div>
        ) : <Segments ctx={ctx} />}
    </div>
  );
}

export function QuestionCard({ q, rows, revealed, labelFor }) {
  const st = useMemo(() => questionStats(q, rows, { labelFor }), [q, rows, labelFor]);
  const hidden = q.sensitive && !revealed;
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-2 min-w-0" aria-label={q.label}>
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{q.label}</h3>
        <span className="text-[11px] text-muted shrink-0">{st.answered} / {st.total} réponses</span>
      </header>
      {hidden ? <p className="text-xs text-dim flex items-center gap-1"><Lock size={12} aria-hidden="true" /> Question sensible : statistiques masquées.</p> : <StatsBody st={st} q={q} />}
    </section>
  );
}

function StatsBody({ st, q }) {
  switch (st.kind) {
    case 'choice': case 'slots':
      return (
        <>
          {st.multi && <p className="text-[11px] text-muted">Choix multiples : les pourcentages se rapportent aux répondants (total &gt; 100 %).</p>}
          <HBarChart title={q.label} items={st.items.map(i => ({ label: i.label, value: i.count, pct: i.pct, capacity: st.kind === 'slots' ? i.capacity : undefined }))} />
          <DataTable columns={[{ key: 'l', label: 'Choix' }, { key: 'n', label: 'Réponses', align: 'right' }, { key: 'p', label: '%', align: 'right' }]} rows={st.items.map(i => ({ l: i.label, n: i.count, p: `${fmtNum(i.pct)} %` }))} caption={q.label} />
        </>
      );
    case 'scale': case 'nps':
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            {st.kind === 'nps'
              ? <><StatTile label="Score NPS" value={st.score ?? '—'} hint="% promoteurs − % détracteurs" /><StatTile label="Promoteurs (9-10)" value={st.promoters} hint={`Passifs ${st.passives}`} /><StatTile label="Détracteurs (0-6)" value={st.detractors} /></>
              : <><StatTile label="Moyenne" value={fmtNum(st.mean)} hint={`sur ${st.dist[st.dist.length - 1]?.value ?? ''}`} /><StatTile label="Médiane" value={fmtNum(st.median)} /><StatTile label="Min · max" value={`${st.min ?? '—'} · ${st.max ?? '—'}`} /></>}
          </div>
          <ColumnChart title={`Distribution — ${q.label}`} items={st.dist.map(d => ({ label: String(d.value), value: d.count, color: st.kind === 'nps' ? (d.value >= 9 ? 'var(--s3)' : d.value <= 6 ? 'var(--s8)' : 'rgb(var(--c-muted))') : undefined }))} />
          {st.kind === 'nps' && <p className="text-[11px] text-dim">Couleurs : détracteurs (0-6), passifs (7-8, gris), promoteurs (9-10).</p>}
          <DataTable columns={[{ key: 'v', label: 'Valeur' }, { key: 'n', label: 'Réponses', align: 'right' }]} rows={st.dist.map(d => ({ v: d.value, n: d.count }))} caption={q.label} />
        </>
      );
    case 'number':
      return (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label="Moyenne" value={fmtNum(st.mean, 2)} /><StatTile label="Médiane" value={fmtNum(st.median, 2)} />
            <StatTile label="Min" value={fmtNum(st.min, 2)} /><StatTile label="Max" value={fmtNum(st.max, 2)} />
          </div>
          {st.money && <p className="text-xs text-dim">Total : {fmtNum(st.sum, 2)} €</p>}
          <ColumnChart title={`Histogramme — ${q.label}`} items={st.bins.map(b => ({ label: fmtNum(b.from, 0), value: b.count }))} />
          <DataTable columns={[{ key: 'r', label: 'Intervalle' }, { key: 'n', label: 'Réponses', align: 'right' }]} rows={st.bins.map(b => ({ r: `${fmtNum(b.from, 1)} – ${fmtNum(b.to, 1)}`, n: b.count }))} caption={q.label} />
        </>
      );
    case 'date':
      return st.byDay.length ? (
        <>
          <p className="text-xs text-dim">Du {st.first.split('-').reverse().join('/')} au {st.last.split('-').reverse().join('/')}</p>
          <ColumnChart title={`Dates — ${q.label}`} items={st.byDay.slice(-60).map(d => ({ label: d.day.slice(5).split('-').reverse().join('/'), value: d.count }))} />
          <DataTable columns={[{ key: 'd', label: 'Date' }, { key: 'n', label: 'Réponses', align: 'right' }]} rows={st.byDay.map(d => ({ d: d.day.split('-').reverse().join('/'), n: d.count }))} caption={q.label} />
        </>
      ) : <p className="text-xs text-dim">Aucune date.</p>;
    case 'time':
      return <><ColumnChart title={`Heures — ${q.label}`} items={st.byHour.map(h => ({ label: `${h.value}h`, value: h.count }))} /><DataTable columns={[{ key: 'h', label: 'Heure' }, { key: 'n', label: 'Réponses', align: 'right' }]} rows={st.byHour.filter(h => h.count).map(h => ({ h: `${h.value} h`, n: h.count }))} /></>;
    case 'text':
      return (
        <>
          <WordCloud words={st.words} title={`Mots fréquents — ${q.label}`} />
          {st.latest.length > 0 && (
            <details className="text-xs"><summary className="cursor-pointer text-dim">Dernières réponses ({st.latest.length})</summary>
              <ul className="mt-1 space-y-1">{st.latest.map(t => <li key={t.id} className="p-2 rounded-lg bg-elevated"><p className="text-ink whitespace-pre-wrap">{t.text}</p><p className="text-muted">{formatDateTimeFr(t.at)}</p></li>)}</ul>
            </details>
          )}
          <DataTable columns={[{ key: 'w', label: 'Mot' }, { key: 'n', label: 'Réponses le contenant', align: 'right' }]} rows={st.words.map(w => ({ w: w.word, n: w.count }))} />
        </>
      );
    case 'ranking':
      return (
        <>
          <HBarChart title={`Rang moyen — ${q.label}`} showPct={false} unit="(rang moyen, 1 = préféré)" maxValue={st.n}
            items={st.items.map(i => ({ label: i.label, value: i.avgRank === null ? 0 : Math.round(i.avgRank * 10) / 10 }))} />
          <p className="text-[11px] text-muted">Barre plus courte = mieux classé.</p>
          <DataTable columns={[{ key: 'l', label: 'Élément' }, { key: 'r', label: 'Rang moyen', align: 'right' }, { key: 'f', label: 'Classé 1er', align: 'right' }]} rows={st.items.map(i => ({ l: i.label, r: fmtNum(i.avgRank), f: `${fmtNum(i.firstPct, 0)} %` }))} />
        </>
      );
    case 'matrix': {
      const max = Math.max(1, ...st.cells.flat());
      return (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse min-w-full">
            <caption className="sr-only">Tableau croisé : {q.label}</caption>
            <thead><tr><th scope="col" className="p-1" />{st.cols.map(c => <th key={c.value} scope="col" className="p-1 text-dim font-medium">{c.label}</th>)}</tr></thead>
            <tbody>
              {st.rows.map((r, i) => (
                <tr key={r.value}>
                  <th scope="row" className="p-1 text-left text-ink font-normal">{r.label}</th>
                  {st.cells[i].map((n, j) => <td key={j} className="p-1 text-center tabular-nums text-ink" style={{ background: `rgba(57,135,229,${(n / max) * 0.45})` }}>{n}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    default:
      return <p className="text-xs text-dim">{headline(st).text} renseignée{st.answered > 1 ? 's' : ''} ({fmtNum(st.total ? (st.answered / st.total) * 100 : 0, 0)} %).</p>;
  }
}

/** Analyse par segment : une question cible, déclinée selon une dimension. */
function Segments({ ctx }) {
  const uid = useId();
  const { filtered, questions, dims, labelFor, revealed } = ctx;
  const targets = questions.filter(q => ['choice', 'picker', 'slots', 'scale', 'nps', 'number', 'ranking'].includes(q.group) && (!q.sensitive || revealed));
  const segDims = dims;
  const eventDims = dims.filter(d => d.question?.type === 'event_picker');
  const [target, setTarget] = useState(targets[0]?.key || '');
  const [seg, setSeg] = useState(eventDims[0]?.id || segDims.find(d => d.id === '__pole')?.id || '__month');
  const q = targets.find(x => x.key === target);
  const dim = segDims.find(d => d.id === seg);
  const groups = useMemo(() => (dim ? groupRows(filtered, dim) : []), [dim, filtered]);
  if (!targets.length) return <p className="text-sm text-dim">Aucune question analysable par segment.</p>;
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-t`} className="block text-xs font-medium text-dim mb-1">Question analysée</label>
          <select id={`${uid}-t`} className="input" value={target} onChange={e => setTarget(e.target.value)}>{targets.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${uid}-s`} className="block text-xs font-medium text-dim mb-1">Segmenter par</label>
          <select id={`${uid}-s`} className="input" value={seg} onChange={e => setSeg(e.target.value)}>
            {segDims.map(d => <option key={d.id} value={d.id}>{d.question?.type === 'event_picker' ? `Événement lié : ${d.label}` : d.label}</option>)}
          </select>
        </div>
      </div>
      {!segDims.some(d => d.id === '__pole') && <p className="text-[11px] text-muted">Segment « pôle du répondant » : disponible quand des réponses sont reliées à des membres.</p>}
      {q && dim && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">{q.label} par {dim.label}</caption>
            <thead><tr className="text-xs text-dim border-b border-line"><th scope="col" className="text-left p-1.5">{dim.label}</th><th scope="col" className="text-right p-1.5">Réponses</th><th scope="col" className="text-left p-1.5">{q.label}</th></tr></thead>
            <tbody>
              {groups.map(g => {
                const st = questionStats(q, g.rows, { labelFor });
                return (
                  <tr key={g.value} className="border-b border-line/60 align-top">
                    <th scope="row" className="text-left p-1.5 font-normal text-ink">{g.label}</th>
                    <td className="text-right p-1.5 tabular-nums text-dim">{g.rows.length}</td>
                    <td className="p-1.5 text-ink">{headline(st).text}
                      {st.items && st.kind !== 'ranking' && (
                        <div className="flex h-2 mt-1 rounded overflow-hidden bg-elevated" aria-hidden="true">
                          {st.items.filter(i => i.count).slice(0, 8).map((i, j) => <span key={i.value} title={`${i.label} : ${i.count}`} style={{ width: `${(i.count / Math.max(1, st.items.reduce((a, x) => a + x.count, 0))) * 100}%`, background: `var(--s${j + 1})` }} />)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
