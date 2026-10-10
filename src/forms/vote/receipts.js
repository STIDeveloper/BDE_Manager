// ============================================================
// ÉLECTIONS — carnet de reçus de vote (sur CET appareil uniquement)
// ============================================================
// Le serveur ne relie jamais un reçu à une personne : il ne peut donc pas
// « rendre » ses reçus à un votant. Le votant peut les garder ici (clé
// localStorage `bde-vote-receipts`), ajoutés automatiquement par la page de
// vote (voir rememberReceipt) ou saisis à la main dans « Mon espace ».
// Un reçu ne révèle pas le choix exprimé : il prouve seulement qu'un
// bulletin est dans l'urne.
// Forme : [{ formId (uuid serveur), slug?, title?, code (32 hex), savedAt }]
// ============================================================

import { useMemo, useSyncExternalStore } from 'react';

const KEY = 'bde-vote-receipts';
const CODE_RX = /^[a-f0-9]{32}$/;
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listeners = new Set();

export const normalizeReceipt = (code) => String(code || '').trim().toLowerCase().replace(/[\s-]/g, '');
export const isReceiptCode = (code) => CODE_RX.test(normalizeReceipt(code));
export const isFormUuid = (id) => UUID_RX.test(String(id || ''));

export function listReceipts() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(r => r && isFormUuid(r.formId) && isReceiptCode(r.code)) : [];
  } catch { return []; }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch { /* stockage indisponible */ }
  listeners.forEach(fn => fn());
}

/** Garde un reçu (sans doublon). → true si enregistré */
export function rememberReceipt({ formId, code, slug = '', title = '' }) {
  const c = normalizeReceipt(code);
  if (!isFormUuid(formId) || !CODE_RX.test(c)) return false;
  const list = listReceipts().filter(r => !(r.formId === formId && r.code === c));
  write([{ formId, code: c, slug: String(slug || '').slice(0, 60), title: String(title || '').slice(0, 200), savedAt: new Date().toISOString() }, ...list]);
  return true;
}

export function forgetReceipt(formId, code) {
  const c = normalizeReceipt(code);
  write(listReceipts().filter(r => !(r.formId === formId && r.code === c)));
}

export function onReceiptsChange(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === KEY) fn(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

/**
 * Lien public de vérification des reçus d'un vote (#/bulletin/<formId>).
 * Le code n'est jamais mis dans l'adresse (historique, journaux du serveur) :
 * le votant le saisit sur la page.
 */
export function ballotCheckLink(formId) {
  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  return `${base}#/bulletin/${encodeURIComponent(formId)}`;
}

// Instantané sous forme de chaîne : stable tant que le carnet ne change pas.
const snapshot = () => JSON.stringify(listReceipts());

/** Hook : reçus gardés sur cet appareil (réactif, entre onglets aussi). */
export function useReceipts() {
  const raw = useSyncExternalStore(onReceiptsChange, snapshot, () => '[]');
  return useMemo(() => JSON.parse(raw), [raw]);
}
