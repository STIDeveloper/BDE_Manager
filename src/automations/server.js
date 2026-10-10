// ============================================================
// AUTOMATISATIONS — passerelle mode connecté (Supabase)
// ============================================================
// Le SERVEUR enregistre les déclenchements (automation_runs) ; l'APP les
// réserve (claimAutomationRuns), les exécute avec les droits de l'utilisateur
// courant puis écrit le résultat (completeAutomationRun). Ici : conversions
// entre la forme locale (model.js) et les lignes serveur, lecture d'une
// réponse par id, correspondance id client ↔ id serveur des formulaires.
// Aucune donnée personnelle n'est envoyée dans `result`.
// ============================================================

import * as formsApi from '../backend/forms.js';
import { getBackendConfig } from '../backend/config.js';
import { useBackendState } from '../backend/state.js';
import { useFormsStore } from '../modules/forms/store.js';
import { normalizeAutomation, serverTrigger } from './model.js';

export { formsApi };

export const isConnected = () => !!getBackendConfig() && !!useBackendState.getState().workspaceId;

/** id serveur d'un formulaire (publié) depuis son id client. */
export function serverFormIdOf(clientId) {
  if (!clientId) return null;
  return useFormsStore.getState().publications?.[clientId]?.serverFormId || null;
}

/** id client depuis l'id serveur (ou l'id serveur lui-même à défaut). */
export function clientFormIdOf(serverId) {
  if (!serverId) return null;
  const pubs = useFormsStore.getState().publications || {};
  const hit = Object.entries(pubs).find(([, p]) => p?.serverFormId === serverId);
  return hit ? hit[0] : serverId;
}

/** Ligne serveur → automatisation locale. */
export function fromServerRow(row) {
  const t = row.trigger && typeof row.trigger === 'object' ? row.trigger : {};
  const { event, status, ...rest } = t;
  const trigger = { type: rest.type || event || 'response.created', ...rest };
  if (status && trigger.type === 'response.status_changed') trigger.status = status;
  const meta = row.conditions && !Array.isArray(row.conditions) ? row.conditions : {};
  return normalizeAutomation({
    id: row.id, serverId: row.id, name: row.name || 'Automatisation', description: meta.description || '',
    enabled: row.enabled, requiresApproval: row.requires_approval,
    formId: clientFormIdOf(row.form_id), trigger,
    conditions: Array.isArray(row.conditions) ? {} : row.conditions, actions: row.actions,
    templateId: meta.templateId, createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

/** Automatisation locale → payload saveAutomation (backend/forms.js). */
export function toServerPayload(a) {
  const formId = a.formId ? serverFormIdOf(a.formId) : null;
  if (a.formId && !formId) throw new Error('Publie d\'abord le formulaire : le serveur ne connaît que les formulaires publiés.');
  const trig = serverTrigger(a.trigger);
  return {
    id: a.serverId || undefined,
    formId,
    name: a.name,
    trigger: { ...a.trigger, ...trig },
    conditions: { ...a.conditions, description: a.description || '', templateId: a.templateId || null },
    actions: a.actions,
    requiresApproval: a.requiresApproval,
    enabled: a.enabled,
  };
}

export async function listServerAutomations() {
  const rows = await formsApi.listAutomations();
  return (rows || []).map(fromServerRow);
}

export async function saveServerAutomation(a) {
  const row = await formsApi.saveAutomation(toServerPayload(a));
  return fromServerRow(row);
}

const RESPONSE_COLUMNS = 'id, form_id, version, status, answers, computed, score, respondent_user, respondent_member, respondent_email, waitlisted, payment_status, payment_amount_cents, tags, created_at, updated_at, deleted_at';

/** Ligne form_responses → Response (src/forms/schema.js). */
export function fromServerResponse(row) {
  if (!row) return null;
  return {
    id: row.id, formId: clientFormIdOf(row.form_id), serverFormId: row.form_id, version: row.version,
    status: row.status || 'received', answers: row.answers || {}, computed: row.computed || {},
    respondent: { email: row.respondent_email || '', memberId: row.respondent_member || '', userId: row.respondent_user || '' },
    paymentStatus: row.payment_status || null,
    paymentAmount: Number.isFinite(row.payment_amount_cents) ? row.payment_amount_cents / 100 : null,
    submittedAt: row.created_at, deleted: !!row.deleted_at, waitlisted: !!row.waitlisted,
  };
}

/** Réponse serveur par id (droits « formulaires › lecture »). */
export async function fetchServerResponse(responseId) {
  const { getBackendClient } = await import('../backend/engine.js');
  const c = await getBackendClient();
  if (!c) throw new Error(formsApi.LOCAL_MODE_MESSAGE);
  const { data, error } = await c.from('form_responses').select(RESPONSE_COLUMNS).eq('id', responseId).maybeSingle();
  if (error) throw new Error(formsApi.formsErrorMessage(error));
  if (!data) throw new Error('Réponse introuvable (supprimée ?).');
  return fromServerResponse(data);
}

/** Réponses récentes d'un formulaire (aperçu « tester sur une réponse »). */
export async function listServerResponses(clientFormId, limit = 30) {
  const sid = serverFormIdOf(clientFormId);
  if (!sid) return [];
  const { rows } = await formsApi.listResponses(sid, { pageSize: limit });
  return (rows || []).map(fromServerResponse);
}

const versionCache = new Map();
/** Définition publiée (version exacte) ; repli : brouillon local. */
export async function serverDefinition(serverFormId, version) {
  const key = `${serverFormId}:${version}`;
  if (versionCache.has(key)) return versionCache.get(key);
  let def;
  try {
    const versions = await formsApi.listFormVersions(serverFormId);
    def = (versions || []).find(v => v.version === version)?.definition || versions?.[0]?.definition || null;
  } catch { def = null; }
  if (!def) def = useFormsStore.getState().definitions[clientFormIdOf(serverFormId)] || null;
  if (def) versionCache.set(key, def);
  return def;
}

/** Une exécution « done » existe-t-elle déjà côté serveur pour (automatisation, réponse) ? */
export async function serverDoneKeys() {
  const rows = await formsApi.listAutomationRuns({ status: 'done', limit: 500 });
  return new Map((rows || []).filter(r => r.response_id && r.result?.executed).map(r => [`${r.automation_id}:${r.response_id}`, r]));
}
