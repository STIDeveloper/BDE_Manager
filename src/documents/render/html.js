// ============================================================
// STUDIO DOCUMENTS — RENDU HTML : impression et export Word
// ============================================================
// documentsToHtml() produit une page HTML autonome (CSS embarquée, images en
// dataURL, texte échappé) : une feuille A4 par document, séparées par des
// sauts de page. Variante `forWord` : en-têtes Microsoft Office pour que Word
// ouvre le fichier en mode Page (A4, marges), mise en page par tableaux.
// ============================================================

import { buildSheet, treeToHtml } from './markup.js';
import { sheetCss } from './styles.js';
import { accentPalette, escapeHtml, str } from './shared.js';
import { safeFileName } from '../model.js';

// Word ne connaît pas les éléments HTML5 de section.
const WORD_TAGS = { article: 'div', header: 'div', footer: 'div' };

function colorsFor(org) {
  const p = accentPalette(org?.accentColor);
  return { accent: p.hex, accentText: p.textHex, accentSoft: p.softHex, onAccent: p.onRuleHex };
}

/**
 * Page HTML autonome contenant tous les documents.
 * @param {object[]} docs
 * @param {object} opts { organization, issues: (issue|null)[] alignés sur docs, forWord }
 * @returns {string}
 */
// Filigrane « BROUILLON » (exports non émis) : répété sur chaque page imprimée
// (position fixe à l'impression). Word ignore les pseudo-éléments : un
// bandeau en tête de document le remplace.
const DRAFT_CSS = `.doc-sheet::before{content:"BROUILLON";position:absolute;top:42%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:96pt;font-weight:800;letter-spacing:6pt;color:rgba(200,30,30,0.13);pointer-events:none;z-index:5;white-space:nowrap;}
@media print{.doc-sheet::before{position:fixed;}}`;
const DRAFT_BANNER = '<p style="color:#c81e1e;font-weight:bold;text-align:center;border:1.5pt solid #c81e1e;padding:4pt;margin:0 0 8pt 0;">BROUILLON — document non émis, sans valeur officielle</p>';

export function documentsToHtml(docs, { organization = {}, issues = [], forWord = false, draft = false } = {}) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  const org = organization || {};
  const title = list.length === 1 ? str(list[0]?.meta?.title) : `${list.length} documents`;
  // Word ignore les déclarations marquées !important : on les retire.
  const baseCss = forWord ? sheetCss(colorsFor(org), { forWord }).replace(/ !important/g, '') : sheetCss(colorsFor(org), { forWord });
  const css = draft && !forWord ? `${baseCss}
${DRAFT_CSS}` : baseCss;

  if (forWord) {
    const sections = list.map((doc, i) => {
      const landscape = doc?.meta?.orientation === 'landscape';
      const sheet = treeToHtml(buildSheet(doc, { organization: org, issue: issues[i] || null, forWord: true, last: i === list.length - 1 }), WORD_TAGS);
      const brk = i > 0 ? '<br clear="all" style="mso-special-character:line-break;page-break-before:always">' : '';
      return `${brk}<div class="${landscape ? 'WordSectionL' : 'WordSection1'}">${draft ? DRAFT_BANNER : ''}${sheet}</div>`;
    }).join('\n');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="BDE Manager">
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1{size:21cm 29.7cm;margin:1.6cm 1.8cm 1.8cm 1.8cm;mso-header-margin:1cm;mso-footer-margin:1cm;mso-paper-source:0;}
@page WordSectionL{size:29.7cm 21cm;mso-page-orientation:landscape;margin:1.6cm 1.8cm 1.8cm 1.8cm;mso-header-margin:1cm;mso-footer-margin:1cm;mso-paper-source:0;}
div.WordSection1{page:WordSection1;}
div.WordSectionL{page:WordSectionL;}
body{font-family:Helvetica,Arial,sans-serif;font-size:10.5pt;}
${css}
</style>
</head>
<body lang="FR">
${sections}
</body>
</html>`;
  }

  const sheets = list.map((doc, i) => treeToHtml(buildSheet(doc, {
    organization: org, issue: issues[i] || null, last: i === list.length - 1,
  }))).join('\n');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
html,body{margin:0;padding:0;background:#e9ebef;}
body{padding:10mm 0;}
.doc-sheet{margin:0 auto 10mm;box-shadow:0 2px 12px rgba(0,0,0,.18);}
@media print{html,body{background:#ffffff;padding:0;}.doc-sheet{margin:0;}}
${css}
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}

/**
 * Imprime les documents via une iframe cachée (srcdoc), après chargement des
 * images. L'iframe est retirée après l'impression.
 * @returns {Promise<void>}
 */
export function printDocuments(docs, opts = {}) {
  if (typeof document === 'undefined') return Promise.reject(new Error('Impression indisponible hors navigateur'));
  const html = documentsToHtml(docs, { ...opts, forWord: false });
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.title = 'Impression';
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    let done = false;
    const cleanup = () => { setTimeout(() => iframe.remove(), 1000); };
    iframe.onload = async () => {
      if (done) return;
      done = true;
      try {
        const win = iframe.contentWindow;
        const idoc = iframe.contentDocument;
        const images = [...(idoc?.images || [])];
        await Promise.all(images.map(img => (img.complete ? Promise.resolve() : new Promise(r => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
        }))));
        if (idoc?.fonts?.ready) await idoc.fonts.ready.catch(() => {});
        const finish = () => { cleanup(); resolve(); };
        win.addEventListener('afterprint', finish, { once: true });
        win.focus();
        win.print();
        // print() est bloquant dans la plupart des navigateurs ; filet de sécurité.
        setTimeout(finish, 60000);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Nom de fichier par défaut d'un lot de documents. */
export function defaultFileName(docs) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  return list.length === 1 ? safeFileName(list[0]?.meta?.fileName || list[0]?.meta?.title) : `Documents_${list.length}`;
}

/**
 * Télécharge un fichier Word (.doc, HTML Office) — s'ouvre dans Word,
 * LibreOffice et Pages.
 * @returns {string} nom du fichier
 */
export function downloadWord(docs, opts = {}, fileName) {
  const html = documentsToHtml(docs, { ...opts, forWord: true });
  const base = safeFileName(String(fileName || defaultFileName(docs)).replace(/\.docx?$/i, ''));
  const name = `${base}.doc`;
  const blob = new Blob(['\uFEFF', html], { type: 'application/msword' });
  triggerDownload(blob, name);
  return name;
}

export { triggerDownload };
