// QR DE PRÉSENCE — planche de billets A4 (8 par page) en PDF vectoriel.
import { drawQr, loadJsPdf, savePdf } from '../../../forms/share/qrPdf.js';
import { pdfSafeText } from '../../../documents/render/shared.js';
import { ticketLink } from './logic.js';

/**
 * @param {object} ev événement
 * @param {{ participant, token }[]} tickets
 * @param {{ when?: string, organization?: string, asBlob?: boolean }} [opts]
 */
export async function downloadTicketsPdf(ev, tickets, { when = '', organization = '', asBlob = false } = {}) {
  const JsPDF = await loadJsPdf();
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.setProperties({ title: pdfSafeText(`Billets — ${ev.title}`), creator: 'BDE Manager' });
  const W = 210; const H = 297; const M = 10; const cols = 2; const rows = 4;
  const cw = (W - M * 2) / cols; const ch = (H - M * 2 - 8) / rows;
  tickets.forEach(({ participant, token }, i) => {
    const slot = i % (cols * rows);
    if (i > 0 && slot === 0) pdf.addPage();
    if (slot === 0) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(120, 120, 130);
      pdf.text(pdfSafeText(`Usage interne — billets nominatifs « ${ev.title} » — à découper`), W / 2, M + 2, { align: 'center' });
    }
    const x = M + (slot % cols) * cw;
    const y = M + 6 + Math.floor(slot / cols) * ch;
    pdf.setDrawColor(170, 170, 180); pdf.setLineDashPattern([1.5, 1.5], 0); pdf.setLineWidth(0.2);
    pdf.rect(x + 1, y + 1, cw - 2, ch - 2, 'S');
    pdf.setLineDashPattern([], 0);
    const qr = Math.min(ch - 14, 46);
    drawQr(pdf, ticketLink(token), x + 5, y + (ch - qr) / 2, qr, { level: 'M' });
    const tx = x + qr + 9; const tw = cw - qr - 14;
    pdf.setTextColor(30, 30, 40);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    let ty = y + 10;
    pdf.splitTextToSize(pdfSafeText(ev.title), tw).slice(0, 3).forEach((l) => { pdf.text(l, tx, ty); ty += 4; });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(80, 80, 90);
    if (when) { pdf.splitTextToSize(pdfSafeText(when), tw).slice(0, 2).forEach((l) => { pdf.text(l, tx, ty); ty += 3.6; }); }
    if (ev.location) { pdf.splitTextToSize(pdfSafeText(ev.location), tw).slice(0, 2).forEach((l) => { pdf.text(l, tx, ty); ty += 3.6; }); }
    ty += 3;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(20, 20, 30);
    pdf.splitTextToSize(pdfSafeText(participant.name), tw).slice(0, 2).forEach((l) => { pdf.text(l, tx, ty); ty += 4.8; });
    pdf.setFont('courier', 'normal'); pdf.setFontSize(7); pdf.setTextColor(120, 120, 130);
    pdf.text(`n° ${token.slice(0, 8).toUpperCase()}`, tx, y + ch - 8);
    if (organization) { pdf.setFont('helvetica', 'normal'); pdf.text(pdfSafeText(organization), tx, y + ch - 4.5); }
  });
  return savePdf(pdf, `billets_${ev.title}`, asBlob);
}
