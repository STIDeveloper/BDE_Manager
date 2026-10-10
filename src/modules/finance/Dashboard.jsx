// Tableau de bord de la trésorerie : solde, mois, exercice, en attente,
// graphique mensuel (SVG fait main) et répartition par catégorie.
import { useMemo, useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Hourglass, Plus, Clock } from 'lucide-react';
import { formatMoney, formatDateShort, isoDate } from '../../documents/context.js';
import { useFinanceStore } from './store.js';
import { balanceAt, totals, monthlySeries, byCategory } from './logic.js';
import { Kpi, Amount, Empty } from './shared.jsx';

const INCOME = '#059669';
const EXPENSE = '#e11d48';

export default function Dashboard({ range, onNew, onShowPending, canWrite }) {
  const transactions = useFinanceStore(s => s.transactions);
  const categories = useFinanceStore(s => s.categories);
  const settings = useFinanceStore(s => s.settings);
  const list = useMemo(() => Object.values(transactions), [transactions]);
  const today = isoDate();

  const data = useMemo(() => {
    const monthStart = `${today.slice(0, 7)}-01`;
    const pending = list.filter(t => t.status === 'pending');
    return {
      balance: balanceAt(transactions, settings),
      month: totals(list, monthStart, ''),
      year: totals(list, range.start, range.endExclusive),
      pendingCount: pending.length,
      pendingNet: pending.reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0),
      series: monthlySeries(list, range),
      incomeCats: byCategory(list, 'income', categories, range.start, range.endExclusive),
      expenseCats: byCategory(list, 'expense', categories, range.start, range.endExclusive),
      recent: [...list].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6),
    };
  }, [list, transactions, settings, categories, range, today]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Wallet} label={`Solde · ${settings.bankLabel || 'compte'}`} value={formatMoney(data.balance)} tone={data.balance < 0 ? 'bad' : 'neutral'}
          hint={settings.openingDate ? `Ouverture ${formatMoney(settings.openingBalance)} au ${formatDateShort(settings.openingDate)}` : 'Opérations validées uniquement'} />
        <Kpi icon={TrendingUp} label="Ce mois-ci" value={formatMoney(data.month.net)} tone={data.month.net < 0 ? 'bad' : 'good'}
          hint={`+${formatMoney(data.month.income)} / −${formatMoney(data.month.expense)}`} />
        <Kpi icon={TrendingDown} label={`Exercice ${range.label}`} value={formatMoney(data.year.net)} tone={data.year.net < 0 ? 'bad' : 'good'}
          hint={`+${formatMoney(data.year.income)} / −${formatMoney(data.year.expense)}`} />
        <button type="button" onClick={onShowPending} className="text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-label={`${data.pendingCount} opérations en attente : afficher`}>
          <Kpi icon={Hourglass} label="En attente de validation" value={String(data.pendingCount)} tone={data.pendingCount ? 'warn' : 'neutral'}
            hint={data.pendingCount ? `Impact ${formatMoney(data.pendingNet)} si validées` : 'Rien à valider'} />
        </button>
      </div>

      <section className="bg-surface border border-line rounded-2xl p-4" aria-labelledby="fin-chart-title">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 id="fin-chart-title" className="font-semibold text-ink">Recettes et dépenses par mois · {range.label}</h2>
          <div className="flex gap-3 text-xs text-dim" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: INCOME }} />Recettes</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: EXPENSE }} />Dépenses</span>
          </div>
        </div>
        <MonthlyChart series={data.series} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <CategoryBreakdown title="Dépenses par catégorie" data={data.expenseCats} />
        <CategoryBreakdown title="Recettes par catégorie" data={data.incomeCats} />
      </div>

      <section className="bg-surface border border-line rounded-2xl p-4" aria-labelledby="fin-recent">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 id="fin-recent" className="font-semibold text-ink">Dernières opérations</h2>
          {canWrite && <button type="button" className="btn-primary" onClick={onNew}><Plus size={14} aria-hidden="true" /> Saisir</button>}
        </div>
        {data.recent.length === 0 ? (
          <Empty icon={Clock} title="Aucune opération pour l'instant">Saisis ta première recette ou dépense, ou importe un relevé bancaire.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map(t => (
              <li key={t.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="text-xs text-muted w-20 shrink-0 tabular-nums">{formatDateShort(t.date)}</span>
                <span className="flex-1 min-w-0 truncate text-ink">{t.label}</span>
                {t.status !== 'validated' && <span className={`badge ${t.status === 'rejected' ? 'badge-rose' : 'badge-amber'}`}>{t.status === 'rejected' ? 'Rejetée' : 'En attente'}</span>}
                <Amount type={t.type} amount={t.amount} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Histogramme groupé, accessible (role=img + tableau équivalent masqué). */
function MonthlyChart({ series }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(100, ...series.flatMap(m => [m.income, m.expense]));
  const W = 720; const H = 220; const padL = 56; const padB = 24; const padT = 8;
  const plotW = W - padL - 8; const plotH = H - padB - padT;
  const slot = plotW / series.length;
  const barW = Math.max(4, Math.min(18, slot / 2 - 4));
  const nice = niceMax(max);
  const y = (v) => padT + plotH - (v / nice) * plotH;
  const ticks = [0, nice / 2, nice];
  const empty = series.every(m => !m.income && !m.expense);
  const summary = empty ? 'Aucune opération validée sur l\'exercice.'
    : `Histogramme mensuel. ${series.filter(m => m.income || m.expense).map(m => `${m.label} ${m.year} : recettes ${formatMoney(m.income)}, dépenses ${formatMoney(m.expense)}`).join(' ; ')}.`;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={summary}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="fill-muted" fontSize="11">{compactMoney(t)}</text>
          </g>
        ))}
        {series.map((m, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={m.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent" />
              {m.income > 0 && <rect x={cx - barW - 1} y={y(m.income)} width={barW} height={Math.max(1, y(0) - y(m.income))} rx="3" fill={INCOME} />}
              {m.expense > 0 && <rect x={cx + 1} y={y(m.expense)} width={barW} height={Math.max(1, y(0) - y(m.expense))} rx="3" fill={EXPENSE} />}
              <text x={cx} y={H - 6} textAnchor="middle" className={hover === i ? 'fill-ink' : 'fill-muted'} fontSize="11">{m.label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (series[hover].income || series[hover].expense) ? (
        <div className="absolute top-1 right-1 bg-elevated border border-line rounded-lg px-2 py-1 text-xs shadow pointer-events-none" aria-hidden="true">
          <div className="font-medium text-ink">{series[hover].label} {series[hover].year}</div>
          <div className="text-dim">Recettes {formatMoney(series[hover].income)}</div>
          <div className="text-dim">Dépenses {formatMoney(series[hover].expense)}</div>
        </div>
      ) : null}
      {empty && <p className="text-sm text-dim text-center -mt-24 mb-16">Aucune opération validée sur cet exercice.</p>}
      <table className="sr-only">
        <caption>Recettes et dépenses validées par mois</caption>
        <thead><tr><th scope="col">Mois</th><th scope="col">Recettes</th><th scope="col">Dépenses</th></tr></thead>
        <tbody>{series.map(m => <tr key={m.key}><th scope="row">{m.label} {m.year}</th><td>{formatMoney(m.income)}</td><td>{formatMoney(m.expense)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const compactMoney = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`);

function CategoryBreakdown({ title, data }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-semibold text-ink">{title}</h2>
        <span className="text-sm text-dim tabular-nums">{formatMoney(data.total)}</span>
      </div>
      {data.items.length === 0 ? <p className="text-sm text-dim">Aucune opération validée sur l'exercice.</p> : (
        <ul className="space-y-2">
          {data.items.map(it => (
            <li key={it.categoryId}>
              <div className="flex justify-between text-sm gap-2">
                <span className="text-ink truncate">{it.label}</span>
                <span className="text-dim tabular-nums shrink-0">{formatMoney(it.amount)} · {Math.round(it.share * 100)} %</span>
              </div>
              <div className="h-2 bg-elevated rounded-full mt-1 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, it.share * 100)}%`, background: it.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
