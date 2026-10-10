// ============================================================
// STUDIO DOCUMENTS — MODÈLE DE DOCUMENT (contrat commun)
// ============================================================
// Un modèle (template) ne produit PAS de HTML ni de PDF : il produit un
// document abstrait (AST) décrit ci-dessous. Les moteurs de rendu
// (src/documents/render/) le transforment en aperçu React, PDF, page
// imprimable ou fichier Word. Ainsi un modèle s'écrit une fois et fonctionne
// partout, et les tests peuvent vérifier son contenu sans navigateur.
//
// ── Document ────────────────────────────────────────────────
// {
//   meta: {
//     templateId: string,
//     title: string,            // titre affiché (onglet, registre)
//     fileName: string,         // nom de fichier SANS extension
//     orientation?: 'portrait' | 'landscape',   (défaut portrait)
//     confidential?: boolean,   // bandeau « Confidentiel » en pied de page
//     memberIds?: string[],     // membres concernés (registre)
//   },
//   blocks: Block[],
// }
//
// ── Blocs (chaque bloc a un `id` unique dans le document) ──
// { type:'title',     id, text, subtitle? }
// { type:'heading',   id, text, level?: 1|2 }
// { type:'paragraph', id, text, align?: 'left'|'justify'|'center'|'right',
//                     tone?: 'normal'|'muted'|'small', editable?: boolean }
// { type:'list',      id, items: string[], ordered?: boolean }
// { type:'keyValue',  id, rows: [label: string, value: string][] }
// { type:'table',     id, columns: [{ key, label, width?: number /*fraction 0..1*/, align?: 'left'|'center'|'right' }],
//                     rows: Record<string,string>[], blankRows?: number, caption?: string, dense?: boolean }
// { type:'signatures', id, slots: [{ label, name?, role?, image?: dataURL, mention?: string,
//                     stamp?: boolean /* true : cachet sur ce bloc ; false : jamais. Défaut :
//                     premier bloc qui porte une image de signature */ }] }
// { type:'placeDate', id, city, date: string /* déjà formatée */ }
// { type:'callout',   id, tone: 'info'|'warning'|'legal', text }
// { type:'checklist', id, items: [{ label, checked?: boolean }] }
// { type:'blankLines',id, lines: string[] }   // « Nom : ________ » à remplir à la main
// { type:'orgChart',  id, groups: [{ title, color?: string /*hex*/, people: [{ name, role }] }] }
// { type:'spacer',    id, size?: 'sm'|'md'|'lg' }
// { type:'pageBreak', id }
//
// Texte : chaîne simple ; `**gras**` est le seul balisage inline reconnu ;
// un caractère « saut de ligne » dans le texte produit un retour à la ligne.
// Tout le reste est échappé par les moteurs de rendu (aucun HTML injectable).
//
// Émission : les moteurs de rendu reçoivent `issues[i]` = { ref, fingerprint,
// issuedAt } associé à `docs[i]` (même index), ou null pour un brouillon.
// Les retouches doivent être appliquées (applyOverrides) AVANT l'export.
//
// Les blocs `paragraph` (et `title`) marqués `editable: true` peuvent être
// retouchés dans l'aperçu ; les retouches sont appliquées par applyOverrides().
// ============================================================

export const BLOCK_TYPES = new Set([
  'title', 'heading', 'paragraph', 'list', 'keyValue', 'table', 'signatures',
  'placeDate', 'callout', 'checklist', 'blankLines', 'orgChart', 'spacer', 'pageBreak',
]);

export const DOCUMENT_CATEGORIES = [
  { id: 'membres',      label: 'Membres',                 icon: 'Users',        description: 'Attestations, lettres de mission, passations…' },
  { id: 'gouvernance',  label: 'Gouvernance & légal',     icon: 'Landmark',     description: 'Assemblées générales, procès-verbaux, déclarations…' },
  { id: 'organisation', label: 'Organisation',            icon: 'Network',      description: 'Organigramme, annuaire, registres internes…' },
  { id: 'partenariats', label: 'Partenariats & finances', icon: 'Handshake',    description: 'Conventions, notes de frais, reçus, attestations d\'événement…' },
  { id: 'rgpd',         label: 'RGPD & conformité',       icon: 'ShieldCheck',  description: 'Information des membres, registre des traitements, droit à l\'image…' },
];

/** Fabrique de blocs : génère des ids stables et lisibles (b1, b2…). */
export function createBlockFactory(prefix = 'b') {
  let n = 0;
  const id = () => `${prefix}${++n}`;
  return {
    title: (text, subtitle) => ({ type: 'title', id: id(), text, ...(subtitle ? { subtitle } : {}) }),
    heading: (text, level = 1) => ({ type: 'heading', id: id(), text, level }),
    p: (text, opts = {}) => ({ type: 'paragraph', id: id(), text, align: 'justify', editable: true, ...opts }),
    small: (text, opts = {}) => ({ type: 'paragraph', id: id(), text, tone: 'small', align: 'left', ...opts }),
    list: (items, ordered = false) => ({ type: 'list', id: id(), items: items.filter(Boolean), ordered }),
    kv: (rows) => ({ type: 'keyValue', id: id(), rows: rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '') }),
    table: (columns, rows, opts = {}) => ({ type: 'table', id: id(), columns, rows, ...opts }),
    signatures: (slots) => ({ type: 'signatures', id: id(), slots }),
    placeDate: (city, date) => ({ type: 'placeDate', id: id(), city, date }),
    callout: (text, tone = 'info') => ({ type: 'callout', id: id(), tone, text }),
    checklist: (items) => ({ type: 'checklist', id: id(), items: items.map(i => (typeof i === 'string' ? { label: i } : i)) }),
    blankLines: (lines) => ({ type: 'blankLines', id: id(), lines }),
    orgChart: (groups) => ({ type: 'orgChart', id: id(), groups }),
    spacer: (size = 'md') => ({ type: 'spacer', id: id(), size }),
    pageBreak: () => ({ type: 'pageBreak', id: id() }),
  };
}

/** Vérifie la structure d'un document (tests + garde-fou avant rendu). */
export function validateDocument(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object') return ['Document absent'];
  if (!doc.meta?.templateId) errors.push('meta.templateId manquant');
  if (!doc.meta?.title) errors.push('meta.title manquant');
  if (!doc.meta?.fileName) errors.push('meta.fileName manquant');
  if (!Array.isArray(doc.blocks) || doc.blocks.length === 0) errors.push('blocks vide');
  const ids = new Set();
  (doc.blocks || []).forEach((b, i) => {
    if (!b || !BLOCK_TYPES.has(b.type)) errors.push(`bloc ${i} : type inconnu (${b?.type})`);
    if (!b?.id) errors.push(`bloc ${i} : id manquant`);
    else if (ids.has(b.id)) errors.push(`bloc ${i} : id dupliqué (${b.id})`);
    ids.add(b?.id);
    const texts = blockTexts(b);
    texts.forEach(t => {
      if (typeof t !== 'string') errors.push(`bloc ${b?.id} : texte non textuel`);
      else if (/undefined|null|NaN|\[object Object\]/.test(t)) errors.push(`bloc ${b?.id} : valeur manquante dans « ${t.slice(0, 60)} »`);
    });
  });
  return errors;
}

/** Tous les textes d'un bloc (validation, recherche, empreinte). */
export function blockTexts(b) {
  if (!b) return [];
  switch (b.type) {
    case 'title': return [b.text, b.subtitle].filter(v => v !== undefined);
    case 'heading': case 'paragraph': case 'callout': return [b.text];
    case 'list': return b.items || [];
    case 'keyValue': return (b.rows || []).flat();
    case 'table': return [...(b.columns || []).map(c => c.label), ...(b.rows || []).flatMap(r => Object.values(r).map(String)), ...(b.caption ? [b.caption] : [])];
    case 'signatures': return (b.slots || []).flatMap(s => [s.label, s.name, s.role, s.mention].filter(Boolean));
    case 'placeDate': return [b.city, b.date];
    case 'checklist': return (b.items || []).map(i => i.label);
    case 'blankLines': return b.lines || [];
    case 'orgChart': return (b.groups || []).flatMap(g => [g.title, ...g.people.flatMap(p => [p.name, p.role])]);
    default: return [];
  }
}

/** Applique les retouches faites dans l'aperçu ({ blockId: texte }). */
export function applyOverrides(doc, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return doc;
  return {
    ...doc,
    blocks: doc.blocks.map(b => (Object.prototype.hasOwnProperty.call(overrides, b.id) && (b.type === 'paragraph' || b.type === 'title')
      ? { ...b, text: overrides[b.id] }
      : b)),
  };
}

/** Texte brut d'un document (recherche, empreinte, tests). */
export function documentPlainText(doc) {
  return (doc?.blocks || []).flatMap(blockTexts).join('\n');
}

/**
 * Empreinte courte et vérifiable du contenu (SHA-256 → « 3F9A-21C4-77B0 »).
 * Imprimée en pied de page : permet de vérifier qu'un document n'a pas été
 * modifié après émission (comparaison avec le registre).
 */
export async function documentFingerprint(doc) {
  const data = new TextEncoder().encode(`${doc.meta?.templateId}\n${documentPlainText(doc)}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const hex = [...hash.slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Nom de fichier sûr (sans accents ni caractères interdits). */
export function safeFileName(name) {
  return String(name || 'document')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-_ ]+/g, ' ').trim().replace(/\s+/g, '_').slice(0, 90) || 'document';
}
