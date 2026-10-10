// Préférences d'affichage propres à cet appareil (colonnes, onglet, alertes…).
// Stockage local « de confort » : tout fonctionne sans (navigation privée).
const PREFIX = 'bde-forms-admin:';

export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

export function writePref(key, value) {
  try {
    if (value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* stockage indisponible : préférence non conservée */ }
}
