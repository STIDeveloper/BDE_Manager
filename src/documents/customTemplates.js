// ============================================================
// STUDIO DOCUMENTS — MODÈLES PERSONNALISÉS (no-code)
// ============================================================
// Un modèle personnalisé est une DONNÉE (stockée dans le store « docs »,
// tranche customTemplates), compilée ici en un modèle au contrat habituel
// (voir context.js) : il passe donc par la même chaîne que les modèles
// intégrés (validateDocument, émission numérotée, aperçu, PDF/Word).
//
// ── CustomTemplate ──────────────────────────────────────────
// {
//   id: 'custom-…', kind: 'custom', version: 1,
//   title, description, category, icon, scope: 'member' | 'organization',
//   docTitle?: string,          // titre du document produit (variables admises)
//   fields: [{ key, label, type: 'text'|'textarea'|'date'|'number'|'select',
//              required?, options?: string[], default?: string, help? }],
//   blocks: CustomBlock[],
//   basedOn?: templateId,       // modèle intégré dupliqué (« Personnaliser »)
//   createdAt, updatedAt,
// }
// CustomBlock (textes : variables {membre.prenom}, {champ.xxx}…) :
//   { id, type:'title', text, subtitle? }      { id, type:'heading', text }
//   { id, type:'paragraph', text, align? }     { id, type:'list', items: string[], ordered? }
//   { id, type:'keyValue', rows: [[libellé, valeur]] }
//   { id, type:'callout', text, tone: 'info'|'warning'|'legal' }
//   { id, type:'blankLines', lines: string[] } { id, type:'placeDate', city, date }
//   { id, type:'signatures', slots: [{ label, signer: 'membre'|'signataire'|'libre', name?, mention? }] }
//   { id, type:'pageBreak' }
// Une variable inconnue (ou vide) n'apparaît JAMAIS telle quelle ni sous la
// forme « undefined » : elle est remplacée par une ligne à compléter.
// ============================================================

import { createBlockFactory, safeFileName, DOCUMENT_CATEGORIES } from './model.js';
import {
  academicYear, cityOf, formatDateLong, fullName, isoDate, poleOf, roleLabelOf, signatory, signatureSlot,
} from './context.js';

export const CUSTOM_PREFIX = 'custom-';
export const CUSTOM_FORMAT = 'bde-manager/custom-template';
export const BLANK = '________';

export const CUSTOM_BLOCK_TYPES = [
  { type: 'title', label: 'Titre' },
  { type: 'heading', label: 'Intertitre' },
  { type: 'paragraph', label: 'Paragraphe' },
  { type: 'list', label: 'Liste à puces' },
  { type: 'keyValue', label: 'Tableau clé / valeur' },
  { type: 'callout', label: 'Encadré' },
  { type: 'blankLines', label: 'Lignes à remplir' },
  { type: 'placeDate', label: 'Lieu et date' },
  { type: 'signatures', label: 'Signatures' },
  { type: 'pageBreak', label: 'Saut de page' },
];
const BLOCK_TYPE_SET = new Set(CUSTOM_BLOCK_TYPES.map(b => b.type));

export const CUSTOM_FIELD_TYPES = [
  { type: 'text', label: 'Texte court' },
  { type: 'textarea', label: 'Texte long' },
  { type: 'date', label: 'Date' },
  { type: 'number', label: 'Nombre' },
  { type: 'select', label: 'Liste de choix' },
];
const FIELD_TYPE_SET = new Set(CUSTOM_FIELD_TYPES.map(f => f.type));

export const CUSTOM_ICONS = [
  'FileText', 'BadgeCheck', 'Award', 'FileSignature', 'ScrollText', 'ClipboardList', 'Handshake', 'Megaphone',
  'Calendar', 'Users', 'GraduationCap', 'Receipt', 'ShieldCheck', 'Stamp', 'Trophy', 'PartyPopper',
];

/** Champs ajoutés automatiquement à tout modèle personnalisé. */
const RESERVED_KEYS = new Set(['dateDocument', 'signataire']);

// ------------------------------------------------------------
// Variables
// ------------------------------------------------------------

export const VARIABLE_GROUPS = [
  { id: 'membre', label: 'Membre concerné', memberOnly: true, vars: [
    ['membre.prenom', 'Prénom'], ['membre.nom', 'Nom'], ['membre.nomComplet', 'Prénom et nom'],
    ['membre.role', 'Rôle'], ['membre.pole', 'Pôle'], ['membre.email', 'Email'], ['membre.telephone', 'Téléphone'],
    ['membre.formation', 'Formation'], ['membre.dateAdhesion', 'Date d\'adhésion'],
    ['membre.debutMandat', 'Début de mandat'], ['membre.finMandat', 'Fin de mandat'],
  ] },
  { id: 'association', label: 'Association', vars: [
    ['association.nom', 'Nom'], ['association.sigle', 'Sigle'], ['association.ville', 'Ville'],
    ['association.adresse', 'Adresse complète'], ['association.rna', 'Numéro RNA'], ['association.email', 'Email'],
    ['association.etablissement', 'Établissement'], ['association.objet', 'Objet statutaire'],
  ] },
  { id: 'document', label: 'Document', vars: [
    ['date', 'Date du document'], ['annee', 'Année universitaire'], ['aujourdhui', 'Date du jour'],
  ] },
  { id: 'signataire', label: 'Signataire', vars: [
    ['signataire.nom', 'Nom du signataire'], ['signataire.role', 'Fonction du signataire'],
  ] },
];

const VAR_RE = /\{([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)?)\}/g;

/** Variables connues pour un modèle (portée + champs personnalisés). */
export function knownVariables(record) {
  const out = new Set();
  VARIABLE_GROUPS.forEach(g => {
    if (g.memberOnly && record?.scope !== 'member') return;
    g.vars.forEach(([k]) => out.add(k));
  });
  (record?.fields || []).forEach(f => { if (f?.key) out.add(`champ.${f.key}`); });
  return out;
}

/** Tous les textes d'un bloc personnalisé (variables, recherche). */
export function customBlockTexts(b) {
  switch (b?.type) {
    case 'title': return [b.text, b.subtitle];
    case 'heading': case 'paragraph': case 'callout': return [b.text];
    case 'list': return b.items || [];
    case 'keyValue': return (b.rows || []).flat();
    case 'blankLines': return b.lines || [];
    case 'placeDate': return [b.city, b.date];
    case 'signatures': return (b.slots || []).flatMap(s => [s.label, s.name, s.mention]);
    default: return [];
  }
}

/** Variables utilisées mais inconnues : [{ name, reason }]. */
export function unknownVariables(record) {
  const known = knownVariables(record);
  const memberVars = new Set(VARIABLE_GROUPS.find(g => g.id === 'membre').vars.map(([k]) => k));
  const found = new Map();
  const scan = (t) => {
    String(t ?? '').replace(VAR_RE, (_m, name) => {
      if (!known.has(name) && !found.has(name)) {
        found.set(name, memberVars.has(name) ? 'Disponible seulement pour un modèle « par membre ».'
          : name.startsWith('champ.') ? 'Aucun champ de formulaire ne porte cette clé.' : 'Variable inconnue.');
      }
      return '';
    });
  };
  scan(record?.docTitle);
  (record?.blocks || []).forEach(b => customBlockTexts(b).forEach(scan));
  return [...found].map(([name, reason]) => ({ name, reason }));
}

const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Valeurs des variables pour un document. */
export function buildVariables(ctx, values, member, record) {
  const org = ctx.organization || {};
  const sig = signatory(ctx, values?.signataire);
  const addr = [clean(org.address), [clean(org.postalCode), clean(org.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const vars = {
    'association.nom': clean(org.name),
    'association.sigle': clean(org.shortName) || clean(org.name),
    'association.ville': clean(org.city),
    'association.adresse': addr,
    'association.rna': clean(org.rna),
    'association.email': clean(org.email),
    'association.etablissement': clean(org.school),
    'association.objet': clean(org.object),
    date: formatDateLong(values?.dateDocument) || formatDateLong(ctx.today),
    annee: academicYear(ctx.today),
    aujourdhui: formatDateLong(ctx.today),
    'signataire.nom': sig?.name || '',
    'signataire.role': sig?.role || '',
  };
  if (member) {
    const role = roleLabelOf(ctx, member, '');
    Object.assign(vars, {
      'membre.prenom': clean(member.firstName),
      'membre.nom': clean(member.lastName),
      'membre.nomComplet': fullName(member),
      'membre.role': /^membres?$/i.test(role) ? 'Membre' : role,
      'membre.pole': poleOf(ctx, member)?.label || '',
      'membre.email': clean(member.email),
      'membre.telephone': clean(member.phone),
      'membre.formation': [clean(member.program), clean(member.year)].filter(Boolean).join(', '),
      'membre.dateAdhesion': formatDateLong(member.joinedAt),
      'membre.debutMandat': formatDateLong(member.mandateStart),
      'membre.finMandat': formatDateLong(member.mandateEnd),
    });
  }
  (record?.fields || []).forEach(f => {
    const v = values?.[f.key];
    vars[`champ.${f.key}`] = f.type === 'date' ? formatDateLong(v) : clean(v);
  });
  return vars;
}

/** Remplace les variables ; inconnue ou vide → ligne à compléter. */
export function resolveText(text, vars, blank = BLANK) {
  return String(text ?? '').replace(VAR_RE, (_m, name) => {
    const v = vars && Object.prototype.hasOwnProperty.call(vars, name) ? clean(vars[name]) : '';
    return v || blank;
  });
}

// ------------------------------------------------------------
// Compilation → modèle au contrat standard
// ------------------------------------------------------------

function buildBlocks(record, ctx, values, member) {
  const B = createBlockFactory('c');
  const vars = buildVariables(ctx, values, member, record);
  const r = (t) => resolveText(t, vars);
  const sig = signatory(ctx, values?.signataire);
  const out = [];
  (record.blocks || []).forEach(b => {
    switch (b?.type) {
      case 'title': out.push(B.title(r(b.text) || BLANK, clean(b.subtitle) ? r(b.subtitle) : undefined)); break;
      case 'heading': out.push(B.heading(r(b.text) || BLANK)); break;
      case 'paragraph': if (clean(b.text)) out.push(B.p(r(b.text), { align: ['left', 'justify', 'center', 'right'].includes(b.align) ? b.align : 'justify' })); break;
      case 'list': {
        const items = (b.items || []).map(clean).filter(Boolean).map(r);
        if (items.length) out.push(B.list(items, !!b.ordered));
        break;
      }
      case 'keyValue': {
        const rows = (b.rows || []).filter(row => Array.isArray(row) && (clean(row[0]) || clean(row[1])))
          .map(([k, v]) => [r(k) || BLANK, r(v) || BLANK]);
        if (rows.length) out.push(B.kv(rows));
        break;
      }
      case 'callout': if (clean(b.text)) out.push(B.callout(r(b.text), ['info', 'warning', 'legal'].includes(b.tone) ? b.tone : 'info')); break;
      case 'blankLines': {
        const lines = (b.lines || []).map(clean).filter(Boolean).map(l => `${r(l)} ${'_'.repeat(30)}`);
        if (lines.length) out.push(B.blankLines(lines));
        break;
      }
      case 'placeDate': out.push(B.placeDate(r(b.city || '{association.ville}') || cityOf(ctx.organization), r(b.date || '{date}'))); break;
      case 'signatures': {
        const slots = (b.slots || []).filter(Boolean).map(s => {
          const label = r(s.label) || 'Signature';
          const mention = clean(s.mention) ? r(s.mention) : undefined;
          if (s.signer === 'membre' && member) {
            return { label, name: fullName(member), role: vars['membre.role'] || '', memberId: member.id, ...(mention ? { mention } : {}) };
          }
          if (s.signer === 'signataire') {
            return signatureSlot(sig, label, { ...(sig?.member ? { memberId: sig.member.id } : {}), ...(mention ? { mention } : {}) });
          }
          return { label, name: clean(s.name) ? r(s.name) : '', ...(mention ? { mention } : {}) };
        });
        if (slots.length) out.push(B.signatures(slots));
        break;
      }
      case 'pageBreak': out.push(B.pageBreak()); break;
      default:
    }
  });
  if (!out.length) out.push(B.title(r(record.docTitle || record.title) || 'Document'));
  return { blocks: out, vars };
}

/** Compile un enregistrement en modèle (même contrat que les modèles intégrés). */
export function compileCustomTemplate(record) {
  const rec = normalizeCustomTemplate(record);
  const fields = [
    { key: 'dateDocument', label: 'Date du document', type: 'date', default: (ctx) => isoDate(ctx.today) },
    { key: 'signataire', label: 'Signataire pour l\'association', type: 'member', default: (ctx) => signatory(ctx, null)?.member?.id || '' },
    ...rec.fields.map(f => ({
      key: f.key, label: f.label || f.key, type: f.type, required: !!f.required,
      ...(f.help ? { help: f.help } : {}),
      ...(f.type === 'select' ? { options: (f.options || []).filter(Boolean) } : {}),
      default: f.default ?? '',
    })),
  ];
  return {
    id: rec.id,
    custom: true,
    record: rec,
    category: rec.category,
    title: rec.title,
    description: rec.description || 'Modèle personnalisé.',
    icon: rec.icon,
    tags: ['personnalisé', ...(rec.tags || [])],
    scope: rec.scope,
    fields,
    build(ctx, values, member) {
      const { blocks, vars } = buildBlocks(rec, ctx, values || {}, member || null);
      const title = resolveText(rec.docTitle || rec.title, vars) || rec.title || 'Document';
      const who = member ? fullName(member) : '';
      return {
        meta: {
          templateId: rec.id,
          title: who ? `${title} — ${who}` : title,
          fileName: safeFileName(who ? `${title}_${who}` : title),
          memberIds: member ? [member.id] : [],
        },
        blocks,
      };
    },
  };
}

// ------------------------------------------------------------
// Normalisation, import / export
// ------------------------------------------------------------

const str = (v, max = 4000) => clean(v).slice(0, max);
const strRaw = (v, max = 4000) => (v === undefined || v === null ? '' : String(v)).slice(0, max);

export const slugKey = (label) => String(label || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'champ';

let blockSeq = 0;
export const newBlockId = () => `cb${Date.now().toString(36)}${(++blockSeq).toString(36)}`;

/** Nouveau bloc vide d'un type donné. */
export function emptyCustomBlock(type) {
  const id = newBlockId();
  switch (type) {
    case 'title': return { id, type, text: 'Titre du document', subtitle: '' };
    case 'heading': return { id, type, text: 'Intertitre' };
    case 'paragraph': return { id, type, text: '', align: 'justify' };
    case 'list': return { id, type, items: [''], ordered: false };
    case 'keyValue': return { id, type, rows: [['', '']] };
    case 'callout': return { id, type, text: '', tone: 'info' };
    case 'blankLines': return { id, type, lines: ['Nom', 'Date'] };
    case 'placeDate': return { id, type, city: '{association.ville}', date: '{date}' };
    case 'signatures': return { id, type, slots: [{ label: 'Pour l\'association', signer: 'signataire' }] };
    case 'pageBreak': return { id, type };
    default: return null;
  }
}

function normalizeBlock(b) {
  if (!b || !BLOCK_TYPE_SET.has(b.type)) return null;
  const id = typeof b.id === 'string' && b.id ? b.id.slice(0, 40) : newBlockId();
  switch (b.type) {
    case 'title': return { id, type: 'title', text: strRaw(b.text, 300), subtitle: strRaw(b.subtitle, 300) };
    case 'heading': return { id, type: 'heading', text: strRaw(b.text, 300) };
    case 'paragraph': return { id, type: 'paragraph', text: strRaw(b.text), align: ['left', 'justify', 'center', 'right'].includes(b.align) ? b.align : 'justify' };
    case 'list': return { id, type: 'list', items: (Array.isArray(b.items) ? b.items : []).slice(0, 100).map(i => strRaw(i, 1000)), ordered: !!b.ordered };
    case 'keyValue': return { id, type: 'keyValue', rows: (Array.isArray(b.rows) ? b.rows : []).slice(0, 60).map(row => [strRaw(row?.[0], 200), strRaw(row?.[1], 1000)]) };
    case 'callout': return { id, type: 'callout', text: strRaw(b.text, 2000), tone: ['info', 'warning', 'legal'].includes(b.tone) ? b.tone : 'info' };
    case 'blankLines': return { id, type: 'blankLines', lines: (Array.isArray(b.lines) ? b.lines : []).slice(0, 40).map(l => strRaw(l, 200)) };
    case 'placeDate': return { id, type: 'placeDate', city: strRaw(b.city, 200), date: strRaw(b.date, 200) };
    case 'signatures': return {
      id, type: 'signatures',
      slots: (Array.isArray(b.slots) ? b.slots : []).slice(0, 9).map(s => ({
        label: strRaw(s?.label, 200),
        signer: ['membre', 'signataire', 'libre'].includes(s?.signer) ? s.signer : 'libre',
        name: strRaw(s?.name, 200),
        mention: strRaw(s?.mention, 200),
      })),
    };
    case 'pageBreak': return { id, type: 'pageBreak' };
    default: return null;
  }
}

/** Enregistrement propre (types, longueurs, valeurs par défaut). */
export function normalizeCustomTemplate(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const keys = new Set();
  const fields = (Array.isArray(r.fields) ? r.fields : []).slice(0, 40).map(f => {
    let key = slugKey(f?.key || f?.label);
    if (RESERVED_KEYS.has(key)) key = `${key}_2`;
    while (keys.has(key)) key = `${key}_2`;
    keys.add(key);
    return {
      key,
      label: str(f?.label, 120) || key,
      type: FIELD_TYPE_SET.has(f?.type) ? f.type : 'text',
      required: !!f?.required,
      ...(f?.type === 'select' ? { options: (Array.isArray(f.options) ? f.options : []).map(o => str(o, 120)).filter(Boolean).slice(0, 30) } : {}),
      default: str(f?.default, 1000),
      ...(str(f?.help, 200) ? { help: str(f.help, 200) } : {}),
    };
  });
  const id = typeof r.id === 'string' && r.id.startsWith(CUSTOM_PREFIX) ? r.id.slice(0, 80) : `${CUSTOM_PREFIX}${Date.now().toString(36)}`;
  return {
    id,
    kind: 'custom',
    version: 1,
    title: str(r.title, 120) || 'Modèle sans titre',
    description: str(r.description, 300),
    category: DOCUMENT_CATEGORIES.some(c => c.id === r.category) ? r.category : 'membres',
    icon: CUSTOM_ICONS.includes(r.icon) ? r.icon : (typeof r.icon === 'string' && /^[A-Z][A-Za-z]+$/.test(r.icon) ? r.icon : 'FileText'),
    scope: r.scope === 'member' ? 'member' : 'organization',
    docTitle: str(r.docTitle, 200),
    fields,
    blocks: (Array.isArray(r.blocks) ? r.blocks : []).slice(0, 200).map(normalizeBlock).filter(Boolean),
    ...(typeof r.basedOn === 'string' && r.basedOn ? { basedOn: r.basedOn.slice(0, 80) } : {}),
    ...(typeof r.createdAt === 'string' ? { createdAt: r.createdAt } : {}),
    ...(typeof r.updatedAt === 'string' ? { updatedAt: r.updatedAt } : {}),
  };
}

/** Fichier JSON d'export d'un modèle personnalisé. */
export function exportCustomTemplate(record) {
  const { createdAt: _c, updatedAt: _u, ...rest } = normalizeCustomTemplate(record);
  return JSON.stringify({ format: CUSTOM_FORMAT, version: 1, exportedAt: new Date().toISOString(), template: rest }, null, 2);
}

/** Lit un fichier d'export ; lève une erreur lisible si invalide. */
export function parseCustomTemplateFile(text) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { throw new Error('Fichier illisible : JSON invalide.'); }
  const tpl = data?.format === CUSTOM_FORMAT ? data.template : null;
  if (!tpl || typeof tpl !== 'object') throw new Error('Ce fichier n\'est pas un modèle exporté depuis BDE Manager.');
  if (!Array.isArray(tpl.blocks) || !tpl.blocks.length) throw new Error('Le modèle ne contient aucun bloc.');
  const rec = normalizeCustomTemplate(tpl);
  if (!rec.blocks.length) throw new Error('Aucun bloc reconnu dans ce modèle.');
  return rec;
}

// ------------------------------------------------------------
// « Personnaliser » un modèle intégré : copie figée de son texte
// ------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convertit un document généré par un modèle intégré en blocs personnalisés,
 * en remplaçant les valeurs concrètes (membre, association, date) par les
 * variables correspondantes. Les blocs non éditables (tableaux complexes,
 * organigrammes) sont convertis au mieux ou ignorés (`skipped`).
 */
export function customFromBuiltin(template, ctx, sampleMember = null) {
  const member = template.scope === 'member' ? sampleMember : null;
  const values = {};
  (template.fields || []).forEach(f => { values[f.key] = typeof f.default === 'function' ? f.default(ctx, member) : f.default; });
  const doc = template.build(ctx, values, member);
  const org = ctx.organization || {};
  // Littéraux → variables (le premier enregistré l'emporte en cas de doublon).
  const map = new Map();
  const add = (literal, variable) => { const l = clean(literal); if (l.length >= 3 && !map.has(l)) map.set(l, variable); };
  if (member) {
    add(fullName(member), '{membre.prenom} {membre.nom}');
    add([clean(member.lastName).toUpperCase(), clean(member.firstName)].filter(Boolean).join(' '), '{membre.nom} {membre.prenom}');
    add(member.email, '{membre.email}');
    const role = roleLabelOf(ctx, member, '');
    if (!/^membres?$/i.test(role)) add(role, '{membre.role}');
  }
  // Les autres personnes nommées sont, en pratique, le ou la signataire.
  (ctx.members || []).filter(m => m !== member).forEach(m => {
    add(fullName(m), '{signataire.nom}');
    const role = roleLabelOf(ctx, m, '');
    if (!/^membres?$/i.test(role)) add(role, '{signataire.role}');
  });
  add(org.name, '{association.nom}');
  add(org.shortName, '{association.sigle}');
  add([clean(org.address), [clean(org.postalCode), clean(org.city)].filter(Boolean).join(' ')].filter(Boolean).join(', '), '{association.adresse}');
  add(org.rna, '{association.rna}');
  add(formatDateLong(ctx.today), '{date}');
  add(academicYear(ctx.today), '{annee}');
  const pairs = [...map];
  pairs.sort((a, b) => b[0].length - a[0].length);
  const sub = (t) => {
    let s = String(t ?? '');
    pairs.forEach(([lit, v]) => { s = s.replace(new RegExp(`(?<![\\p{L}\\d])${escapeRe(lit)}(?![\\p{L}\\d])`, 'gu'), v); });
    return s;
  };
  const skipped = new Set();
  const blocks = [];
  (doc.blocks || []).forEach(b => {
    const id = newBlockId();
    switch (b.type) {
      case 'title': blocks.push({ id, type: 'title', text: sub(b.text), subtitle: sub(b.subtitle || '') }); break;
      case 'heading': blocks.push({ id, type: 'heading', text: sub(b.text) }); break;
      case 'paragraph': blocks.push({ id, type: 'paragraph', text: sub(b.text), align: b.align || 'justify' }); break;
      case 'list': blocks.push({ id, type: 'list', items: (b.items || []).map(sub), ordered: !!b.ordered }); break;
      case 'checklist': blocks.push({ id, type: 'list', items: (b.items || []).map(i => sub(i.label)), ordered: false }); break;
      case 'keyValue': blocks.push({ id, type: 'keyValue', rows: (b.rows || []).map(([k, v]) => [sub(k), sub(v)]) }); break;
      case 'callout': blocks.push({ id, type: 'callout', text: sub(b.text), tone: b.tone || 'info' }); break;
      case 'blankLines': blocks.push({ id, type: 'blankLines', lines: (b.lines || []).map(l => sub(l).replace(/[\s_.…]{3,}$/u, '')) }); break;
      case 'placeDate': blocks.push({ id, type: 'placeDate', city: '{association.ville}', date: '{date}' }); break;
      case 'signatures': blocks.push({
        id, type: 'signatures',
        slots: (b.slots || []).map(s => {
          const isMember = member && clean(s.name) === fullName(member);
          return { label: sub(s.label), signer: isMember ? 'membre' : (s.name ? 'signataire' : 'libre'), name: '', mention: sub(s.mention || '') };
        }),
      }); break;
      case 'pageBreak': blocks.push({ id, type: 'pageBreak' }); break;
      case 'table': {
        const cols = b.columns || [];
        if (cols.length === 2 && (b.rows || []).length) {
          blocks.push({ id, type: 'keyValue', rows: b.rows.map(r => [sub(r[cols[0].key]), sub(r[cols[1].key])]) });
        } else skipped.add('tableaux');
        break;
      }
      case 'orgChart': skipped.add('organigrammes'); break;
      default:
    }
  });
  const record = normalizeCustomTemplate({
    title: `${template.title} (personnalisé)`,
    description: template.description,
    category: template.category,
    icon: template.icon,
    scope: template.scope === 'member' ? 'member' : 'organization',
    docTitle: template.title,
    fields: [],
    blocks,
    basedOn: template.id,
  });
  return { record, skipped: [...skipped] };
}
