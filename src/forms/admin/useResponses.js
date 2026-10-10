// Hook de chargement des réponses d'un formulaire (dépôt local ou serveur),
// avec rechargement, écoute des nouveautés et détection des nouvelles réponses.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createResponsesRepo } from './responsesRepo.js';
import { readPref, writePref } from './prefs.js';
import { evaluate, truthy } from '../engine/index.js';
import { pushNotification } from './integrations.js';
import { toast } from '../../components/ui/toastStore.js';

/**
 * @param {{ def, mode: 'server'|'local', serverFormId, actor, deleted?: boolean }} opts
 */
export function useResponses({ def, mode, serverFormId, actor, deleted = false }) {
  const defId = def.id;
  const slug = def.slug;
  // Le dépôt ne dépend que de l'identité du formulaire (pas de chaque frappe dans l'éditeur).
  const defRef = useRef(def);
  useEffect(() => { defRef.current = def; }, [def]);
  const repo = useMemo(() => {
    try { return createResponsesRepo({ def: { id: defId, slug }, mode, serverFormId, actor }); } catch (e) { return { error: e }; }
  }, [defId, slug, mode, serverFormId, actor]);

  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null, progress: null, truncated: false, loadedAt: null });
  const [tick, setTick] = useState(0);
  const knownIds = useRef(null);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (repo.error) return undefined;
    let alive = true;
    // Chargement asynchrone : l'état « chargement » est posé dans le rappel.
    Promise.resolve().then(() => { if (alive) setState(s => ({ ...s, loading: true, error: null })); });
    repo.loadAll({ filters: deleted ? { deleted: true } : {}, sort: { field: 'submittedAt', dir: 'desc' }, onProgress: (n, total) => { if (alive) setState(s => ({ ...s, progress: { n, total } })); } })
      .then(res => {
        if (!alive) return;
        // Nouvelles réponses depuis le dernier chargement (notification)
        if (knownIds.current && !deleted) {
          const fresh = res.rows.filter(r => !knownIds.current.has(r.id) && !r.pending);
          if (fresh.length) notifyNew(defRef.current, fresh);
        }
        knownIds.current = new Set(res.rows.map(r => r.id));
        setState({ rows: res.rows, total: res.total, loading: false, error: null, progress: null, truncated: res.truncated, loadedAt: new Date().toISOString() });
      })
      .catch(err => { if (alive) setState(s => ({ ...s, loading: false, error: err?.message || String(err), progress: null })); });
    return () => { alive = false; };
  }, [repo, tick, deleted]);

  // Écoute : abonnement local immédiat, interrogation périodique côté serveur.
  useEffect(() => {
    if (repo.error || !repo.subscribe) return undefined;
    let timer = null;
    const off = repo.subscribe(() => { clearTimeout(timer); timer = setTimeout(reload, 250); });
    return () => { clearTimeout(timer); off?.(); };
  }, [repo, reload]);

  return { ...state, error: repo.error ? repo.error.message : state.error, repo: repo.error ? null : repo, reload };
}

// ── Nouvelles réponses : centre de notifications ou badge local ──
export const lastSeenKey = formId => `seen:${formId}`;
export function markSeen(formId) { writePref(lastSeenKey(formId), new Date().toISOString()); }
export const alertsKey = formId => `alerts:${formId}`;

async function notifyNew(def, fresh) {
  const alerts = readPref(alertsKey(def.id), { onNew: true, expr: '' });
  const matching = alerts.expr
    ? fresh.filter(r => { try { return truthy(evaluate(alerts.expr, { ...(r.computed || {}), ...(r.answers || {}) }, {})); } catch { return false; } })
    : [];
  const notes = [];
  if (alerts.onNew) notes.push({ title: `${fresh.length} nouvelle${fresh.length > 1 ? 's' : ''} réponse${fresh.length > 1 ? 's' : ''}`, detail: def.title });
  if (matching.length) notes.push({ title: `Condition remplie (${matching.length})`, detail: `${def.title} : ${alerts.expr}` });
  for (const n of notes) {
    const handled = await pushNotification({ title: n.title, message: n.detail, body: n.detail, source: 'forms', link: { section: 'forms', rest: [def.id, 'reponses'] }, at: new Date().toISOString() });
    if (!handled) toast.info(n.title, n.detail);
  }
}
