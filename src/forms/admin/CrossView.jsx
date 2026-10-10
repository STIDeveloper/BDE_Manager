// Croisement de deux questions : tableau croisé (effectifs, % ligne,
// % colonne) + graphique en barres empilées. Filtres appliqués.
import { useId, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { crossTab, fmtNum } from './analytics.js';
import { StackedBars } from './charts.jsx';
import { readPref, writePref } from './prefs.js';

const MAX_SERIES = 8;

export default function CrossView({ ctx }) {
  const uid = useId();
  const { dims, filtered, def, revealed } = ctx;
  const usable = dims.filter(d => !d.question?.sensitive || revealed);
  const saved = readPref(`cross:${def.id}`, null);
  const [a, setA] = useState(saved?.a && usable.some(d => d.id === saved.a) ? saved.a : usable[0]?.id || '');
  const [b, setB] = useState(saved?.b && usable.some(d => d.id === saved.b) ? saved.b : usable.find(d => d.id === '__status')?.id || usable[1]?.id || '');
  const [view, setView] = useState('row');
  const dimA = usable.find(d => d.id === a);
  const dimB = usable.find(d => d.id === b);
  const ct = dimA && dimB ? crossTab(dimA, dimB, filtered) : null;
  const save = (na, nb) => writePref(`cross:${def.id}`, { a: na, b: nb });

  if (usable.length < 2) return <p className="text-sm text-dim p-6 text-center bg-surface border border-line rounded-2xl">Il faut au moins deux questions à choix ou à note pour croiser.</p>;

  const cellText = (n, i, j) => {
    if (view === 'count') return String(n);
    const base = view === 'row' ? ct.rowTotals[i] : ct.colTotals[j];
    return `${fmtNum(base ? (n / base) * 100 : 0, 0)} %`;
  };
  // Graphique : au-delà de 8 colonnes, regroupement en « Autres »
  const series = ct ? (ct.cols.length > MAX_SERIES ? [...ct.cols.slice(0, MAX_SERIES - 1), { value: '__other', label: 'Autres' }] : ct.cols) : [];
  const stacked = ct ? ct.rows.map((r, i) => ({
    label: r.label,
    parts: ct.cols.length > MAX_SERIES ? [...ct.cells[i].slice(0, MAX_SERIES - 1), ct.cells[i].slice(MAX_SERIES - 1).reduce((x, y) => x + y, 0)] : ct.cells[i],
  })) : [];

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-line rounded-2xl p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor={`${uid}-a`} className="block text-xs font-medium text-dim mb-1">Lignes</label>
          <select id={`${uid}-a`} className="input" value={a} onChange={e => { setA(e.target.value); save(e.target.value, b); }}>{usable.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </div>
        <button type="button" className="btn-ghost !p-2" aria-label="Inverser lignes et colonnes" onClick={() => { setA(b); setB(a); save(b, a); }}><ArrowLeftRight size={16} aria-hidden="true" /></button>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor={`${uid}-b`} className="block text-xs font-medium text-dim mb-1">Colonnes</label>
          <select id={`${uid}-b`} className="input" value={b} onChange={e => { setB(e.target.value); save(a, e.target.value); }}>{usable.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </div>
        <div role="radiogroup" aria-label="Affichage" className="inline-flex gap-1 p-1 bg-elevated border border-line rounded-lg">
          {[['count', 'Effectifs'], ['row', '% ligne'], ['col', '% colonne']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`px-2 py-1 text-xs rounded-md ${view === v ? 'bg-surface text-ink border border-line' : 'text-dim'}`}>{l}</button>
          ))}
        </div>
      </div>

      {ct && a === b && <p className="text-xs text-amber-700 dark:text-amber-300">Choisis deux dimensions différentes.</p>}
      {ct && ct.total === 0 && <p className="text-sm text-dim">Aucune réponse commune aux deux questions.</p>}
      {ct && ct.total > 0 && (
        <>
          <section className="bg-surface border border-line rounded-2xl p-3 overflow-x-auto">
            <table className="text-sm border-collapse min-w-full">
              <caption className="text-left text-xs text-dim pb-2">{dimA.label} × {dimB.label} — {ct.total} réponse(s) croisée(s){view === 'row' ? ', % par ligne' : view === 'col' ? ', % par colonne' : ''}</caption>
              <thead>
                <tr className="text-xs text-dim border-b border-line">
                  <th scope="col" className="text-left p-1.5">{dimA.label}</th>
                  {ct.cols.map(c => <th key={c.value} scope="col" className="p-1.5 text-right font-medium">{c.label}</th>)}
                  <th scope="col" className="p-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {ct.rows.map((r, i) => (
                  <tr key={r.value} className="border-b border-line/60">
                    <th scope="row" className="text-left p-1.5 font-normal text-ink whitespace-nowrap">{r.label}</th>
                    {ct.cells[i].map((n, j) => {
                      const base = view === 'col' ? ct.colTotals[j] : ct.rowTotals[i];
                      const share = base ? n / base : 0;
                      return <td key={j} className="p-1.5 text-right tabular-nums text-ink" style={{ background: `rgba(57,135,229,${share * 0.4})` }} title={`${n} réponse(s)`}>{cellText(n, i, j)}</td>;
                    })}
                    <td className="p-1.5 text-right tabular-nums font-semibold text-ink">{ct.rowTotals[i]}</td>
                  </tr>
                ))}
                <tr className="text-xs text-dim">
                  <th scope="row" className="text-left p-1.5 font-semibold">Total</th>
                  {ct.colTotals.map((n, j) => <td key={j} className="p-1.5 text-right tabular-nums">{n}</td>)}
                  <td className="p-1.5 text-right tabular-nums font-semibold">{ct.total}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <section className="bg-surface border border-line rounded-2xl p-3" aria-label="Graphique empilé">
            <StackedBars title={`${dimA.label} selon ${dimB.label}`} rows={stacked} series={series} />
          </section>
        </>
      )}
    </div>
  );
}
