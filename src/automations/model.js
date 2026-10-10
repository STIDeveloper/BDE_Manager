// ============================================================
// AUTOMATISATIONS — modèle (déclencheurs, conditions, forme)
// ============================================================
// Automation :
// {
//   id, name, description?, enabled, requiresApproval,
//   formId: id CLIENT du formulaire (store forms) | null (tous),
//   trigger: { type: 'response.created'|'response.status_changed'|'payment.paid'|'condition'|'schedule',
//              status?: string            // status_changed : statut cible (vide = tout changement)
//              on?: 'response.created'|'response.updated'|'response.status_changed' // condition
//              when?: Expr                // condition : formule à remplir
//              schedule?: { from: 'answer'|'fixed', key?, date?, offsetDays, time } },
//   conditions: { mode: 'all'|'any', rules: [{ field, op, value }], formula?: Expr },
//   actions: [{ id, type, params: { … }, label? }],
//   templateId?, createdAt, updatedAt, serverId?
// }
// Côté serveur (table automations) : trigger.event ∈ { response.created,
// response.updated, response.status_changed, payment.paid } → serverTrigger().
// ============================================================

import { newId } from '../core/createModuleStore.js';
import { parseDate, todayIso } from '../forms/engine/index.js';
import { truthy } from '../forms/engine/index.js';
import { evalFormula } from './mapping.js';

export const TRIGGERS = [
  { id: 'response.created', label: 'Nouvelle réponse', hint: 'À chaque nouvelle réponse au formulaire.' },
  { id: 'response.status_changed', label: 'Changement de statut', hint: 'Quand une réponse passe à un statut (ex. « Validé »).' },
  { id: 'payment.paid', label: 'Paiement confirmé', hint: 'Quand le paiement d\'une réponse est confirmé (en ligne ou hors ligne).' },
  { id: 'condition', label: 'Condition remplie', hint: 'Quand une formule devient vraie sur la réponse.' },
  { id: 'schedule', label: 'Date atteinte', hint: 'À une date calculée depuis la réponse (ex. 2 jours avant la date choisie).' },
];
export const TRIGGER_LABEL = Object.fromEntries(TRIGGERS.map(t => [t.id, t.label]));

export const CONDITION_EVENTS = [
  { id: 'response.created', label: 'à la réception' },
  { id: 'response.updated', label: 'à la modification par le répondant' },
  { id: 'response.status_changed', label: 'au changement de statut' },
];

export const OPERATORS = [
  { id: 'eq', label: 'est égal à', needsValue: true },
  { id: 'neq', label: 'est différent de', needsValue: true },
  { id: 'contains', label: 'contient', needsValue: true },
  { id: 'not_contains', label: 'ne contient pas', needsValue: true },
  { id: 'gt', label: 'est supérieur à', needsValue: true },
  { id: 'gte', label: 'est supérieur ou égal à', needsValue: true },
  { id: 'lt', label: 'est inférieur à', needsValue: true },
  { id: 'lte', label: 'est inférieur ou égal à', needsValue: true },
  { id: 'not_empty', label: 'est renseigné', needsValue: false },
  { id: 'empty', label: 'est vide', needsValue: false },
];

export const RUN_STATUS = {
  pending_approval: { label: 'À approuver', badge: 'badge-amber' },
  scheduled: { label: 'Planifiée', badge: 'badge-violet' },
  queued: { label: 'En file', badge: 'badge-brand' },
  running: { label: 'En cours', badge: 'badge-brand' },
  done: { label: 'Réussie', badge: 'badge-emerald' },
  partial: { label: 'Partielle', badge: 'badge-amber' },
  failed: { label: 'Échec', badge: 'badge-rose' },
  skipped: { label: 'Conditions non remplies', badge: 'badge-neutral' },
  cancelled: { label: 'Refusée', badge: 'badge-neutral' },
};

/** Événement serveur correspondant à un déclencheur. */
export function serverTrigger(trigger = {}) {
  switch (trigger.type) {
    case 'response.status_changed': return trigger.status ? { event: 'response.status_changed', status: trigger.status } : { event: 'response.status_changed' };
    case 'payment.paid': return { event: 'payment.paid' };
    case 'condition': return { event: CONDITION_EVENTS.some(e => e.id === trigger.on) ? trigger.on : 'response.created' };
    default: return { event: 'response.created' };
  }
}

/** Le déclencheur réagit-il à cet événement ? */
export function triggerMatches(trigger = {}, event, payload = {}) {
  const t = trigger.type || 'response.created';
  if (t === 'condition') return (trigger.on || 'response.created') === event;
  if (t === 'schedule') return event === 'response.created';
  if (t !== event) return false;
  if (t === 'response.status_changed' && trigger.status && payload.to !== trigger.status) return false;
  return true;
}

export function emptyAutomation(patch = {}) {
  return {
    id: newId(),
    name: 'Nouvelle automatisation',
    description: '',
    enabled: false,
    requiresApproval: false,
    formId: null,
    trigger: { type: 'response.created' },
    conditions: { mode: 'all', rules: [], formula: '' },
    actions: [],
    ...patch,
  };
}

/** Complète / nettoie une automatisation (import, serveur, modèle). */
export function normalizeAutomation(a = {}) {
  const base = emptyAutomation();
  const cond = a.conditions && !Array.isArray(a.conditions) && typeof a.conditions === 'object' ? a.conditions : {};
  return {
    ...base,
    ...a,
    id: a.id || base.id,
    name: String(a.name || base.name).slice(0, 200),
    enabled: !!a.enabled,
    requiresApproval: !!a.requiresApproval,
    trigger: { type: 'response.created', ...(a.trigger || {}) },
    conditions: {
      mode: cond.mode === 'any' ? 'any' : 'all',
      rules: Array.isArray(cond.rules) ? cond.rules.filter(r => r && r.field) : [],
      formula: String(cond.formula || ''),
    },
    actions: (Array.isArray(a.actions) ? a.actions : []).filter(x => x && x.type).map(x => ({ id: x.id || newId(), type: x.type, params: { ...(x.params || {}) }, ...(x.label ? { label: x.label } : {}) })),
  };
}

const quote = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const fieldRef = (f) => String(f || '').replace(/^reponse\./, '');
const numOrText = (v) => (/^-?\d+([.,]\d+)?$/.test(String(v ?? '').trim()) ? String(v).trim().replace(',', '.') : quote(v));

/** Règle visuelle → formule. */
export function ruleToExpr(rule) {
  const f = fieldRef(rule.field);
  if (!/^[a-zA-Z_][\w]*(\.[\w]+)*$/.test(f)) return 'FAUX';
  switch (rule.op) {
    case 'eq': return `${f} = ${numOrText(rule.value)}`;
    case 'neq': return `${f} <> ${numOrText(rule.value)}`;
    case 'contains': return `CONTIENT(${f}; ${quote(rule.value)})`;
    case 'not_contains': return `NON(CONTIENT(${f}; ${quote(rule.value)}))`;
    case 'gt': return `${f} > ${numOrText(rule.value)}`;
    case 'gte': return `${f} >= ${numOrText(rule.value)}`;
    case 'lt': return `${f} < ${numOrText(rule.value)}`;
    case 'lte': return `${f} <= ${numOrText(rule.value)}`;
    case 'empty': return `VIDE(${f})`;
    case 'not_empty': return `NON_VIDE(${f})`;
    default: return 'VRAI';
  }
}

/** Formule complète des conditions (constructeur visuel + formule libre). */
export function conditionsExpr(conditions = {}) {
  const parts = (conditions.rules || []).map(r => `(${ruleToExpr(r)})`);
  const visual = parts.length ? parts.join(conditions.mode === 'any' ? ' OU ' : ' ET ') : '';
  const formula = String(conditions.formula || '').trim();
  if (visual && formula) return `(${visual}) ET (${formula})`;
  return visual || formula;
}

/**
 * Évalue déclencheur « condition » + conditions sur une réponse.
 * → { ok, expr, errors, details: [{ label, ok }] }
 */
export function checkConditions(automation, scope) {
  const details = [];
  const errors = [];
  let triggerOk = true;
  if (automation.trigger?.type === 'condition' && String(automation.trigger.when || '').trim()) {
    const r = evalFormula(automation.trigger.when, scope);
    errors.push(...r.errors);
    triggerOk = truthy(r.value);
    details.push({ label: `Déclencheur : ${automation.trigger.when}`, ok: triggerOk });
  }
  const c = automation.conditions || {};
  const ruleResults = (c.rules || []).map(rule => {
    const r = evalFormula(ruleToExpr(rule), scope);
    errors.push(...r.errors);
    const ok = truthy(r.value);
    details.push({ label: ruleToExpr(rule), ok });
    return ok;
  });
  let visualOk = true;
  if (ruleResults.length) visualOk = c.mode === 'any' ? ruleResults.some(Boolean) : ruleResults.every(Boolean);
  let formulaOk = true;
  if (String(c.formula || '').trim()) {
    const r = evalFormula(c.formula, scope);
    errors.push(...r.errors);
    formulaOk = truthy(r.value);
    details.push({ label: c.formula, ok: formulaOk });
  }
  return { ok: triggerOk && visualOk && formulaOk, expr: conditionsExpr(c), errors, details };
}

/**
 * Date d'exécution d'un déclencheur « Date atteinte » (ISO) ou null.
 * schedule : { from: 'answer'|'fixed', key, date, offsetDays, time }
 */
export function scheduleDueAt(trigger, response) {
  const s = trigger?.schedule || {};
  let base;
  if (s.from === 'fixed') base = parseDate(s.date);
  else if (s.key) {
    const v = response?.answers?.[s.key];
    base = parseDate(typeof v === 'string' ? v.slice(0, 10) : v);
  } else base = parseDate(String(response?.submittedAt || todayIso()).slice(0, 10));
  // (base : { y, m, d })
  if (!base) return null;
  const dt = new Date(base.y, base.m - 1, base.d + (Number(s.offsetDays) || 0));
  const [hh, mm] = /^\d{2}:\d{2}$/.test(String(s.time || '')) ? s.time.split(':').map(Number) : [9, 0];
  dt.setHours(hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Clé d'idempotence : une exécution par réponse et par automatisation. */
export const runKey = (automationId, responseId) => `${automationId}:${responseId}`;
