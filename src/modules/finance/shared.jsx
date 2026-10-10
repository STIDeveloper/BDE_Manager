// ============================================================
// TRÉSORERIE — petits composants d'interface partagés (aussi utilisés par
// le module Adhésions). Hooks et utilitaires : voir hooks.js.
// ============================================================
import { formatMoney } from '../../documents/context.js';

/** Montant signé coloré. */
export function Amount({ type, amount, className = '' }) {
  const income = type === 'income';
  return (
    <span className={`tabular-nums font-semibold ${income ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} ${className}`}>
      {income ? '+' : '−'}{formatMoney(amount)}
    </span>
  );
}

/** Carte indicateur. */
export function Kpi({ label, value, hint, tone = 'neutral', icon: Icon }) {
  const tones = {
    neutral: 'text-ink', good: 'text-emerald-600 dark:text-emerald-400', bad: 'text-rose-600 dark:text-rose-400', warn: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="bg-surface border border-line rounded-2xl p-4 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-dim">
        {Icon && <Icon size={14} aria-hidden="true" />}<span>{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums mt-1 truncate ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

/** État vide. */
export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="text-center py-10 px-4 text-dim">
      {Icon && <Icon size={28} className="mx-auto mb-2 text-muted" aria-hidden="true" />}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="text-sm mt-1">{children}</div>}
    </div>
  );
}

/** Onglets accessibles (role=tablist), pilotés par la route. */
export function Tabs({ tabs, active, onChange, label }) {
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1">
      {tabs.map((t, i) => {
        const Icon = t.icon;
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`chip shrink-0 py-1.5 ${selected ? 'chip-active' : 'chip-idle'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60`}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}{t.label}
            {t.count ? <span className="badge badge-amber ml-0.5">{t.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
