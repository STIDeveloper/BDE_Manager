// ============================================================
// STUDIO FORMULAIRES — client serveur (Supabase)
// ============================================================
// API de l'application vers le serveur des formulaires :
//  - administration (connecté·e à un espace, capacité « forms ») :
//    publication, réponses paginées, traitement, notes, historique,
//    automatisations, fichiers, messages aux répondants ;
//  - public (clé publique seule, aucun compte) : lecture d'un formulaire
//    publié, envoi via la fonction Edge forms-submit, brouillons, reprise
//    d'une réponse par jeton, paiement HelloAsso ;
//  - vote anonyme : castVote / verifyBallot / voteResults (RPC dédiées).
// Le moteur Supabase (engine.js) est chargé à la demande : ce module reste
// léger. Sans backend configuré, chaque fonction lève une erreur explicite.
// Aucune réponse n'est journalisée dans la console.
// ============================================================

import { getBackendConfig } from './config.js';
import { useBackendState } from './state.js';

export const LOCAL_MODE_MESSAGE = 'Formulaires publics : connecte d’abord un espace (Équipe & accès).';
const BUCKET = 'form-uploads';
const FN_TIMEOUT_MS = 20000;

export class FormsApiError extends Error {
  /** @param {string} message @param {{ status?: number, fields?: object, code?: string }} [extra] */
  constructor(message, extra = {}) {
    super(message);
    this.name = 'FormsApiError';
    this.status = extra.status ?? null;
    this.fields = extra.fields ?? null;
    this.code = extra.code ?? null;
  }
}

/** Erreur Supabase / PostgREST / réseau → message français. */
export function formsErrorMessage(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|AbortError|aborted/i.test(msg)) return 'Serveur injoignable : vérifie ta connexion puis réessaie.';
  if (/Could not find the function|function .* does not exist|relation .*form.* does not exist|PGRST202/i.test(msg + code)) {
    return 'Le serveur des formulaires n’est pas installé : exécute supabase/migrations/0002_forms.sql (voir supabase/README.md).';
  }
  if (/JWT expired|invalid JWT|PGRST301/i.test(msg + code)) return 'Session expirée : reconnecte-toi.';
  if (/row-level security|permission denied/i.test(msg) || code === '42501') {
    return /^[A-ZÀ-Ü«]/.test(msg) && !/row-level|permission denied/i.test(msg) ? msg : 'Droit insuffisant pour cette action.';
  }
  if (code === '23505' && !/[À-ÿ]/.test(msg)) return 'Cette valeur existe déjà.';
  if (!msg) return 'Erreur inconnue.';
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

const toError = (err, extra) => (err instanceof FormsApiError ? err : new FormsApiError(formsErrorMessage(err), { code: err?.code, ...extra }));

async function client() {
  if (!getBackendConfig()) throw new FormsApiError(LOCAL_MODE_MESSAGE, { code: 'local' });
  const { getBackendClient } = await import('./engine.js');
  const c = await getBackendClient();
  if (!c) throw new FormsApiError(LOCAL_MODE_MESSAGE, { code: 'local' });
  return c;
}

function workspaceId() {
  const id = useBackendState.getState().workspaceId;
  if (!id) throw new FormsApiError(LOCAL_MODE_MESSAGE, { code: 'local' });
  return id;
}

async function rpc(name, params) {
  const c = await client();
  let res;
  try { res = await c.rpc(name, params); } catch (err) { throw toError(err); }
  if (res.error) throw toError(res.error);
  return res.data;
}

const check = (res) => { if (res.error) throw toError(res.error); return res.data; };

/** Appelle une fonction Edge (clé publique + session éventuelle). */
async function callFunction(name, body) {
  const cfg = getBackendConfig();
  if (!cfg) throw new FormsApiError(LOCAL_MODE_MESSAGE, { code: 'local' });
  const c = await client();
  let token = cfg.key;
  try {
    const { data } = await c.auth.getSession();
    if (data?.session?.access_token) token = data.session.access_token;
  } catch { /* anonyme */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FN_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${cfg.url}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.key, authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new FormsApiError(err?.name === 'AbortError' ? 'Le serveur met trop de temps à répondre : réessaie.' : 'Serveur injoignable : vérifie ta connexion puis réessaie.', { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* corps non JSON */ }
  if (!res.ok || data?.ok === false) {
    if (res.status === 404 && !data?.error) throw new FormsApiError(`Fonction serveur « ${name} » non déployée (voir supabase/README.md).`, { status: 404, code: 'not_deployed' });
    throw new FormsApiError(data?.error || `Erreur du serveur (${res.status}).`, { status: res.status, fields: data?.fields || null });
  }
  return data;
}

// ── Publication (administration) ────────────────────────────

/**
 * Publie la définition : nouvelle version immuable, lien /f/<slug>.
 * @returns {Promise<{ form_id: string, version: number, slug: string, status: string }>}
 */
export async function publishForm(definition) {
  if (!definition || typeof definition !== 'object') throw new FormsApiError('Formulaire invalide.');
  return rpc('publish_form', { p_workspace: workspaceId(), p_form_id: String(definition.id), p_slug: String(definition.slug || ''), p_definition: definition });
}

/** status : 'published' (rouvrir) | 'closed' | 'archived'. */
export async function setFormStatus(formId, status) {
  return rpc('set_form_status', { p_form: formId, p_status: status });
}

/** Formulaires publiés de l'espace connecté (sans les définitions). */
export async function listPublishedForms() {
  const c = await client();
  return check(await c.from('forms').select('id, client_id, slug, title, kind, status, access, identity, current_version, opens_at, closes_at, updated_at')
    .eq('workspace_id', workspaceId()).order('updated_at', { ascending: false }));
}

/** Versions publiées d'un formulaire (définitions figées). */
export async function listFormVersions(formId) {
  const c = await client();
  return check(await c.from('form_versions').select('version, definition, published_at, published_by').eq('form_id', formId).order('version', { ascending: false }));
}

// ── Public (répondants) ─────────────────────────────────────

/**
 * Formulaire publié (anonyme autorisé). → { available: false, reason } ou
 * { available: true, form_id, version, definition, open, stats, viewer, … }
 */
export async function getPublicForm(slug) {
  return rpc('get_public_form', { p_slug: String(slug || '').trim().toLowerCase() });
}

/**
 * Envoie (ou modifie avec editToken) une réponse via la fonction Edge.
 * files : [{ key, file: File|Blob, name? }] — téléversés ensuite vers des
 * URL signées à usage unique.
 * @returns {Promise<{ ok, responseId, editToken?, waitlisted, message, payment, uploads, uploadErrors }>}
 */
export async function submitResponse({ slug, answers, files = [], turnstileToken = null, draftToken = null, editToken = null, honeypot = '', params = null }) {
  const list = (Array.isArray(files) ? files : []).filter(f => f && f.key && f.file);
  const out = await callFunction('forms-submit', {
    slug, answers, turnstileToken, draftToken, editToken, honeypot, params,
    files: list.map(f => ({ key: f.key, name: f.name || f.file.name || 'fichier', size: f.file.size, type: f.file.type || 'application/octet-stream' })),
  });
  const uploadErrors = [];
  if (Array.isArray(out.uploads) && out.uploads.length) {
    const c = await client();
    const queue = list.slice();
    for (const u of out.uploads) {
      const idx = queue.findIndex(f => f.key === u.key && (f.name || f.file.name || 'fichier').slice(0, 200) === u.name);
      const f = idx >= 0 ? queue.splice(idx, 1)[0] : null;
      if (!f) { uploadErrors.push(u.name); continue; }
      try {
        const { error } = await c.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, f.file, { contentType: f.file.type || 'application/octet-stream' });
        if (error) uploadErrors.push(u.name);
      } catch { uploadErrors.push(u.name); }
    }
  }
  return { ...out, uploadErrors };
}

/** Jeton de brouillon aléatoire (à garder dans le navigateur du répondant). */
export function newDraftToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Sauvegarde de reprise (si le formulaire l'autorise). → horodatage serveur */
export async function saveDraft(slug, token, answers) {
  return rpc('save_form_draft', { p_slug: slug, p_token: token, p_answers: answers || {} });
}

/** → { answers, updated_at } ou null */
export async function loadDraft(slug, token) {
  return rpc('load_form_draft', { p_slug: slug, p_token: token });
}

/** Réponse retrouvée par son jeton de modification (lien reçu à l'envoi). */
export async function getResponseByToken(token) {
  return rpc('get_response_by_token', { p_token: String(token || '').trim().toLowerCase() });
}

/** Réponses du compte connecté (tous espaces). */
export async function getMyResponses() {
  return rpc('get_my_responses', {});
}

/** Paiement HelloAsso d'une réponse → URL de paiement. */
export async function startPayment(responseId, editToken) {
  const out = await callFunction('helloasso/checkout', { responseId, editToken });
  return out.url;
}

// ── Réponses (administration) ───────────────────────────────

const SORTABLE = new Set(['created_at', 'updated_at', 'status', 'score', 'payment_status', 'respondent_email']);
const RESPONSE_COLUMNS = 'id, form_id, version, status, answers, computed, score, respondent_user, respondent_member, respondent_email, waitlisted, payment_status, payment_amount_cents, tags, assignee, created_at, updated_at, deleted_at';

/**
 * Réponses paginées d'un formulaire publié (id serveur).
 * filters : { status?: string|string[], tag?, assignee?, waitlisted?: boolean,
 *   paymentStatus?, email? (recherche partielle), from?, to? (ISO), version?, deleted?: boolean }
 * sort : { field, dir: 'asc'|'desc' }
 * @returns {Promise<{ rows: object[], total: number, page: number, pageSize: number }>}
 */
export async function listResponses(formId, { filters = {}, page = 1, pageSize = 50, sort = { field: 'created_at', dir: 'desc' } } = {}) {
  const c = await client();
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 500);
  const p = Math.max(Number(page) || 1, 1);
  let q = c.from('form_responses').select(RESPONSE_COLUMNS, { count: 'exact' }).eq('form_id', formId);
  q = filters.deleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
  if (Array.isArray(filters.status) && filters.status.length) q = q.in('status', filters.status);
  else if (typeof filters.status === 'string' && filters.status) q = q.eq('status', filters.status);
  if (filters.tag) q = q.contains('tags', [String(filters.tag)]);
  if (filters.assignee) q = q.eq('assignee', String(filters.assignee));
  if (typeof filters.waitlisted === 'boolean') q = q.eq('waitlisted', filters.waitlisted);
  if (filters.paymentStatus) q = q.eq('payment_status', String(filters.paymentStatus));
  if (filters.email) q = q.ilike('respondent_email', `%${String(filters.email).replace(/[%_,()]/g, '')}%`);
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);
  if (Number.isInteger(filters.version)) q = q.eq('version', filters.version);
  const field = SORTABLE.has(sort?.field) ? sort.field : 'created_at';
  q = q.order(field, { ascending: sort?.dir === 'asc', nullsFirst: false }).order('id', { ascending: true });
  const res = await q.range((p - 1) * size, p * size - 1);
  const rows = check(res) || [];
  return { rows, total: res.count ?? rows.length, page: p, pageSize: size };
}

const PATCHABLE = new Set(['status', 'tags', 'assignee', 'waitlisted', 'deleted_at', 'payment_status']);
function cleanPatch(patch) {
  const out = {};
  Object.entries(patch || {}).forEach(([k, v]) => { if (PATCHABLE.has(k)) out[k] = v; });
  if (out.tags !== undefined) out.tags = (Array.isArray(out.tags) ? out.tags : []).map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 30);
  if (!Object.keys(out).length) throw new FormsApiError('Aucune modification autorisée.');
  return out;
}

export async function updateResponseStatus(responseId, status) {
  return bulkUpdate([responseId], { status });
}

/**
 * Modifie plusieurs réponses (statut, étiquettes, responsable, liste
 * d'attente, suppression logique via deleted_at, paiement « manual »).
 * @returns {Promise<number>} nombre de réponses modifiées
 */
export async function bulkUpdate(responseIds, patch) {
  const ids = (Array.isArray(responseIds) ? responseIds : []).filter(Boolean);
  if (!ids.length) return 0;
  if (ids.length > 1000) throw new FormsApiError('1000 réponses maximum par opération.');
  const c = await client();
  const rows = check(await c.from('form_responses').update(cleanPatch(patch)).in('id', ids).select('id'));
  if ((rows || []).length < ids.length && !(rows || []).length) throw new FormsApiError('Droit insuffisant pour modifier ces réponses.');
  return (rows || []).length;
}

export const deleteResponses = (ids) => bulkUpdate(ids, { deleted_at: new Date().toISOString() });
export const restoreResponses = (ids) => bulkUpdate(ids, { deleted_at: null });

export async function addResponseNote(responseId, text) {
  return rpc('add_response_note', { p_response: responseId, p_text: String(text || '') });
}

/** Historique : [{ at, actor, action, payload }] (statuts, notes, modifications…). */
export async function getResponseHistory(responseId) {
  const c = await client();
  return check(await c.from('form_response_events').select('id, at, actor, action, payload').eq('response_id', responseId).order('at').order('id'));
}

/** URL signée temporaire pour consulter un fichier envoyé par un répondant. */
export async function getUploadUrl(path, expiresIn = 300) {
  if (typeof path !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_:.-]{1,100}$/.test(path)) {
    throw new FormsApiError('Chemin de fichier invalide.');
  }
  const c = await client();
  const { data, error } = await c.storage.from(BUCKET).createSignedUrl(path, Math.min(Math.max(expiresIn, 30), 3600));
  if (error || !data?.signedUrl) throw new FormsApiError(error ? formsErrorMessage(error) : 'Fichier introuvable.');
  return data.signedUrl;
}

/**
 * Message aux répondants (par id de réponse) ou aux membres de l'espace
 * (adresses de comptes membres uniquement) via Brevo.
 * @returns {Promise<{ sent: number, ignored: number }>}
 */
export async function sendFormEmail({ responseIds = [], to = [], subject, message, link = null }) {
  const out = await callFunction('brevo-send', { workspaceId: workspaceId(), responseIds, to, subject, message, link });
  return { sent: out.sent, ignored: out.ignored };
}

// ── Vote anonyme ────────────────────────────────────────────

/** Vote (connecté·e, inscrit·e sur la liste). → code de reçu à conserver. */
export async function castVote(formId, choices) {
  const r = await rpc('cast_vote', { p_form: formId, p_choices: choices || {} });
  return r?.receipt;
}

/** Le bulletin associé à ce reçu a-t-il été compté ? */
export async function verifyBallot(formId, receipt) {
  const r = await rpc('verify_ballot', { p_form: formId, p_receipt: String(receipt || '').trim().toLowerCase() });
  return !!r?.counted;
}

/** Résultats (selon la visibilité choisie) : { visible, reason? , ballots, electorate, participation_percent, quorum_reached, questions } */
export async function voteResults(formId) {
  return rpc('vote_results', { p_form: formId });
}

/** Participation (administration) : { electorate, voted }. */
export async function voteParticipation(formId) {
  return rpc('vote_participation', { p_form: formId });
}

// ── Automatisations ─────────────────────────────────────────

export const AUTOMATION_EVENTS = [
  { id: 'response.created', label: 'Nouvelle réponse' },
  { id: 'response.updated', label: 'Réponse modifiée par le répondant' },
  { id: 'response.status_changed', label: 'Changement de statut' },
  { id: 'payment.paid', label: 'Paiement reçu' },
];

export async function listAutomations(formId = null) {
  const c = await client();
  let q = c.from('automations').select('*').eq('workspace_id', workspaceId()).order('created_at');
  if (formId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(formId))) throw new FormsApiError('Identifiant de formulaire invalide.');
    q = q.or(`form_id.eq.${formId},form_id.is.null`);
  }
  return check(await q);
}

/**
 * Crée ou met à jour une automatisation.
 * { id?, formId?, name, trigger: { event, status? }, conditions: [], actions: [], requiresApproval, enabled }
 */
export async function saveAutomation(a) {
  const c = await client();
  const row = {
    workspace_id: workspaceId(),
    form_id: a.formId || a.form_id || null,
    name: a.name ? String(a.name).slice(0, 200) : null,
    trigger: a.trigger || {},
    conditions: a.conditions ?? [],
    actions: a.actions ?? [],
    requires_approval: !!(a.requiresApproval ?? a.requires_approval),
    enabled: a.enabled !== false,
  };
  if (a.id) return check(await c.from('automations').update(row).eq('id', a.id).select().single());
  return check(await c.from('automations').insert(row).select().single());
}

export async function deleteAutomation(id) {
  const c = await client();
  check(await c.from('automations').delete().eq('id', id));
}

export async function listAutomationRuns({ status = null, limit = 100 } = {}) {
  const c = await client();
  let q = c.from('automation_runs').select('*').eq('workspace_id', workspaceId()).order('created_at', { ascending: false }).limit(Math.min(limit, 500));
  if (status) q = q.eq('status', status);
  return check(await q);
}

/** Réserve les exécutions en file (10 min) : [{ id, response_id, event, payload, automation }] */
export async function claimAutomationRuns(limit = 20) {
  return rpc('claim_automation_runs', { p_workspace: workspaceId(), p_limit: limit });
}

/** status : 'done' | 'failed' ; result : petit objet JSON (jamais de données personnelles). */
export async function completeAutomationRun(runId, status, result = null) {
  return rpc('complete_automation_run', { p_run: runId, p_status: status, p_result: result });
}

export async function approveAutomationRun(runId, approve = true) {
  return rpc('approve_automation_run', { p_run: runId, p_approve: !!approve });
}
