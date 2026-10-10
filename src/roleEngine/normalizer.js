const EMOJI_RX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

export function stripAccents(str) {
  return String(str ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export function stripEmojis(str) { return String(str ?? '').replace(EMOJI_RX, ''); }
export function collapseSpaces(str) { return String(str ?? '').replace(/\s+/g, ' ').trim(); }

export function normalizeKey(str) {
  return stripAccents(stripEmojis(collapseSpaces(str)))
    .toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplay(str) {
  return collapseSpaces(stripEmojis(String(str ?? '')));
}

export function parseAvailability(raw) {
  const k = normalizeKey(raw);
  if (k.includes('dispo et reactif')) return { value: 1.0, label: 'Dispo et réactif' };
  if (k.includes('regulier') && k.includes('limites')) return { value: 0.7, label: 'Régulier avec limites' };
  if (k.includes('investissement cible')) return { value: 0.4, label: 'Investissement ciblé' };
  if (k.includes('emploi du temps tres charge')) return { value: 0.1, label: 'Emploi du temps chargé' };
  return { value: 0.5, label: 'Non précisé' };
}

export function parseSwissKnife(raw) {
  const k = normalizeKey(raw);
  if (k.includes('carrement')) return { value: 1.0, label: 'Couteau suisse' };
  if (k.includes('pourquoi pas')) return { value: 0.5, label: 'Flexible' };
  if (k.includes('pas vraiment')) return { value: 0.1, label: 'Focus poste' };
  return { value: 0.5, label: 'Non précisé' };
}

export function parseName(fullName) {
  const clean = normalizeDisplay(fullName);
  if (!clean) return { firstName: '', lastName: '' };
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return 'c_' + h.toString(36);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse date "2026/09/27 6:57:16 PM UTC+3" → ISO (avec conversion en UTC) */
export function parseTimestamp(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?\s*(?:UTC|GMT)?([+-]\d{1,2})?/i);
  if (!m) {
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString();
  }

  let [, y, mo, d, h, mi, se, ap, tz] = m;
  h = parseInt(h, 10);
  if (ap) {
    if (ap.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ap.toUpperCase() === 'AM' && h === 12) h = 0;
  }

  let offsetHours = 0;
  if (tz) {
    const sign = tz.startsWith('-') ? -1 : 1;
    const hours = Math.abs(parseInt(tz.replace(/[+-]/, ''), 10));
    offsetHours = sign * hours;
  }

  const asUtc = Date.UTC(+y, +mo - 1, +d, h, +mi, +se);
  return new Date(asUtc - offsetHours * 3600 * 1000).toISOString();
}