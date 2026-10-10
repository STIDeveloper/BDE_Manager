// ============================================================
// STUDIO DOCUMENTS — REGISTRE & ÉMISSION (helpers purs)
// ============================================================
// Émission = attribution d'un numéro unique (jamais réutilisé) + empreinte
// SHA-256 courte du contenu final, puis inscription au registre. Ces
// fonctions préparent les données ; le composant appelle le store et le
// moteur de rendu. Testées dans registryHelpers.test.js.

import { normalizeSearch } from './studioHelpers.js';

export const FORMAT_LABELS = { pdf: 'PDF', print: 'Impression', word: 'Word' };

export const formatLabel = (format) => FORMAT_LABELS[format] || format || '—';

/** Clé stable d'un document d'un lot (retouches) : membres concernés, sinon position. */
export function docKey(doc, index) {
  const ids = doc?.meta?.memberIds;
  return Array.isArray(ids) && ids.length ? `m:${ids.join(',')}` : `i:${index}`;
}

/**
 * Copie « registre » des valeurs du formulaire : JSON pur, sans images
 * (data URL) ni textes démesurés — le registre reste léger.
 */
export function sanitizeValues(values, maxString = 4000) {
  const walk = (v, depth) => {
    if (depth > 6) return undefined;
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.startsWith('data:') || v.length > maxString ? undefined : v;
    if (Array.isArray(v)) return v.map(x => walk(x, depth + 1)).filter(x => x !== undefined);
    if (typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) {
        const w = walk(x, depth + 1);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    return undefined;
  };
  return walk(values || {}, 0) || {};
}

/** Informations d'émission imprimées sur chaque document. */
export function buildIssues(refs, fingerprints, issuedAt = new Date().toISOString()) {
  return refs.map((ref, i) => ({ ref, fingerprint: fingerprints[i] || '', issuedAt }));
}

/** Entrées du registre (une par document émis). */
export function buildLogEntries(docs, issues, { templateId, values, format, fileName }) {
  const snapshot = sanitizeValues(values);
  return docs.map((doc, i) => {
    const m = doc?.meta || {};
    // Sous-ensemble de meta utile aux suggestions (ex. composition du bureau
    // { memberId: roleId } pour détecter un changement de dirigeants).
    const meta = sanitizeValues({ orientation: m.orientation, confidential: m.confidential, composition: m.composition });
    return {
      ref: issues[i]?.ref || '',
      templateId: templateId || m.templateId || '',
      title: m.title || '',
      memberIds: Array.isArray(m.memberIds) ? [...m.memberIds] : [],
      fingerprint: issues[i]?.fingerprint || '',
      values: snapshot,
      fileName: fileName || m.fileName || '',
      format,
      ...(m.composition && typeof m.composition === 'object' ? { composition: sanitizeValues(m.composition) } : {}),
      meta,
    };
  });
}

/** Plage de références lisible : « BDE-2026-0007 » ou « BDE-2026-0007 → BDE-2026-0012 ». */
export function refRange(refs) {
  const list = (refs || []).filter(Boolean);
  if (!list.length) return '';
  return list.length === 1 ? list[0] : `${list[0]} → ${list.at(-1)}`;
}

/**
 * Nom de fichier d'export (sans extension) : un document → son nom + réf. ;
 * un lot → titre du modèle + nombre.
 */
export function exportBaseName(docs, issues, templateTitle, draft = false) {
  const n = docs?.length || 0;
  let base;
  if (n === 1) {
    base = docs[0]?.meta?.fileName || templateTitle || 'document';
    if (issues?.[0]?.ref) base = `${base}_${issues[0].ref}`;
  } else {
    base = `${templateTitle || 'documents'}_${n}_documents`;
    if (issues?.[0]?.ref) base = `${base}_${issues[0].ref}`;
  }
  return draft ? `${base}_BROUILLON` : base;
}

// ------------------------------------------------------------
// RECHERCHE / VÉRIFICATION
// ------------------------------------------------------------

/** Normalise une référence saisie (« bde 2026 7 », « bde-2026-0007 »). */
export function normalizeRef(input) {
  const s = String(input || '').toUpperCase().trim().replace(/[\u2010-\u2015\s_/.]+/g, '-').replace(/-+/g, '-');
  const m = /^([A-Z0-9]+)-(\d{4})-(\d{1,6})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3].padStart(4, '0')}` : s;
}

/** Normalise une empreinte (« 3f9a21c477b0 » → « 3F9A-21C4-77B0 »). */
export function normalizeFingerprint(input) {
  const hex = String(input || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 12) return hex;
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/**
 * Vérifie un document à partir de sa référence (et éventuellement de
 * l'empreinte imprimée).
 * @returns {{ status: 'empty'|'not-found'|'found'|'match'|'mismatch', entry?: object }}
 */
export function verifyDocument(entries, refInput, fingerprintInput = '') {
  const ref = normalizeRef(refInput);
  if (!ref) return { status: 'empty' };
  const entry = (entries || []).find(e => normalizeRef(e?.ref) === ref);
  if (!entry) return { status: 'not-found' };
  const fp = normalizeFingerprint(fingerprintInput);
  if (!fp) return { status: 'found', entry };
  return { status: fp === normalizeFingerprint(entry.fingerprint) ? 'match' : 'mismatch', entry };
}

/** Années présentes dans le registre (décroissantes). */
export function registryYears(entries) {
  const set = new Set();
  (entries || []).forEach(e => {
    const y = new Date(e?.createdAt).getFullYear();
    if (Number.isFinite(y)) set.add(y);
  });
  return [...set].sort((a, b) => b - a);
}

/**
 * Filtre le registre.
 * @param {{ query?, templateId?, category?, year? }} f
 * @param {{ memberName:(id)=>string, templateOf:(id)=>object|null }} lookup
 */
export function filterRegistry(entries, f, lookup) {
  const q = normalizeSearch(f?.query);
  const words = q ? q.split(/\s+/) : [];
  return (entries || []).filter(e => {
    if (f?.templateId && e.templateId !== f.templateId) return false;
    if (f?.category && lookup?.templateOf?.(e.templateId)?.category !== f.category) return false;
    if (f?.year && new Date(e.createdAt).getFullYear() !== Number(f.year)) return false;
    if (words.length) {
      const hay = normalizeSearch([
        e.ref, e.title, e.fingerprint, e.fileName,
        ...(e.memberIds || []).map(id => lookup?.memberName?.(id) || ''),
      ].join(' '));
      if (!words.every(w => hay.includes(w))) return false;
    }
    return true;
  });
}

// ------------------------------------------------------------
// EXPORT CSV (Excel FR : séparateur « ; », BOM UTF-8, CRLF)
// ------------------------------------------------------------

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** « 10/10/2026 14:05 » (heure locale). */
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * @param {object[]} entries
 * @param {{ memberName:(id)=>string, templateOf:(id)=>object|null, categoryLabel:(id)=>string }} lookup
 */
export function registryToCsv(entries, lookup = {}) {
  const header = ['Référence', 'Date d\'émission', 'Document', 'Modèle', 'Catégorie', 'Membres concernés', 'Empreinte', 'Format', 'Fichier'];
  const rows = (entries || []).map(e => {
    const t = lookup.templateOf?.(e.templateId) || null;
    return [
      e.ref,
      formatDateTime(e.createdAt),
      e.title,
      t?.title || e.templateId || '',
      t ? (lookup.categoryLabel?.(t.category) || t.category) : '',
      (e.memberIds || []).map(id => lookup.memberName?.(id) || 'Membre supprimé').join(', '),
      e.fingerprint,
      formatLabel(e.format),
      e.fileName,
    ];
  });
  return `\uFEFF${[header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
}
