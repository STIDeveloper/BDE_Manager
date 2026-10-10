// ============================================================
// STUDIO DOCUMENTS — RENDU : utilitaires partagés (purs, sans DOM)
// ============================================================
// Utilisés par les trois moteurs : aperçu React, HTML (impression / Word)
// et PDF vectoriel. Aucun import de React ni de CSS : testable sous Node.
// ============================================================

/** Dimensions d'une feuille A4 en millimètres (portrait). */
export const A4_MM = Object.freeze({ width: 210, height: 297 });

export const DEFAULT_ACCENT = '#4f81f5';

/** Texte affiché en pied de page tant que le document n'est pas émis. */
export const PENDING_REFERENCE = 'Référence attribuée à l\'émission';

/** Taille de page (mm) selon l'orientation du document. */
export function pageSizeOf(doc) {
  return doc?.meta?.orientation === 'landscape'
    ? { width: A4_MM.height, height: A4_MM.width, landscape: true }
    : { width: A4_MM.width, height: A4_MM.height, landscape: false };
}

// ------------------------------------------------------------
// Texte
// ------------------------------------------------------------

/** Convertit n'importe quelle valeur en chaîne affichable. */
export function str(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

/** Échappe une chaîne pour l'insérer dans du HTML (texte ou attribut). */
export function escapeHtml(value) {
  return str(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Découpe le balisage inline `**gras**` en segments.
 * Un `**` sans partenaire est conservé tel quel.
 * @returns {{ text: string, bold: boolean }[]}
 */
export function parseInline(text) {
  const source = str(text);
  const segments = [];
  const re = /\*\*([^*]+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(source)) !== null) {
    if (m.index > last) segments.push({ text: source.slice(last, m.index), bold: false });
    segments.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), bold: false });
  return segments.length ? segments : [{ text: '', bold: false }];
}

/** Texte sans les marqueurs `**`. */
export function stripInline(text) {
  return parseInline(text).map(s => s.text).join('');
}

/** Vrai si tout le texte est en gras (`**…**`). */
export function isFullyBold(text) {
  const segs = parseInline(text).filter(s => s.text.trim() !== '');
  return segs.length > 0 && segs.every(s => s.bold);
}

// ------------------------------------------------------------
// Assainissement pour les polices PDF standard (WinAnsi / CP1252)
// ------------------------------------------------------------

// Caractères hors Latin-1 présents dans WinAnsiEncoding (0x80–0x9F).
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

const PDF_REPLACEMENTS = [
  [/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' '],   // espaces insécables / fines
  [/[\u200B-\u200D\u2060\uFEFF]|\uFE0E|\uFE0F/g, ''],     // largeur nulle, sélecteurs de variante
  [/≥/g, '>='], [/≤/g, '<='], [/≠/g, '!='],
  [/→|⟶|⇒/g, '->'], [/←|⟵|⇐/g, '<-'], [/↔/g, '<->'],
  [/[✓✔☑✅]/g, 'x'], [/[✗✘❌]/g, 'x'],
  [/[−‐‑‒]/g, '-'], [/―/g, '—'],
  [/[′ʼ]/g, '’'], [/″/g, '"'],
  [/[•●▪◦⁃]/g, '•'],
  [/…/g, '…'],
  [/×/g, '×'],
  [/\r\n?/g, '\n'],
  [/\t/g, ' '],
];

const TRANSLIT = {
  Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', ı: 'i', Ħ: 'H', ħ: 'h', Ŧ: 'T', ŧ: 't',
  ŋ: 'ng', Ŋ: 'NG', ĸ: 'k', ſ: 's', ẞ: 'SS', '№': 'No',
};

function isWinAnsi(ch) {
  const c = ch.codePointAt(0);
  if (c === 10) return true;
  if (c >= 0x20 && c <= 0x7E) return true;
  if (c >= 0xA0 && c <= 0xFF) return true;
  return WINANSI_EXTRA.has(ch);
}

/**
 * Rend une chaîne compatible avec les polices standard de jsPDF :
 * espaces spéciales → espace, ≥ → >=, → → ->, ✓ → x, lettres accentuées
 * hors Latin-1 translittérées (ă → a), emoji et symboles supprimés.
 */
export function pdfSafeText(value) {
  let s = str(value).normalize('NFC');
  for (const [re, rep] of PDF_REPLACEMENTS) s = s.replace(re, rep);
  let out = '';
  for (const ch of s) {
    if (isWinAnsi(ch)) { out += ch; continue; }
    if (TRANSLIT[ch] && [...TRANSLIT[ch]].every(isWinAnsi)) { out += TRANSLIT[ch]; continue; }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036F]/g, '');
    if (base && base !== ch && [...base].every(isWinAnsi)) { out += base; continue; }
    // Emoji, pictogrammes, écritures non latines : supprimés.
  }
  // Espaces doublées par la suppression d'un emoji (« Bravo 🎉 ! »).
  // et espaces de bord (« 🎉 Bureau » → « Bureau »).
  return out.replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').trim();
}

// ------------------------------------------------------------
// Images (dataURL uniquement)
// ------------------------------------------------------------

const SAFE_IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/;

/** N'accepte que les images embarquées PNG / JPEG / WebP en base64. */
export function isSafeImageSrc(src) {
  return typeof src === 'string' && src.length < 8_000_000 && SAFE_IMAGE_RE.test(src);
}

/** Format jsPDF ('PNG' | 'JPEG' | 'WEBP') d'une dataURL sûre, sinon null. */
export function imageFormatOf(src) {
  if (!isSafeImageSrc(src)) return null;
  const m = /^data:image\/(png|jpeg|jpg|webp);/.exec(src);
  if (!m) return null;
  return m[1] === 'png' ? 'PNG' : m[1] === 'webp' ? 'WEBP' : 'JPEG';
}

function base64Bytes(b64, maxBytes) {
  const clean = b64.replace(/\s+/g, '');
  const chars = maxBytes ? clean.slice(0, Math.ceil(maxBytes / 3) * 4) : clean;
  if (typeof atob !== 'function') return null;
  let bin;
  try { bin = atob(chars); } catch (_e) { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Lit les dimensions naturelles (px) d'une image PNG / JPEG / WebP en
 * analysant l'en-tête binaire de la dataURL — synchrone, fonctionne sous
 * Node comme dans le navigateur. Renvoie null si illisible.
 * @returns {{ width: number, height: number }|null}
 */
export function readImageSize(src) {
  const format = imageFormatOf(src);
  if (!format) return null;
  const b64 = src.slice(src.indexOf(',') + 1);
  try {
    if (format === 'PNG') {
      const b = base64Bytes(b64, 33);
      if (!b || b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
      const width = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
      const height = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
      return width && height ? { width, height } : null;
    }
    if (format === 'WEBP') {
      const b = base64Bytes(b64, 40);
      if (!b || b.length < 30) return null;
      const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tag === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (tag === 'VP8 ') return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
      if (tag === 'VP8L') {
        const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    // JPEG : parcours des segments jusqu'au marqueur SOFn.
    const b = base64Bytes(b64);
    if (!b || b[0] !== 0xFF || b[1] !== 0xD8) return null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const height = (b[i + 5] << 8) | b[i + 6];
        const width = (b[i + 7] << 8) | b[i + 8];
        return width && height ? { width, height } : null;
      }
      i += 2 + len;
    }
  } catch (_e) { /* en-tête illisible */ }
  return null;
}

/** Ajuste (w, h) dans une boîte (maxW, maxH) en conservant le ratio. */
export function fitBox(size, maxW, maxH) {
  if (!size || !size.width || !size.height) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / size.width, maxH / size.height);
  return { width: size.width * ratio, height: size.height * ratio };
}

// ------------------------------------------------------------
// Couleurs
// ------------------------------------------------------------

/** '#4f81f5' → [79, 129, 245] (repli sur la couleur par défaut). */
export function hexToRgb(hex, fallback = DEFAULT_ACCENT) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(hex).trim());
  if (!m) return fallback ? hexToRgb(fallback, null) : [79, 129, 245];
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const rgbToHex = (rgb) => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Luminance relative WCAG (0 noir … 1 blanc). */
export function luminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mélange une couleur avec du blanc (t = 0 → couleur, 1 → blanc). */
export const tint = (rgb, t) => rgb.map(v => v + (255 - v) * t);
/** Mélange une couleur avec du noir. */
export const shade = (rgb, t) => rgb.map(v => v * (1 - t));

/**
 * Palette dérivée de la couleur d'accent de l'association :
 * - `rule`  : filets et aplats (couleur brute) ;
 * - `text`  : titres (assombrie si trop claire pour être lue sur du blanc) ;
 * - `onRule`: texte posé sur un aplat (blanc ou encre) ;
 * - `soft`  : fond très clair (encadrés).
 */
export function accentPalette(hex) {
  const rule = hexToRgb(hex);
  let text = rule;
  for (let i = 0; i < 6 && luminance(text) > 0.28; i++) text = shade(text, 0.18);
  const onRule = luminance(rule) > 0.45 ? [28, 28, 32] : [255, 255, 255];
  return {
    rule, text: text.map(Math.round), onRule, soft: tint(rule, 0.92).map(Math.round),
    hex: rgbToHex(rule), textHex: rgbToHex(text), onRuleHex: rgbToHex(onRule), softHex: rgbToHex(tint(rule, 0.92)),
  };
}

/** Couleur hex sûre pour CSS (sinon repli). */
export function safeHex(hex, fallback = DEFAULT_ACCENT) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(str(hex).trim()) ? str(hex).trim() : fallback;
}

// ------------------------------------------------------------
// Identité de l'association
// ------------------------------------------------------------

export function addressLine(org = {}) {
  return [org.address, [org.postalCode, org.city].filter(Boolean).join(' ')].map(str).map(s => s.trim()).filter(Boolean).join(', ');
}

/** Lignes de l'en-tête (papier à lettres). */
export function letterheadInfo(org = {}) {
  const name = str(org.name).trim() || 'Association';
  const shortName = str(org.shortName).trim();
  const subtitle = [str(org.legalForm).trim(), str(org.school).trim()].filter(Boolean).join(' — ');
  const contacts = [str(org.email).trim(), str(org.phone).trim(), str(org.website).trim()].filter(Boolean);
  return {
    name: shortName && shortName !== name && !name.includes(shortName) ? `${name} (${shortName})` : name,
    subtitle,
    address: addressLine(org),
    contacts,
    logo: isSafeImageSrc(org.logo) ? org.logo : null,
  };
}

/** Ligne d'identité légale du pied de page. */
export function footerIdentity(org = {}) {
  return [
    str(org.name).trim() || 'Association',
    str(org.legalForm).trim(),
    org.rna ? `RNA ${str(org.rna).trim()}` : '',
    org.siren ? `SIREN ${str(org.siren).trim()}` : '',
    addressLine(org),
  ].filter(Boolean).join(' · ');
}

function formatIssuedAt(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** « Réf. X · Empreinte Y · Émis le JJ/MM/AAAA » ou mention d'attente. */
export function referenceLine(issue) {
  if (!issue || !issue.ref) return PENDING_REFERENCE;
  const parts = [`Réf. ${str(issue.ref)}`];
  if (issue.fingerprint) parts.push(`Empreinte ${str(issue.fingerprint)}`);
  const date = formatIssuedAt(issue.issuedAt);
  if (date) parts.push(`Émis le ${date}`);
  return parts.join(' · ');
}

/** Image de tampon pour un bloc signatures : index du créneau qui le porte (ou -1). */
export function stampSlotIndex(slots, org = {}) {
  if (!isSafeImageSrc(org.stamp) || !Array.isArray(slots)) return -1;
  const explicit = slots.findIndex(s => s && s.stamp === true);
  if (explicit >= 0) return explicit;
  if (slots.some(s => s && s.stamp === false)) return -1;
  return slots.findIndex(s => s && isSafeImageSrc(s.image));
}

// ------------------------------------------------------------
// Estimation du nombre de pages (affichage indicatif dans l'interface)
// ------------------------------------------------------------

const CHARS_PER_LINE_PORTRAIT = 98;

/**
 * Estimation grossière (sans moteur PDF) du nombre de pages A4.
 * Suffisante pour afficher « ≈ 3 pages » dans l'interface.
 */
export function estimatePageCount(doc) {
  if (!doc || !Array.isArray(doc.blocks)) return 1;
  const size = pageSizeOf(doc);
  const cpl = CHARS_PER_LINE_PORTRAIT * (size.width - 36) / (A4_MM.width - 36);
  const usable = size.height - 50;
  const lines = (t, k = 1) => Math.max(1, Math.ceil(stripInline(t).length / (cpl * k)));
  let pages = 1;
  let y = 42; // en-tête
  for (const b of doc.blocks) {
    let h;
    switch (b?.type) {
      case 'title': h = 18 + (b.subtitle ? 6 : 0); break;
      case 'heading': h = 10; break;
      case 'paragraph': h = lines(b.text, b.tone === 'small' ? 1.25 : 1) * (b.tone === 'small' ? 4.2 : 5.3) + 3.5; break;
      case 'list': h = (b.items || []).reduce((a, t) => a + lines(t, 0.93) * 5.3 + 1.2, 2); break;
      case 'keyValue': h = (b.rows || []).reduce((a, r) => a + lines(r[1], 0.62) * 5 + 2.4, 3); break;
      case 'table': h = 8 + ((b.rows || []).length + (b.blankRows || 0)) * (b.dense ? 5.6 : 7) + (b.caption ? 6 : 0); break;
      case 'signatures': h = Math.ceil((b.slots || []).length / 3) * 48; break;
      case 'placeDate': h = 9; break;
      case 'callout': h = lines(b.text, 0.9) * 4.9 + 9; break;
      case 'checklist': h = (b.items || []).length * 6.4 + 2; break;
      case 'blankLines': h = (b.lines || []).length * 9 + 2; break;
      case 'orgChart': h = Math.ceil((b.groups || []).length / 3) * 40; break;
      case 'spacer': h = b.size === 'lg' ? 12 : b.size === 'sm' ? 3 : 6; break;
      case 'pageBreak': pages++; y = 22; continue;
      default: h = 0;
    }
    y += h;
    while (y > usable) { pages++; y = 22 + (y - usable); }
  }
  return pages;
}
