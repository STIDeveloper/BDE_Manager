// Détail d'une exécution (journal) et résultat d'une simulation.
import { CheckCircle2, XCircle, MinusCircle, ExternalLink, AlertTriangle } from 'lucide-react';
import { navigate } from '../../core/router.js';
import { RUN_STATUS } from '../model.js';


export function StatusBadge({ status }) {
  const meta = RUN_STATUS[status] || (status === 'queued-server' ? { label: 'Approuvée (file serveur)', badge: 'badge-brand' } : { label: status, badge: 'badge-neutral' });
  return <span className={`badge ${meta.badge}`}>{meta.label}</span>;
}

export function ResultLink({ link }) {
  if (link.href) {
    return <a className="btn-ghost !px-2 !py-0.5 text-xs" href={link.href} target={link.href.startsWith('mailto:') ? undefined : '_blank'} rel="noreferrer"><ExternalLink size={12} aria-hidden="true" /> {link.label || 'Ouvrir'}</a>;
  }
  return (
    <button type="button" className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => navigate(link.section, ...(link.rest || []), ...(link.query ? [link.query] : []))}>
      <ExternalLink size={12} aria-hidden="true" /> {link.label || 'Voir'}
    </button>
  );
}

export function ConditionsBlock({ conditions }) {
  if (!conditions || (!conditions.details?.length && !conditions.errors?.length)) return null;
  return (
    <div className="text-xs space-y-1">
      <p className="font-semibold text-dim">Conditions {conditions.ok ? 'remplies' : 'non remplies'}</p>
      <ul className="space-y-0.5">
        {(conditions.details || []).map((d, i) => (
          <li key={i} className="flex gap-1.5 items-start">
            {d.ok ? <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" aria-label="vraie" /> : <XCircle size={12} className="text-rose-500 mt-0.5 shrink-0" aria-label="fausse" />}
            <code className="font-mono break-all text-ink">{d.label}</code>
          </li>
        ))}
      </ul>
      {(conditions.errors || []).length > 0 && <p className="text-amber-600 dark:text-amber-300">Avertissements : {conditions.errors.slice(0, 3).join(' ; ')}</p>}
    </div>
  );
}

export function ActionResults({ actions = [], simulate = false }) {
  if (!actions.length) return null;
  return (
    <ol className="space-y-2">
      {actions.map((a, i) => (
        <li key={`${a.actionId}-${i}`} className="rounded-lg border border-line p-2.5 text-sm">
          <div className="flex items-start gap-2">
            {a.status === 'ok' ? <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" aria-label="réussie" />
              : a.status === 'error' ? <XCircle size={16} className="text-rose-500 mt-0.5 shrink-0" aria-label="échec" />
                : <MinusCircle size={16} className="text-muted mt-0.5 shrink-0" aria-label="ignorée" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{i + 1}. {a.label}{a.reused && <span className="badge badge-neutral ml-2">déjà faite</span>}{!simulate && Number.isFinite(a.durationMs) && <span className="text-[11px] text-muted ml-2">{a.durationMs} ms</span>}</p>
              {a.summary && <p className="text-dim">{a.summary}</p>}
              {a.error && <p className="text-rose-600 dark:text-rose-300">{a.error}</p>}
              {(a.warnings || []).map((w, j) => <p key={j} className="text-xs text-amber-600 dark:text-amber-300 flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{w}</p>)}
              {a.params && Object.keys(a.params).length > 0 && (
                <details className="mt-1">
                  <summary className="text-xs text-muted cursor-pointer">Entrées résolues</summary>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    {Object.entries(a.params).map(([k, v]) => [<dt key={`${k}-k`} className="text-muted">{k}</dt>, <dd key={`${k}-v`} className="text-ink break-all">{String(v)}</dd>])}
                  </dl>
                </details>
              )}
              {(a.links || []).length > 0 && <div className="flex flex-wrap gap-1 mt-1">{a.links.map((l, j) => <ResultLink key={j} link={l} />)}</div>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SimulationResult({ result }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line p-3" role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-violet">Simulation — aucun effet</span>
        <StatusBadge status={result.status} />
      </div>
      <ConditionsBlock conditions={result.conditions} />
      {result.status === 'skipped' && <p className="text-sm text-dim">Les conditions ne sont pas remplies : aucune action ne serait exécutée.</p>}
      <ActionResults actions={result.actions} simulate />
    </div>
  );
}
