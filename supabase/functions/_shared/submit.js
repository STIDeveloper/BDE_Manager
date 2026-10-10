// ============================================================
// Cœur de la fonction Edge « forms-submit » (JavaScript pur, testable).
// ============================================================
// Toutes les dépendances sont injectées (deps) :
//   rpc(name, params) → { data, error }      client Supabase (clé de service)
//   getUser(jwt) → { id, email } | null       vérification du JWT utilisateur
//   verifyTurnstile(token, ip) → boolean       null si TURNSTILE_SECRET_KEY absent
//   createUploadUrl(path) → { signedUrl, token, path }
//   sendEmail(msg) → Promise                   null si Brevo non configuré
//   background(promise)                        travail après la réponse
//   engine                                     moteur de règles (copie générée)
//   env: { appOrigin, rateSalt, appUrl }       now(): Date
//   onOriginAllowed()                          origine validée pour ce formulaire (CORS)
// Retour : { status, body } — le point d'entrée ajoute CORS et sérialise.
// Aucune donnée personnelle n'est journalisée.
// ============================================================

import { HttpError, originAllowed } from './http.js';
import { sha256Hex, randomHex, safeFileName, isEmail, isPlainObject, listQuestions, logTech, SLUG_RX } from './util.js';
import { computePaymentAmount } from './helloasso.js';
import { receiptEmail, newResponseEmail } from './emails.js';

const TOKEN_RX = /^[a-f0-9]{64}$/;
const DRAFT_RX = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_FILES = 20;
const DEFAULT_FILE_MB = 10;

const ERR = {
  duplicate: 'Tu as déjà répondu à ce formulaire.',
  closed: 'Ce formulaire est fermé.',
  edit_not_found: 'Lien de modification invalide ou expiré.',
  not_editable: 'Cette réponse ne peut plus être modifiée.',
};

/** Contrôle de forme du corps de requête (avant tout accès à la base). */
export function parseSubmitBody(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Requête invalide.');
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  if (!SLUG_RX.test(slug)) throw new HttpError(400, 'Lien de formulaire invalide.');
  if (!isPlainObject(body.answers)) throw new HttpError(400, 'Réponses manquantes.');
  if (Object.keys(body.answers).length > 600) throw new HttpError(400, 'Trop de réponses.');
  const files = body.files === undefined ? [] : body.files;
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new HttpError(400, `Fichiers invalides (${MAX_FILES} maximum).`);
  for (const f of files) {
    if (!isPlainObject(f) || typeof f.key !== 'string' || typeof f.name !== 'string' || f.name.length > 200
      || !Number.isFinite(f.size) || f.size < 0 || (f.type !== undefined && (typeof f.type !== 'string' || f.type.length > 120))) {
      throw new HttpError(400, 'Description de fichier invalide.');
    }
  }
  const opt = (v, rx, label) => {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !rx.test(v)) throw new HttpError(400, `${label} invalide.`);
    return v;
  };
  const turnstileToken = body.turnstileToken === undefined || body.turnstileToken === null ? null
    : (typeof body.turnstileToken === 'string' && body.turnstileToken.length <= 4096 ? body.turnstileToken : (() => { throw new HttpError(400, 'Jeton anti-robot invalide.'); })());
  return {
    slug,
    answers: body.answers,
    files,
    turnstileToken,
    draftToken: opt(body.draftToken, DRAFT_RX, 'Jeton de brouillon'),
    editToken: opt(body.editToken, TOKEN_RX, 'Jeton de modification'),
    honeypot: typeof body.honeypot === 'string' ? body.honeypot : (typeof body.website === 'string' ? body.website : ''),
    params: isPlainObject(body.params) ? body.params : null,
  };
}

async function rpcOrThrow(deps, name, params) {
  const { data, error } = await deps.rpc(name, params);
  if (error) {
    logTech('forms-submit', `rpc ${name}`, error);
    throw new HttpError(500, 'Erreur du serveur : réessaie dans un instant.');
  }
  return data;
}

/** Fichiers déclarés → références stockées (chemins générés par le serveur). */
export function planFiles(definition, files, ids) {
  const byKey = new Map(listQuestions(definition).filter(q => q.type === 'file').map(q => [q.key, q]));
  const refs = {};
  const uploads = [];
  for (const f of files) {
    const q = byKey.get(f.key);
    if (!q) throw new HttpError(422, 'Fichier envoyé pour une question inconnue.');
    const v = isPlainObject(q.validation) ? q.validation : {};
    const maxMb = Number.isFinite(v.maxFileSizeMb) ? Math.min(v.maxFileSizeMb, DEFAULT_FILE_MB) : DEFAULT_FILE_MB;
    if (f.size > maxMb * 1024 * 1024) throw new HttpError(422, `« ${f.name.slice(0, 60)} » dépasse ${maxMb} Mo.`, { fields: { [f.key]: `Fichier trop volumineux (${maxMb} Mo maximum).` } });
    if (Array.isArray(v.accept) && v.accept.length) {
      const ext = `.${String(f.name).split('.').pop().toLowerCase()}`;
      const type = String(f.type || '').toLowerCase();
      const ok = v.accept.some(a => {
        const s = String(a).toLowerCase().trim();
        if (s.startsWith('.')) return ext === s;
        if (s.endsWith('/*')) return type.startsWith(s.slice(0, -1));
        return type === s;
      });
      if (!ok) throw new HttpError(422, `Type de fichier non accepté : ${f.name.slice(0, 60)}`, { fields: { [f.key]: 'Type de fichier non accepté.' } });
    }
    refs[f.key] = refs[f.key] || [];
    const max = Number.isInteger(v.maxFiles) ? v.maxFiles : 10;
    if (refs[f.key].length >= max) throw new HttpError(422, `Trop de fichiers (${max} maximum).`, { fields: { [f.key]: `${max} fichier(s) maximum.` } });
    // id compatible avec le moteur (/^[A-Za-z0-9_:.-]{1,100}$/) ; chemin = espace/formulaire/réponse/id
    const id = `${randomHex(6)}-${safeFileName(f.name)}`;
    const path = `${ids.workspaceId}/${ids.formId}/${ids.responseId}/${id}`;
    const ref = { id, path, name: String(f.name).slice(0, 200), size: Math.round(f.size), type: String(f.type || 'application/octet-stream').slice(0, 120) };
    refs[f.key].push(ref);
    uploads.push({ key: f.key, ...ref });
  }
  return { refs, uploads };
}

/** Résumé lisible (accusé de réception) : questions visibles, non sensibles, hors fichiers. */
export function simpleSummary(definition, answers, visible) {
  const out = [];
  for (const q of listQuestions(definition)) {
    if (q.sensitive || ['file', 'signature', 'hidden', 'payment'].includes(q.type) || q._repeatKey) continue;
    if (visible && typeof visible.has === 'function' && !visible.has(q.key)) continue;
    const v = answers?.[q.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    const label = (x) => {
      const o = Array.isArray(q.options) ? q.options.find(op => op && String(op.value) === String(x)) : null;
      return o ? String(o.label ?? o.value) : (typeof x === 'boolean' ? (x ? 'Oui' : 'Non') : (isPlainObject(x) ? Object.values(x).filter(y => typeof y === 'string' || typeof y === 'number').join(' ') : String(x)));
    };
    out.push({ label: String(q.label || q.key).slice(0, 200), value: (Array.isArray(v) ? v.map(label).join(', ') : label(v)).slice(0, 1000) });
  }
  return out;
}

/** Compte des quotas à expression (réponses existantes évaluées par le moteur). */
async function quotaCounts(deps, def, formId, excludeId, ctxBase) {
  const quotas = Array.isArray(def?.settings?.quotas) ? def.settings.quotas : [];
  if (!quotas.some(q => q && typeof q.expr === 'string' && q.expr.trim())) return undefined;
  const E = deps.engine;
  if (typeof E.evaluate !== 'function' || typeof E.evaluateForm !== 'function') return undefined;
  const rows = await rpcOrThrow(deps, 'forms_quota_answers', { p_form: formId, p_exclude: excludeId || null });
  const counts = quotas.map(() => 0);
  for (const ans of Array.isArray(rows) ? rows : []) {
    let scope;
    try { scope = { ...E.evaluateForm(def, ans, ctxBase).values }; } catch { continue; }
    quotas.forEach((q, i) => {
      if (!q || typeof q.expr !== 'string' || !q.expr.trim()) return;
      try {
        const r = E.evaluate(q.expr, scope, { now: ctxBase.now });
        if (typeof E.truthy === 'function' ? E.truthy(r) : !!r) counts[i]++;
      } catch { /* expression invalide : ignorée */ }
    });
  }
  return counts;
}

/**
 * Traite un envoi. @returns {Promise<{ status: number, body: object }>}
 */
export async function handleSubmit({ body, origin, ip, userJwt }, deps) {
  const input = parseSubmitBody(body);
  const now = deps.now ? deps.now() : new Date();

  // Pot de miel rempli : on fait comme si tout allait bien, sans rien enregistrer.
  if (input.honeypot && input.honeypot.trim()) {
    return { status: 201, body: { ok: true, responseId: crypto.randomUUID(), waitlisted: false } };
  }

  let user = null;
  if (userJwt) {
    user = await deps.getUser(userJwt);
    if (!user) throw new HttpError(401, 'Session expirée : reconnecte-toi puis renvoie le formulaire.');
  }
  const editHash = input.editToken ? await sha256Hex(input.editToken) : null;

  for (let attempt = 0; attempt < 4; attempt++) {
    const ctx = await rpcOrThrow(deps, 'forms_submit_context', { p_slug: input.slug, p_user: user?.id || null, p_edit_hash: editHash });
    if (!ctx) throw new HttpError(404, 'Formulaire introuvable.');
    if (ctx.error) throw new HttpError(404, ERR[ctx.error] || 'Formulaire introuvable.');
    const { form, definition: def } = ctx;
    const settings = isPlainObject(def?.settings) ? def.settings : {};

    if (!originAllowed(origin, deps.env.appOrigin, settings.embed)) {
      throw new HttpError(403, 'Ce site n’est pas autorisé à envoyer des réponses à ce formulaire.');
    }
    deps.onOriginAllowed?.();
    if (form.kind === 'vote') throw new HttpError(400, 'Un vote se fait depuis le bureau de vote sécurisé, pas par ce formulaire.');
    if (!form.open) throw new HttpError(409, ERR.closed);
    if (!ctx.eligible) {
      if (!user) throw new HttpError(401, 'Connexion requise pour répondre à ce formulaire.');
      throw new HttpError(403, 'Ce formulaire est réservé : ton compte n’y a pas accès.');
    }
    if (form.identity === 'required' && !user) throw new HttpError(401, 'Connexion requise pour répondre à ce formulaire.');
    if (ctx.edit && !ctx.edit.editable) throw new HttpError(403, ERR.not_editable);

    if (attempt === 0) {
      // Limitation du débit : empreinte (IP + formulaire), jamais l'IP en clair.
      const limit = Math.min(Math.max(Number(settings.antiSpam?.rateLimitPerHour) || 20, 1), 1000);
      const key = await sha256Hex(`${deps.env.rateSalt || ''}|${ip}|${form.id}`);
      const allowed = await rpcOrThrow(deps, 'forms_rate_limit_hit', { p_key_hash: key, p_limit: limit, p_window_seconds: 3600 });
      if (!allowed) throw new HttpError(429, 'Trop d’envois depuis cette connexion : réessaie dans une heure.');

      if (settings.antiSpam?.turnstile) {
        if (!deps.verifyTurnstile) throw new HttpError(503, 'La protection anti-robot de ce formulaire n’est pas configurée sur le serveur : préviens l’organisateur.');
        if (!input.turnstileToken) throw new HttpError(400, 'Vérification anti-robot manquante : coche la case puis renvoie.');
        if (!(await deps.verifyTurnstile(input.turnstileToken, ip))) throw new HttpError(403, 'Vérification anti-robot échouée : recharge la page et réessaie.');
      }
    }

    // Fichiers : références générées par le serveur, jamais celles du client.
    const responseId = ctx.edit?.response_id || crypto.randomUUID();
    const fileKeys = new Set(listQuestions(def).filter(q => q.type === 'file').map(q => q.key));
    const plan = planFiles(def, input.files, { workspaceId: form.workspace_id, formId: form.id, responseId });
    const answers = {};
    for (const [k, v] of Object.entries(input.answers)) if (!fileKeys.has(k)) answers[k] = v;
    for (const k of fileKeys) {
      if (plan.refs[k]) answers[k] = plan.refs[k];
      else if (ctx.edit?.answers?.[k] !== undefined) answers[k] = ctx.edit.answers[k];
    }

    const stats = isPlainObject(ctx.stats) ? { ...ctx.stats } : {};
    const member = user ? { id: ctx.user?.member_id || null, email: ctx.user?.email || user.email || null } : null;
    const engineCtx = { now, member, params: input.params, stats, timeZone: 'Europe/Paris' };
    // Sélecteurs de membres / d'événements : existence vérifiée dans l'espace.
    if (listQuestions(def).some(q => q.type === 'member_picker' || q.type === 'event_picker')) {
      const lk = await rpcOrThrow(deps, 'forms_lookup', { p_ws: form.workspace_id });
      engineCtx.lookup = { members: new Set((lk?.members || []).map(String)), events: new Set((lk?.events || []).map(String)) };
    }
    const qc = await quotaCounts(deps, def, form.id, ctx.edit?.response_id, engineCtx);
    if (qc) stats.quotaCounts = qc;

    const E = deps.engine;
    const v = E.validateAnswers(def, answers, engineCtx, { server: true });
    if (!v || !v.ok) {
      return { status: 422, body: { ok: false, error: 'Certaines réponses sont invalides : corrige les champs signalés.', fields: v?.errors || {} } };
    }
    const cleaned = isPlainObject(v.cleaned) ? v.cleaned : answers;
    // Le moteur ne garde que { id, name, size, type } : on rattache le chemin de stockage.
    for (const k of fileKeys) {
      if (!Array.isArray(cleaned[k])) continue;
      const known = new Map([...(plan.refs[k] || []), ...(Array.isArray(ctx.edit?.answers?.[k]) ? ctx.edit.answers[k] : [])].map(r => [r.id, r.path]));
      cleaned[k] = cleaned[k].map(r => ({ ...r, path: known.get(r.id) || `${form.workspace_id}/${form.id}/${responseId}/${r.id}` }));
    }
    const ev = E.evaluateForm(def, cleaned, engineCtx);
    const computed = isPlainObject(v.computed) ? v.computed : (isPlainObject(ev?.computed) ? ev.computed : {});
    const score = typeof v.score === 'number' ? v.score : (typeof ev?.score === 'number' ? ev.score : null);

    const quota = E.quotaStatus({ ...def, status: form.status }, cleaned, engineCtx);
    if (!quota.allowed) return { status: 409, body: { ok: false, error: quota.message || 'Ce formulaire est complet.' } };
    const waitlisted = !ctx.edit && !!quota.waitlist;

    // Unicité : valeurs scalaires des questions marquées « uniqueAcrossResponses ».
    const unique = {};
    for (const q of listQuestions(def)) {
      const val = cleaned[q.key];
      if (q.validation?.uniqueAcrossResponses && (typeof val === 'string' || typeof val === 'number') && String(val).trim()) unique[q.key] = String(val);
    }

    // Adresse du répondant : compte connecté, sinon première question e-mail.
    const emailQ = listQuestions(def).find(q => q.type === 'email' && isEmail(cleaned[q.key]));
    const email = (user ? (ctx.user?.email || user.email) : null) || (emailQ ? String(cleaned[emailQ.key]).trim().toLowerCase() : null);

    let payment;
    try { payment = computePaymentAmount(def, cleaned); } catch (e) { throw new HttpError(422, e.message); }

    let result;
    let editToken = null;
    if (ctx.edit) {
      result = await rpcOrThrow(deps, 'forms_update_response', {
        p_form: form.id, p_edit_hash: editHash, p_answers: cleaned, p_computed: computed, p_score: score,
        p_unique: unique, p_fingerprint: ctx.fingerprint,
      });
    } else {
      editToken = randomHex(32);
      result = await rpcOrThrow(deps, 'forms_insert_response', {
        p_form: form.id, p_version: form.version, p_response_id: responseId, p_answers: cleaned, p_computed: computed,
        p_score: score, p_user: user?.id || null, p_member: ctx.user?.member_id || null, p_email: email,
        p_edit_hash: await sha256Hex(editToken), p_waitlisted: waitlisted, p_unique: unique,
        p_one_per_person: !!settings.onePerPerson, p_fingerprint: ctx.fingerprint,
        p_payment_cents: payment?.cents || 0,
      });
    }
    if (result?.code === 'retry') continue;   // une autre réponse est arrivée : on recalcule les quotas
    if (!result?.ok) {
      if (result?.code === 'unique') {
        const q = listQuestions(def).find(x => x.key === result.key);
        return { status: 409, body: { ok: false, error: `« ${q?.label || result.key} » a déjà été utilisé dans une autre réponse.`, fields: { [result.key]: 'Valeur déjà utilisée.' } } };
      }
      return { status: 409, body: { ok: false, error: ERR[result?.code] || 'Envoi impossible.' } };
    }

    // Téléversements : une URL signée par fichier (valable 2 h, usage unique).
    const uploads = [];
    for (const u of plan.uploads) {
      const s = await deps.createUploadUrl(u.path);
      uploads.push({ key: u.key, path: u.path, name: u.name, signedUrl: s.signedUrl, token: s.token });
    }

    if (input.draftToken) {
      const { error } = await deps.rpc('forms_delete_draft', { p_form: form.id, p_token: input.draftToken });
      if (error) logTech('forms-submit', 'suppression du brouillon', error);
    }

    // E-mails après la réponse HTTP (aucun contenu de réponse vers les organisateurs).
    if (deps.sendEmail && !ctx.edit) {
      const tasks = [];
      const editUrl = deps.env.appUrl && settings.allowEdit && settings.allowEdit !== 'never'
        ? `${deps.env.appUrl}/#/f/${form.slug}?modifier=${editToken}` : null;
      if (settings.notifications?.respondentReceipt && email) {
        let summary;
        try {
          const s = typeof E.summarizeAnswers === 'function' ? E.summarizeAnswers(def, cleaned, { context: engineCtx }) : null;
          // Jamais de réponse « sensible » ni de fichier dans un e-mail.
          const skip = new Set(listQuestions(def).filter(q => q.sensitive || ['file', 'signature'].includes(q.type)).map(q => q.key));
          summary = Array.isArray(s) && s.every(r => r && typeof r.label === 'string')
            ? s.filter(r => !r.sensitive && !skip.has(r.key)).map(r => ({ label: r.label, value: String(r.value ?? '') }))
            : simpleSummary(def, cleaned, ev?.visible);
        } catch { summary = simpleSummary(def, cleaned, ev?.visible); }
        tasks.push(deps.sendEmail({ to: [{ email }], ...receiptEmail({ formTitle: form.title, summary, editUrl, waitlisted, confirmationMessage: settings.confirmation?.message }) }));
      }
      const admins = (Array.isArray(settings.notifications?.onSubmit) ? settings.notifications.onSubmit : []).filter(isEmail).slice(0, 20);
      if (admins.length) {
        tasks.push(deps.sendEmail({ to: admins.map(e => ({ email: e })), ...newResponseEmail({ formTitle: form.title, appUrl: deps.env.appUrl ? `${deps.env.appUrl}/#/forms` : null, waitlisted }) }));
      }
      if (tasks.length) {
        deps.background(Promise.allSettled(tasks).then(rs => rs.forEach(r => {
          if (r.status === 'rejected' || r.value?.ok === false) logTech('forms-submit', 'e-mail non envoyé', r.reason || { code: r.value?.status });
        })));
      }
    }

    const out = {
      ok: true,
      responseId,
      waitlisted,
      message: waitlisted ? quota.message : (settings.confirmation?.message || null),
      uploads,
      payment: payment && payment.cents > 0 ? { required: true, amountCents: payment.cents, label: payment.label } : null,
      ...(settings.showSummary && score !== null ? { score, maxScore: ev?.maxScore ?? null } : {}),
    };
    if (ctx.edit) return { status: 200, body: { ...out, updated: true } };
    return { status: 201, body: { ...out, editToken } };
  }
  throw new HttpError(503, 'Trop de réponses simultanées : réessaie dans quelques secondes.');
}

