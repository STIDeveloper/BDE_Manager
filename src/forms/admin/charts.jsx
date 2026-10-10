// ============================================================
// ADMINISTRATION DES RÉPONSES — graphiques SVG maison
// ============================================================
// Accessibles : role="img" + aria-label (synthèse), <title> par barre
// (infobulle au survol), et tableau de données repliable sous chaque
// graphique. Couleurs : palette catégorielle validée (ordre fixe), une
// déclinaison pour le thème sombre (défaut de l'app) et le thème clair.
// ============================================================
import { useId } from 'react';
import { fmtNum } from './analytics.js';

const VIZ_CSS = `
.fa-viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--grid:rgb(var(--c-line));--axis:rgb(var(--c-dim));--track:rgb(var(--c-elevated))}
.light .fa-viz{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948}
.fa-viz svg text{fill:rgb(var(--c-dim));font-size:11px}
.fa-viz .fa-mark:hover,.fa-viz .fa-mark:focus{opacity:.8;outline:none}
`;
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const OTHER_COLOR = 'rgb(var(--c-muted))';

/** Feuille de style des graphiques (à rendre une fois à la racine). */
export function VizStyles() {
  return <style>{VIZ_CSS}</style>;
}

/** Tableau de données repliable (alternative textuelle des graphiques). */
export function DataTable({ columns, rows, caption = 'Données du graphique' }) {
  if (!rows.length) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-dim hover:text-ink select-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">Voir les données</summary>
      <div className="overflow-x-auto mt-1">
        <table className="w-full text-left border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead><tr>{columns.map(c => <th key={c.key} scope="col" className={`py-1 pr-3 font-semibold text-ink border-b border-line ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60">
                {columns.map((c, j) => j === 0
                  ? <th key={c.key} scope="row" className="py-1 pr-3 font-normal text-ink">{r[c.key]}</th>
                  : <td key={c.key} className={`py-1 pr-3 text-dim tabular-nums ${c.align === 'right' ? 'text-right' : ''}`}>{r[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Barres horizontales (répartition des choix, remplissage de créneaux).
 * items : [{ label, value, pct?, capacity? }] ; une seule série : pas de légende.
 */
export function HBarChart({ items, title, unit = 'réponses', showPct = true, maxValue }) {
  const max = maxValue ?? Math.max(1, ...items.map(i => Math.max(i.value, i.capacity || 0)));
  const rowH = 30;
  const summary = `${title} : ${items.slice(0, 6).map(i => `${i.label} ${i.value}`).join(', ')}${items.length > 6 ? '…' : ''}`;
  return (
    <div className="fa-viz">
      <div className="space-y-0" role="img" aria-label={summary}>
        {items.map((it, i) => {
          const w = (it.value / max) * 100;
          const capW = it.capacity ? (it.capacity / max) * 100 : null;
          const full = it.capacity && it.value >= it.capacity;
          return (
            <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] sm:grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-2" style={{ height: rowH }}>
              <span className="text-xs text-ink truncate" title={it.label}>{it.label}</span>
              <svg width="100%" height="18" className="overflow-visible" aria-hidden="true">
                <rect x="0" y="3" width="100%" height="12" rx="4" fill="var(--track)" />
                {w > 0 && <rect className="fa-mark" x="0" y="3" width={`${Math.max(w, 0.8)}%`} height="12" rx="4" fill={full ? 'var(--s8)' : 'var(--s1)'}><title>{`${it.label} : ${it.value} ${unit}${showPct && it.pct !== undefined ? ` (${fmtNum(it.pct)} %)` : ''}${it.capacity ? ` sur ${it.capacity} places` : ''}`}</title></rect>}
                {capW !== null && <line x1={`${capW}%`} x2={`${capW}%`} y1="0" y2="18" stroke="rgb(var(--c-ink))" strokeWidth="2" strokeDasharray="3 2" />}
              </svg>
              <span className="text-xs tabular-nums text-dim text-right min-w-[4.5rem]">
                {fmtNum(it.value, 2)}{it.capacity ? ` / ${it.capacity}` : ''}{showPct && it.pct !== undefined ? ` · ${fmtNum(it.pct, 0)} %` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Colonnes verticales (distribution d'une note, histogramme). items : [{ label, value }] */
export function ColumnChart({ items, title, height = 140, color = 'var(--s1)', unit = 'réponses' }) {
  const max = Math.max(1, ...items.map(i => i.value));
  const n = Math.max(items.length, 1);
  const W = 600, H = height, pad = 22, gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  const summary = `${title} : ${items.map(i => `${i.label} → ${i.value}`).slice(0, 12).join(', ')}`;
  return (
    <div className="fa-viz">
      <svg viewBox={`0 0 ${W} ${H + pad}`} width="100%" role="img" aria-label={summary} preserveAspectRatio="none" style={{ maxHeight: H + pad + 10 }}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--grid)" />
        {items.map((it, i) => {
          const bh = (it.value / max) * (H - 14);
          const x = i * (bw + gap);
          return (
            <g key={i}>
              {it.value > 0 && <path className="fa-mark" tabIndex={-1} d={roundedTop(x, H - bh, bw, bh, Math.min(4, bw / 2))} fill={it.color || color}><title>{`${it.label} : ${it.value} ${unit}`}</title></path>}
              {(n <= 16 || i % Math.ceil(n / 12) === 0) && <text x={x + bw / 2} y={H + 15} textAnchor="middle">{it.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function roundedTop(x, y, w, h, r) {
  if (h <= r) return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Courbe par jour. points : [{ day: 'AAAA-MM-JJ', count }] */
export function LineChart({ points, title, height = 150 }) {
  const gid = useId();
  if (!points.length) return <p className="text-sm text-dim">Pas encore de données.</p>;
  const W = 600, H = height, padB = 20, padL = 28;
  const max = Math.max(1, ...points.map(p => p.count));
  const step = points.length > 1 ? (W - padL - 8) / (points.length - 1) : 0;
  const xy = points.map((p, i) => [padL + i * step, H - (p.count / max) * (H - 14)]);
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const area = `${d}L${xy[xy.length - 1][0]},${H}L${xy[0][0]},${H}Z`;
  const total = points.reduce((a, p) => a + p.count, 0);
  const peak = points.reduce((a, p) => (p.count > a.count ? p : a), points[0]);
  const fmt = k => { const [, m, dd] = k.split('-'); return `${+dd}/${+m}`; };
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <div className="fa-viz">
      <svg viewBox={`0 0 ${W} ${H + padB}`} width="100%" role="img" aria-label={`${title} : ${total} au total sur ${points.length} jours, pic de ${peak.count} le ${fmt(peak.day)}`}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--s1)" stopOpacity="0.25" /><stop offset="1" stopColor="var(--s1)" stopOpacity="0" /></linearGradient></defs>
        {[0, 0.5, 1].map(f => <line key={f} x1={padL} x2={W} y1={H - f * (H - 14)} y2={H - f * (H - 14)} stroke="var(--grid)" strokeDasharray={f ? '2 4' : undefined} />)}
        <text x={padL - 6} y={14} textAnchor="end">{max}</text>
        <text x={padL - 6} y={H} textAnchor="end">0</text>
        <path d={area} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />
        {xy.map(([x, y], i) => (
          <circle key={i} className="fa-mark" cx={x} cy={y} r={points.length > 60 ? 2 : 4} fill="var(--s1)" stroke="rgb(var(--c-surface))" strokeWidth="2">
            <title>{`${fmt(points[i].day)} : ${points[i].count}`}</title>
          </circle>
        ))}
        {ticks.map(i => <text key={i} x={xy[i][0]} y={H + 15} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{fmt(points[i].day)}</text>)}
      </svg>
    </div>
  );
}

/**
 * Barres empilées horizontales (croisement). rows : [{ label, parts: number[] }],
 * series : [{ label }] (≤ 8 couleurs, au-delà « Autres » regroupées par l'appelant).
 */
export function StackedBars({ rows, series, title, percent = true }) {
  return (
    <div className="fa-viz space-y-2">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim" aria-label="Légende">
        {series.map((s, j) => <li key={j} className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: SERIES[j] || OTHER_COLOR }} aria-hidden="true" />{s.label}</li>)}
      </ul>
      <div role="img" aria-label={`${title} (${percent ? 'pourcentages par ligne' : 'effectifs'})`}>
        {rows.map((r, i) => {
          const tot = r.parts.reduce((a, b) => a + b, 0) || 1;
          let acc = 0;
          return (
            <div key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] sm:grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-2 h-7">
              <span className="text-xs text-ink truncate" title={r.label}>{r.label}</span>
              <svg width="100%" height="16" aria-hidden="true">
                {r.parts.map((v, j) => {
                  if (!v) return null;
                  const x = (acc / tot) * 100;
                  const w = (v / tot) * 100;
                  acc += v;
                  return <rect key={j} className="fa-mark" x={`${x}%`} y="2" width={`${w}%`} height="12" fill={SERIES[j] || OTHER_COLOR} stroke="rgb(var(--c-surface))" strokeWidth="2"><title>{`${r.label} — ${series[j]?.label} : ${v} (${fmtNum((v / tot) * 100)} %)`}</title></rect>;
                })}
              </svg>
              <span className="text-xs tabular-nums text-dim">{r.parts.reduce((a, b) => a + b, 0)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Nuage de mots simple (taille proportionnelle à la fréquence). */
export function WordCloud({ words, title }) {
  if (!words.length) return <p className="text-xs text-dim">Pas assez de texte pour un nuage de mots.</p>;
  const max = words[0].count, min = words[words.length - 1].count;
  const size = c => (max === min ? 16 : 12 + ((c - min) / (max - min)) * 18);
  const shuffled = [...words].sort((a, b) => a.word.localeCompare(b.word));
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 items-baseline leading-tight" aria-label={`${title} : ${words.slice(0, 10).map(w => `${w.word} (${w.count})`).join(', ')}`}>
      {shuffled.map(w => (
        <span key={w.word} title={`${w.word} : ${w.count}`} style={{ fontSize: size(w.count) }} className={w.count === max ? 'text-ink font-semibold' : 'text-dim'}>{w.word}</span>
      ))}
    </p>
  );
}

/** Tuile de chiffre clé. */
export function StatTile({ label, value, hint, tone }) {
  return (
    <div className="bg-surface border border-line rounded-2xl p-3 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted truncate">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>{value}</p>
      {hint && <p className="text-[11px] text-dim mt-0.5">{hint}</p>}
    </div>
  );
}
