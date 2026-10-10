import { useId } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Circle, FileText, Info, PartyPopper,
  Repeat, ShieldAlert, Users, Wallet,
} from 'lucide-react';
import { navigate } from '../../core/router.js';
import { formatDateLong, formatMoney } from '../../documents/context.js';
import { WIDGETS } from './logic.js';
import { go } from './nav.js';

const card = 'bg-surface border border-line rounded-2xl p-4';

// ------------------------------------------------------------
// Bandeau d'accueil + santé
// ------------------------------------------------------------
const LEVEL = {
  good: { label: 'Bonne santé', ring: 'text-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
  warning: { label: 'À surveiller', ring: 'text-amber-500', text: 'text-amber-700 dark:text-amber-300', Icon: Info },
  critical: { label: 'Points critiques', ring: 'text-rose-500', text: 'text-rose-700 dark:text-rose-300', Icon: ShieldAlert },
};

export function HealthBanner({ name, orgName, year, health }) {
  const lvl = LEVEL[health.level];
  const C = 2 * Math.PI * 26;
  return (
    <section className={`${card} flex flex-col lg:flex-row gap-4`} aria-label="Accueil et santé de l'association">
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-bold text-ink">Bonjour{name ? ` ${name}` : ''} 👋</h2>
        <p className="text-sm text-dim mt-0.5">{orgName} · Année universitaire {year}</p>
        <div className="flex items-center gap-4 mt-4">
          <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Score de santé : ${health.score} sur 100, ${lvl.label}`}>
            <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" className="stroke-current text-elevated" />
              <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                className={`stroke-current ${lvl.ring}`} strokeDasharray={C} strokeDashoffset={C * (1 - health.score / 100)} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-ink" aria-hidden="true">{health.score}</span>
          </div>
          <div>
            <p className={`font-semibold flex items-center gap-1.5 ${lvl.text}`}><lvl.Icon size={16} aria-hidden="true" /> {lvl.label}</p>
            <p className="text-xs text-dim">Score de santé sur 100 : moyenne des {health.parts.length} critères ci-contre.</p>
          </div>
        </div>
      </div>
      <ul className="lg:w-[55%] space-y-2" aria-label="Détail du score de santé">
        {health.parts.map(p => {
          const pct = Math.round(p.score * 100);
          const tone = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
          return (
            <li key={p.id}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-ink">{p.label}</span>
                <span className="text-xs text-dim tabular-nums">{pct} %</span>
              </div>
              <div className="h-1.5 rounded-full bg-elevated overflow-hidden mt-1" role="progressbar" aria-label={p.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-dim mt-0.5">{p.detail}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ------------------------------------------------------------
// Cartes KPI
// ------------------------------------------------------------
export function KpiCard({ icon: Icon, label, value, sub, alert, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${card} text-left w-full hover:border-line-strong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-60 disabled:cursor-default`}>
      <span className="flex items-center justify-between gap-2 text-xs font-medium text-dim">
        <span className="flex items-center gap-1.5"><Icon size={14} aria-hidden="true" /> {label}</span>
        {!disabled && <ArrowRight size={13} aria-hidden="true" />}
      </span>
      <span className="block text-2xl font-bold text-ink mt-1.5 tabular-nums">{value}</span>
      {sub && <span className={`block text-xs mt-0.5 ${alert ? 'text-amber-700 dark:text-amber-300' : 'text-dim'}`}>{sub}</span>}
    </button>
  );
}

export function KpiGrid({ data, hasFinance, hasMembership }) {
  const { active, vac, membership, treasury, events, suggestions, handoversInProgress, candidates } = data;
  const high = suggestions.filter(s => s.priority === 'high').length;
  return (
    <section aria-label="Indicateurs clés" className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-3">
      <KpiCard icon={Users} label="Membres actifs" value={active.length}
        sub={vac.essentialVacant.length ? `${vac.essentialVacant.length} poste(s) essentiel(s) vacant(s) · ${vac.seats} place(s) libre(s)` : `${vac.seats} place(s) libre(s) au catalogue`}
        alert={vac.essentialVacant.length > 0} onClick={() => navigate('kanban')} />
      <KpiCard icon={Users} label={`Adhésions ${membership.campaign}`} value={`${membership.paid}/${membership.total}`}
        sub={`${formatMoney(membership.amount)} encaissés${membership.source === 'fiches' ? ' (d\'après les fiches membres)' : ''}`}
        onClick={() => navigate(hasMembership ? 'membership' : 'kanban')} />
      {hasFinance && treasury ? (
        <KpiCard icon={Wallet} label="Solde de trésorerie" value={formatMoney(treasury.balance)}
          sub={treasury.pendingCount ? `${treasury.pendingCount} dépense(s) à valider (${formatMoney(treasury.pendingAmount)})` : 'Aucune dépense en attente'}
          alert={treasury.pendingCount > 0} onClick={() => navigate('finance')} />
      ) : (
        <KpiCard icon={Wallet} label="Trésorerie" value="—" sub="Module trésorerie non installé" disabled />
      )}
      <KpiCard icon={PartyPopper} label="Prochains événements" value={events.count}
        sub={events.next ? `${events.registered} inscrit(s) · prochain : ${events.next.title} (${formatDateLong(events.next.start)})` : 'Aucun événement à venir'}
        onClick={() => navigate('events')} />
      <KpiCard icon={FileText} label="Documents à produire" value={suggestions.length}
        sub={high ? `dont ${high} prioritaire(s)` : suggestions.length ? 'Suggestions du studio documents' : 'Rien à produire'}
        alert={high > 0} onClick={() => navigate('documents')} />
      <KpiCard icon={Repeat} label="Passations en cours" value={handoversInProgress.length}
        sub={candidates.length ? `${candidates.length} à prévoir (fins de mandat)` : 'Aucune à prévoir'}
        alert={candidates.length > 0} onClick={() => navigate('handover')} />
    </section>
  );
}

// ------------------------------------------------------------
// À traiter
// ------------------------------------------------------------
const PRIO = {
  high: { label: 'Urgent', badge: 'badge-rose' },
  medium: { label: 'À faire', badge: 'badge-amber' },
  low: { label: 'À prévoir', badge: 'badge-neutral' },
};

export function TodoList({ items, resolve }) {
  return (
    <section className={card} aria-labelledby="dash-todo-title">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 id="dash-todo-title" className="font-semibold text-ink flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" /> À traiter</h3>
        <span className="badge badge-neutral">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-dim flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-500" aria-hidden="true" /> Rien d'urgent : tout est à jour.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.slice(0, 12).map(t => {
            const target = resolve(t.action);
            return (
              <li key={t.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <span className={`badge ${PRIO[t.priority].badge} shrink-0`}>{PRIO[t.priority].label}</span>
                <div className="min-w-0 flex-1 basis-[60%]">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-dim">{t.category}{t.detail ? ` · ${t.detail}` : ''}</p>
                </div>
                {target && (
                  <button type="button" className="btn-secondary text-xs py-1.5 shrink-0 ml-auto" onClick={() => go(target)}
                    aria-label={`${t.action.label} : ${t.title}`}>
                    {t.action.label} <ArrowRight size={13} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 12 && <p className="text-xs text-dim mt-2">+ {items.length - 12} autre(s) point(s) moins prioritaire(s).</p>}
    </section>
  );
}

// ------------------------------------------------------------
// Trésorerie : solde de fin de mois (6 mois)
// ------------------------------------------------------------
export function TreasuryChart({ treasury, available }) {
  const uid = useId();
  if (!available) {
    return (
      <section className={card} aria-label="Trésorerie">
        <h3 className="font-semibold text-ink flex items-center gap-2 mb-2"><Wallet size={16} aria-hidden="true" /> Trésorerie</h3>
        <p className="text-sm text-dim">Le module trésorerie n'est pas installé.</p>
      </section>
    );
  }
  const s = treasury.series;
  const W = 320; const H = 150; const top = 18; const bottom = 22; const plotH = H - top - bottom;
  const max = Math.max(0, ...s.map(x => x.balance));
  const min = Math.min(0, ...s.map(x => x.balance));
  const span = max - min || 1;
  const y = (v) => top + ((max - v) / span) * plotH;
  const step = W / s.length;
  const bw = Math.min(28, step * 0.5);
  const zero = y(0);
  const last = s[s.length - 1];
  return (
    <section className={card} aria-labelledby={`${uid}-t`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 id={`${uid}-t`} className="font-semibold text-ink flex items-center gap-2"><Wallet size={16} aria-hidden="true" /> Solde de fin de mois</h3>
        <button type="button" className="btn-ghost text-xs" onClick={() => navigate('finance')}>Trésorerie <ArrowRight size={13} aria-hidden="true" /></button>
      </div>
      <p className="text-xs text-dim mb-2">Opérations validées, 6 derniers mois · solde actuel {formatMoney(treasury.balance)}</p>
      {!treasury.hasData ? <p className="text-sm text-dim">Aucune opération enregistrée.</p> : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Solde de fin de mois sur 6 mois, de ${formatMoney(s[0].balance)} à ${formatMoney(last.balance)}`}>
            <line x1="0" x2={W} y1={zero} y2={zero} className="stroke-current text-line" strokeWidth="1" />
            {s.map((p, i) => {
              const x = i * step + (step - bw) / 2;
              const yv = y(p.balance);
              const h = Math.max(1, Math.abs(zero - yv));
              const neg = p.balance < 0;
              return (
                <g key={p.key}>
                  <title>{`${p.label} : solde ${formatMoney(p.balance)} — recettes ${formatMoney(p.income)}, dépenses ${formatMoney(p.expense)}`}</title>
                  <rect x={i * step} y={top} width={step} height={plotH} fill="transparent" />
                  <rect x={x} y={neg ? zero : yv} width={bw} height={h} rx="4"
                    className={`fill-current ${neg ? 'text-rose-500' : i === s.length - 1 ? 'text-blue-500' : 'text-blue-500/50'}`} />
                  <text x={i * step + step / 2} y={H - 6} textAnchor="middle" className="fill-current text-dim" fontSize="10">{p.label}</text>
                  {(i === s.length - 1 || i === 0) && (
                    <text x={i * step + step / 2} y={(neg ? zero + h + 12 : yv - 5)} textAnchor="middle" className="fill-current text-ink" fontSize="10" fontWeight="600">{formatMoney(p.balance).replace(',00', '')}</text>
                  )}
                </g>
              );
            })}
          </svg>
          <table className="sr-only">
            <caption>Solde de fin de mois</caption>
            <thead><tr><th scope="col">Mois</th><th scope="col">Solde</th><th scope="col">Recettes</th><th scope="col">Dépenses</th></tr></thead>
            <tbody>{s.map(p => <tr key={p.key}><th scope="row">{p.key}</th><td>{formatMoney(p.balance)}</td><td>{formatMoney(p.income)}</td><td>{formatMoney(p.expense)}</td></tr>)}</tbody>
          </table>
          {treasury.pendingCount > 0 && <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{treasury.pendingCount} dépense(s) en attente de validation ({formatMoney(treasury.pendingAmount)}) non comptée(s).</p>}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Membres par pôle
// ------------------------------------------------------------
export function PoleBars({ rows, poleColor, total }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <section className={card} aria-labelledby="dash-poles-title">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 id="dash-poles-title" className="font-semibold text-ink flex items-center gap-2"><Users size={16} aria-hidden="true" /> Membres par pôle</h3>
        <button type="button" className="btn-ghost text-xs" onClick={() => navigate('org')}>Organisation <ArrowRight size={13} aria-hidden="true" /></button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-dim">Aucun membre actif.</p> : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-ink truncate">{r.label}</span>
                <span className="text-dim tabular-nums">{r.count} <span className="sr-only">membre(s), </span><span className="text-muted text-xs">({Math.round((r.count / total) * 100)} %)</span></span>
              </div>
              <div className="h-2 rounded-full bg-elevated mt-1 overflow-hidden" aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: r.color ? poleColor(r.id) : 'rgb(var(--c-muted))' }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Dernières activités
// ------------------------------------------------------------
const KIND = {
  document: { Icon: FileText, label: 'Document' },
  finance: { Icon: Wallet, label: 'Trésorerie' },
  event: { Icon: PartyPopper, label: 'Événement' },
  handover: { Icon: Repeat, label: 'Passation' },
};

function relTime(iso, now) {
  const d = new Date(iso);
  const mins = Math.round((now - d) / 60000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ActivityList({ items, now }) {
  return (
    <section className={card} aria-labelledby="dash-activity-title">
      <h3 id="dash-activity-title" className="font-semibold text-ink mb-2">Dernières activités</h3>
      {items.length === 0 ? <p className="text-sm text-dim">Aucune activité récente.</p> : (
        <ul className="space-y-0.5">
          {items.map(a => {
            const k = KIND[a.kind];
            return (
              <li key={a.id}>
                <button type="button" onClick={() => go(a.action)}
                  className="w-full text-left flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
                  <k.Icon size={15} className="text-dim shrink-0" aria-label={k.label} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink truncate">{a.title}</span>
                    {a.detail && <span className="block text-xs text-dim truncate">{a.detail}</span>}
                  </span>
                  {a.amount !== undefined && <span className={`text-xs tabular-nums shrink-0 ${a.amount < 0 ? 'text-ink' : 'text-emerald-700 dark:text-emerald-300'}`}>{a.amount > 0 ? '+' : ''}{formatMoney(a.amount)}</span>}
                  <span className="text-xs text-muted shrink-0">{relTime(a.at, now)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Accueil d'une nouvelle installation
// ------------------------------------------------------------
export function Welcome({ steps }) {
  return (
    <section className={`${card} p-6`} aria-labelledby="dash-welcome-title">
      <h2 id="dash-welcome-title" className="text-2xl font-bold text-ink">Bienvenue dans BDE Manager 👋</h2>
      <p className="text-sm text-dim mt-1">Ton tableau de bord se remplira au fil de tes données. Commence par :</p>
      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
            {s.done ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" aria-hidden="true" /> : <Circle size={18} className="text-muted shrink-0" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink">{i + 1}. {s.title}<span className="sr-only">{s.done ? ' (fait)' : ''}</span></p>
              <p className="text-xs text-dim">{s.desc}</p>
            </div>
            <button type="button" className={s.done ? 'btn-ghost' : 'btn-primary'} onClick={s.onClick}>{s.cta} <ArrowRight size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------
// Personnalisation
// ------------------------------------------------------------
export function CustomizePanel({ order, hidden, onChange, onReset, onClose }) {
  const label = (id) => WIDGETS.find(w => w.id === id)?.label || id;
  const move = (i, dir) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ order: next, hidden: [...hidden] });
  };
  const toggle = (id) => {
    const h = new Set(hidden);
    if (h.has(id)) h.delete(id); else h.add(id);
    onChange({ order, hidden: [...h] });
  };
  return (
    <section className={card} aria-labelledby="dash-custom-title">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 id="dash-custom-title" className="font-semibold text-ink">Personnaliser le tableau de bord</h3>
        <div className="flex gap-1">
          <button type="button" className="btn-ghost text-xs" onClick={onReset}>Réinitialiser</button>
          <button type="button" className="btn-secondary text-xs" onClick={onClose}>Terminé</button>
        </div>
      </div>
      <ul className="divide-y divide-line">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-2 py-2">
            <label className="flex items-center gap-2 flex-1 text-sm text-ink">
              <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggle(id)} />
              {label(id)}
            </label>
            <button type="button" className="btn-ghost p-1.5" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter « ${label(id)} »`}><ArrowUp size={14} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost p-1.5" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre « ${label(id)} »`}><ArrowDown size={14} aria-hidden="true" /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
