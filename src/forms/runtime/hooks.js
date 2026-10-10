// Petits hooks partagés de la page répondant.
import { useSyncExternalStore } from 'react';

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
const subscribeDark = cb => {
  const q = darkQuery();
  if (!q) return () => {};
  q.addEventListener?.('change', cb);
  return () => q.removeEventListener?.('change', cb);
};

/** Thème sombre demandé par l'appareil. */
export function useSystemDark() {
  return useSyncExternalStore(subscribeDark, () => !!darkQuery()?.matches, () => false);
}

const subscribeOnline = cb => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
};

/** État du réseau (navigator.onLine). */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine !== false, () => true);
}
