// ============================================================
// STUDIO DOCUMENTS — RENDU PDF VECTORIEL (jsPDF + jspdf-autotable)
// ============================================================
// Produit un vrai PDF vectoriel A4 (unités mm, Helvetica) à partir de l'AST :
//   - pagination de tous les blocs (lignes orphelines / veuves évitées,
//     intertitre gardé avec le bloc suivant, signatures jamais coupées,
//     tableaux paginés avec en-tête répété) ;
//   - texte justifié (sauf dernière ligne) avec `**gras**` en ligne ;
//   - en-tête complet en page 1, en-tête compact sur les pages suivantes ;
//   - pied de page sur chaque page : identité légale, référence + empreinte,
//     « CONFIDENTIEL », mention libre, « Page n / N » (par document).
// jsPDF est chargé à la demande (import dynamique) : hors du bundle principal.
// ============================================================

import {
  pageSizeOf, parseInline, pdfSafeText, stripInline, isFullyBold, imageFormatOf,
  isSafeImageSrc, readImageSize, fitBox, accentPalette, letterheadInfo, footerIdentity,
  referenceLine, stampSlotIndex, safeHex, hexToRgb, str,
} from './shared.js';
import { safeFileName } from '../model.js';

const PT = 25.4 / 72;            // 1 pt en mm
const MARGIN_X = 18;
const CONT_TOP = 22;             // haut du contenu sur les pages de continuation
const INK = [28, 28, 32];
const MUTED = [95, 99, 107];
const FAINT = [110, 114, 122];
const LINE = [215, 218, 224];
const ZEBRA = [246, 247, 249];
const WARN = { bar: [194, 124, 14], bg: [253, 246, 231] };
const LEGAL = { bar: [122, 127, 136], bg: [244, 245, 247], ink: [60, 64, 72] };
const CONFIDENTIAL_RED = [161, 45, 45];

// Les métriques internes de jsPDF sont approximatives pour certains glyphes
// WinAnsi (œ, Œ, Š…) : corrections en millièmes d'em d'après les AFM Helvetica.
const WIDTH_FIX = {
  normal: { 'Œ': 470, 'œ': 414, 'Š': 137, 'Ž': 81, 'š': -30, 'ž': -30, '€': 26 },
  bold: { 'Œ': 440, 'œ': 384, 'Š': 107, 'Ž': 51, 'š': -4, 'ž': -60, '€': -4 },
};
const FIX_RE = /[ŒœŠŽšž€]/g;

/** Largeur (mm) d'un texte dans la police courante, corrigée. */
function measure(pdf, text, style, size) {
  let w = pdf.getTextWidth(text);
  const fixes = WIDTH_FIX[style === 'bold' || style === 'bolditalic' ? 'bold' : 'normal'];
  const found = text.match(FIX_RE);
  if (found) found.forEach(ch => { w += (fixes[ch] || 0) / 1000 * size * PT; });
  return w;
}

// ------------------------------------------------------------
// Préparation des images (dimensions, conversion WebP → PNG)
// ------------------------------------------------------------

async function webpToPng(src) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Prépare toutes les images (logo, tampon, signatures) : format, dimensions
 * naturelles. `imageSize(src)` permet d'injecter un lecteur de dimensions
 * (tests, environnements particuliers) ; par défaut l'en-tête binaire est lu.
 */
async function prepareImages(docs, org, imageSize) {
  const srcs = new Set([org.logo, org.stamp]);
  docs.forEach(d => (d?.blocks || []).forEach(b => {
    if (b?.type === 'signatures') (b.slots || []).forEach(s => srcs.add(s?.image));
  }));
  const map = new Map();
  for (const src of srcs) {
    if (!isSafeImageSrc(src)) continue;
    let data = src;
    let format = imageFormatOf(src);
    try {
      if (format === 'WEBP') {
        const png = await webpToPng(src).catch(() => null);
        if (png) { data = png; format = 'PNG'; }
      }
      let size = null;
      if (typeof imageSize === 'function') size = await imageSize(data);
      if (!size) size = readImageSize(data);
      map.set(src, { data, format, size });
    } catch (_e) { /* image ignorée */ }
  }
  return map;
}

// ------------------------------------------------------------
// Moteur
// ------------------------------------------------------------

function createWriter(pdf, autoTable, doc, org, images) {
  const page = pageSizeOf(doc);
  const orientation = page.landscape ? 'landscape' : 'portrait';
  const contentW = page.width - 2 * MARGIN_X;
  const accent = accentPalette(org.accentColor);
  const W = {
    y: 0, dirty: false, bottom: page.height - 24,
  };

  // --- Polices -------------------------------------------------
  const setFont = (style = 'normal', size = 10.5, color = INK) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };
  const styleOf = (bold, italic) => (bold ? (italic ? 'bolditalic' : 'bold') : (italic ? 'italic' : 'normal'));
  const widthOf = (text, style, size) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    return measure(pdf, text, style, size);
  };
  const lineHeight = (size, factor = 1.45) => size * PT * factor;
  const baselineIn = (top, lh, size) => top + lh / 2 + size * PT * 0.34;

  // --- Pages ---------------------------------------------------
  function newPage() {
    pdf.addPage('a4', orientation);
    W.y = CONT_TOP;
    W.dirty = false;
  }
  /** Passe à la page suivante si `h` mm ne tiennent pas (jamais sur une page vierge). */
  function ensure(h) {
    if (W.y + h > W.bottom && W.dirty) { newPage(); return true; }
    return false;
  }
  const usable = () => W.bottom - CONT_TOP;

  // --- Texte riche ---------------------------------------------
  /**
   * Découpe un texte (`**gras**`, \n) en lignes de largeur maxWidth.
   * @returns {{ words: {pieces:{text,style,w}[], w:number}[], w:number, last:boolean }[]}
   */
  function layoutRich(text, { size, maxWidth, italic = false, boldAll = false }) {
    const safe = pdfSafeText(text);
    const items = [];
    let cur = null;
    const flush = () => { if (cur) { items.push(cur); cur = null; } };
    parseInline(safe).forEach(seg => {
      seg.text.split(/(\s)/).forEach(part => {
        if (!part) return;
        if (part === '\n') { flush(); items.push({ br: true }); return; }
        if (/\s/.test(part)) { flush(); return; }
        const style = styleOf(seg.bold || boldAll, italic);
        if (!cur) cur = { pieces: [] };
        cur.pieces.push({ text: part, style, w: widthOf(part, style, size) });
      });
    });
    flush();
    const space = widthOf(' ', styleOf(boldAll, italic), size);
    // Mots plus larges que la ligne : coupe caractère par caractère.
    const words = [];
    items.forEach(it => {
      if (it.br) { words.push(it); return; }
      it.w = it.pieces.reduce((a, p) => a + p.w, 0);
      if (it.w <= maxWidth) { words.push(it); return; }
      let chunk = { pieces: [], w: 0 };
      it.pieces.forEach(p => {
        for (const ch of p.text) {
          const cw = widthOf(ch, p.style, size);
          if (chunk.w + cw > maxWidth && chunk.w > 0) { words.push(chunk); chunk = { pieces: [], w: 0 }; }
          const last = chunk.pieces[chunk.pieces.length - 1];
          if (last && last.style === p.style) { last.text += ch; last.w += cw; } else chunk.pieces.push({ text: ch, style: p.style, w: cw });
          chunk.w += cw;
        }
      });
      if (chunk.pieces.length) words.push(chunk);
    });
    const lines = [];
    let line = { words: [], w: 0, last: false };
    const pushLine = (last) => { line.last = last; lines.push(line); line = { words: [], w: 0, last: false }; };
    words.forEach(wd => {
      if (wd.br) { pushLine(true); return; }
      const add = line.words.length ? space + wd.w : wd.w;
      if (line.words.length && line.w + add > maxWidth + 0.01) pushLine(false);
      line.w += line.words.length ? space + wd.w : wd.w;
      line.words.push(wd);
    });
    if (line.words.length || !lines.length) pushLine(true);
    return { lines, space, size };
  }

  function drawRichLine(layout, line, x, baseline, maxWidth, align, color) {
    const { space, size } = layout;
    const n = line.words.length;
    if (!n) return;
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.setFontSize(size);
    let cx = x;
    let gap = space;
    if (align === 'justify' && !line.last && n > 1) gap = (maxWidth - (line.w - space * (n - 1))) / (n - 1);
    else if (align === 'right') cx = x + maxWidth - line.w;
    else if (align === 'center') cx = x + (maxWidth - line.w) / 2;
    if (gap === space) {
      // Regroupe les mots de même style : texte extractible proprement.
      let run = '';
      let runStyle = null;
      let runX = cx;
      const flushRun = () => {
        if (run) { pdf.setFont('helvetica', runStyle); pdf.text(run, runX, baseline); }
      };
      line.words.forEach((wd, wi) => {
        wd.pieces.forEach((p, pi) => {
          const prefix = wi > 0 && pi === 0 ? ' ' : '';
          if (p.style !== runStyle) {
            flushRun();
            // L'espace de séparation est écrite dans le flux (et non simulée
            // par un décalage) : le texte extrait / copié garde ses espaces.
            runX = cx;
            run = prefix + p.text;
            runStyle = p.style;
          } else run += prefix + p.text;
          cx += (prefix ? space : 0) + p.w;
        });
      });
      flushRun();
      return;
    }
    line.words.forEach((wd, wi) => {
      let px = cx;
      const lastWord = wi === n - 1;
      wd.pieces.forEach((p, pi) => {
        // Espace finale explicite (invisible) : conserve la séparation des mots
        // dans le texte extrait d'une ligne justifiée.
        const tail = !lastWord && pi === wd.pieces.length - 1 ? ' ' : '';
        pdf.setFont('helvetica', p.style);
        pdf.text(p.text + tail, px, baseline);
        px += p.w;
      });
      cx += wd.w + gap;
    });
  }

  /**
   * Écoule des lignes de hauteur `lh` sur les pages (2 lignes minimum en bas
   * de page et en haut de la suivante). `drawChunk(from, to, top)` dessine.
   */
  function flowLines(count, lh, drawChunk, { padTop = 0, padBottom = 0 } = {}) {
    let i = 0;
    const minLines = Math.min(2, count);
    ensure(padTop + minLines * lh + (count <= 2 ? padBottom : 0));
    while (i < count) {
      const room = Math.floor((W.bottom - W.y - padTop - padBottom + 0.01) / lh);
      let take = Math.max(1, Math.min(room, count - i));
      if (room <= 0 && W.dirty) { newPage(); continue; }
      if (count - i - take === 1 && take >= 3) take -= 1; // évite une ligne veuve
      const top = W.y;
      drawChunk(i, i + take, top);
      W.y = top + padTop + take * lh + padBottom;
      W.dirty = true;
      i += take;
      if (i < count) newPage();
    }
  }

  function richBlock(text, { size = 10.5, x = MARGIN_X, width = contentW, align = 'left', color = INK, italic = false, boldAll = false, factor = 1.45 } = {}) {
    const layout = layoutRich(text, { size, maxWidth: width, italic, boldAll });
    const lh = lineHeight(size, factor);
    flowLines(layout.lines.length, lh, (from, to, top) => {
      for (let k = from; k < to; k++) drawRichLine(layout, layout.lines[k], x, baselineIn(top + (k - from) * lh, lh, size), width, align, color);
    });
  }

  // --- Images --------------------------------------------------
  function drawImage(src, x, y, maxW, maxH, { alignX = 'left', alignY = 'middle' } = {}) {
    const img = images.get(src);
    if (!img) return null;
    const box = fitBox(img.size, maxW, maxH);
    const dx = alignX === 'right' ? maxW - box.width : alignX === 'center' ? (maxW - box.width) / 2 : 0;
    const dy = alignY === 'bottom' ? maxH - box.height : alignY === 'top' ? 0 : (maxH - box.height) / 2;
    try {
      pdf.addImage(img.data, img.format, x + dx, y + dy, box.width, box.height, undefined, 'FAST');
      return { x: x + dx, y: y + dy, ...box };
    } catch (_e) {
      return null;
    }
  }

  // --- En-tête de première page ---------------------------------
  function letterhead() {
    const info = letterheadInfo(org);
    const top = 14;
    let textX = MARGIN_X;
    let logoBox = null;
    if (info.logo && images.has(info.logo)) {
      const box = fitBox(images.get(info.logo).size, 34, 20);
      logoBox = drawImage(info.logo, MARGIN_X, top, box.width, box.height);
      if (logoBox) textX = MARGIN_X + logoBox.width + 5;
    }
    // Coordonnées (colonne de droite)
    const contacts = info.contacts.map(pdfSafeText);
    setFont('normal', 8.5, MUTED);
    const contactW = contacts.reduce((m, c) => Math.max(m, measure(pdf, c, 'normal', 8.5)), 0);
    const textW = Math.max(40, page.width - MARGIN_X - textX - (contactW ? contactW + 8 : 0));
    // Bloc identité
    setFont('bold', 14);
    const nameLines = pdf.splitTextToSize(pdfSafeText(info.name), textW);
    setFont('normal', 9);
    const subLines = info.subtitle ? pdf.splitTextToSize(pdfSafeText(info.subtitle), textW) : [];
    const addrLines = info.address ? pdf.splitTextToSize(pdfSafeText(info.address), textW) : [];
    const nameLh = lineHeight(14, 1.2);
    const smallLh = lineHeight(9, 1.4);
    const textH = nameLines.length * nameLh + (subLines.length + addrLines.length) * smallLh + (subLines.length || addrLines.length ? 1 : 0);
    const contactLh = lineHeight(8.5, 1.5);
    const contactH = contacts.length * contactLh;
    const blockH = Math.max(logoBox ? logoBox.height : 0, textH, contactH);
    let ty = top + (blockH - textH) / 2;
    setFont('bold', 14, INK);
    nameLines.forEach(l => { pdf.text(l, textX, baselineIn(ty, nameLh, 14)); ty += nameLh; });
    if (subLines.length || addrLines.length) ty += 1;
    setFont('normal', 9, MUTED);
    [...subLines, ...addrLines].forEach(l => { pdf.text(l, textX, baselineIn(ty, smallLh, 9)); ty += smallLh; });
    setFont('normal', 8.5, MUTED);
    let cy = top + (blockH - contactH) / 2;
    contacts.forEach(c => { pdf.text(c, page.width - MARGIN_X, baselineIn(cy, contactLh, 8.5), { align: 'right' }); cy += contactLh; });
    const ruleY = top + blockH + 4;
    pdf.setDrawColor(...accent.rule);
    pdf.setLineWidth(0.6);
    pdf.line(MARGIN_X, ruleY, page.width - MARGIN_X, ruleY);
    W.y = ruleY + 9;
    W.dirty = false;
  }

  // --- Mesures pour « garder avec le suivant » -------------------
  function minHeadOf(b) {
    if (!b) return 0;
    switch (b.type) {
      case 'paragraph': return lineHeight(b.tone === 'small' ? 8.5 : 10.5) * 2;
      case 'table': return (b.caption ? 6 : 0) + 22;
      case 'signatures': return Math.min(signaturesLayout(b).total, usable());
      case 'orgChart': return Math.min(orgLayout(b).rows[0]?.h || 0, usable());
      case 'callout': return 16;
      case 'heading': return 12;
      case 'title': return 25;
      case 'list': case 'checklist': case 'keyValue': return 9;
      case 'blankLines': return 9;
      case 'placeDate': return 10;
      default: return 0;
    }
  }

  // --- Signatures -------------------------------------------------
  function signaturesLayout(b) {
    const slots = (b.slots || []).filter(Boolean);
    const perRow = 3;
    const cols = slots.length === 1 ? 2 : Math.min(perRow, slots.length);
    const gap = 8;
    const slotW = (contentW - gap * (cols - 1)) / cols;
    const rows = [];
    for (let i = 0; i < slots.length; i += perRow) {
      const row = slots.slice(i, i + perRow).map((s, k) => {
        setFont('bold', 9.5);
        const label = pdf.splitTextToSize(pdfSafeText(stripInline(s.label)), slotW);
        setFont('italic', 8.5);
        const mention = s.mention ? pdf.splitTextToSize(pdfSafeText(stripInline(s.mention)), slotW) : [];
        setFont('bold', 10);
        const name = s.name ? pdf.splitTextToSize(pdfSafeText(stripInline(s.name)), slotW) : [];
        setFont('normal', 9);
        const role = s.role ? pdf.splitTextToSize(pdfSafeText(stripInline(s.role)), slotW) : [];
        const headH = label.length * lineHeight(9.5, 1.3) + mention.length * lineHeight(8.5, 1.3);
        const tailH = 1.5 + 24 + 1.5 + 1.2 + Math.max(1, name.length) * lineHeight(10, 1.3) + role.length * lineHeight(9, 1.3);
        return { slot: s, index: i + k, label, mention, name, role, headH, tailH };
      });
      // Zones de signature alignées d'une colonne à l'autre.
      const headH = Math.max(...row.map(r => r.headH));
      rows.push({ items: row, headH, h: headH + Math.max(...row.map(r => r.tailH)) + 4 });
    }
    return { rows, cols, slotW, gap, total: rows.reduce((a, r) => a + r.h, 0) + 2, single: slots.length === 1 };
  }

  function drawSignatures(b) {
    const L = signaturesLayout(b);
    if (!L.rows.length) return;
    const stampAt = stampSlotIndex((b.slots || []).filter(Boolean), org);
    // Bloc de signatures : jamais coupé (sauf s'il dépasse une page entière).
    if (L.total <= usable()) ensure(L.total);
    W.y += 2;
    L.rows.forEach(row => {
      ensure(row.h);
      const top = W.y;
      row.items.forEach((it, k) => {
        const col = L.single ? 1 : k;
        const x = MARGIN_X + col * (L.slotW + L.gap);
        let y = top;
        setFont('bold', 9.5, INK);
        it.label.forEach(l => { const lh = lineHeight(9.5, 1.3); pdf.text(l, x, baselineIn(y, lh, 9.5)); y += lh; });
        setFont('italic', 8.5, MUTED);
        it.mention.forEach(l => { const lh = lineHeight(8.5, 1.3); pdf.text(l, x, baselineIn(y, lh, 8.5)); y += lh; });
        y = top + row.headH + 1.5;
        const sigMaxW = Math.min(52, L.slotW * 0.7);
        const sig = isSafeImageSrc(it.slot.image) ? drawImage(it.slot.image, x, y + 1, sigMaxW, 22) : null;
        if (it.index === stampAt && isSafeImageSrc(org.stamp)) {
          const sx = sig ? sig.x + sig.width + 3 : x;
          const sw = Math.max(10, Math.min(28, x + L.slotW - sx));
          drawImage(org.stamp, sx, y, sw, 24);
        }
        y += 24 + 1.5;
        pdf.setDrawColor(...LINE);
        pdf.setLineWidth(0.2);
        pdf.line(x, y, x + Math.min(L.slotW, 70), y);
        y += 1.2;
        setFont('bold', 10, INK);
        (it.name.length ? it.name : ['']).forEach(l => { const lh = lineHeight(10, 1.3); if (l) pdf.text(l, x, baselineIn(y, lh, 10)); y += lh; });
        setFont('normal', 9, MUTED);
        it.role.forEach(l => { const lh = lineHeight(9, 1.3); pdf.text(l, x, baselineIn(y, lh, 9)); y += lh; });
      });
      W.y = top + row.h;
      W.dirty = true;
    });
  }

  // --- Organigramme -------------------------------------------------
  function orgLayout(b) {
    const groups = (b.groups || []).filter(Boolean);
    const perRow = page.landscape ? 4 : 3;
    const gap = 3.5;
    const cardW = (contentW - gap * (perRow - 1)) / perRow;
    const inner = cardW - 5;
    const rows = [];
    for (let i = 0; i < groups.length; i += perRow) {
      const cards = groups.slice(i, i + perRow).map(g => {
        setFont('bold', 9.5);
        const title = pdf.splitTextToSize(pdfSafeText(stripInline(g.title)), inner);
        const people = (g.people || []).filter(Boolean).map(p => {
          setFont('bold', 9);
          const name = pdf.splitTextToSize(pdfSafeText(stripInline(p.name)), inner);
          setFont('normal', 8);
          const role = p.role ? pdf.splitTextToSize(pdfSafeText(stripInline(p.role)), inner) : [];
          return { name, role, h: name.length * lineHeight(9, 1.3) + role.length * lineHeight(8, 1.3) + 1.4 };
        });
        const titleH = title.length * lineHeight(9.5, 1.3) + 3.6;
        const h = 1 + titleH + 1.6 + people.reduce((a, p) => a + p.h, 0) + 1.6;
        return { g, title, people, titleH, h };
      });
      rows.push({ cards, h: Math.max(...cards.map(c => c.h)) });
    }
    return { rows, cardW, gap };
  }

  function drawOrgChart(b) {
    const L = orgLayout(b);
    L.rows.forEach(row => {
      ensure(row.h + 3.5);
      const top = W.y;
      row.cards.forEach((c, k) => {
        const x = MARGIN_X + k * (L.cardW + L.gap);
        const color = hexToRgb(safeHex(c.g.color, accent.hex));
        pdf.setDrawColor(...LINE);
        pdf.setLineWidth(0.2);
        pdf.rect(x, top, L.cardW, row.h, 'S');
        pdf.setFillColor(...ZEBRA);
        pdf.rect(x, top, L.cardW, 1 + c.titleH, 'F');
        pdf.setFillColor(...color);
        pdf.rect(x, top, L.cardW, 1, 'F');
        pdf.line(x, top + 1 + c.titleH, x + L.cardW, top + 1 + c.titleH);
        let y = top + 1 + 1.8;
        setFont('bold', 9.5, INK);
        c.title.forEach(l => { const lh = lineHeight(9.5, 1.3); pdf.text(l, x + 2.5, baselineIn(y, lh, 9.5)); y += lh; });
        y = top + 1 + c.titleH + 1.6;
        c.people.forEach(p => {
          setFont('bold', 9, INK);
          p.name.forEach(l => { const lh = lineHeight(9, 1.3); pdf.text(l, x + 2.5, baselineIn(y, lh, 9)); y += lh; });
          setFont('normal', 8, MUTED);
          p.role.forEach(l => { const lh = lineHeight(8, 1.3); pdf.text(l, x + 2.5, baselineIn(y, lh, 8)); y += lh; });
          y += 1.4;
        });
      });
      W.y = top + row.h + 3.5;
      W.dirty = true;
    });
  }

  // --- Tableaux (autoTable) ------------------------------------------
  function drawTable(b) {
    const cols = (b.columns || []).filter(Boolean);
    if (!cols.length) return;
    const dense = !!b.dense;
    const fontSize = dense ? 8 : 9;
    if (b.caption) {
      ensure(6 + 22);
      richBlock(b.caption, { size: 8.5, italic: true, color: MUTED, factor: 1.35 });
      W.y += 1.2;
    } else ensure(22);
    const specified = cols.map(c => (Number(c.width) > 0 ? Number(c.width) : 0));
    const sum = specified.reduce((a, v) => a + v, 0);
    const allSpecified = specified.every(v => v > 0);
    const scale = sum > 1 || allSpecified ? 1 / (sum || 1) : 1;
    const columnStyles = {};
    cols.forEach((c, i) => {
      const st = { halign: ['left', 'center', 'right'].includes(c.align) ? c.align : 'left' };
      if (specified[i] > 0) st.cellWidth = specified[i] * scale * contentW;
      columnStyles[i] = st;
    });
    const boldCells = [];
    const body = (b.rows || []).map((r, ri) => cols.map((c, ci) => {
      const raw = str(r?.[c.key]);
      if (isFullyBold(raw)) boldCells.push(`${ri}:${ci}`);
      return pdfSafeText(stripInline(raw));
    }));
    const firstBlank = body.length;
    const blanks = Math.max(0, Math.min(200, Number(b.blankRows) || 0));
    for (let i = 0; i < blanks; i++) body.push(cols.map(() => ''));
    const boldSet = new Set(boldCells);
    const pad = dense ? { top: 1.1, bottom: 1.1, left: 1.6, right: 1.6 } : { top: 1.9, bottom: 1.9, left: 2.2, right: 2.2 };
    autoTable(pdf, {
      startY: W.y,
      head: [cols.map(c => pdfSafeText(stripInline(c.label)))],
      body,
      theme: 'grid',
      tableWidth: contentW,
      margin: { top: CONT_TOP, bottom: page.height - W.bottom, left: MARGIN_X, right: MARGIN_X },
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica', fontSize, cellPadding: pad, textColor: INK, lineColor: LINE,
        lineWidth: 0.18, overflow: 'linebreak', valign: 'top',
      },
      headStyles: { fillColor: accent.rule, textColor: accent.onRule, fontStyle: 'bold', lineColor: accent.rule, valign: 'middle' },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === 'head') data.cell.styles.halign = columnStyles[data.column.index]?.halign || 'left';
        if (data.section !== 'body') return;
        if (boldSet.has(`${data.row.index}:${data.column.index}`)) data.cell.styles.fontStyle = 'bold';
        if (data.row.index >= firstBlank) { data.cell.styles.minCellHeight = 8; data.cell.styles.fillColor = [255, 255, 255]; }
      },
    });
    W.y = (pdf.lastAutoTable?.finalY || W.y) + 4.5;
    W.dirty = true;
  }

  // --- Blocs -------------------------------------------------------
  function drawBlock(b, next) {
    switch (b?.type) {
      case 'title': {
        const width = contentW * 0.86;
        const tl = layoutRich(b.text, { size: 17, maxWidth: width, boldAll: true });
        const sl = b.subtitle ? layoutRich(b.subtitle, { size: 10.5, maxWidth: width }) : null;
        const tlh = lineHeight(17, 1.25);
        const slh = lineHeight(10.5, 1.4);
        const h = 2 + tl.lines.length * tlh + (sl ? 1.5 + sl.lines.length * slh : 0) + 3.5 + 8;
        ensure(h + minHeadOf(next));
        W.y += W.dirty ? 2 : 0;
        const x = MARGIN_X + (contentW - width) / 2;
        tl.lines.forEach(l => { drawRichLine(tl, l, x, baselineIn(W.y, tlh, 17), width, 'center', INK); W.y += tlh; });
        if (sl) { W.y += 1.5; sl.lines.forEach(l => { drawRichLine(sl, l, x, baselineIn(W.y, slh, 10.5), width, 'center', MUTED); W.y += slh; }); }
        W.y += 3.5;
        pdf.setDrawColor(...accent.rule);
        pdf.setLineWidth(0.6);
        pdf.line(page.width / 2 - 9, W.y, page.width / 2 + 9, W.y);
        W.y += 8;
        W.dirty = true;
        return;
      }
      case 'heading': {
        const level2 = Number(b.level) === 2;
        const size = level2 ? 10.5 : 11.5;
        const layout = layoutRich(b.text, { size, maxWidth: contentW, boldAll: true });
        const lh = lineHeight(size, 1.3);
        const before = level2 ? 4.5 : 6;
        const after = level2 ? 1.8 : 3;
        const h = layout.lines.length * lh + (level2 ? 0 : 1.2) + after;
        ensure(before + h + minHeadOf(next));
        if (W.dirty) W.y += before;
        layout.lines.forEach(l => { drawRichLine(layout, l, MARGIN_X, baselineIn(W.y, lh, size), contentW, 'left', level2 ? INK : accent.text); W.y += lh; });
        if (!level2) {
          W.y += 1.2;
          pdf.setDrawColor(...LINE);
          pdf.setLineWidth(0.2);
          pdf.line(MARGIN_X, W.y, page.width - MARGIN_X, W.y);
        }
        W.y += after;
        W.dirty = true;
        return;
      }
      case 'paragraph': {
        const small = b.tone === 'small';
        const align = ['left', 'justify', 'center', 'right'].includes(b.align) ? b.align : 'left';
        richBlock(b.text, {
          size: small ? 8.5 : 10.5, align, color: b.tone === 'muted' || small ? MUTED : INK, factor: small ? 1.4 : 1.45,
        });
        W.y += small ? 2.5 : 3;
        return;
      }
      case 'list': {
        const items = (b.items || []).filter(i => str(i) !== '');
        items.forEach((it, idx) => {
          const size = 10.5;
          const indent = 7;
          const layout = layoutRich(it, { size, maxWidth: contentW - indent - 2 });
          const lh = lineHeight(size);
          flowLines(layout.lines.length, lh, (from, to, top) => {
            if (from === 0) {
              setFont('normal', size, INK);
              const bl = baselineIn(top, lh, size);
              if (b.ordered) pdf.text(`${idx + 1}.`, MARGIN_X + 5.5, bl, { align: 'right' });
              else { pdf.setFillColor(...accent.rule); pdf.circle(MARGIN_X + 3.2, bl - size * PT * 0.3, 0.6, 'F'); }
            }
            for (let k = from; k < to; k++) drawRichLine(layout, layout.lines[k], MARGIN_X + indent + 2, baselineIn(top + (k - from) * lh, lh, size), contentW - indent - 2, 'left', INK);
          });
          W.y += 1.2;
        });
        W.y += 2;
        return;
      }
      case 'keyValue': {
        const rows = (b.rows || []).filter(Array.isArray);
        const size = 10;
        const lh = lineHeight(size, 1.4);
        const labelW = contentW * 0.36 - 4;
        const valueX = MARGIN_X + contentW * 0.36;
        const valueW = contentW * 0.64;
        rows.forEach(([k, v]) => {
          const kl = layoutRich(k, { size, maxWidth: labelW });
          const vl = layoutRich(v, { size, maxWidth: valueW, boldAll: true });
          const n = Math.max(kl.lines.length, vl.lines.length);
          const h = n * lh + 3.2;
          ensure(h);
          const top = W.y + 1.6;
          kl.lines.forEach((l, i) => drawRichLine(kl, l, MARGIN_X, baselineIn(top + i * lh, lh, size), labelW, 'left', MUTED));
          vl.lines.forEach((l, i) => drawRichLine(vl, l, valueX, baselineIn(top + i * lh, lh, size), valueW, 'left', INK));
          W.y += h;
          pdf.setDrawColor(...LINE);
          pdf.setLineWidth(0.2);
          pdf.line(MARGIN_X, W.y, page.width - MARGIN_X, W.y);
          W.dirty = true;
        });
        W.y += 4;
        return;
      }
      case 'table':
        drawTable(b);
        return;
      case 'signatures':
        drawSignatures(b);
        return;
      case 'placeDate': {
        const city = str(b.city).trim();
        const date = str(b.date).trim();
        const text = city ? `Fait à ${city}${date ? `, le ${date}` : ''}` : `Fait le ${date}`;
        const lh = lineHeight(10.5);
        ensure(6 + lh + 4 + minHeadOf(next));
        if (W.dirty) W.y += 6;
        setFont('normal', 10.5, INK);
        pdf.text(pdfSafeText(text), page.width - MARGIN_X, baselineIn(W.y, lh, 10.5), { align: 'right' });
        W.y += lh + 4;
        W.dirty = true;
        return;
      }
      case 'callout': {
        const tone = ['info', 'warning', 'legal'].includes(b.tone) ? b.tone : 'info';
        const colors = tone === 'warning' ? { bar: WARN.bar, bg: WARN.bg, ink: INK }
          : tone === 'legal' ? LEGAL : { bar: accent.rule, bg: accent.soft, ink: INK };
        const size = tone === 'legal' ? 8.8 : 9.5;
        const padX = 4;
        const padY = 3;
        const width = contentW - padX * 2 - 1;
        const layout = layoutRich(b.text, { size, maxWidth: width });
        const lh = lineHeight(size, 1.45);
        const total = layout.lines.length * lh + padY * 2;
        if (total <= usable()) ensure(total);
        flowLines(layout.lines.length, lh, (from, to, top) => {
          const h = (to - from) * lh + padY * 2;
          pdf.setFillColor(...colors.bg);
          pdf.rect(MARGIN_X, top, contentW, h, 'F');
          pdf.setFillColor(...colors.bar);
          pdf.rect(MARGIN_X, top, 1, h, 'F');
          for (let k = from; k < to; k++) drawRichLine(layout, layout.lines[k], MARGIN_X + 1 + padX, baselineIn(top + padY + (k - from) * lh, lh, size), width, 'left', colors.ink);
        }, { padTop: padY, padBottom: padY });
        W.y += 4;
        return;
      }
      case 'checklist': {
        const items = (b.items || []).filter(Boolean);
        const size = 10.5;
        const lh = lineHeight(size);
        items.forEach(it => {
          const layout = layoutRich(it.label, { size, maxWidth: contentW - 7 });
          flowLines(layout.lines.length, lh, (from, to, top) => {
            if (from === 0) {
              const bx = MARGIN_X;
              const by = top + (lh - 3.6) / 2;
              pdf.setLineWidth(0.3);
              if (it.checked) {
                pdf.setFillColor(...accent.rule);
                pdf.setDrawColor(...accent.rule);
                pdf.roundedRect(bx, by, 3.6, 3.6, 0.5, 0.5, 'FD');
                pdf.setDrawColor(...accent.onRule);
                pdf.setLineWidth(0.45);
                pdf.lines([[0.9, 0.9], [1.6, -1.9]], bx + 0.8, by + 1.9);
              } else {
                pdf.setDrawColor(74, 78, 86);
                pdf.roundedRect(bx, by, 3.6, 3.6, 0.5, 0.5, 'S');
              }
            }
            for (let k = from; k < to; k++) drawRichLine(layout, layout.lines[k], MARGIN_X + 7, baselineIn(top + (k - from) * lh, lh, size), contentW - 7, 'left', INK);
          });
          W.y += 1.6;
        });
        W.y += 2;
        return;
      }
      case 'blankLines': {
        const size = 10.5;
        (b.lines || []).map(str).forEach(line => {
          const label = pdfSafeText(stripInline(line.replace(/[\s_.…]{3,}$/u, '').trim()));
          ensure(9);
          const base = W.y + 9 - 2;
          let x = MARGIN_X;
          if (label) {
            setFont('normal', size, INK);
            pdf.text(label, x, base);
            x += measure(pdf, label, 'normal', size) + 2;
          }
          pdf.setDrawColor(107, 111, 119);
          pdf.setLineWidth(0.25);
          pdf.setLineDashPattern([0.5, 0.8], 0);
          pdf.line(x, base + 0.8, page.width - MARGIN_X, base + 0.8);
          pdf.setLineDashPattern([], 0);
          W.y += 9;
          W.dirty = true;
        });
        W.y += 3;
        return;
      }
      case 'orgChart':
        drawOrgChart(b);
        return;
      case 'spacer':
        W.y += b.size === 'lg' ? 12 : b.size === 'sm' ? 3 : 6;
        return;
      case 'pageBreak':
        if (W.dirty) newPage();
        return;
      default:
    }
  }

  // --- Pied de page et en-tête de continuation (seconde passe) --------
  function footerLayout() {
    setFont('normal', 7);
    const id = pdf.splitTextToSize(pdfSafeText(footerIdentity(org)), contentW);
    setFont('italic', 7);
    const note = org.footerNote ? pdf.splitTextToSize(pdfSafeText(org.footerNote), contentW) : [];
    const step = 3.1;
    const metaY = page.height - 9;
    const firstId = metaY - 3.6 - (id.length - 1) * step;
    const firstNote = firstId - note.length * step;
    const ruleY = firstNote - 3.6;
    return { id, note, step, metaY, firstId, firstNote, ruleY };
  }
  const FOOT = footerLayout();
  W.bottom = Math.min(page.height - 24, FOOT.ruleY - 4);

  function drawFooter(n, total, issue) {
    const F = FOOT;
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_X, F.ruleY, page.width - MARGIN_X, F.ruleY);
    setFont('italic', 7, FAINT);
    F.note.forEach((l, i) => pdf.text(l, page.width / 2, F.firstNote + i * F.step, { align: 'center' }));
    setFont('normal', 7, FAINT);
    F.id.forEach((l, i) => pdf.text(l, page.width / 2, F.firstId + i * F.step, { align: 'center' }));
    pdf.text(pdfSafeText(referenceLine(issue)), MARGIN_X, F.metaY);
    const pageLabel = `Page ${n} / ${total}`;
    pdf.text(pageLabel, page.width - MARGIN_X, F.metaY, { align: 'right' });
    if (doc?.meta?.confidential) {
      // Juste à gauche de la pagination : ne chevauche jamais la référence.
      const label = 'CONFIDENTIEL';
      setFont('bold', 7, CONFIDENTIAL_RED);
      const x = page.width - MARGIN_X - measure(pdf, pageLabel, 'normal', 7) - 6;
      pdf.text(label, x, F.metaY, { align: 'right' });
    }
  }

  function drawContinuationHeader() {
    const name = pdfSafeText(str(org.shortName).trim() || str(org.name).trim() || 'Association');
    setFont('bold', 8, accent.text);
    pdf.text(name, MARGIN_X, 12.5);
    const nameW = measure(pdf, name, 'bold', 8);
    setFont('normal', 8, FAINT);
    const title = pdf.splitTextToSize(pdfSafeText(str(doc?.meta?.title)), Math.max(30, contentW - nameW - 10))[0] || '';
    pdf.text(title, page.width - MARGIN_X, 12.5, { align: 'right' });
    pdf.setDrawColor(...LINE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN_X, 14.8, page.width - MARGIN_X, 14.8);
  }

  function render() {
    letterhead();
    const blocks = (doc?.blocks || []).filter(Boolean);
    blocks.forEach((b, i) => {
      // Bloc final « Je soussigné(e)… » + « Fait à… » + signatures : gardés
      // ensemble sur la même page (sauf si l'ensemble dépasse une page).
      if (b.type === 'paragraph' && blocks[i + 1]?.type === 'placeDate') {
        const sig = blocks[i + 2]?.type === 'signatures' ? signaturesLayout(blocks[i + 2]).total + 2 : 0;
        const group = paragraphHeight(b) + placeDateHeight() + sig;
        if (group <= usable()) ensure(group);
      }
      drawBlock(b, blocks[i + 1]);
    });
  }

  /** Hauteur totale d'un paragraphe (espacement après compris). */
  function paragraphHeight(b) {
    const small = b.tone === 'small';
    const size = small ? 8.5 : 10.5;
    const { lines } = layoutRich(b.text, { size, maxWidth: contentW });
    return lines.length * lineHeight(size, small ? 1.4 : 1.45) + (small ? 2.5 : 3);
  }
  const placeDateHeight = () => 6 + lineHeight(10.5) + 4;

  return { render, drawFooter, drawContinuationHeader, orientation };
}

/**
 * Rend un ou plusieurs documents en un PDF vectoriel.
 * @param {object[]} docs
 * @param {object} opts {
 *   organization, issues: (issue|null)[] alignés sur docs,
 *   compress = true, imageSize?: (dataUrl) => {width,height}|null|Promise
 * }
 * @returns {Promise<import('jspdf').jsPDF>}
 */
export async function renderDocumentsToPdf(docs, { organization = {}, issues = [], compress = true, imageSize = null, draft = false } = {}) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  if (!list.length) throw new Error('Aucun document à exporter');
  const [pdfMod, tableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const JsPDF = pdfMod.jsPDF || pdfMod.default;
  const autoTable = tableMod.autoTable || tableMod.default;
  const org = organization || {};
  const images = await prepareImages(list, org, imageSize);

  const firstLandscape = list[0]?.meta?.orientation === 'landscape';
  const pdf = new JsPDF({ unit: 'mm', format: 'a4', orientation: firstLandscape ? 'landscape' : 'portrait', compress });
  const title = list.length === 1 ? str(list[0]?.meta?.title) : `${list.length} documents`;
  pdf.setProperties({
    title: pdfSafeText(title),
    subject: pdfSafeText(title),
    author: pdfSafeText(str(org.name)),
    creator: 'BDE Manager',
  });
  if (typeof pdf.setLanguage === 'function') pdf.setLanguage('fr');

  // autoTable ajoute des pages via pdf.addPage() sans argument : on impose
  // l'orientation du document en cours.
  const baseAddPage = pdf.addPage.bind(pdf);
  let currentOrientation = firstLandscape ? 'landscape' : 'portrait';
  pdf.addPage = (format, orient) => baseAddPage(format || 'a4', orient || currentOrientation);

  const ranges = [];
  list.forEach((doc, i) => {
    const writer = createWriter(pdf, autoTable, doc, org, images);
    currentOrientation = writer.orientation;
    if (i > 0) pdf.addPage('a4', writer.orientation);
    const start = pdf.getNumberOfPages();
    writer.render();
    ranges.push({ writer, start, end: pdf.getNumberOfPages(), issue: issues[i] || null });
  });

  ranges.forEach(({ writer, start, end, issue }) => {
    const total = end - start + 1;
    for (let p = start; p <= end; p++) {
      pdf.setPage(p);
      if (p > start) writer.drawContinuationHeader();
      writer.drawFooter(p - start + 1, total, issue);
      if (draft) drawDraftWatermark(pdf);
    }
  });
  pdf.addPage = baseAddPage;
  return pdf;
}

/**
 * Filigrane diagonal « BROUILLON » sur la page courante : un export non émis
 * ne doit jamais pouvoir passer pour un document officiel.
 */
function drawDraftWatermark(pdf) {
  const w = pdf.internal.pageSize.getWidth();
  const h = pdf.internal.pageSize.getHeight();
  const canOpacity = typeof pdf.GState === 'function' && typeof pdf.setGState === 'function';
  if (canOpacity) { pdf.saveGraphicsState(); pdf.setGState(new pdf.GState({ opacity: 0.14 })); }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(Math.round(Math.min(w, h) * 0.42));
  pdf.setTextColor(200, 30, 30);
  pdf.text('BROUILLON', w / 2, h / 2, { angle: 35, align: 'center', baseline: 'middle' });
  if (canOpacity) pdf.restoreGraphicsState();
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
}

/** Construit puis télécharge le PDF. @returns {Promise<string>} nom du fichier */
export async function downloadPdf(docs, opts = {}, fileName) {
  const pdf = await renderDocumentsToPdf(docs, opts);
  const list = (Array.isArray(docs) ? docs : [docs]).filter(Boolean);
  const base = fileName
    ? safeFileName(String(fileName).replace(/\.pdf$/i, ''))
    : (list.length === 1 ? safeFileName(list[0]?.meta?.fileName || list[0]?.meta?.title) : `Documents_${list.length}`);
  const name = `${base}.pdf`;
  pdf.save(name);
  return name;
}
