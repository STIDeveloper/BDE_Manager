import { normalizeDisplay, normalizeKey } from './normalizer.js';
import { parseRoleLabel } from './roles.js';

export function parseCSV(text) {
  if (typeof text !== 'string') throw new Error('parseCSV : texte attendu');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const firstLine = text.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const sep = semiCount > commaCount ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === sep) { row.push(field); field = ''; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

export function mapHeader(header) {
  const h = normalizeKey(header);
  if (!h) return 'unknown';

  if (h.includes('horodateur') || h.includes('timestamp')) return 'timestamp';
  if (h.includes('prenom') && h.includes('nom')) return 'fullName';
  if (h.includes('telephone') || h.includes('numero') || h.includes('phone')) return 'phone';
  if (h.includes('email') || h.includes('mail')) return 'email';
  if (h.includes('alternance') || h.includes('apprentissage')) return 'alternance';
  if (h.includes('formation')) return 'formation';
  if (h === 'annee' || h.includes(' annee') || h.endsWith('annee')) return 'year';
  if (h.includes('premier choix') || h.includes('1er choix')) return 'choice1';
  if (h.includes('deuxieme choix') || h.includes('2e choix') || h.includes('2eme choix')) return 'choice2';
  if (h.includes('troisieme choix') || h.includes('3e choix') || h.includes('3eme choix')) return 'choice3';
  if (h.includes('pourquoi')) return 'whyText';
  if (h.includes('decouvrir') || h.includes('apprendre')) return 'discoverText';
  if (h.includes('apporter')) return 'contributeText';
  if (h.includes('rythme')) return 'availabilityRaw';
  if (h.includes('couteau suisse') || h.includes('hybride')) return 'swissKnifeRaw';
  return 'unknown';
}

/**
 * Parse un export CSV Google Form.
 * @param {string} csvText
 * @param {object} [catalog]  Catalogue utilisé pour reconnaître les rôles
 *                            (défaut : catalogue actif)
 */
export function parseResponses(csvText, catalog) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) throw new Error('CSV vide ou trop court');
  const headers = rows[0].map(mapHeader);
  const report = {
    totalRows: rows.length - 1,
    parsedRows: 0,
    skippedRows: 0,
    warnings: [],
    missingChoice1: 0,
    missingChoice2: 0,
    missingChoice3: 0,
    emptyTextFields: 0,
  };
  const candidates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    headers.forEach((key, idx) => { obj[key] = row[idx] ?? ''; });

    if (!obj.fullName || !obj.fullName.trim()) {
      report.skippedRows++;
      report.warnings.push(`Ligne ${i + 1} : pas de nom`);
      continue;
    }

    const rawChoices = [obj.choice1, obj.choice2, obj.choice3]
      .map(c => normalizeDisplay(c))
      .filter(Boolean);

    // ⚠️ Dédoublonnage par ID canonique (pas par chaîne brute)
    const seen = new Set();
    const dedup = [];
    rawChoices.forEach(c => {
      const canonId = parseRoleLabel(c, catalog) || c.toLowerCase().trim();
      if (!seen.has(canonId)) {
        seen.add(canonId);
        dedup.push(c);
      }
    });

    if (dedup.length === 0) report.missingChoice1++;
    if (dedup.length < 2) report.missingChoice2++;
    if (dedup.length < 3) report.missingChoice3++;

    const anyText = [obj.whyText, obj.discoverText, obj.contributeText].some(t => t && t.trim());
    if (!anyText) report.emptyTextFields++;

    candidates.push({ _raw: obj, _dedupChoices: dedup });
    report.parsedRows++;
  }

  return { candidates, report };
}