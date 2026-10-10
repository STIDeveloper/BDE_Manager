// ============================================================
// STUDIO DOCUMENTS — REGISTRE DES MODÈLES
// ============================================================
import membres from './templates/membres.js';
import gouvernance from './templates/gouvernance.js';
import organisation from './templates/organisation.js';
import partenariats from './templates/partenariats.js';
import rgpd from './templates/rgpd.js';

export const TEMPLATES = [...membres, ...gouvernance, ...organisation, ...partenariats, ...rgpd];

const BY_ID = new Map(TEMPLATES.map(t => [t.id, t]));

export const getTemplate = (id) => BY_ID.get(id) || null;

/** Valeurs par défaut du formulaire d'un modèle. */
export function defaultValues(template, ctx, member = null) {
  const values = {};
  (template?.fields || []).forEach(f => {
    values[f.key] = typeof f.default === 'function' ? f.default(ctx, member) : (f.default ?? emptyValue(f.type));
  });
  return values;
}

function emptyValue(type) {
  switch (type) {
    case 'checkbox': return false;
    case 'members': case 'list': case 'resolutions': case 'lines': return [];
    case 'number': case 'money': return '';
    default: return '';
  }
}

/** Champs obligatoires manquants (formulaire + profil de l'association). */
export function missingRequirements(template, ctx, values) {
  const missing = [];
  (template?.fields || []).forEach(f => {
    if (!f.required) return;
    const v = values?.[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) missing.push({ kind: 'field', key: f.key, label: f.label });
  });
  (template?.requires || []).forEach(path => {
    const key = path.replace(/^organization\./, '');
    if (!ctx.organization?.[key]) missing.push({ kind: 'organization', key, label: ORGANIZATION_LABELS[key] || key });
  });
  return missing;
}

export const ORGANIZATION_LABELS = {
  name: 'Nom de l\'association', shortName: 'Sigle', address: 'Adresse du siège', postalCode: 'Code postal',
  city: 'Ville', rna: 'Numéro RNA', siren: 'SIREN', email: 'Email', school: 'Établissement de rattachement',
  object: 'Objet statutaire', prefecture: 'Préfecture de déclaration', statutesDate: 'Date des statuts',
  membershipFee: 'Montant de la cotisation', logo: 'Logo',
};

/**
 * Génère les documents d'un modèle : un par membre (scope 'member') ou un
 * seul (scope 'organization').
 *
 * ⚠️ Génération en lot : les valeurs par défaut dépendent du membre (dates de
 * mandat, missions du rôle…). Seules les valeurs que l'utilisateur a
 * RÉELLEMENT modifiées doivent s'imposer à tous les membres : passer leurs
 * clés dans `options.editedKeys`. Sans cette option, toutes les valeurs
 * fournies s'appliquent (usage simple / tests).
 * @param {{ editedKeys?: string[] }} [options]
 */
export function generateDocuments(template, ctx, values, memberIds = [], options = {}) {
  const pick = (vals) => {
    if (!Array.isArray(options.editedKeys)) return vals || {};
    const out = {};
    options.editedKeys.forEach(k => { if (vals && Object.prototype.hasOwnProperty.call(vals, k)) out[k] = vals[k]; });
    return out;
  };
  const userValues = pick(values);
  if (template.scope === 'member') {
    return memberIds
      .map(id => ctx.members.find(m => m.id === id))
      .filter(Boolean)
      .map(member => template.build(ctx, { ...defaultValues(template, ctx, member), ...userValues }, member));
  }
  return [template.build(ctx, { ...defaultValues(template, ctx), ...userValues })];
}

/** Toutes les suggestions intelligentes, triées par priorité. */
export function collectSuggestions(ctx) {
  const rank = { high: 0, medium: 1, low: 2 };
  const out = [];
  TEMPLATES.forEach(t => {
    if (typeof t.suggest !== 'function') return;
    try { out.push(...(t.suggest(ctx) || []).map(s => ({ templateId: t.id, ...s }))); }
    catch (e) { console.error(`[Documents] suggestion ${t.id}`, e); }
  });
  return out.sort((a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3));
}

/** Avertissements d'un modèle pour des valeurs données (jamais bloquants). */
export function collectWarnings(template, ctx, values, member = null) {
  if (typeof template?.warnings !== 'function') return [];
  try {
    return (template.warnings(ctx, { ...defaultValues(template, ctx, member), ...values }, member) || []).filter(Boolean);
  } catch (e) {
    console.error(`[Documents] avertissements ${template.id}`, e);
    return [];
  }
}
