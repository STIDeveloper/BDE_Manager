// ============================================================
// STUDIO FORMULAIRES — fabrique de définitions (modèles et éditeur)
// ============================================================
// Petites fonctions pures pour écrire des définitions lisibles :
//   q('email', 'email', 'Ton adresse e-mail', { required: true })
//   opts('Oui', 'Non')  → [{ value: 'oui', label: 'Oui' }, …]
// Les identifiants des éléments n'ont besoin d'être uniques qu'au sein
// d'une définition : les modèles utilisent des ids lisibles (q_<clé>).

import { DEFAULT_STATUSES } from '../schema.js';
import { slugify } from '../engine/index.js';
import { themeFromPreset } from './themes.js';

/** Valeur d'option à partir d'un libellé : « Végétarien » → « vegetarien ». */
export const optionValue = label => slugify(label).replace(/-/g, '_');

/** Options à partir de libellés ou d'objets { value?, label, … }. */
export function opts(...list) {
  return list.flat().map(x => (typeof x === 'string' ? { value: optionValue(x), label: x } : { value: x.value ?? optionValue(x.label), ...x }));
}

/** Question. */
export function q(key, type, label, extra = {}) {
  return { id: `q_${key}`, kind: 'question', key, type, label, ...extra };
}

/** Section (bloc titré, éventuellement répétable). */
export function section(id, title, items, extra = {}) {
  return { id, kind: 'section', title, items, ...extra };
}

/** Bloc de texte. */
export function text(id, value, extra = {}) {
  return { id, kind: 'content', format: 'text', text: value, ...extra };
}

/** Colonnes (2 ou 3). */
export function columns(id, ...cols) {
  return { id, kind: 'columns', columns: cols };
}

/** Page. */
export function page(id, title, items, extra = {}) {
  return { id, title, items, ...extra };
}

/** Réglages par défaut (Settings) pour un type de formulaire. */
export function defaultSettings(kind = 'standard', overrides = {}) {
  const base = {
    access: 'link',
    identity: 'optional',
    opensAt: null,
    closesAt: null,
    maxResponses: null,
    quotas: [],
    waitlist: false,
    onePerPerson: false,
    allowEdit: 'never',
    saveDraft: true,
    showSummary: true,
    pdfReceipt: false,
    confirmation: { title: 'Merci !', message: 'Ta réponse a bien été enregistrée.', redirectUrl: '' },
    notifications: { onSubmit: [], respondentReceipt: false },
    antiSpam: { turnstile: false, honeypot: true, rateLimitPerHour: 20 },
    retentionDays: 365,
    consentText: 'Les informations recueillies sont utilisées uniquement par le BDE pour traiter ta réponse. Tu peux demander leur suppression à tout moment.',
    embed: { allowed: false, origins: [] },
    statuses: structuredClone(DEFAULT_STATUSES),
  };
  if (kind === 'vote') {
    Object.assign(base, {
      access: 'members', identity: 'required', onePerPerson: true, saveDraft: false, showSummary: false,
      vote: { electoralRoll: 'members', list: [], anonymous: true, resultsVisibility: 'after_close', quorumPercent: null, majority: 'simple' },
    });
  }
  return { ...base, ...overrides };
}

/** Style « officiel » (votes, documents) : préréglage clair, police à empattements. */
export const OFFICIAL_THEME = { preset: 'light', accent: '#1f2937', background: { type: 'color', value: '#ffffff' }, font: 'serif', radius: 'sm', progressBar: 'steps', animations: false, density: 'compact' };

/** Squelette complet d'une FormDefinition. */
export function baseDefinition({ title = 'Nouveau formulaire', description = '', kind = 'standard', pages, variables = [], theme = 'light', settings = {} } = {}) {
  const t = new Date().toISOString();
  return {
    id: '',
    slug: slugify(title),
    title,
    description,
    kind,
    status: 'draft',
    pages: pages || [page('page_1', 'Page 1', [])],
    variables,
    // theme : identifiant de préréglage, ou { preset, …surcharges }
    theme: typeof theme === 'string' ? themeFromPreset(theme) : { ...themeFromPreset(theme?.preset || 'light'), ...theme },
    settings: defaultSettings(kind, settings),
    automations: [],
    createdAt: t,
    updatedAt: t,
  };
}
