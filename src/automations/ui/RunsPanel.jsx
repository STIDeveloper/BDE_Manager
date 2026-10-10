// File d'approbation et journal des exécutions.
import { useId, useMemo, useState } from 'react';
import { Check, X, RotateCcw, Play, Trash2, Repeat, RefreshCw, ShieldCheck, Inbox } from 'lucide-react';
import { useCan } from '../../core/permissions.js';
import { useFormsStore } from '../../modules/forms/store.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { useAutomationsStore } from '../store.js';
import { decideLocalRun, executeRun } from '../pipeline.js';
import { runNow, decideServerRun } from '../runner.js';
import { getAction } from '../actions/index.js';
import { RUN_STATUS } from '../model.js';
import { useServerData } from './data.js';
import { StatusBadge, ConditionsBlock, ActionResults } from './RunDetails.jsx';
import { fmtDate } from './format.js';

const selectRuns = s => s.runs;
const selectResponses = s => s.responses;
const selectAutos = s => s.automations;
const selectDefs = s => s.definitions;
const selectServerRuns = s => s.runs;
const selectServerAutos = s => s.automations;

function responseLabel(r, defs) {
  if (!r) return null;
  const form = defs[r.formId]?.title || 'Formulaire';
  const who = r.respondent?.email || (typeof r.answers?.email === 'string' ? r.answers.email : '') || '';
  return `${form} — ${fmtDate(r.submittedAt)}${who ? ` — ${who}` : ''}`;
}

export function ApprovalsPanel({ connected }) {
  const canValidate = useCan('forms', 'validate');
  const runs = useAutomationsStore(selectRuns);
  const responses = useAutomationsStore(selectResponses);
  const autos = useAutomationsStore(selectAutos);
  const defs = useFormsStore(selectDefs);
  const serverRuns = useServerData(selectServerRuns);
  const serverAutos = useServerData(selectServerAutos);
  const [busy, setBusy] = useState(null);

  const localPending = useMemo(() => Object.values(runs).filter(r => r.status === 'pending_approval' && r.mode !== 'server')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))), [runs]);
  const serverPending = useMemo(() => (connected ? serverRuns.filter(r => r.status === 'pending_approval') : []), [connected, serverRuns]);
  const autoName = (id) => serverAutos.find(a => a.id === id)?.name || autos[id]?.name || 'Automatisation';

  const decideLocal = async (run, approve) => {
    setBusy(run.id);
    try {
      decideLocalRun(run.id, approve);
      if (approve) {
        const res = await executeRun(run.id);
        if (res?.status === 'done') toast.success('Approuvée et exécutée', run.automationName);
        else toast.warn('Approuvée — exécution incomplète', 'Détail dans le journal.');
      } else toast.info('Exécution refusée', run.automationName);
    } finally { setBusy(null); }
  };
  const decideServer = async (row, approve) => {
    setBusy(row.id);
    try {
      await decideServerRun({ ...row, automationName: autoName(row.automation_id) }, approve);
      toast.success(approve ? 'Approuvée' : 'Refusée', approve ? 'L\'exécution part dans la file du serveur.' : '');
      await useServerData.getState().load();
    } catch (err) {
      toast.error('Décision impossible', String(err?.message || err));
    } finally { setBusy(null); }
  };

  if (!localPending.length && !serverPending.length) {
    return <div className="card p-8 text-center text-sm text-dim"><Inbox className="mx-auto mb-2 text-muted" size={28} aria-hidden="true" />Aucune exécution n'attend d'approbation.</div>;
  }
  return (
    <div className="space-y-3">
      {!canValidate && <p className="text-sm text-amber-600 dark:text-amber-300 flex gap-2"><ShieldCheck size={16} aria-hidden="true" />Approuver demande le droit Formulaires › valider.</p>}
      {localPending.map(run => {
        const auto = autos[run.automationId];
        return (
          <article key={run.id} className="card p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-ink">{run.automationName}</h3>
                <p className="text-xs text-dim">{responseLabel(responses[run.responseId], defs) || 'Réponse supprimée'} · déclenchée le {fmtDate(run.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" disabled={!canValidate || busy === run.id} onClick={() => decideLocal(run, false)}><X size={16} aria-hidden="true" /> Refuser</button>
                <button type="button" className="btn-primary" disabled={!canValidate || busy === run.id} onClick={() => decideLocal(run, true)}><Check size={16} aria-hidden="true" /> Approuver</button>
              </div>
            </div>
            {auto && <p className="text-xs text-dim">Actions prévues : {auto.actions.map((a, i) => `${i + 1}. ${a.label || getAction(a.type)?.label || a.type}`).join(' · ')}</p>}
          </article>
        );
      })}
      {serverPending.map(row => (
        <article key={row.id} className="card p-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-ink">{autoName(row.automation_id)}</h3>
            <p className="text-xs text-dim">Réponse {String(row.response_id || '').slice(0, 8)} · {row.event} · {fmtDate(row.created_at)}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!canValidate || busy === row.id} onClick={() => decideServer(row, false)}><X size={16} aria-hidden="true" /> Refuser</button>
            <button type="button" className="btn-primary" disabled={!canValidate || busy === row.id} onClick={() => decideServer(row, true)}><Check size={16} aria-hidden="true" /> Approuver</button>
          </div>
        </article>
      ))}
    </div>
  );
}

const PAGE = 40;

export function JournalPanel({ connected }) {
  const uid = useId();
  const canWrite = useCan('forms', 'write');
  const runs = useAutomationsStore(selectRuns);
  const responses = useAutomationsStore(selectResponses);
  const defs = useFormsStore(selectDefs);
  const serverRuns = useServerData(selectServerRuns);
  const serverAutos = useServerData(selectServerAutos);
  const [filters, setFilters] = useState({ automation: '', status: '', q: '' });
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(null);

  const all = useMemo(() => Object.values(runs).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [runs]);
  const automations = useMemo(() => [...new Map(all.map(r => [r.automationId, r.automationName])).entries()], [all]);
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return all.filter(r => (!filters.automation || r.automationId === filters.automation)
      && (!filters.status || r.status === filters.status)
      && (!q || [r.automationName, r.error, ...(r.actions || []).map(a => `${a.summary} ${a.error || ''}`)].join(' ').toLowerCase().includes(q)));
  }, [all, filters]);

  const act = async (run, fn, okMsg) => {
    setBusy(run.id);
    try {
      const res = await fn();
      if (res?.status === 'done' || res?.status === 'skipped') toast.success(okMsg, run.automationName);
      else if (res?.status) toast.warn(`Exécution ${RUN_STATUS[res.status]?.label?.toLowerCase() || res.status}`, res.error || res.actions?.find(a => a.status === 'error')?.error || '');
    } catch (err) {
      toast.error('Exécution impossible', String(err?.message || err));
    } finally { setBusy(null); }
  };
  const retry = (run) => act(run, () => { useAutomationsStore.getState().patchRun(run.id, { status: 'queued' }); return executeRun(run.id); }, 'Reprise réussie');
  const replay = (run) => act(run, () => executeRun(run.id, { replay: true }), 'Rejouée (doublons évités)');
  const execNow = (run) => act(run, () => executeRun(run.id), 'Exécutée');
  const remove = async (run) => {
    if (!(await confirmDialog({ title: 'Supprimer cette entrée du journal ?', message: 'Les données créées par l\'exécution ne sont pas supprimées.', confirmLabel: 'Supprimer', tone: 'danger' }))) return;
    useAutomationsStore.getState().deleteRun(run.id);
  };
  const clearDone = async () => {
    if (!(await confirmDialog({ title: 'Vider le journal ?', message: 'Les exécutions terminées sont retirées du journal (les exécutions en attente sont gardées). Les données créées restent en place.', confirmLabel: 'Vider', tone: 'danger' }))) return;
    useAutomationsStore.getState().clearFinishedRuns();
    toast.success('Journal vidé');
  };

  return (
    <div className="space-y-4">
      <div className="card p-3 grid gap-2 sm:grid-cols-[1fr_12rem_1fr_auto] items-end">
        <div>
          <label htmlFor={`${uid}-a`} className="text-xs font-semibold text-dim">Automatisation</label>
          <select id={`${uid}-a`} className="input" value={filters.automation} onChange={(e) => { setFilters(f => ({ ...f, automation: e.target.value })); setLimit(PAGE); }}>
            <option value="">Toutes</option>{automations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-s`} className="text-xs font-semibold text-dim">Statut</label>
          <select id={`${uid}-s`} className="input" value={filters.status} onChange={(e) => { setFilters(f => ({ ...f, status: e.target.value })); setLimit(PAGE); }}>
            <option value="">Tous</option>{Object.entries(RUN_STATUS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-q`} className="text-xs font-semibold text-dim">Rechercher</label>
          <input id={`${uid}-q`} className="input" value={filters.q} onChange={(e) => setFilters(f => ({ ...f, q: e.target.value }))} placeholder="résultat, erreur…" />
        </div>
        <button type="button" className="btn-ghost" onClick={clearDone} disabled={!all.length}><Trash2 size={14} aria-hidden="true" /> Vider</button>
      </div>

      {!filtered.length && <p className="card p-6 text-center text-sm text-dim">{all.length ? 'Aucune exécution ne correspond aux filtres.' : 'Aucune exécution pour l\'instant.'}</p>}
      <ul className="space-y-2">
        {filtered.slice(0, limit).map(run => (
          <li key={run.id}>
            <details className="card p-3 group">
              <summary className="cursor-pointer list-none flex flex-wrap items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
                <StatusBadge status={run.status} />
                <span className="font-medium text-ink">{run.automationName}</span>
                <span className="text-xs text-dim">{fmtDate(run.createdAt)}{Number.isFinite(run.durationMs) ? ` · ${run.durationMs} ms` : ''}{run.mode === 'server' ? ' · serveur' : ''}</span>
                {(run.actions || []).length > 0 && <span className="text-xs text-muted">{run.actions.filter(a => a.status === 'ok').length}/{run.actions.length} actions</span>}
              </summary>
              <div className="mt-3 space-y-3 text-sm">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Réponse</dt><dd className="text-ink">{responseLabel(responses[run.responseId], defs) || String(run.responseId || '—').slice(0, 13)}</dd>
                  <dt className="text-muted">Déclencheur</dt><dd className="text-ink">{run.event}{run.payload?.to ? ` → ${run.payload.to}` : ''}</dd>
                  {run.dueAt && (<><dt className="text-muted">Prévue le</dt><dd className="text-ink">{fmtDate(run.dueAt)}</dd></>)}
                  {run.approvedBy && (<><dt className="text-muted">{run.status === 'cancelled' ? 'Refusée par' : 'Approuvée par'}</dt><dd className="text-ink">{run.approvedBy} ({fmtDate(run.approvedAt)})</dd></>)}
                  {run.executedBy && (<><dt className="text-muted">Exécutée par</dt><dd className="text-ink">{run.executedBy}{run.attempts ? ` · ${run.attempts} tentative(s)` : ''}</dd></>)}
                  {run.finishedAt && (<><dt className="text-muted">Terminée</dt><dd className="text-ink">{fmtDate(run.finishedAt)}{run.replayedAt ? ` (rejouée le ${fmtDate(run.replayedAt)})` : ''}</dd></>)}
                </dl>
                {run.error && <p className="text-rose-600 dark:text-rose-300" role="alert">{run.error}</p>}
                <ConditionsBlock conditions={run.conditions} />
                <ActionResults actions={run.actions} />
                <div className="flex flex-wrap gap-2">
                  {canWrite && ['failed', 'partial'].includes(run.status) && <button type="button" className="btn-secondary" disabled={busy === run.id} onClick={() => retry(run)}><RotateCcw size={14} aria-hidden="true" /> Reprendre (actions en échec)</button>}
                  {canWrite && run.status === 'done' && <button type="button" className="btn-secondary" disabled={busy === run.id} onClick={() => replay(run)}><Repeat size={14} aria-hidden="true" /> Rejouer</button>}
                  {canWrite && run.status === 'queued' && <button type="button" className="btn-secondary" disabled={busy === run.id} onClick={() => execNow(run)}><Play size={14} aria-hidden="true" /> Exécuter</button>}
                  <button type="button" className="btn-ghost" onClick={() => remove(run)}><Trash2 size={14} aria-hidden="true" /> Retirer du journal</button>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {filtered.length > limit && <button type="button" className="btn-secondary w-full" onClick={() => setLimit(l => l + PAGE)}>Afficher plus ({filtered.length - limit})</button>}

      {connected && (
        <section className="space-y-2" aria-labelledby={`${uid}-srv`}>
          <div className="flex items-center justify-between">
            <h3 id={`${uid}-srv`} className="text-sm font-semibold text-ink">Déclenchements enregistrés par le serveur</h3>
            <button type="button" className="btn-ghost" onClick={() => { useServerData.getState().load(); runNow().catch(() => {}); }}><RefreshCw size={14} aria-hidden="true" /> Actualiser</button>
          </div>
          {!serverRuns.length ? <p className="text-sm text-dim">Aucun déclenchement.</p> : (
            <ul className="card divide-y divide-line text-sm">
              {serverRuns.slice(0, 100).map(r => (
                <li key={r.id} className="p-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={r.status === 'done' && r.result?.executed === false ? 'skipped' : r.status === 'claimed' ? 'running' : r.status} />
                  <span className="text-ink">{serverAutos.find(a => a.id === r.automation_id)?.name || 'Automatisation'}</span>
                  <span className="text-xs text-dim">{fmtDate(r.created_at)} · {r.event}{r.result?.scheduled ? ` · planifiée ${fmtDate(r.result.scheduled)}` : ''}{r.result?.duplicate ? ' · doublon ignoré' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
