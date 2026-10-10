// ============================================================
// NAVIGATION (routage par hash)
// ============================================================
// Routes : #/<section>[/<sous-chemin>]  ex. #/finance/transactions,
// #/events/<id>, #/documents/attestation-adhesion.
// Les modules naviguent entre eux avec navigate('events', id) au lieu de
// manipuler window.location directement.

import { useSyncExternalStore } from 'react';

export function parseHash(hash = (typeof window !== 'undefined' ? window.location.hash : '')) {
  const parts = String(hash).replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(String(hash).split('?')[1] || '');
  return { section: parts[0] || '', rest: parts.slice(1), query };
}

/** Va vers une section (et éventuellement un sous-chemin / des paramètres). */
export function navigate(section, ...rest) {
  let query = '';
  if (rest.length && rest[rest.length - 1] && typeof rest[rest.length - 1] === 'object') {
    const params = new URLSearchParams(rest.pop());
    query = params.toString() ? `?${params}` : '';
  }
  const path = [section, ...rest.filter(v => v !== undefined && v !== null && v !== '')].map(encodeURIComponent).join('/');
  window.location.hash = `/${path}${query}`;
}

const subscribe = (cb) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** Hook : route courante (réactive). Renvoie la chaîne hash (stable) ; parser avec parseHash. */
export function useHash() {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => '');
}

export function useRoute() {
  const hash = useHash();
  return parseHash(hash);
}
