// ============================================================
// AUTOMATISATIONS — exécuteur (boucle douce, un seul onglet)
// ============================================================
// startAutomationRunner() : idempotent ; passe toutes les 60 s, au retour du
// focus / de la visibilité, et à la demande (runNow, bouton « Exécuter
// maintenant »). Un seul onglet exécute à la fois (navigator.locks, verrou
// « bde-automations-runner » ; repli : verrou mémoire de l'onglet).
//
// Mode connecté : claimAutomationRuns → réponse lue sur le serveur →
//   conditions → actions avec les droits de l'utilisateur courant (can()) →
//   completeAutomationRun(done|failed, résumé SANS données personnelles).
//   Déclencheur « date atteinte » : l'exécution serveur est close
//   (« planifiée ») et la suite est gardée dans le journal de l'appareil.
// Mode local : réponses de la borne (kioskQueue) reprises comme réponses
//   locales → mêmes déclenchements → même pipeline.
// ============================================================

import { create } from 'zustand';
import { can } from '../core/permissions.js';
import { kioskQueue } from '../forms/runtime/kioskQueue.js';
import { useFormsStore } from '../modules/forms/store.js';
import { useAutomationsStore, findRunByKey } from './store.js';
import { addLocalResponse, executeRun, currentUserLabel, notifyApproval, runActions } from './pipeline.js';
import { checkConditions, scheduleDueAt, runKey, normalizeAutomation } from './model.js';
import { buildScope } from './mapping.js';
import {
  formsApi, isConnected, fetchServerResponse, serverDefinition, serverDoneKeys, fromServerRow,
} from './server.js';

const INTERVAL_MS = 60_000;
const STALE_RUNNING_MS = 10 * 60_000;
const BATCH = 20;

export const useRunnerState = create(() => ({
  started: false, busy: false, lastRunAt: null, lastSummary: null, lastError: null, mode: 'local',
}));

const st = () => useAutomationsStore.getState();
let timer = null;
let localBusy = false;

/** Démarre la boucle (navigateur uniquement). */
export function startAutomationRunner() {
  if (typeof window === 'undefined' || useRunnerState.getState().started) return;
  useRunnerState.setState({ started: true });
  timer = setInterval(() => { runNow().catch(() => {}); }, INTERVAL_MS);
  const kick = () => { if (document.visibilityState !== 'hidden') runNow().catch(() => {}); };
  window.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', kick);
  kioskQueue.subscribe(() => { if (!isConnected()) runNow().catch(() => {}); });
  setTimeout(kick, 1500);
}

export function stopAutomationRunner() {
  clearInterval(timer);
  timer = null;
  useRunnerState.setState({ started: false });
}

async function withLock(fn) {
  if (localBusy) return { skipped: 'busy' };
  localBusy = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return await navigator.locks.request('bde-automations-runner', { ifAvailable: true }, async (lock) => (lock ? fn() : { skipped: 'other-tab' }));
    }
    return await fn();
  } finally {
    localBusy = false;
  }
}

/**
 * Un passage complet. → { executed, failed, ingested, claimed, skipped? }
 */
export async function runNow() {
  const connected = isConnected();
  useRunnerState.setState({ busy: true, mode: connected ? 'server' : 'local' });
  try {
    const res = await withLock(async () => {
      const out = { executed: 0, failed: 0, ingested: 0, claimed: 0 };
      recoverStale();
      if (connected) await serverCycle(out);
      else await ingestKiosk(out);
      promoteScheduled();
      await executeQueued(out);
      return out;
    });
    useRunnerState.setState({ lastRunAt: new Date().toISOString(), lastSummary: res, lastError: null });
    return res;
  } catch (err) {
    useRunnerState.setState({ lastRunAt: new Date().toISOString(), lastError: String(err?.message || err) });
    throw err;
  } finally {
    useRunnerState.setState({ busy: false });
  }
}

/** Exécutions « en cours » abandonnées (onglet fermé) → reprises. */
function recoverStale() {
  const now = Date.now();
  Object.values(st().runs).forEach(r => {
    if (r.status === 'running' && now - new Date(r.startedAt || r.updatedAt || 0).getTime() > STALE_RUNNING_MS) {
      st().patchRun(r.id, { status: 'queued', error: 'Exécution interrompue : reprise automatique.' });
    }
  });
}

/** Planifiées arrivées à échéance → file (ou approbation). */
function promoteScheduled() {
  const now = Date.now();
  Object.values(st().runs).forEach(r => {
    if (r.status !== 'scheduled' || !r.dueAt || new Date(r.dueAt).getTime() > now) return;
    const auto = r.mode === 'server' ? r.automationSnapshot : st().automations[r.automationId];
    // Mode serveur : l'approbation a déjà eu lieu côté serveur avant la réservation.
    const needsApproval = r.mode !== 'server' && auto?.requiresApproval;
    const next = st().patchRun(r.id, { status: needsApproval ? 'pending_approval' : 'queued' });
    if (needsApproval) notifyApproval(next);
  });
}

async function executeQueued(out) {
  const queued = Object.values(st().runs).filter(r => r.status === 'queued')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, BATCH);
  for (const r of queued) {
    const res = await executeRun(r.id);
    if (res?.status === 'failed' || res?.status === 'partial') out.failed++;
    else out.executed++;
  }
  // Les actions « changer le statut » peuvent avoir créé de nouvelles exécutions.
  if (queued.length === BATCH) return;
  const more = Object.values(st().runs).some(r => r.status === 'queued' && !queued.some(q => q.id === r.id));
  if (more && out.executed + out.failed < BATCH * 3) await executeQueued(out);
}

// ── Mode local : borne hors ligne ───────────────────────────

async function ingestKiosk(out) {
  let entries;
  try { entries = await kioskQueue.list(); } catch { entries = []; }
  const ingested = st().ingested;
  const defs = useFormsStore.getState().definitions;
  for (const e of entries) {
    if (ingested[e.id]) continue;
    const def = defs[e.formId] || Object.values(defs).find(d => d.slug === e.slug) || null;
    const r = addLocalResponse({
      formId: def?.id || e.formId || null, version: def?.publishedVersion ?? null,
      answers: e.answers || {}, source: 'borne', submittedAt: new Date(e.createdAt || Date.now()).toISOString(),
    });
    st().markIngested(e.id, r.id);
    out.ingested++;
  }
}

// ── Mode connecté ───────────────────────────────────────────

async function serverCycle(out) {
  if (!can('forms', 'write')) return; // claim_automation_runs exige forms › écriture
  const claimed = await formsApi.claimAutomationRuns(BATCH);
  if (!Array.isArray(claimed) || !claimed.length) return;
  out.claimed += claimed.length;
  let doneKeys = new Map();
  try { doneKeys = await serverDoneKeys(); } catch { /* best effort : l'idempotence des actions prend le relais */ }
  for (const item of claimed) {
    try {
      await processClaimed(item, doneKeys, out);
    } catch (err) {
      out.failed++;
      try { await formsApi.completeAutomationRun(item.id, 'failed', { executed: false, error: String(err?.message || err).slice(0, 300) }); } catch { /* réservation expirera (10 min) */ }
    }
  }
}

async function processClaimed(item, doneKeys, out) {
  const automation = fromServerRow({ ...item.automation, enabled: true, requires_approval: false });
  const key = runKey(item.automation_id, item.response_id);
  const local = Object.values(st().runs).find(r => r.serverRunId === item.id);
  const already = findRunByKey(st().runs, key);
  const base = {
    ...(local ? { id: local.id, createdAt: local.createdAt, approvedBy: local.approvedBy, approvedAt: local.approvedAt } : {}),
    key, mode: 'server', serverRunId: item.id, automationId: item.automation_id, automationName: automation.name,
    automationSnapshot: normalizeAutomation(automation), formId: automation.formId, responseId: item.response_id,
    event: item.event, payload: item.payload, attempts: item.attempts || 1, actions: [],
  };
  // Idempotence : déjà exécutée (ici ou sur un autre appareil) pour cette réponse.
  const doneHere = already && already.id !== local?.id && ['done', 'partial'].includes(already.status);
  if (doneHere || (doneKeys.has(key) && doneKeys.get(key).id !== item.id)) {
    await formsApi.completeAutomationRun(item.id, 'done', { executed: false, duplicate: true });
    st().putRun({ ...base, key: `${key}#doublon:${item.id}`, status: 'skipped', error: 'Déjà exécutée pour cette réponse : doublon ignoré.', finishedAt: new Date().toISOString() });
    return;
  }
  if (!item.response_id) throw new Error('Déclenchement sans réponse.');
  const response = await fetchServerResponse(item.response_id);
  const definition = await serverDefinition(response.serverFormId, response.version);
  const cond = checkConditions(automation, buildScope({ response, definition }));
  if (!cond.ok) {
    await formsApi.completeAutomationRun(item.id, 'done', { executed: false, skipped: 'conditions' });
    st().putRun({ ...base, status: 'skipped', conditions: { ok: false, expr: cond.expr, details: cond.details, errors: cond.errors }, finishedAt: new Date().toISOString() });
    return;
  }
  if (automation.trigger?.type === 'schedule') {
    const dueAt = scheduleDueAt(automation.trigger, response);
    if (dueAt && new Date(dueAt).getTime() > Date.now()) {
      await formsApi.completeAutomationRun(item.id, 'done', { executed: false, scheduled: dueAt });
      st().putRun({ ...base, status: 'scheduled', dueAt });
      return;
    }
  }
  const run = st().putRun({ ...base, status: 'running', startedAt: new Date().toISOString(), executedBy: currentUserLabel() });
  const result = await runActions({ automation, response, definition, previous: local?.actions || [], key, connected: true });
  st().patchRun(run.id, { status: result.status, actions: result.actions, conditions: result.conditions, durationMs: result.durationMs, finishedAt: new Date().toISOString() });
  await formsApi.completeAutomationRun(item.id, result.status === 'failed' ? 'failed' : 'done', {
    executed: result.status !== 'failed', status: result.status, durationMs: result.durationMs,
    actions: result.actions.map(a => ({ type: a.type, ok: a.status === 'ok' })),
  });
  if (result.status === 'failed' || result.status === 'partial') out.failed++;
  else out.executed++;
}

/** Approbation d'une exécution serveur (droit forms › validate). */
export async function decideServerRun(serverRow, approve) {
  await formsApi.approveAutomationRun(serverRow.id, approve);
  const key = runKey(serverRow.automation_id, serverRow.response_id);
  const existing = Object.values(st().runs).find(r => r.serverRunId === serverRow.id);
  st().putRun({
    ...(existing || {}), key, mode: 'server', serverRunId: serverRow.id, automationId: serverRow.automation_id,
    automationName: existing?.automationName || serverRow.automationName || 'Automatisation', responseId: serverRow.response_id,
    event: serverRow.event, payload: serverRow.payload, actions: existing?.actions || [],
    status: approve ? 'queued-server' : 'cancelled', approvedBy: currentUserLabel(), approvedAt: new Date().toISOString(),
  });
  if (approve) runNow().catch(() => {});
}
