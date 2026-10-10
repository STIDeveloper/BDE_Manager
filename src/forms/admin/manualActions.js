// ============================================================
// ADMINISTRATION DES RÉPONSES — actions manuelles via les automatisations
// ============================================================
// Déclenchement manuel d'une automatisation sur une réponse et envoi des
// candidats retenus au moteur d'affectation : on passe par le pipeline du
// module Automatisations (mêmes droits, même journal, mêmes actions).
import { useAutomationsStore, loadAutomationPipeline, loadAutomationServer } from './integrations.js';

const actionsIndexLoader = Object.values(import.meta.glob('../../automations/actions/index.js'))[0] || null;
export const automationsAvailable = !!(useAutomationsStore && loadAutomationPipeline);

/** Réponse d'administration → forme Response attendue par le pipeline. */
export function toPipelineResponse(row, formId) {
  return {
    id: row.id, formId, version: row.version, status: row.status, answers: row.answers || {}, computed: row.computed || {},
    respondent: row.respondent || {}, paymentStatus: row.paymentStatus, paymentAmount: row.paymentAmount,
    submittedAt: row.submittedAt, waitlisted: row.waitlisted,
  };
}

/** Automatisations applicables au formulaire (locales ou serveur). */
export async function listAutomationsFor(formId, mode) {
  if (mode === 'server' && loadAutomationServer) {
    const srv = await loadAutomationServer();
    const list = await srv.listServerAutomations();
    return list.filter(a => !a.formId || a.formId === formId);
  }
  if (!useAutomationsStore) return [];
  return Object.values(useAutomationsStore.getState().automations || {}).filter(a => a && (!a.formId || a.formId === formId));
}

/** Exécute maintenant une automatisation sur une réponse et l'inscrit au journal. */
export async function runAutomationManually({ automation, row, definition, mode, formId }) {
  if (!automationsAvailable) throw new Error('Le module Automatisations n\'est pas disponible.');
  const pipeline = await loadAutomationPipeline();
  const response = toPipelineResponse(row, formId);
  const key = `manuel:${automation.id}:${row.id}:${Date.now()}`;
  const startedAt = new Date().toISOString();
  const result = await pipeline.runActions({ automation, response, definition, key, connected: mode === 'server' });
  useAutomationsStore.getState().putRun({
    key, mode: mode === 'server' ? 'server' : 'local', manual: true, automationId: automation.id, automationName: `${automation.name} (manuel)`,
    formId, responseId: row.id, event: 'manual', status: result.status, actions: result.actions, conditions: result.conditions,
    durationMs: result.durationMs, attempts: 1, startedAt, finishedAt: new Date().toISOString(), executedBy: pipeline.currentUserLabel?.() || '',
  });
  return result;
}

/**
 * Envoie des candidatures au moteur d'affectation des rôles (action
 * « recruitment.addCandidate » avec son mappage par défaut, modèle
 * « Candidature au bureau »). → { ok, failed: [{ row, error }], warnings }
 */
export async function sendCandidatesToRoleEngine({ rows, definition, mode, formId, params }) {
  if (!automationsAvailable || !actionsIndexLoader) throw new Error('Le module Automatisations (action « Ajouter au moteur d\'affectation ») est indisponible.');
  const [pipeline, actions] = await Promise.all([loadAutomationPipeline(), actionsIndexLoader()]);
  if (!actions.getAction?.('recruitment.addCandidate')) throw new Error('Action « Ajouter au moteur d\'affectation » introuvable.');
  const automation = {
    id: `candidats-${formId}`, name: 'Envoi des candidats retenus', enabled: true, trigger: { type: 'response.created' },
    conditions: { mode: 'all', rules: [], formula: '' },
    actions: [{ id: 'candidat', type: 'recruitment.addCandidate', params: { ...actions.defaultParams('recruitment.addCandidate'), ...(params || {}) } }],
  };
  let ok = 0;
  const failed = [];
  const warnings = [];
  for (const row of rows) {
    const res = await pipeline.runActions({ automation, response: toPipelineResponse(row, formId), definition, key: `candidat:${row.id}`, connected: mode === 'server' });
    const a = res.actions[0];
    if (a?.status === 'ok') { ok++; (a.warnings || []).forEach(w => warnings.push(w)); } else failed.push({ row, error: a?.error || 'Échec' });
  }
  return { ok, failed, warnings };
}
