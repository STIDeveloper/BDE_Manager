// ============================================================
// STUDIO DOCUMENTS — MOTEURS DE RENDU (API publique)
// ============================================================
//   <DocumentView doc organization issue editable overrides onEdit className />
//   documentsToHtml(docs, { organization, issues, forWord })  → string
//   printDocuments(docs, { organization, issues })             → Promise<void>
//   downloadWord(docs, { organization, issues }, fileName?)    → nom du fichier
//   renderDocumentsToPdf(docs, { organization, issues })       → Promise<jsPDF>
//   downloadPdf(docs, { organization, issues }, fileName?)     → Promise<nom>
//   A4_MM, estimatePageCount(doc)
// `issues[i]` correspond à `docs[i]` ({ ref, fingerprint, issuedAt } ou null).
// Les retouches (overrides) doivent être appliquées AVANT export :
// applyOverrides(doc, overrides) — voir ../model.js.
// ============================================================

export { default as DocumentView } from './DocumentView.jsx';
export { documentsToHtml, printDocuments, downloadWord } from './html.js';
export { renderDocumentsToPdf, downloadPdf } from './pdf.js';
export {
  A4_MM, estimatePageCount, pdfSafeText, isSafeImageSrc, PENDING_REFERENCE, referenceLine,
} from './shared.js';

/** Classe CSS des zones imprimables (impression directe de la page). */
export const DOC_PRINT_AREA_CLASS = 'doc-print-area';
