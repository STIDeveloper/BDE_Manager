// ============================================================
// STUDIO DOCUMENTS — RÉGÉNÉRATION D'UN DOCUMENT ÉMIS & SIGNATURE
// ============================================================
// Un document émis n'est pas stocké : il est régénéré à partir de l'entrée
// du registre (modèle + valeurs + membres), à la date d'émission. Son
// empreinte est recalculée : si elle diffère de celle du registre (données
// modifiées depuis, retouches de texte…), le document ne peut pas être
// présenté comme « la » version émise — on le signale.
// ============================================================

import { getTemplate, generateDocuments } from '../../documents/registry.js';
import { documentFingerprint, safeFileName } from '../../documents/model.js';
import { loadEngine } from './engine.js';
import { toDate, fullName } from '../../documents/context.js';

/**
 * @returns {Promise<{ doc: object|null, template: object|null, matches: boolean, fingerprint: string, error?: string }>}
 */
export async function regenerateEntry(entry, ctx) {
  const template = getTemplate(entry?.templateId);
  if (!template) return { doc: null, template: null, matches: false, fingerprint: '', error: 'Modèle introuvable.' };
  try {
    const at = toDate(entry.createdAt) || ctx.today;
    const docs = generateDocuments(template, { ...ctx, today: at }, entry.values || {}, entry.memberIds || []);
    const doc = template.scope === 'member'
      ? docs.find(d => (d.meta?.memberIds || []).join(',') === (entry.memberIds || []).join(',')) || docs[0]
      : docs[0];
    if (!doc) return { doc: null, template, matches: false, fingerprint: '', error: 'Membre introuvable (supprimé ?).' };
    const fingerprint = await documentFingerprint(doc);
    return { doc, template, fingerprint, matches: !entry.fingerprint || fingerprint === entry.fingerprint };
  } catch (e) {
    return { doc: null, template, matches: false, fingerprint: '', error: e?.message || String(e) };
  }
}

/** Emplacements de signature d'un document : [{ blockId, slotIndex, label, name, memberId }]. */
export function signatureSlotsOf(doc) {
  const out = [];
  (doc?.blocks || []).forEach(b => {
    if (b?.type !== 'signatures') return;
    (b.slots || []).forEach((s, i) => out.push({ blockId: b.id, slotIndex: i, label: s.label || 'Signature', name: s.name || '', memberId: s.memberId || null }));
  });
  return out;
}

/** Emplacement le plus probable pour un membre (nom, puis libellé « membre »). */
export function defaultSlotFor(slots, member) {
  if (!slots.length) return -1;
  const name = fullName(member).toLowerCase();
  let i = slots.findIndex(s => (member && s.memberId === member.id) || (name && s.name.toLowerCase() === name));
  if (i < 0) i = slots.findIndex(s => /membre|intéress|bénévole|bénéficiaire|stagiaire|étudiant/i.test(s.label) && !s.name);
  if (i < 0) i = slots.findIndex(s => !s.name);
  return i < 0 ? slots.length - 1 : i;
}

/** Copie du document avec l'image de signature posée dans l'emplacement choisi. */
export function applySignature(doc, sig) {
  if (!doc || !sig?.image) return doc;
  let applied = false;
  const blocks = doc.blocks.map(b => {
    if (b.type !== 'signatures' || (sig.blockId && b.id !== sig.blockId)) return b;
    if (applied) return b;
    const idx = Math.min(Math.max(0, sig.slotIndex || 0), (b.slots || []).length - 1);
    if (idx < 0) return b;
    applied = true;
    return { ...b, slots: b.slots.map((s, i) => (i === idx ? { ...s, image: sig.image } : s)) };
  });
  return { ...doc, blocks };
}

/** Informations d'émission d'une entrée du registre (pied de page, QR). */
export const issueOfEntry = (entry) => ({ ref: entry.ref, fingerprint: entry.fingerprint || '', issuedAt: entry.createdAt });

/** Télécharge le PDF signé d'une entrée du registre. */
export async function downloadSignedPdf(entry, ctx, signature) {
  const res = await regenerateEntry(entry, ctx);
  if (!res.doc) throw new Error(res.error || 'Document impossible à régénérer.');
  if (!res.matches) throw new Error('Le contenu régénéré ne correspond plus à la version émise (données modifiées depuis) : réémets le document.');
  const engine = await loadEngine();
  const doc = applySignature(res.doc, signature);
  const base = safeFileName(`${entry.fileName || entry.title || 'document'}_signe`);
  return engine.downloadPdf([doc], { organization: ctx.organization, issues: [issueOfEntry(entry)] }, base);
}

