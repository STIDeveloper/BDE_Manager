// ============================================================
// CSV — lecture / écriture (relevés bancaires, HelloAsso, exports)
// ============================================================
// Fonctions pures, partagées par la trésorerie et les adhésions.
// Lecture : séparateur détecté (; , tabulation), guillemets RFC 4180,
// BOM ignoré. Écriture : BOM UTF-8 + « ; » (ouverture directe dans Excel FR).

/** Détecte le séparateur le plus probable sur les premières lignes. */
export function detectDelimiter(text) {
  const sample = String(text || '').split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [';', ',', '\t'].map(d => ({ d, n: countOutsideQuotes(sample, d) }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ';';
}

function countOutsideQuotes(text, ch) {
  let n = 0; let q = false;
  for (const c of text) {
    if (c === '"') q = !q;
    else if (c === ch && !q) n += 1;
  }
  return n;
}

/** Texte CSV → tableau de lignes (tableaux de cellules). Lignes vides ignorées. */
export function parseCsv(text, delimiter) {
  const src = String(text || '').replace(/^\ufeff/, '');
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(s => s.trim())).filter(r => r.some(Boolean));
}

/**
 * Tableau → { headers, rows } en repérant la ligne d'en-tête (première ligne
 * ayant au moins 2 cellules non vides et non numériques — certains relevés
 * commencent par quelques lignes d'informations sur le compte).
 */
export function tableFromCsv(text) {
  const all = parseCsv(text);
  const width = Math.max(0, ...all.map(r => r.length));
  let headerIndex = all.findIndex(r => r.filter(c => c && !/^[-+\d\s.,€/]+$/.test(c)).length >= Math.min(2, width));
  if (headerIndex < 0) headerIndex = 0;
  const headers = (all[headerIndex] || []).map((h, i) => h || `Colonne ${i + 1}`);
  const rows = all.slice(headerIndex + 1).filter(r => r.length >= Math.min(2, headers.length));
  return { headers, rows };
}

const needsQuote = (s) => /[";\n\r]/.test(s);

/** Lignes → texte CSV (« ; », BOM UTF-8). */
export function toCsv(rows) {
  const body = rows.map(r => r.map(v => {
    const s = v === undefined || v === null ? '' : String(v);
    return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\r\n');
  return `\ufeff${body}`;
}

/** Télécharge un CSV (mention « usage interne » en première ligne). */
export function downloadCsv(rows, fileName, { internal = true } = {}) {
  const all = internal ? [['Usage interne — document contenant des données de l\'association, ne pas diffuser'], ...rows] : rows;
  const blob = new Blob([toCsv(all)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** « 1 234,56 », « -12.5 », « 12,00 € », « (45,00) » → nombre (NaN si illisible). */
export function parseMoney(value) {
  if (typeof value === 'number') return value;
  let s = String(value ?? '').trim();
  if (!s) return NaN;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[\s\u00a0\u202f€]|EUR/gi, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }
  // « 1.234,56 » (point milliers) ou « 1,234.56 » (virgule milliers).
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return negative ? -n : n;
}

/** « 12/03/2027 », « 12-03-27 », « 2027-03-12 », « 2027-03-12T10:00 » → 'AAAA-MM-JJ' ('' si illisible). */
export function parseDateFr(value) {
  const s = String(value ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return ymd(y, Number(m[2]), Number(m[1]));
  }
  return '';
}

function ymd(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Normalisation pour comparaisons (accents, casse, espaces). */
export function normalizeText(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();
}

/** Devine l'index de colonne dont l'en-tête correspond à l'un des motifs. */
export function guessColumn(headers, patterns, exclude = []) {
  const norm = headers.map(normalizeText);
  for (const p of patterns) {
    const i = norm.findIndex((h, idx) => !exclude.includes(idx) && p.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

/** Lit un fichier texte (UTF-8, repli Windows-1252 si caractères invalides). */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try { return new TextDecoder('windows-1252').decode(buf); } catch { return utf8; }
}
