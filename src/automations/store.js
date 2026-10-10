// ============================================================
// AUTOMATISATIONS — store persisté (mode local + journal détaillé)
// ============================================================
// automations : { [id]: Automation }  (mode local ; voir model.js)
// responses   : { [id]: Response }    réponses LOCALES (borne hors ligne,
//               saisie manuelle) — forme de src/forms/schema.js + source
// ingested    : { [kioskEntryId]: responseId }  entrées de borne déjà reprises
// runs        : { [id]: Run }  journal détaillé :
//   { id, key ('automationId:responseId'), mode: 'local'|'server', serverRunId?,
//     automationId, automationName, formId, responseId, event, payload?,
//     status (RUN_STATUS), dueAt?, attempts, createdAt, startedAt?, finishedAt?, durationMs?,
//     approvedBy?, approvedAt?, executedBy?, conditions?: { ok, expr, details },
//     actions: [{ actionId, type, label, status: 'ok'|'error'|'skipped', summary, error?,
//                 params (entrées résolues), links, output, durationMs, at }], error? }
//
// Tranches de synchronisation : AUCUNE (déclaré volontairement).
//  - mode local : tout reste sur l'appareil (sauvegarde JSON incluse via
//    le registre des modules) ;
//  - mode connecté : la source des automatisations et des déclenchements est
//    le SERVEUR (tables automations / automation_runs via backend/forms.js) ;
//    ce store ne garde que le détail d'exécution de l'appareil qui a exécuté.
// ============================================================

import { createModuleStore, newId, nowIso } from '../core/createModuleStore.js';
import { normalizeAutomation } from './model.js';

export const MAX_RUNS = 1000;
export const MAX_RESPONSES = 2000;

const sortByDate = (list, key = 'createdAt') => list.sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));

export const useAutomationsStore = createModuleStore({
  name: 'automations',
  label: 'Automatisations',
  version: 1,
  initialState: { automations: {}, responses: {}, ingested: {}, runs: {} },
  slices: [],
  actions: (set, get, h) => ({
    // ── Automatisations (mode local) ──
    saveAutomation: (a) => h.upsert('automations', normalizeAutomation(a)),
    deleteAutomation: (id) => h.remove('automations', id),
    setEnabled: (id, enabled) => {
      const a = get().automations[id];
      return a ? h.upsert('automations', { ...a, enabled: !!enabled }) : null;
    },
    duplicateAutomation: (id) => {
      const a = get().automations[id];
      if (!a) return null;
      const copy = normalizeAutomation({ ...JSON.parse(JSON.stringify(a)), id: newId(), name: `${a.name} (copie)`, enabled: false, serverId: undefined, createdAt: undefined });
      return h.upsert('automations', copy);
    },

    // ── Réponses locales ──
    addResponse: ({ id, formId, version = null, answers = {}, computed = {}, status = 'received', respondent = null, source = 'manuel', paymentStatus = null, paymentAmount = null, submittedAt }) => {
      const t = nowIso();
      const rec = {
        id: id || newId(), formId, version, status, answers, computed, source,
        ...(respondent ? { respondent } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(Number.isFinite(paymentAmount) ? { paymentAmount } : {}),
        submittedAt: submittedAt || t, tags: [], history: [{ at: t, action: 'submitted' }],
      };
      set(s => {
        let responses = { ...s.responses, [rec.id]: { ...rec, createdAt: t, updatedAt: t } };
        const ids = Object.keys(responses);
        if (ids.length > MAX_RESPONSES) {
          const keep = new Set(sortByDate(Object.values(responses), 'submittedAt').slice(0, MAX_RESPONSES).map(r => r.id));
          responses = Object.fromEntries(Object.entries(responses).filter(([k]) => keep.has(k)));
        }
        return { responses };
      });
      return get().responses[rec.id];
    },
    /** Modifie une réponse locale ; consigne l'historique (statut, paiement). */
    updateResponse: (id, patch, { by = '' } = {}) => {
      const r = get().responses[id];
      if (!r) return null;
      const history = [...(r.history || [])];
      const at = nowIso();
      if (patch.status !== undefined && patch.status !== r.status) history.push({ at, by, action: 'status', from: r.status, to: patch.status });
      if (patch.paymentStatus !== undefined && patch.paymentStatus !== r.paymentStatus) history.push({ at, by, action: 'payment', from: r.paymentStatus || null, to: patch.paymentStatus });
      return h.upsert('responses', { ...r, ...patch, history: history.slice(-100) });
    },
    deleteResponse: (id) => h.remove('responses', id),
    markIngested: (entryId, responseId) => set(s => ({ ingested: { ...s.ingested, [entryId]: responseId } })),

    // ── Journal ──
    putRun: (run) => {
      const t = nowIso();
      const rec = { ...run, id: run.id || newId(), createdAt: run.createdAt || t, updatedAt: t };
      set(s => {
        let runs = { ...s.runs, [rec.id]: rec };
        if (Object.keys(runs).length > MAX_RUNS) {
          // On garde les plus récentes, jamais celles en attente.
          const list = sortByDate(Object.values(runs));
          const active = new Set(['pending_approval', 'scheduled', 'queued', 'running']);
          const keep = new Set([...list.filter(r => active.has(r.status)).map(r => r.id), ...list.slice(0, MAX_RUNS).map(r => r.id)]);
          runs = Object.fromEntries(Object.entries(runs).filter(([k]) => keep.has(k)));
        }
        return { runs };
      });
      return rec;
    },
    patchRun: (id, patch) => {
      const r = get().runs[id];
      if (!r) return null;
      const next = { ...r, ...patch, updatedAt: nowIso() };
      set(s => ({ runs: { ...s.runs, [id]: next } }));
      return next;
    },
    deleteRun: (id) => h.remove('runs', id),
    clearFinishedRuns: () => set(s => ({
      runs: Object.fromEntries(Object.entries(s.runs).filter(([, r]) => ['pending_approval', 'scheduled', 'queued', 'running'].includes(r.status))),
    })),
  }),
});

/** Exécution existante pour une clé (idempotence). */
export const findRunByKey = (runs, key) => Object.values(runs || {}).find(r => r.key === key && !r.simulate) || null;
