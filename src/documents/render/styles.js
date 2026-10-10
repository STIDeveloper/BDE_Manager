// ============================================================
// STUDIO DOCUMENTS — RENDU : feuille de style « papier »
// ============================================================
// Une seule source de vérité pour l'aperçu React, l'impression et l'export
// Word. La feuille est TOUJOURS blanche à encre noire, quel que soit le thème
// de l'application. Mise en page par tableaux (en-tête, signatures,
// organigramme) : Word ignore flexbox et grid.
// ============================================================

const FONT_STACK = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif';

/**
 * @param {object} colors   { accent, accentText, accentSoft, onAccent } (CSS)
 * @param {object} [opts]   { forWord: boolean }
 */
export function sheetCss(colors, { forWord = false } = {}) {
  const { accent, accentText, accentSoft, onAccent } = colors;
  const ink = '#1c1c20';
  const muted = '#5f636b';
  const line = '#d7dae0';
  return `
.doc-sheet{box-sizing:border-box;position:relative;width:210mm;min-height:297mm;margin:0 auto;padding:14mm 18mm 10mm;background:#ffffff;color:${ink};color-scheme:light;font-family:${FONT_STACK};font-size:10.5pt;line-height:1.45;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-wrap:break-word;}
.doc-sheet.doc-landscape{width:297mm;min-height:210mm;}
.doc-sheet *,.doc-sheet *::before,.doc-sheet *::after{box-sizing:border-box;}
.doc-sheet p,.doc-sheet h1,.doc-sheet h2,.doc-sheet h3,.doc-sheet ul,.doc-sheet ol,.doc-sheet li,.doc-sheet table,.doc-sheet figure{margin:0;padding:0;}
.doc-sheet table{border-collapse:collapse;border-spacing:0;width:100%;}
.doc-sheet td,.doc-sheet th{vertical-align:top;padding:0;text-align:left;font-weight:normal;}
.doc-sheet img{display:inline-block;max-width:100%;height:auto;border:0;}
.doc-sheet strong{font-weight:700;color:inherit;}
.doc-frame>thead,.doc-frame>tfoot{display:none;}
.doc-frame,.doc-frame>tbody,.doc-frame>tbody>tr,.doc-frame>tbody>tr>td{display:block;width:100%;}
.doc-frame-top{height:0;}

/* En-tête (papier à lettres) */
.doc-letterhead{margin:0 0 9mm;}
.doc-lh td{vertical-align:middle;}
.doc-lh-logo{width:1%;padding-right:5mm !important;white-space:nowrap;}
.doc-sheet .doc-logo{max-height:20mm;max-width:34mm;width:auto;height:auto;display:block;}
.doc-lh-name{font-size:14pt;font-weight:700;line-height:1.2;color:${ink};letter-spacing:.01em;}
.doc-lh-sub{font-size:9pt;color:${muted};margin-top:1mm;}
.doc-lh-addr{font-size:9pt;color:${muted};}
.doc-lh-contact{text-align:right !important;font-size:8.5pt;line-height:1.5;color:${muted};white-space:nowrap;padding-left:6mm !important;}
.doc-rule{height:0;border-top:2px solid ${accent};margin-top:4mm;font-size:1pt;line-height:1pt;}

/* Titre */
.doc-title-block{text-align:center;margin:2mm 0 8mm;}
.doc-title{font-size:17pt;font-weight:700;line-height:1.25;color:${ink};letter-spacing:.01em;}
.doc-subtitle{font-size:10.5pt;color:${muted};margin-top:1.5mm !important;}
.doc-title-bar{width:18mm;height:0;border-top:2px solid ${accent};margin:3.5mm auto 0;font-size:1pt;line-height:1pt;}

/* Intertitres */
.doc-h1{font-size:11.5pt;font-weight:700;color:${accentText};margin:6mm 0 2.5mm !important;padding-bottom:1.2mm !important;border-bottom:0.5pt solid ${line};page-break-after:avoid;break-after:avoid;}
.doc-h2{font-size:10.5pt;font-weight:700;color:${ink};margin:4.5mm 0 1.8mm !important;page-break-after:avoid;break-after:avoid;}

/* Paragraphes */
.doc-p{margin:0 0 3mm !important;orphans:2;widows:2;}
.doc-align-justify{text-align:justify;hyphens:auto;-webkit-hyphens:auto;}
.doc-align-center{text-align:center;}
.doc-align-right{text-align:right;}
.doc-tone-muted{color:${muted};}
.doc-tone-small{font-size:8.5pt;line-height:1.4;color:${muted};}

/* Listes */
.doc-list{margin:0 0 3mm 6mm !important;padding-left:4mm !important;}
ul.doc-list{list-style:disc outside;}
ol.doc-list{list-style:decimal outside;}
.doc-list li{margin:0 0 1.2mm !important;padding-left:1mm !important;display:list-item;}

/* Clé / valeur */
.doc-kv{margin:0 0 4mm !important;}
.doc-kv th,.doc-kv td{padding:1.6mm 0 !important;border-bottom:0.5pt solid ${line};}
.doc-kv th{width:36%;color:${muted};font-weight:normal;padding-right:4mm !important;}
.doc-kv td{color:${ink};font-weight:600;}

/* Tableaux */
.doc-table{margin:0 0 4.5mm !important;font-size:9pt;line-height:1.35;}
.doc-table caption{caption-side:top;text-align:left;font-size:8.5pt;font-style:italic;color:${muted};padding:0 0 1.5mm !important;}
.doc-table th{background:${accent};color:${onAccent};font-weight:700;padding:2mm 2.2mm !important;border:0.5pt solid ${accent};}
.doc-table td{padding:1.8mm 2.2mm !important;border:0.5pt solid ${line};}
.doc-table tbody tr:nth-child(even) td{background:#f6f7f9;}
.doc-table tr{page-break-inside:avoid;break-inside:avoid;}
.doc-table thead{display:table-header-group;}
.doc-table-dense{font-size:8pt;}
.doc-table-dense th,.doc-table-dense td{padding:1.1mm 1.6mm !important;}
.doc-blank-row td{height:8mm;}

/* Lieu et date, signatures */
.doc-placedate{text-align:right;margin:6mm 0 4mm !important;page-break-after:avoid;break-after:avoid;page-break-before:avoid;break-before:avoid;}
.doc-signatures{margin:2mm 0 4mm !important;page-break-inside:avoid;break-inside:avoid;page-break-before:avoid;break-before:avoid;}
.doc-p:has(+ .doc-placedate){page-break-after:avoid;break-after:avoid;}
.doc-sig{padding:0 3mm 4mm !important;}
.doc-sig:first-child{padding-left:0 !important;}
.doc-sig:last-child{padding-right:0 !important;}
.doc-sig-label{font-size:9.5pt;font-weight:700;}
.doc-sig-mention{font-size:8.5pt;font-style:italic;color:${muted};}
.doc-sig-area{height:24mm;margin:1.5mm 0;position:relative;white-space:nowrap;}
.doc-sheet .doc-sig-img{max-height:22mm;max-width:52mm;vertical-align:middle;}
.doc-sheet .doc-stamp{max-height:24mm;max-width:28mm;vertical-align:middle;margin-left:3mm;opacity:.92;}
.doc-sig-name{font-weight:700;font-size:10pt;border-top:0.5pt solid ${line};padding-top:1.2mm !important;}
.doc-sig-role{font-size:9pt;color:${muted};}

/* Encadrés */
.doc-callout{margin:0 0 4mm !important;padding:3mm 4mm !important;border-left:3px solid ${accent};background:${accentSoft};font-size:9.5pt;line-height:1.45;page-break-inside:avoid;break-inside:avoid;}
.doc-callout-warning{border-left-color:#c27c0e;background:#fdf6e7;}
.doc-callout-legal{border-left-color:#7a7f88;background:#f4f5f7;color:#3c4048;font-size:8.8pt;}

/* Cases à cocher */
.doc-checklist{list-style:none;margin:0 0 3.5mm !important;}
.doc-checklist li{margin:0 0 1.6mm !important;padding-left:7mm !important;position:relative;list-style:none;}
.doc-box{position:absolute;left:0;top:.6mm;display:inline-block;width:3.6mm;height:3.6mm;border:0.8pt solid #4a4e56;border-radius:0.6mm;font-size:8pt;line-height:3.2mm;text-align:center;color:${onAccent};}
.doc-box-checked{background:${accent};border-color:${accent};}

/* Lignes à compléter */
.doc-blanks{margin:0 0 4mm !important;}
.doc-blanks td{height:9mm;vertical-align:bottom;padding-bottom:1mm !important;}
.doc-blank-label{width:1%;white-space:nowrap;padding-right:2mm !important;}
.doc-blank-fill{border-bottom:0.6pt dotted #6b6f77;}

/* Organigramme */
.doc-org{margin:0 0 4mm !important;table-layout:fixed;}
.doc-org-cell{padding:0 1.5mm 3mm !important;}
.doc-org-card{border:0.5pt solid ${line};border-top:3px solid ${accent};page-break-inside:avoid;break-inside:avoid;}
.doc-org-title{font-weight:700;font-size:9.5pt;padding:1.8mm 2.5mm !important;background:#f6f7f9;border-bottom:0.5pt solid ${line};}
.doc-org-people{list-style:none;padding:1.5mm 2.5mm 2mm !important;}
.doc-org-people li{margin:0 0 1.4mm !important;list-style:none;}
.doc-org-name{display:block;font-weight:700;font-size:9pt;}
.doc-org-role{display:block;font-size:8pt;color:${muted};}

/* Espacements et sauts */
.doc-spacer-sm{height:3mm;}
.doc-spacer-md{height:6mm;}
.doc-spacer-lg{height:12mm;}
.doc-page-break{margin:6mm -18mm !important;border-top:1px dashed #b4b8c0;text-align:center;height:0;}
.doc-page-break span{position:relative;top:-0.75em;background:#ffffff;padding:0 3mm;font-size:7.5pt;letter-spacing:.08em;text-transform:uppercase;color:#8a8f98;}

/* Pied de page */
.doc-footer{margin-top:8mm;padding-top:2mm;border-top:0.5pt solid ${line};font-size:7.2pt;line-height:1.45;color:#6b6f77;text-align:center;}
.doc-footer-note{font-style:italic;}
.doc-footer-meta{margin-top:1mm;}
.doc-footer-meta td{font-size:7.2pt;color:#6b6f77;vertical-align:bottom;}
.doc-footer-ref{text-align:left !important;width:52%;}
.doc-footer-conf{width:14%;white-space:nowrap;text-align:center !important;font-weight:700;letter-spacing:.12em;color:#a12d2d !important;}
.doc-footer-page{text-align:right !important;width:34%;}
${forWord ? wordCss() : screenAndPrintCss()}
`;
}

function screenAndPrintCss() {
  return `
@media screen{
  .doc-sheet{display:flex;flex-direction:column;}
  .doc-frame{display:flex;flex-direction:column;flex:1 1 auto;}
  .doc-frame>tbody{flex:1 1 auto;}
  .doc-frame>tfoot{display:block;width:100%;}
  .doc-frame>tfoot>tr,.doc-frame>tfoot>tr>td{display:block;width:100%;}
}
@page{size:A4;margin:0;}
@page doc-landscape{size:A4 landscape;margin:0;}
@media print{
  .doc-sheet{width:auto;min-height:0;margin:0;padding:0 18mm;box-shadow:none !important;border:0 !important;border-radius:0 !important;page-break-after:always;break-after:page;}
  .doc-sheet.doc-landscape{width:auto;min-height:0;page:doc-landscape;}
  .doc-sheet.doc-last{page-break-after:auto;break-after:auto;}
  .doc-frame{display:table;width:100%;}
  .doc-frame>thead{display:table-header-group;}
  .doc-frame>tfoot{display:table-footer-group;}
  .doc-frame>tbody{display:table-row-group;}
  .doc-frame>tbody>tr,.doc-frame>thead>tr,.doc-frame>tfoot>tr{display:table-row;}
  .doc-frame>tbody>tr>td,.doc-frame>thead>tr>td,.doc-frame>tfoot>tr>td{display:table-cell;}
  .doc-frame-top{height:14mm;}
  .doc-footer{margin-top:4mm;margin-bottom:8mm;}
  .doc-page-break{border:0 !important;margin:0 !important;height:0;page-break-after:always;break-after:page;}
  .doc-page-break span{display:none;}
}
`;
}

function wordCss() {
  return `
.doc-sheet{width:auto;min-height:0;padding:0;margin:0;}
.doc-sheet.doc-landscape{width:auto;min-height:0;}
.doc-page-break{display:none;}
`;
}

/** Styles propres à l'aperçu interactif (retouche en place, impression directe). */
export const PREVIEW_EXTRA_CSS = `
.doc-print-area{color-scheme:light;}
.doc-print-area .doc-sheet{box-shadow:0 1px 3px rgba(15,17,22,.18),0 12px 32px -12px rgba(15,17,22,.28);}
.doc-editable{position:relative;border-radius:2px;outline:1px dashed transparent;outline-offset:2px;transition:outline-color .15s ease,background-color .15s ease;cursor:text;}
.doc-editable:hover{outline-color:rgba(79,129,245,.55);background:rgba(79,129,245,.04);}
.doc-editable:focus{outline:2px solid rgba(79,129,245,.85);background:rgba(79,129,245,.06);}
.doc-editable::after{content:"\\270E";position:absolute;top:-1mm;right:-5mm;font-size:9pt;color:rgba(79,129,245,.85);opacity:0;transition:opacity .15s ease;pointer-events:none;}
.doc-editable:hover::after,.doc-editable:focus::after{opacity:1;}
@media print{
  body:has(.doc-print-area) *{visibility:hidden !important;}
  body:has(.doc-print-area) .doc-print-area,body:has(.doc-print-area) .doc-print-area *{visibility:visible !important;}
  body:has(.doc-print-area){background:#ffffff !important;}
  html:has(.doc-print-area),body:has(.doc-print-area){height:auto !important;overflow:visible !important;}
  .doc-print-area{position:absolute !important;left:0;top:0;width:100%;margin:0 !important;padding:0 !important;transform:none !important;zoom:1 !important;}
  .doc-print-area .doc-sheet{box-shadow:none !important;}
  .doc-print-area .doc-editable{outline:none !important;background:transparent !important;}
  .doc-print-area .doc-editable::after{display:none !important;}
}
`;
