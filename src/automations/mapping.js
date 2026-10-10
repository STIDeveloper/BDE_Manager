// ============================================================
// AUTOMATISATIONS — mappage des champs (réponse → paramètres)
// ============================================================
// Un paramètre d'action est une valeur fixe OU un texte contenant des
// jetons remplacés à l'exécution :
//   {reponse.cle}            valeur de la réponse (nom → « Prénom Nom »,
//                            liste → « a, b », paiement → montant)
//   {reponse.cle.sous_cle}   partie d'une réponse structurée (identite.firstName)
//   {reponse.cle|libelle}    LIBELLÉ de l'option choisie (pas sa valeur)
//   {info.id|statut|email|date|montant|formulaire|paiement}  métadonnées
//   {membre.id}              membre créé / retrouvé par une étape précédente
//                            (sinon membre lié au répondant)
//   {etape.memberId|transactionId|taskId|candidateId|documentRef|reminderId|participantId}
//   {aujourdhui}             date du jour (AAAA-MM-JJ)
// Un paramètre qui commence par « = » est une FORMULE du Studio
// Formulaires (src/forms/engine/README.md), ex. `=SI(age >= 18; "Majeur"; "Mineur")`
// ou `=AUJOURDHUI() + 7`. Aucune exécution de code : moteur dédié.
// Un paramètre composé d'UN SEUL jeton garde le type de la valeur
// (liste, nombre, booléen…).
// ============================================================

import { evaluate, evaluateForm, flattenItems, compileForm, isEmpty, todayIso } from '../forms/engine/index.js';

const TOKEN_RX = /\{\s*([a-zA-Z_][\w]*(?:\.[\w]+)*)(?:\s*\|\s*(libelle|label))?\s*\}/g;
const SINGLE_TOKEN_RX = /^\s*\{\s*([a-zA-Z_][\w]*(?:\.[\w]+)*)(?:\s*\|\s*(libelle|label))?\s*\}\s*$/;

/** Questions d'une définition : [{ key, label, type, options, item }]. */
export function formQuestions(definition) {
  if (!definition) return [];
  const out = [];
  const seen = new Set();
  try {
    for (const { item, repeatKey } of flattenItems(definition)) {
      if (item?.kind !== 'question' || !item.key || seen.has(item.key)) continue;
      seen.add(item.key);
      out.push({ key: item.key, label: item.label || item.key, type: item.type, options: item.options || [], item, ...(repeatKey ? { repeatKey } : {}) });
    }
    (definition.variables || []).forEach(v => {
      if (v?.key && !seen.has(v.key)) { seen.add(v.key); out.push({ key: v.key, label: v.label || v.key, type: 'variable', options: [], item: null }); }
    });
  } catch { /* définition invalide : aucune question */ }
  return out;
}

/** Clés connues d'une définition (pour signaler les jetons orphelins). */
export function knownKeys(definition) {
  if (!definition) return new Set();
  try { return new Set([...(compileForm(definition).keys || []), ...formQuestions(definition).map(q => q.key)]); } catch { return new Set(formQuestions(definition).map(q => q.key)); }
}

/** Entrées du menu « insérer un champ » pour l'éditeur. */
export function mappingMenu(definition) {
  const fields = [];
  formQuestions(definition).forEach(q => {
    fields.push({ token: `{reponse.${q.key}}`, label: q.label, group: 'Réponse', type: q.type });
    if (q.type === 'name') {
      fields.push({ token: `{reponse.${q.key}.firstName}`, label: `${q.label} — prénom`, group: 'Réponse', type: 'short_text' });
      fields.push({ token: `{reponse.${q.key}.lastName}`, label: `${q.label} — nom`, group: 'Réponse', type: 'short_text' });
    }
    if (q.type === 'payment') fields.push({ token: `{reponse.${q.key}.amount}`, label: `${q.label} — montant`, group: 'Réponse', type: 'number' });
    if (['single_choice', 'dropdown', 'multiple_choice', 'image_choice', 'ranking'].includes(q.type)) {
      fields.push({ token: `{reponse.${q.key}|libelle}`, label: `${q.label} (libellé)`, group: 'Réponse', type: 'short_text' });
    }
  });
  const meta = [
    ['{info.id}', 'Identifiant de la réponse'], ['{info.statut}', 'Statut de la réponse'],
    ['{info.email}', 'Email du répondant'], ['{info.date}', 'Date de la réponse'],
    ['{info.montant}', 'Montant payé'], ['{info.formulaire}', 'Titre du formulaire'],
    ['{membre.id}', 'Membre (étape précédente ou répondant)'],
    ['{etape.transactionId}', 'Opération créée (étape précédente)'],
    ['{aujourdhui}', 'Date du jour'],
  ];
  meta.forEach(([token, label]) => fields.push({ token, label, group: 'Informations', type: 'meta' }));
  return fields;
}

/** Jetons d'un texte (pour la validation). */
export function tokensOf(value) {
  const out = [];
  if (typeof value !== 'string') return out;
  for (const m of value.matchAll(TOKEN_RX)) out.push(m[1]);
  return out;
}

/** Contexte d'une exécution : réponse + définition + sorties des étapes. */
export function buildScope({ response, definition, outputs = {}, now = new Date() }) {
  const answers = response?.answers && typeof response.answers === 'object' ? response.answers : {};
  let computed = response?.computed && typeof response.computed === 'object' ? response.computed : {};
  // Champs calculés absents (réponse locale ancienne, import) : recalculés.
  if (definition) {
    try { computed = { ...(evaluateForm(definition, answers, { now }).computed || {}), ...computed }; } catch { /* définition invalide */ }
  }
  // Sections répétables : answers.groupe = [{ cle: v }] → cle = liste des valeurs
  // (même convention que le langage de formules).
  const flat = {};
  Object.values(answers).forEach(v => {
    if (!Array.isArray(v) || !v.length || !v.every(x => x && typeof x === 'object' && !Array.isArray(x))) return;
    v.forEach(row => Object.keys(row).forEach(k => { if (!(k in answers)) (flat[k] ||= []).push(row[k]); }));
  });
  const questions = new Map(formQuestions(definition).map(q => [q.key, q]));
  const info = {
    id: response?.id || '',
    statut: response?.status || '',
    email: response?.respondent?.email || findEmail(answers, questions) || '',
    date: String(response?.submittedAt || '').slice(0, 10),
    montant: paymentAmount(response, answers, questions),
    paiement: response?.paymentStatus || '',
    formulaire: definition?.title || '',
  };
  const membre = { id: outputs.memberId || response?.respondent?.memberId || '' };
  return { answers: { ...computed, ...flat, ...answers }, info, membre, etape: { ...outputs }, questions, now, today: todayIso(now) };
}

function findEmail(answers, questions) {
  for (const [key, q] of questions) if (q.type === 'email' && typeof answers[key] === 'string' && answers[key]) return answers[key];
  return '';
}

function paymentAmount(response, answers, questions) {
  if (Number.isFinite(response?.paymentAmount)) return response.paymentAmount;
  for (const [key, q] of questions) {
    if (q.type === 'payment' && answers[key] && Number.isFinite(Number(answers[key].amount))) return Number(answers[key].amount);
  }
  return null;
}

function optionLabel(q, v) {
  const o = (q?.options || []).find(x => String(x.value) === String(v));
  return o ? (o.label || String(o.value)) : v;
}

/** Valeur brute d'un chemin de jeton. */
function lookup(path, scope, wantLabel) {
  const [head, ...rest] = path.split('.');
  let v;
  if (head === 'reponse') {
    const key = rest.shift();
    v = scope.answers[key];
    if (wantLabel && v !== undefined && v !== null) {
      const q = scope.questions.get(key);
      v = Array.isArray(v) ? v.map(x => optionLabel(q, x)) : optionLabel(q, v);
    }
  } else if (head === 'info') v = scope.info; else if (head === 'membre') v = scope.membre;
  else if (head === 'etape') v = scope.etape; else if (head === 'aujourdhui') return scope.today;
  else return undefined;
  for (const seg of rest) {
    if (v === null || v === undefined) return undefined;
    v = typeof v === 'object' ? v[seg] : undefined;
  }
  return v;
}

/** Valeur → texte lisible (nom, adresse, paiement, liste, booléen). */
export function valueToText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (Array.isArray(v)) return v.map(valueToText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    if ('firstName' in v || 'lastName' in v) return [v.firstName, v.lastName].filter(Boolean).join(' ');
    if ('amount' in v) return String(v.amount ?? '');
    if ('line1' in v || 'city' in v) return [v.line1, v.line2, [v.postalCode, v.city].filter(Boolean).join(' '), v.country].filter(Boolean).join(', ');
    if ('name' in v) return String(v.name);
    return '';
  }
  return String(v);
}

/** Scope des formules : réponses + info + membre + etape. */
function formulaScope(scope) {
  return (name) => {
    if (name === 'info') return scope.info;
    if (name === 'membre') return scope.membre;
    if (name === 'etape') return scope.etape;
    return Object.prototype.hasOwnProperty.call(scope.answers, name) ? scope.answers[name] : null;
  };
}

/** Évalue une formule (condition, paramètre). → { value, errors } */
export function evalFormula(expr, scope) {
  const diagnostics = [];
  const value = evaluate(String(expr || ''), formulaScope(scope), { now: scope.now, diagnostics });
  return { value, errors: diagnostics.map(d => d.message) };
}

/**
 * Résout un paramètre. Les valeurs non textuelles (booléen, liste d'ids…)
 * sont renvoyées telles quelles ; les listes de textes sont résolues
 * élément par élément.
 */
export function resolveValue(raw, scope) {
  if (Array.isArray(raw)) return raw.flatMap(v => { const r = resolveValue(v, scope); return Array.isArray(r) ? r : [r]; }).filter(v => !isEmpty(v));
  if (raw && typeof raw === 'object') return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, resolveValue(v, scope)]));
  if (typeof raw !== 'string') return raw;
  const s = raw;
  if (s.trim().startsWith('=')) {
    const { value, errors } = evalFormula(s.trim().slice(1), scope);
    if (errors.length) throw new Error(`Formule « ${s.trim().slice(0, 60)} » : ${errors[0]}`);
    return value;
  }
  const single = s.match(SINGLE_TOKEN_RX);
  if (single) {
    const v = lookup(single[1], scope, !!single[2]);
    if (v === undefined || v === null) return '';
    if (typeof v === 'object' && !Array.isArray(v)) return valueToText(v);
    return v;
  }
  return s.replace(TOKEN_RX, (_m, path, label) => valueToText(lookup(path, scope, !!label)));
}

/** Résout tous les paramètres d'une action. */
export function resolveParams(params, scope) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) out[k] = resolveValue(v, scope);
  return out;
}
