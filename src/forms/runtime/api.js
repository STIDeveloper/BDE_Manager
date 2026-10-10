// ============================================================
// STUDIO FORMULAIRES — accès au serveur depuis la page répondant
// ============================================================
// Lit le client src/backend/forms.js SANS dépendance d'ordre
// (import.meta.glob : le fichier peut être absent pendant le développement)
// et normalise ses réponses. `setFormsApi()` permet d'injecter une autre
// implémentation (intégration, aperçu, banc d'essai) ayant la même forme.

const mods = import.meta.glob('../../backend/forms.js', { eager: true });
const backend = Object.values(mods)[0] || null;

let override = null;

/** Remplace (partiellement) le client serveur. `null` rétablit le client réel. */
export function setFormsApi(impl) { override = impl || null; }

function fn(name) {
  if (override && typeof override[name] === 'function') return override[name];
  if (backend && typeof backend[name] === 'function') return backend[name];
  return null;
}

export const BACKEND_MISSING = 'Le service des formulaires en ligne n’est pas installé sur cette version de l’application.';

export class RuntimeApiError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = 'RuntimeApiError';
    this.code = extra.code ?? null;
    this.status = extra.status ?? null;
    this.fields = extra.fields ?? null;
  }
}

function need(name) {
  const f = fn(name);
  if (!f) throw new RuntimeApiError(BACKEND_MISSING, { code: 'missing' });
  return f;
}

export const hasApi = name => !!fn(name);

/** Erreur réseau (à réessayer / mettre en file) plutôt qu'un refus du serveur. */
export function isNetworkError(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (err.code === 'network') return true;
  if (err.status && err.status >= 400) return false;
  return /Failed to fetch|NetworkError|Load failed|fetch failed|injoignable|trop de temps|timeout|réseau/i.test(String(err.message || err));
}

const isPlain = v => v && typeof v === 'object' && !Array.isArray(v);

/**
 * Formulaire publié. Accepte la forme RPC ({ available, reason, form_id, definition, open, stats, viewer… })
 * ou la forme simplifiée ({ form: { id, slug, title, kind, settings }, version, definition, stats }).
 * → { available, reason?, form: { id, slug, title, kind, status, opensAt, closesAt, open }, version, definition, stats, viewer }
 */
export async function fetchPublicForm(slug) {
  const raw = await need('getPublicForm')(slug);
  if (!isPlain(raw)) return { available: false, reason: 'not_found' };
  if (raw.available === false) return { available: false, reason: raw.reason || 'not_found', title: raw.title || null };
  const def = raw.definition;
  if (!isPlain(def)) return { available: false, reason: 'not_found' };
  const f = isPlain(raw.form) ? raw.form : {};
  const settings = isPlain(def.settings) ? def.settings : isPlain(f.settings) ? f.settings : {};
  const form = {
    id: raw.form_id ?? f.id ?? def.id ?? null,
    slug: raw.slug ?? f.slug ?? def.slug ?? slug,
    title: raw.title ?? f.title ?? def.title ?? '',
    kind: raw.kind ?? f.kind ?? def.kind ?? 'standard',
    status: raw.status ?? f.status ?? def.status ?? 'published',
    opensAt: raw.opens_at ?? f.opensAt ?? settings.opensAt ?? null,
    closesAt: raw.closes_at ?? f.closesAt ?? settings.closesAt ?? null,
    open: typeof raw.open === 'boolean' ? raw.open : null,
  };
  return { available: true, form, version: raw.version ?? f.version ?? null, definition: def, stats: isPlain(raw.stats) ? raw.stats : null, viewer: isPlain(raw.viewer) ? raw.viewer : {} };
}

/**
 * Envoi. files : [{ key, file: Blob, name }]
 * → { responseId, editToken?, waitlisted, message?, paymentRequired, paymentAmountCents?, paymentUrl?, receiptCode?, score?, maxScore?, uploadErrors[] }
 */
export async function sendResponse({ slug, answers, files = [], turnstileToken = null, draftToken = null, editToken = null, honeypot = '', params = null }) {
  const out = await need('submitResponse')({ slug, answers, files, turnstileToken, draftToken, editToken, honeypot, params });
  const r = isPlain(out) ? out : {};
  return {
    responseId: r.responseId ?? r.response_id ?? null,
    editToken: r.editToken ?? editToken ?? null,
    waitlisted: !!r.waitlisted,
    message: r.message || null,
    paymentRequired: !!(r.payment?.required || r.paymentUrl),
    paymentAmountCents: r.payment?.amountCents ?? null,
    paymentLabel: r.payment?.label ?? null,
    paymentUrl: typeof r.paymentUrl === 'string' ? r.paymentUrl : null,
    receiptCode: r.receiptCode ?? r.receipt ?? null,
    score: r.score ?? null,
    maxScore: r.maxScore ?? null,
    uploadErrors: Array.isArray(r.uploadErrors) ? r.uploadErrors : [],
    updated: !!r.updated,
  };
}

/** Vote anonyme → code de reçu. */
export async function sendVote(formId, choices) {
  const r = await need('castVote')(formId, choices);
  return typeof r === 'string' ? r : r?.receipt ?? r?.receiptCode ?? null;
}

export async function checkBallot(formId, receipt) {
  return !!(await need('verifyBallot')(formId, receipt));
}

export function makeDraftToken() {
  const f = fn('newDraftToken');
  if (f) return f();
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Sauvegarde serveur du brouillon (signature positionnelle ou objet). */
export async function saveServerDraft(slug, token, answers) {
  const f = need('saveDraft');
  if (f.length >= 2) return f(slug, token, answers);
  const r = await f({ slug, answers, draftToken: token });
  return r;
}

export async function loadServerDraft(slug, token) {
  const f = need('loadDraft');
  const r = f.length >= 2 ? await f(slug, token) : await f(token);
  if (!isPlain(r)) return null;
  return { answers: isPlain(r.answers) ? r.answers : {}, updatedAt: r.updated_at ?? r.updatedAt ?? null };
}

export async function loadResponseByToken(token) {
  const r = await need('getResponseByToken')(token);
  if (!isPlain(r)) return null;
  return {
    responseId: r.response_id ?? r.responseId ?? r.id ?? null,
    slug: r.slug ?? null,
    answers: isPlain(r.answers) ? r.answers : {},
    editable: r.editable !== false,
    status: r.status ?? null,
    waitlisted: !!r.waitlisted,
    paymentStatus: r.payment_status ?? r.paymentStatus ?? null,
    submittedAt: r.submitted_at ?? r.submittedAt ?? null,
  };
}

/** URL de paiement HelloAsso d'une réponse (après envoi). */
export async function paymentUrlFor(responseId, editToken) {
  const url = await need('startPayment')(responseId, editToken);
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) throw new RuntimeApiError('Lien de paiement invalide.');
  return url;
}

/** Message d'erreur lisible. */
export function errorMessage(err) {
  if (!err) return 'Erreur inconnue.';
  if (backend?.formsErrorMessage && !(err instanceof RuntimeApiError) && err.name !== 'FormsApiError') return backend.formsErrorMessage(err);
  return String(err.message || err);
}
