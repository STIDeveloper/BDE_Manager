// FICHIER GÉNÉRÉ par scripts/build-edge.mjs — ne pas modifier ici (source : src/forms/).
// ============================================================
// Moteur de formulaires — récapitulatif lisible des réponses
// ============================================================
// Pour le récapitulatif avant envoi, le reçu PDF et les e-mails.

import { compileForm } from './compile.js';
import { evaluateForm } from './runtime.js';
import { isEmpty, isPlainObject, toNumber, toText, formatDateFr, numberToText, hasOwn } from './values.js';

function optionLabel(list, v) {
  if (Array.isArray(list)) for (const o of list) if (o && String(o.value) === String(v)) return o.label || String(o.value);
  return toText(v);
}

function formatSize(bytes) {
  const n = toNumber(bytes) ?? 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${numberToText(Math.round(n / 102.4) / 10)} Ko`;
  return `${numberToText(Math.round(n / (1024 * 102.4)) / 10)} Mo`;
}

export function formatMoneyFr(amount, currency = 'EUR') {
  const n = toNumber(amount);
  if (n === null) return '';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sym = currency === 'EUR' ? '€' : currency;
  return `${n < 0 ? '-' : ''}${grouped},${dec} ${sym}`;
}

/** Formate une réponse en texte lisible selon le type de la question. */
export function formatAnswer(item, value, labelFor) {
  if (isEmpty(value) && item.type !== 'consent' && item.type !== 'yes_no') return '';
  const opts = item.options;
  switch (item.type) {
    case 'single_choice': case 'dropdown': case 'image_choice': case 'slots':
      return Array.isArray(value) ? value.map(v => optionLabel(opts, v)).join(', ') : optionLabel(opts, value);
    case 'multiple_choice':
      return (Array.isArray(value) ? value : [value]).map(v => optionLabel(opts, v)).join(', ');
    case 'ranking':
      return (Array.isArray(value) ? value : [value]).map((v, i) => `${i + 1}. ${optionLabel(opts, v)}`).join(' · ');
    case 'matrix': {
      if (!isPlainObject(value)) return toText(value);
      const rows = Array.isArray(opts) ? opts : [];
      const parts = [];
      for (const r of rows) {
        if (!r || !hasOwn(value, String(r.value)) || isEmpty(value[String(r.value)])) continue;
        const cell = value[String(r.value)];
        const txt = (Array.isArray(cell) ? cell : [cell]).map(c => optionLabel(item.columns, c)).join(', ');
        parts.push(`${r.label || r.value} : ${txt}`);
      }
      return parts.join(' ; ');
    }
    case 'yes_no': return value === true ? 'Oui' : value === false ? 'Non' : toText(value);
    case 'consent': return value === true ? 'Accepté' : 'Non accepté';
    case 'number': return toNumber(value) !== null ? numberToText(toNumber(value)) : toText(value);
    case 'rating': return `${toText(value)} / ${item.max ?? item.validation?.max ?? 5}`;
    case 'nps': return `${toText(value)} / 10`;
    case 'date': case 'datetime': return formatDateFr(value);
    case 'time': return typeof value === 'string' ? value.replace(':', 'h') : toText(value);
    case 'file': {
      const list = Array.isArray(value) ? value : [value];
      return list.map(f => (isPlainObject(f) ? `${f.name || 'fichier'} (${formatSize(f.size)})` : toText(f))).join(', ');
    }
    case 'signature': return 'Signature fournie';
    case 'name': return isPlainObject(value) ? [value.firstName, value.lastName].filter(Boolean).join(' ') : toText(value);
    case 'address': {
      if (!isPlainObject(value)) return toText(value);
      const city = [value.postalCode, value.city].filter(Boolean).join(' ');
      return [value.line1, value.line2, city, value.region, value.country].filter(Boolean).join(', ');
    }
    case 'payment': {
      if (!isPlainObject(value)) return formatMoneyFr(value);
      const money = formatMoneyFr(value.amount, value.currency);
      return value.option !== undefined ? `${optionLabel(opts, value.option)} — ${money}` : money;
    }
    case 'member_picker': case 'event_picker': {
      const list = Array.isArray(value) ? value : [value];
      const kind = item.type === 'member_picker' ? 'member' : 'event';
      return list.map(id => (typeof labelFor === 'function' ? labelFor(kind, id) || toText(id) : toText(id))).join(', ');
    }
    default:
      if (Array.isArray(value)) return value.map(toText).join(', ');
      return toText(value);
  }
}

/**
 * Liste lisible des réponses, dans l'ordre du formulaire.
 * options : { context? (pour la visibilité), includeEmpty?: false, includeHidden?: false,
 *             labelFor?: (kind 'member'|'event', id) → libellé }
 * → [{ key, label, value: string, sensitive? }]
 */
export function summarizeAnswers(definition, answers, options = {}) {
  const c = compileForm(definition);
  const opts = options || {};
  const input = isPlainObject(answers) ? answers : {};
  const ev = evaluateForm(definition, input, opts.context || {});
  const out = [];
  const push = (key, label, value, item) => {
    if (!value && !opts.includeEmpty) return;
    const line = { key, label, value: value || '—' };
    if (item.sensitive) line.sensitive = true;
    out.push(line);
  };
  const lineFor = (q, value) => {
    if (q.item.repeat && Array.isArray(value)) return value.map(v => formatAnswer(q.item, v, opts.labelFor)).filter(Boolean).join(' | ');
    return formatAnswer(q.item, value, opts.labelFor);
  };
  const doneGroups = new Set();
  for (const q of c.questions) {
    if (q.repeatKey) {
      const gk = q.repeatKey;
      if (doneGroups.has(gk)) continue;
      doneGroups.add(gk);
      const g = c.repeatGroups.get(gk);
      if (!ev.visible.has(gk)) continue;
      const list = Array.isArray(input[gk]) ? input[gk] : [];
      const title = g.item.title || gk;
      list.forEach((inst, i) => {
        if (!isPlainObject(inst)) return;
        for (const ck of g.childKeys) {
          const cq = c.byKey.get(ck);
          push(`${gk}.${i}.${ck}`, `${title} n°${i + 1} — ${cq.item.label || ck}`, lineFor(cq, inst[ck]), cq.item);
        }
      });
      continue;
    }
    if (!ev.visible.has(q.key)) continue;
    if (q.type === 'hidden' && !opts.includeHidden) continue;
    const value = q.type === 'calculated' ? ev.computed[q.key] : hasOwn(input, q.key) ? input[q.key] : ev.defaults[q.key];
    push(q.key, q.item.label || q.key, lineFor(q, value), q.item);
  }
  return out;
}
