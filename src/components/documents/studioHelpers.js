// ============================================================
// STUDIO DOCUMENTS — HELPERS PURS (interface)
// ============================================================
// Aucune dépendance React / navigateur : testables sous Node
// (voir studioHelpers.test.js). Les composants leur passent les données
// déjà extraites du store / du contexte de génération.

/** Texte normalisé pour la recherche (minuscules, sans accents). */
export function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

// ------------------------------------------------------------
// PROFIL DE L'ASSOCIATION — complétude
// ------------------------------------------------------------

/** Rôle considéré comme « président » (id immuable du catalogue par défaut). */
export const PRESIDENT_ROLE_ID = 'president';

/** Membre président(e) actuel, ou null. */
export function findPresident(members) {
  return (Array.isArray(members) ? members : []).find(m => m?.mainRole === PRESIDENT_ROLE_ID) || null;
}

/**
 * Champs clés du profil (en-têtes et mentions légales des documents).
 * `field` = identifiant de champ à cibler dans l'éditeur de profil.
 */
export const PROFILE_KEY_FIELDS = [
  { key: 'name', label: 'Nom de l\'association' },
  { key: 'address', label: 'Adresse du siège' },
  { key: 'city', label: 'Ville' },
  { key: 'rna', label: 'Numéro RNA' },
  { key: 'email', label: 'Email de contact' },
  { key: 'school', label: 'Établissement' },
  { key: 'logo', label: 'Logo' },
  { key: 'signatures', label: 'Signature du/de la président(e)' },
];

/**
 * Complétude du profil : % des champs clés renseignés.
 * @returns {{ percent:number, done:number, total:number,
 *   items:{key,label,done:boolean,hint?:string}[], missing:object[], president:object|null }}
 */
export function profileCompleteness(organization, members) {
  const org = organization || {};
  const president = findPresident(members);
  const items = PROFILE_KEY_FIELDS.map(f => {
    if (f.key === 'signatures') {
      const done = !!(president && org.signatures?.[president.id]);
      return {
        ...f,
        done,
        ...(president ? {} : { hint: 'Aucun membre n\'a le rôle Président(e).' }),
      };
    }
    const v = org[f.key];
    return { ...f, done: typeof v === 'string' ? v.trim() !== '' : !!v };
  });
  const done = items.filter(i => i.done).length;
  const total = items.length;
  return {
    percent: Math.round((done / total) * 100),
    done,
    total,
    items,
    missing: items.filter(i => !i.done),
    president,
  };
}

// ------------------------------------------------------------
// SUGGESTIONS
// ------------------------------------------------------------

/**
 * Contrôles intégrés (en plus des suggestions des modèles) : profil
 * incomplet, signature du président absente, président introuvable.
 * Chaque entrée porte une `action` : { type:'profile', field } | { type:'navigate', hash }.
 */
export function builtinSuggestions(completeness) {
  const out = [];
  if (!completeness) return out;
  const missingInfo = completeness.missing.filter(i => i.key !== 'signatures');
  if (missingInfo.length) {
    const critical = missingInfo.some(i => ['name', 'address', 'city'].includes(i.key));
    out.push({
      id: 'builtin:profile',
      builtin: true,
      priority: critical ? 'high' : 'medium',
      title: 'Complète le profil de l\'association',
      reason: `Il manque : ${missingInfo.map(i => i.label.toLowerCase()).join(', ')}. Ces informations apparaissent dans les en-têtes et les mentions légales.`,
      action: { type: 'profile', field: missingInfo[0].key },
      actionLabel: 'Compléter',
    });
  }
  const president = completeness.president;
  if (!president) {
    out.push({
      id: 'builtin:no-president',
      builtin: true,
      priority: 'low',
      title: 'Aucun(e) président(e) désigné(e)',
      reason: 'Attribue le rôle Président(e) à un membre : il ou elle sera le signataire par défaut des documents.',
      action: { type: 'navigate', hash: '#/kanban' },
      actionLabel: 'Voir les membres',
    });
  } else if (!completeness.items.find(i => i.key === 'signatures')?.done) {
    const name = [president.firstName, president.lastName].filter(Boolean).join(' ') || 'le/la président(e)';
    out.push({
      id: 'builtin:president-signature',
      builtin: true,
      priority: 'medium',
      title: `Ajoute la signature de ${name}`,
      reason: 'Les attestations et procès-verbaux pourront être signés automatiquement (signature stockée uniquement sur cet appareil).',
      memberIds: [president.id],
      action: { type: 'profile', field: 'signatures' },
      actionLabel: 'Ajouter la signature',
    });
  }
  return out;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

/** Fusionne suggestions intégrées + modèles, retire les masquées, trie par priorité. */
export function mergeSuggestions(builtin, fromTemplates, dismissed = []) {
  const hidden = new Set(dismissed);
  return [...(builtin || []), ...(fromTemplates || [])]
    .filter(s => s && !hidden.has(suggestionKey(s)))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (PRIORITY_RANK[a.s.priority] ?? 3) - (PRIORITY_RANK[b.s.priority] ?? 3) || a.i - b.i)
    .map(x => x.s);
}

/** Clé stable d'une suggestion (masquage persistant). */
export function suggestionKey(s) {
  if (!s) return '';
  return s.builtin ? s.id : `${s.templateId || ''}:${s.id || ''}`;
}

/**
 * Suggestion → état d'ouverture du générateur.
 * Ne conserve que les membres qui existent encore.
 */
export function suggestionToSession(suggestion, template, members) {
  if (!suggestion || !template) return null;
  const known = new Set((members || []).map(m => m.id));
  const memberIds = (suggestion.memberIds || []).filter(id => known.has(id));
  return {
    templateId: template.id,
    memberIds: template.scope === 'member' ? memberIds : [],
    values: suggestion.values && typeof suggestion.values === 'object' ? { ...suggestion.values } : {},
    origin: { type: 'suggestion', label: suggestion.title || '' },
  };
}

// ------------------------------------------------------------
// GALERIE
// ------------------------------------------------------------

/** true si le modèle correspond à la recherche et à la catégorie. */
export function templateMatches(template, query, category, categoryLabel = '') {
  if (!template) return false;
  if (category && template.category !== category) return false;
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch([
    template.title, template.description, ...(template.tags || []), categoryLabel,
  ].filter(Boolean).join(' '));
  return q.split(/\s+/).every(word => hay.includes(word));
}

/** Modèles récemment utilisés (ordre du registre, sans doublon). */
export function recentTemplateIds(documentLog, limit = 4) {
  const out = [];
  for (const e of documentLog || []) {
    if (e?.templateId && !out.includes(e.templateId)) out.push(e.templateId);
    if (out.length >= limit) break;
  }
  return out;
}

// ------------------------------------------------------------
// SÉLECTION DES MEMBRES
// ------------------------------------------------------------

/** Nom affiché « Prénom Nom ». */
export function memberName(member) {
  if (!member) return '';
  return [member.firstName, member.lastName].map(s => String(s || '').trim()).filter(Boolean).join(' ') || 'Sans nom';
}

/** Initiales (2 lettres max). */
export function memberInitials(member) {
  const parts = [member?.firstName, member?.lastName].map(s => String(s || '').trim()).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Tri alphabétique (prénom puis nom). */
export function sortMembers(members) {
  return [...(members || [])].sort((a, b) => memberName(a).localeCompare(memberName(b), 'fr'));
}

/**
 * Pré-sélection d'un modèle « par membre » : membres retenus par
 * `memberFilter` (s'il existe), sinon le premier membre (aperçu immédiat).
 */
export function defaultMemberSelection(template, ctx) {
  if (!template || template.scope !== 'member') return [];
  const members = sortMembers(ctx?.members || []);
  if (typeof template.memberFilter === 'function') {
    return members.filter(m => {
      try { return !!template.memberFilter(m, ctx); } catch { return false; }
    }).map(m => m.id);
  }
  return members.length ? [members[0].id] : [];
}

/**
 * Filtre de la liste des membres du sélecteur.
 * @param {{ query?, poleId?, roleId?, columnId? }} f
 * @param {object} roles map du catalogue
 */
export function memberMatchesPicker(member, f, roles) {
  if (!member) return false;
  const role = roles?.[member.mainRole];
  if (f?.roleId) {
    if (f.roleId === '__none__' ? !!role : member.mainRole !== f.roleId) return false;
  }
  if (f?.poleId && role?.pole !== f.poleId) return false;
  if (f?.columnId && member.columnId !== f.columnId) return false;
  const q = normalizeSearch(f?.query);
  if (q) {
    const hay = normalizeSearch([memberName(member), role?.label, member.mainRole, member.email].filter(Boolean).join(' '));
    if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

// ------------------------------------------------------------
// CHAMPS DU FORMULAIRE
// ------------------------------------------------------------

/** Options d'un champ select : chaînes ou { value, label } → { value, label }. */
export function normalizeOptions(options) {
  return (Array.isArray(options) ? options : []).map(o => (
    o && typeof o === 'object'
      ? { value: String(o.value ?? ''), label: String(o.label ?? o.value ?? '') }
      : { value: String(o ?? ''), label: String(o ?? '') }
  ));
}

/** Texte d'un champ « liste » → tableau (lignes non vides, rognées). */
export function parseListText(text) {
  return String(text ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

/** Montant saisi (« 12,5 », « 12.50 », 12) → nombre (NaN si invalide / vide). */
export function parseAmount(value) {
  if (typeof value === 'number') return value;
  const s = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  if (!s) return NaN;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Total des lignes chiffrées ([{ label, amount }]). */
export function linesTotal(lines) {
  return (Array.isArray(lines) ? lines : []).reduce((sum, l) => {
    const n = parseAmount(l?.amount);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

/** Valeur numérique d'un <input type="number"> : '' si vide, sinon nombre. */
export function numberInputValue(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? n : '';
}

/** Déplace un élément d'un tableau (renvoie une copie). */
export function moveItem(list, from, to) {
  const arr = [...(list || [])];
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
}

/** Issue d'un vote : 'adopted' | 'rejected' | 'pending' (aucune voix). */
export function resolutionOutcome(r) {
  const yes = Number(r?.for) || 0;
  const no = Number(r?.against) || 0;
  if (yes === 0 && no === 0) return 'pending';
  return yes > no ? 'adopted' : 'rejected';
}

/** true si la valeur par défaut d'un champ dépend du membre (fonction (ctx, member)). */
export function defaultDependsOnMember(field) {
  return typeof field?.default === 'function' && field.default.length >= 2;
}

/** Champs touchés → valeurs transmises au générateur (scope 'member' : défauts par membre préservés). */
export function generationValues(template, formValues, touched) {
  if (!template) return {};
  if (template.scope !== 'member') return { ...(formValues || {}) };
  const out = {};
  for (const key of touched || []) {
    if (Object.prototype.hasOwnProperty.call(formValues || {}, key)) out[key] = formValues[key];
  }
  return out;
}

// ------------------------------------------------------------
// VALIDATION DOUCE DU PROFIL
// ------------------------------------------------------------

/** Avertissements non bloquants sur le profil (format RNA, SIREN…). */
export function profileFieldWarnings(form) {
  const w = {};
  const rna = String(form?.rna || '').replace(/\s/g, '');
  if (rna && !/^W\d{9}$/i.test(rna)) w.rna = 'Format attendu : W suivi de 9 chiffres (ex. W751234567).';
  const siren = String(form?.siren || '').replace(/\s/g, '');
  if (siren && !/^\d{9}$/.test(siren)) w.siren = 'Le SIREN comporte 9 chiffres.';
  const cp = String(form?.postalCode || '').trim();
  if (cp && !/^\d{5}$/.test(cp)) w.postalCode = 'Code postal français : 5 chiffres.';
  const email = String(form?.email || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) w.email = 'Adresse email invalide.';
  const web = String(form?.website || '').trim();
  if (web && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(web)) w.website = 'Adresse web invalide.';
  const color = String(form?.accentColor || '');
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) w.accentColor = 'Couleur hexadécimale attendue (#4f81f5).';
  return w;
}

/** Normalise les saisies du profil avant enregistrement. */
export function cleanProfilePatch(form) {
  const out = { ...form };
  delete out.signatures;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && k !== 'logo' && k !== 'stamp') out[k] = v.trim();
  }
  // Images : chaîne vide → null (le store refuse toute valeur non-data URL).
  for (const k of ['logo', 'stamp']) {
    if (k in out && !(typeof out[k] === 'string' && out[k].startsWith('data:image/'))) out[k] = null;
  }
  if (out.rna) out.rna = out.rna.replace(/\s/g, '').toUpperCase();
  if (out.siren) out.siren = out.siren.replace(/\s/g, '');
  // Nombres des statuts : vide ou invalide → valeur par défaut.
  const NUMERIC_DEFAULTS = { agNoticeDays: 15, agQuorumPercent: 25 };
  for (const [k, def] of Object.entries(NUMERIC_DEFAULTS)) {
    if (k in out) {
      const n = Number(out[k]);
      out[k] = out[k] !== '' && Number.isFinite(n) ? Math.max(0, Math.min(k === 'agQuorumPercent' ? 100 : 365, Math.round(n))) : def;
    }
  }
  return out;
}
