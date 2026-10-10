// ============================================================
// AUTOMATISATIONS — pipeline d'exécution (commun local / connecté)
// ============================================================
// SI déclencheur ET conditions ALORS actions :
//  1. dispatchLocal(event, response, payload) : crée les exécutions (mode
//     local) — une par réponse et par automatisation (idempotence) ;
//  2. runActions(...) : conditions puis actions, une par une, erreurs isolées,
//     droits vérifiés avec can() (utilisateur courant), journal détaillé ;
//  3. simulateAutomation(...) : même chemin, SANS aucune écriture.
// Les actions déjà réussies ne sont pas rejouées lors d'une reprise ;
// « Rejouer » relance tout, chaque action détectant ses propres doublons.
// ============================================================

import { can, getPermissionSource } from '../core/permissions.js';
import { useStore } from '../store.js';
import { useFormsStore } from '../modules/forms/store.js';
import { DEFAULT_STATUSES } from '../forms/schema.js';
import { isEmpty } from '../forms/engine/index.js';
import { getAction } from './actions/index.js';
import { buildScope, resolveParams } from './mapping.js';
import { checkConditions, triggerMatches, scheduleDueAt, runKey } from './model.js';
import { useAutomationsStore, findRunByKey } from './store.js';
import { notify } from './notifications.js';
import { formsApi, isConnected, fetchServerResponse, serverDefinition } from './server.js';

const OUTPUT_KEYS = ['memberId', 'transactionId', 'taskId', 'candidateId', 'documentRef', 'reminderId', 'participantId'];
const st = () => useAutomationsStore.getState();

/** Nom de la personne qui exécute / approuve (jamais affiché dans la console). */
export function currentUserLabel() {
  const src = getPermissionSource();
  if (src?.mode === 'remote' && src.user) return src.user.email || 'Compte connecté';
  try {
    const meId = localStorage.getItem('bde-tasks-me');
    const m = meId && useStore.getState().members.find(x => x.id === meId);
    if (m) return [m.firstName, m.lastName].filter(Boolean).join(' ');
  } catch { /* stockage indisponible */ }
  return 'Cet appareil';
}

export const localDefinition = (formId) => (formId ? useFormsStore.getState().definitions[formId] || null : null);
export const statusesOf = (definition) => (Array.isArray(definition?.settings?.statuses) && definition.settings.statuses.length ? definition.settings.statuses : DEFAULT_STATUSES);
const statusLabelFn = (definition) => (id) => statusesOf(definition).find(s => s.id === id)?.label || id || '—';

/** Ne garde dans le journal que des valeurs simples (pas de fichiers). */
function journalParams(params) {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return;
    if (typeof v === 'string') out[k] = v.length > 300 ? `${v.slice(0, 300)}…` : v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else out[k] = JSON.stringify(v).slice(0, 300);
  });
  return out;
}

/**
 * Évalue les conditions puis exécute les actions.
 * @returns {Promise<{ status, conditions, actions, durationMs, outputs }>}
 */
export async function runActions({ automation, response, definition, simulate = false, previous = [], key, connected = false }) {
  const t0 = performance.now();
  const outputs = {};
  const scope0 = buildScope({ response, definition, outputs });
  const cond = checkConditions(automation, scope0);
  const conditions = { ok: cond.ok, expr: cond.expr, details: cond.details, errors: cond.errors };
  if (!cond.ok) return { status: 'skipped', conditions, actions: [], durationMs: Math.round(performance.now() - t0), outputs };

  const resp = { ...response };
  const results = [];
  for (const action of automation.actions || []) {
    const def = getAction(action.type);
    const label = action.label || def?.label || action.type;
    const prev = previous.find(x => x.actionId === action.id && x.status === 'ok');
    if (prev && !simulate) {
      OUTPUT_KEYS.forEach(k => { if (prev.output?.[k]) outputs[k] = prev.output[k]; });
      results.push({ ...prev, reused: true });
      continue;
    }
    const at = new Date().toISOString();
    const a0 = performance.now();
    const warnings = [];
    let params = {};
    try {
      if (!def) throw new Error(`Action inconnue : ${action.type}`);
      const [cap, lvl] = def.capability;
      if (!can(cap, lvl)) throw new Error(`Droit insuffisant : ${cap} › ${lvl} requis pour « ${def.label} ».`);
      const scope = buildScope({ response: resp, definition, outputs });
      params = resolveParams(action.params, scope);
      const missing = def.params.filter(p => p.required && isEmpty(params[p.key]));
      if (missing.length) throw new Error(`Paramètre vide : ${missing.map(p => `« ${p.label} »`).join(', ')} (vérifie le mappage).`);
      const ctx = {
        simulate, key: `${key}:${action.id}`, automation, response: resp, definition, scope, outputs,
        user: currentUserLabel(), connected, formsApi,
        warn: (m) => warnings.push(m),
        statusLabel: statusLabelFn(definition),
        setResponseStatus: async (status) => {
          await setResponseStatus(resp, status, connected);
          resp.status = status;
        },
      };
      const res = await def.run(params, ctx);
      OUTPUT_KEYS.forEach(k => { if (res?.output?.[k]) outputs[k] = res.output[k]; });
      results.push({ actionId: action.id, type: action.type, label, status: 'ok', summary: res?.summary || 'Fait.', warnings, params: journalParams(params), links: res?.links || [], output: res?.output || {}, durationMs: Math.round(performance.now() - a0), at });
    } catch (err) {
      results.push({ actionId: action.id, type: action.type, label, status: 'error', summary: '', error: String(err?.message || err).slice(0, 500), warnings, params: journalParams(params), links: [], output: {}, durationMs: Math.round(performance.now() - a0), at });
    }
  }
  const ok = results.filter(r => r.status === 'ok').length;
  const status = !results.length || ok === results.length ? 'done' : ok ? 'partial' : 'failed';
  return { status, conditions, actions: results, durationMs: Math.round(performance.now() - t0), outputs };
}

/** Change le statut d'une réponse (locale : déclenche les automatisations ; serveur : RPC). */
async function setResponseStatus(response, status, connected) {
  if (connected) {
    await formsApi.updateResponseStatus(response.id, status);
    return;
  }
  changeLocalResponseStatus(response.id, status);
}

// ── Mode local : réponses et déclenchements ─────────────────

/**
 * Crée les exécutions des automatisations concernées par un événement.
 * @returns {object[]} exécutions créées ou réévaluées
 */
export function dispatchLocal(event, response, payload = {}) {
  if (!response?.id) return [];
  const created = [];
  const definition = localDefinition(response.formId);
  const autos = Object.values(st().automations).filter(a => a.enabled && (!a.formId || a.formId === response.formId) && triggerMatches(a.trigger, event, payload));
  for (const a of autos) {
    const key = runKey(a.id, response.id);
    const existing = findRunByKey(st().runs, key);
    // Idempotence : une exécution par réponse et par automatisation. Seule
    // une exécution écartée (conditions non remplies) est réévaluée.
    if (existing && existing.status !== 'skipped') continue;
    const cond = checkConditions(a, buildScope({ response, definition }));
    const base = {
      ...(existing ? { id: existing.id, createdAt: existing.createdAt } : {}),
      key, mode: 'local', automationId: a.id, automationName: a.name, formId: response.formId || null,
      responseId: response.id, event, payload, attempts: existing?.attempts || 0, actions: [],
      conditions: { ok: cond.ok, expr: cond.expr, details: cond.details, errors: cond.errors },
    };
    if (!cond.ok) { created.push(st().putRun({ ...base, status: 'skipped', finishedAt: new Date().toISOString() })); continue; }
    let status = a.requiresApproval ? 'pending_approval' : 'queued';
    let dueAt;
    if (a.trigger?.type === 'schedule') {
      dueAt = scheduleDueAt(a.trigger, response);
      if (!dueAt) { created.push(st().putRun({ ...base, status: 'skipped', error: 'Date de déclenchement introuvable dans la réponse.' })); continue; }
      status = 'scheduled';
    }
    const run = st().putRun({ ...base, status, ...(dueAt ? { dueAt } : {}) });
    created.push(run);
    if (status === 'pending_approval') notifyApproval(run);
  }
  return created;
}

export function notifyApproval(run) {
  notify({
    title: `À approuver : ${run.automationName}`,
    body: 'Une automatisation attend une validation humaine avant de s\'exécuter.',
    level: 'warn', link: { section: 'automations', rest: ['approbations'] }, source: 'Automatisations', dedupeKey: `approval:${run.key || run.id}`,
  });
}

/** Ajoute une réponse locale (borne, saisie manuelle) et déclenche. */
export function addLocalResponse(input) {
  const r = st().addResponse(input);
  dispatchLocal('response.created', r, { to: r.status });
  if (r.paymentStatus === 'paid' || r.paymentStatus === 'manual') dispatchLocal('payment.paid', r, { to: r.paymentStatus, amount: r.paymentAmount });
  return r;
}

export function changeLocalResponseStatus(responseId, status) {
  const r = st().responses[responseId];
  if (!r || r.status === status) return r || null;
  const from = r.status;
  const next = st().updateResponse(responseId, { status }, { by: currentUserLabel() });
  dispatchLocal('response.status_changed', next, { from, to: status });
  return next;
}

/** Paiement confirmé hors ligne (espèces, chèque…) : déclenche « paiement confirmé ». */
export function confirmLocalPayment(responseId, amount) {
  const r = st().responses[responseId];
  if (!r) return null;
  const paymentAmount = Number.isFinite(Number(amount)) && String(amount).trim() !== '' ? Math.round(Number(amount) * 100) / 100 : r.paymentAmount;
  const next = st().updateResponse(responseId, { paymentStatus: 'manual', ...(Number.isFinite(paymentAmount) ? { paymentAmount } : {}) }, { by: currentUserLabel() });
  dispatchLocal('payment.paid', next, { to: 'manual', amount: paymentAmount });
  return next;
}

// ── Exécution d'une exécution du journal ────────────────────

/**
 * Exécute (ou reprend) une exécution du journal.
 * opts.replay : relance TOUTES les actions (elles détectent leurs doublons).
 */
export async function executeRun(runId, { replay = false } = {}) {
  const run = st().runs[runId];
  if (!run) throw new Error('Exécution introuvable.');
  if (!['queued', 'failed', 'partial', 'done'].includes(run.status)) return run;
  if (run.status === 'done' && !replay) return run;
  const connected = run.mode === 'server';
  const automation = connected ? run.automationSnapshot : st().automations[run.automationId];
  const fail = (error) => st().patchRun(runId, { status: 'failed', error, finishedAt: new Date().toISOString() });
  if (!automation) return fail('Automatisation supprimée.');
  let response;
  let definition;
  try {
    if (connected) {
      response = await fetchServerResponse(run.responseId);
      definition = await serverDefinition(response.serverFormId, response.version);
    } else {
      response = st().responses[run.responseId];
      definition = localDefinition(response?.formId);
    }
  } catch (err) {
    return fail(String(err?.message || err));
  }
  if (!response) return fail('Réponse introuvable (supprimée ?).');
  st().patchRun(runId, { status: 'running', startedAt: new Date().toISOString(), attempts: (run.attempts || 0) + 1, executedBy: currentUserLabel(), error: undefined });
  let result;
  try {
    result = await runActions({ automation, response, definition, previous: replay ? [] : run.actions || [], key: run.key, connected });
  } catch (err) {
    return fail(String(err?.message || err));
  }
  const next = st().patchRun(runId, {
    status: result.status, actions: result.actions, conditions: result.conditions,
    durationMs: result.durationMs, finishedAt: new Date().toISOString(),
    ...(replay ? { replayedAt: new Date().toISOString() } : {}),
  });
  if (result.status === 'failed' || result.status === 'partial') {
    notify({ title: `Automatisation ${result.status === 'failed' ? 'en échec' : 'partielle'} : ${run.automationName}`, body: result.actions.find(a => a.status === 'error')?.error || '', level: 'error', link: { section: 'automations', rest: ['journal'] }, source: 'Automatisations' });
  }
  return next;
}

/** Approuve / refuse une exécution locale. */
export function decideLocalRun(runId, approve) {
  const run = st().runs[runId];
  if (!run || run.status !== 'pending_approval') return null;
  return st().patchRun(runId, approve
    ? { status: 'queued', approvedBy: currentUserLabel(), approvedAt: new Date().toISOString() }
    : { status: 'cancelled', approvedBy: currentUserLabel(), approvedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
}

/** Simulation sur une réponse existante : AUCUN effet. */
export async function simulateAutomation(automation, response, definition) {
  return runActions({ automation, response, definition: definition || localDefinition(response?.formId), simulate: true, key: `simulation:${automation.id}`, connected: isConnected() });
}
