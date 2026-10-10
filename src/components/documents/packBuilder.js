// ============================================================
// STUDIO DOCUMENTS — CONSTRUCTION DU DOSSIER ANNUEL (un seul PDF)
// ============================================================
// Page de garde + sommaire (pages réelles) + documents choisis, chacun
// numéroté et inscrit au registre, avec son QR code de vérification.
// ============================================================

import { getTemplate, generateDocuments, missingRequirements, defaultValues } from '../../documents/registry.js';
import { documentFingerprint, validateDocument, safeFileName } from '../../documents/model.js';
import { toDate } from '../../documents/context.js';
import { PACK_ITEMS, PACK_TEMPLATE_ID, packTemplate, inAcademicYear } from '../../documents/pack.js';
import { buildIssues, buildLogEntries } from './registryHelpers.js';
import { loadEngine } from './engine.js';

/** Dernière entrée du registre d'un modèle dans l'année universitaire. */
export function latestEntryOfYear(documentLog, templateId, year) {
  return (documentLog || []).filter(e => e.templateId === templateId && inAcademicYear(e.createdAt, year))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

/** Documents émis dans l'année et réémissibles (hors dossiers annuels). */
export function reissuableEntries(documentLog, year) {
  return (documentLog || []).filter(e => e.templateId !== PACK_TEMPLATE_ID && inAcademicYear(e.createdAt, year) && getTemplate(e.templateId));
}

function generateOne(template, ctx, values, memberIds = [], today = null) {
  const c = today ? { ...ctx, today } : ctx;
  const missing = missingRequirements(template, c, { ...defaultValues(template, c), ...values });
  if (missing.length) return { error: `à compléter : ${missing.map(m => m.label).join(', ')}` };
  const docs = generateDocuments(template, c, values, memberIds);
  const doc = docs[0];
  if (!doc) return { error: 'aucun document généré' };
  const problems = validateDocument(doc);
  if (problems.length) return { error: problems[0] };
  return { doc };
}

/**
 * @param {{ year: string, itemIds: string[], reissue: object[], ctx: object, archives: object[],
 *   documentLog: object[], reserveRefs: (n:number)=>string[], logDocuments: (e:object[])=>object[],
 *   categoryLabel: (id:string)=>string }} p
 * @returns {Promise<{ fileName: string, refs: string[], count: number, skipped: string[] }>}
 */
export async function buildAnnualPack({ year, itemIds, reissue = [], ctx, archives = [], documentLog, reserveRefs, logDocuments, categoryLabel = (x) => x }) {
  const parts = []; // { doc, templateId, values }
  const skipped = [];

  for (const item of PACK_ITEMS.filter(i => itemIds.includes(i.id))) {
    const template = getTemplate(item.templateId);
    if (!template) { skipped.push(`${item.label} : modèle indisponible`); continue; }
    let values = {};
    let memberIds = [];
    let today = null;
    if (item.fromRegistry) {
      const entry = latestEntryOfYear(documentLog, item.templateId, year);
      if (!entry) { skipped.push(`${item.label} : aucun document émis en ${year}`); continue; }
      values = entry.values || {};
      memberIds = entry.memberIds || [];
      today = toDate(entry.createdAt);
    }
    const res = generateOne(template, ctx, values, memberIds, today);
    if (res.error) { skipped.push(`${item.label} : ${res.error}`); continue; }
    parts.push({ doc: res.doc, templateId: template.id, values });
  }

  for (const entry of reissue) {
    const template = getTemplate(entry.templateId);
    if (!template) { skipped.push(`${entry.ref} : modèle indisponible`); continue; }
    const res = generateOne(template, ctx, entry.values || {}, entry.memberIds || [], toDate(entry.createdAt));
    if (res.error) { skipped.push(`${entry.ref} (${entry.title}) : ${res.error}`); continue; }
    parts.push({ doc: res.doc, templateId: template.id, values: entry.values || {} });
  }

  if (!parts.length) throw new Error(skipped.length ? `Aucun document n'a pu être généré. ${skipped.join(' ; ')}` : 'Choisis au moins un document.');

  const engine = await loadEngine();
  const org = ctx.organization;
  const refs = reserveRefs(parts.length + 1);
  const issuedAt = new Date().toISOString();
  const docFingerprints = await Promise.all(parts.map(p => documentFingerprint(p.doc)));
  const docIssues = buildIssues(refs.slice(1), docFingerprints, issuedAt);

  // Pages réelles de chaque document (rendu individuel).
  const pageCounts = [];
  for (let i = 0; i < parts.length; i++) {
    const pdf = await engine.renderDocumentsToPdf([parts[i].doc], { organization: org, issues: [docIssues[i]] });
    pageCounts.push(pdf.getNumberOfPages());
  }

  const archivesOfYear = archives.filter(a => inAcademicYear(a.date, year))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(a => ({ title: a.title, category: categoryLabel(a.category), date: a.date }));
  const coverValues = (pages) => ({
    annee: year,
    dateDocument: issuedAt.slice(0, 10),
    sommaire: parts.map((p, i) => ({ title: p.doc.meta.title, ref: docIssues[i].ref, page: pages ? pages[i] : 0 })),
    archives: archivesOfYear,
  });
  const pagesFrom = (coverPages) => {
    let next = coverPages + 1;
    return pageCounts.map(n => { const start = next; next += n; return start; });
  };
  // Deux passes : la page de garde peut occuper plusieurs pages.
  const draftCover = packTemplate.build(ctx, coverValues(pagesFrom(1)));
  const coverPdf = await engine.renderDocumentsToPdf([draftCover], { organization: org, issues: [{ ref: refs[0], fingerprint: '0000-0000-0000', issuedAt }] });
  const values = coverValues(pagesFrom(coverPdf.getNumberOfPages()));
  const cover = packTemplate.build(ctx, values);
  const coverIssue = buildIssues([refs[0]], [await documentFingerprint(cover)], issuedAt)[0];

  const fileName = safeFileName(`Dossier_annuel_${year}_${refs[0]}`);
  await engine.downloadPdf([cover, ...parts.map(p => p.doc)], { organization: org, issues: [coverIssue, ...docIssues] }, fileName);

  const entries = [
    ...buildLogEntries([cover], [coverIssue], { templateId: PACK_TEMPLATE_ID, values, format: 'pdf', fileName }),
    ...parts.flatMap((p, i) => buildLogEntries([p.doc], [docIssues[i]], { templateId: p.templateId, values: p.values, format: 'pdf', fileName })),
  ].map(e => ({ ...e, origin: { type: 'pack', year, ref: refs[0] } }));
  logDocuments(entries);
  return { fileName, refs, count: parts.length, skipped };
}
