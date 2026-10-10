// ============================================================
// PARTAGE — QR codes et affiche A4 en PDF
// ============================================================
// Même chaîne que le moteur de rendu des documents : jsPDF chargé à la
// demande, QR tracé en VECTEURS (qrMatrix / qrRuns de src/documents/qr.js,
// net à toute taille d'impression), texte rendu sûr pour les polices PDF
// standard (pdfSafeText). Le modèle de document (AST) n'ayant pas de bloc
// « image », l'affiche et les billets sont mis en page ici directement.
// ============================================================

import { qrMatrix, qrRuns } from '../../documents/qr.js';
import { pdfSafeText } from '../../documents/render/shared.js';
import { safeFileName } from '../../documents/model.js';
import { displayLink } from './links.js';

export async function loadJsPdf() {
  const mod = await import('jspdf');
  return mod.jsPDF || mod.default;
}

/** Trace un QR code (carré de `size` mm, zone de silence comprise). */
export function drawQr(pdf, text, x, y, size, { level = 'M', quiet = 2 } = {}) {
  const m = qrMatrix(text, { level });
  const unit = size / (m.size + quiet * 2);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, size, size, 'F');
  pdf.setFillColor(0, 0, 0);
  qrRuns(m).forEach(r => pdf.rect(x + (r.x + quiet) * unit, y + (r.y + quiet) * unit, r.w * unit + 0.01, unit + 0.01, 'F'));
}

/** Texte centré sur plusieurs lignes ; → ordonnée après le bloc. */
export function centeredText(pdf, text, y, { size = 12, style = 'normal', maxWidth = 170, lineGap = 1.25, color = [20, 20, 20] } = {}) {
  pdf.setFont('helvetica', style);
  pdf.setFontSize(size);
  pdf.setTextColor(...color);
  const lines = pdf.splitTextToSize(pdfSafeText(text), maxWidth);
  const lh = (size * 0.3528) * lineGap;
  const w = pdf.internal.pageSize.getWidth();
  lines.forEach((l, i) => pdf.text(l, w / 2, y + i * lh, { align: 'center', baseline: 'top' }));
  return y + lines.length * lh;
}

/** Télécharge le PDF (ou renvoie { name, blob } si asBlob). */
export function savePdf(pdf, fileName, asBlob = false) {
  const name = `${safeFileName(fileName || 'document')}.pdf`;
  if (asBlob) return { name, blob: pdf.output('blob') };
  pdf.save(name);
  return name;
}

/**
 * Affiche A4 imprimable : titre, accroche, grand QR code, lien lisible.
 * @returns {Promise<string|{ name, blob }>} nom du fichier (ou blob si asBlob)
 */
export async function downloadPoster({ title, subtitle = '', link, organization = '', callToAction = 'Scanne-moi pour répondre', fileName, asBlob = false }) {
  const JsPDF = await loadJsPdf();
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  pdf.setProperties({ title: pdfSafeText(title || 'Affiche'), creator: 'BDE Manager' });

  // Bandeau
  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, W, 14, 'F');
  if (organization) {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(255, 255, 255);
    pdf.text(pdfSafeText(organization), W / 2, 9.2, { align: 'center' });
  }

  let y = 30;
  y = centeredText(pdf, title || 'Formulaire', y, { size: 34, style: 'bold', maxWidth: 176 });
  if (subtitle) y = centeredText(pdf, subtitle, y + 6, { size: 15, maxWidth: 160, color: [70, 70, 80] });

  const qrSize = Math.min(130, H - y - 80);
  const qrY = Math.max(y + 12, 90);
  pdf.setDrawColor(37, 99, 235); pdf.setLineWidth(1.2);
  pdf.roundedRect((W - qrSize) / 2 - 6, qrY - 6, qrSize + 12, qrSize + 12, 6, 6, 'S');
  drawQr(pdf, link, (W - qrSize) / 2, qrY, qrSize, { level: 'Q' });

  let after = qrY + qrSize + 16;
  after = centeredText(pdf, callToAction, after, { size: 20, style: 'bold', color: [37, 99, 235] });
  centeredText(pdf, `ou va sur ${displayLink(link)}`, after + 4, { size: 14, color: [50, 50, 60] });

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(140, 140, 150);
  pdf.text(pdfSafeText('Pointe l’appareil photo de ton téléphone vers le code.'), W / 2, H - 10, { align: 'center' });
  return savePdf(pdf, fileName || `affiche_${title || 'formulaire'}`, asBlob);
}
