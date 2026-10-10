// ============================================================
// STUDIO FORMULAIRES — file locale d'envois différés
// ============================================================
// Réponses enregistrées sur l'appareil (IndexedDB, fichiers compris) puis
// envoyées au serveur quand le réseau revient. Utilisée par le mode borne
// (file « kiosk »), par la page répondant en cas de coupure (file « outbox »)
// et réutilisable par l'administration (compteur, envoi manuel, purge).
//
//   const q = createQueue('kiosk');
//   await q.add({ slug, formId, answers, files: [{ key, blob, name }] })
//   await q.flush(entry => sendResponse({...}))   → { sent, failed, remaining, stoppedOffline }
//   q.count(slug?) / q.list(slug?) / q.remove(id) / q.retry(id) / q.subscribe(cb)
//   usePendingCount(q, slug?) (hook React)
//
// Une entrée refusée par le serveur (formulaire fermé, réponse invalide…)
// passe au statut « error » avec le message : elle n'est plus renvoyée
// automatiquement mais reste visible (retry() / remove()).

import { useEffect, useState } from 'react';
import { idbAll, idbDelete, idbGet, idbPut, hasIndexedDb } from './localStore.js';
import { isNetworkError } from './api.js';

const queues = new Map();

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

export function createQueue(name) {
  if (queues.has(name)) return queues.get(name);
  const listeners = new Set();
  let channel = null;
  try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`bde-forms-queue-${name}`) : null; } catch { channel = null; }
  const emit = (remote = false) => {
    listeners.forEach(cb => { try { cb(); } catch { /* écouteur fautif ignoré */ } });
    if (!remote && channel) { try { channel.postMessage('changed'); } catch { /* rien */ } }
  };
  if (channel) channel.onmessage = () => emit(true);
  let flushing = null;

  const all = async () => {
    if (!hasIndexedDb()) return [];
    try {
      const rows = await idbAll('queue');
      return rows.filter(r => r.queue === name).sort((a, b) => a.createdAt - b.createdAt);
    } catch { return []; }
  };

  const api = {
    name,
    /** Ajoute une réponse. files : [{ key, blob|file, name?, type? }] → entrée */
    async add({ slug, formId = null, kind = 'standard', answers, files = [], meta = null }) {
      if (!hasIndexedDb()) throw new Error('Stockage local indisponible : impossible de garder la réponse hors ligne.');
      const entry = {
        id: newId(), queue: name, slug, formId, kind, answers,
        files: (files || []).filter(f => f && (f.blob || f.file)).map(f => {
          const blob = f.blob || f.file;
          return { key: f.key, blob, name: f.name || blob.name || 'fichier', type: f.type || blob.type || 'application/octet-stream', size: blob.size };
        }),
        meta, createdAt: Date.now(), attempts: 0, status: 'pending', error: null,
      };
      await idbPut('queue', entry);
      emit();
      return entry;
    },
    list: async (slug = null) => (await all()).filter(e => !slug || e.slug === slug),
    count: async (slug = null, { includeErrors = true } = {}) => (await all()).filter(e => (!slug || e.slug === slug) && (includeErrors || e.status !== 'error')).length,
    async remove(id) { try { await idbDelete('queue', id); } finally { emit(); } },
    async retry(id) {
      const e = await idbGet('queue', id).catch(() => null);
      if (e) { await idbPut('queue', { ...e, status: 'pending', error: null }); emit(); }
    },
    async clear(slug = null) {
      const rows = await api.list(slug);
      await Promise.all(rows.map(r => idbDelete('queue', r.id).catch(() => {})));
      emit();
    },
    subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },

    /**
     * Envoie les entrées en attente, dans l'ordre. sender(entry) → résultat (lève en cas d'échec).
     * S'arrête à la première erreur réseau. onSent(entry, result) appelé après chaque succès.
     */
    flush(sender, { slug = null, retryErrors = false, onSent = null } = {}) {
      if (flushing) return flushing;
      const run = async () => {
        const res = { sent: 0, failed: 0, remaining: 0, stoppedOffline: false };
        const rows = (await all()).filter(e => (!slug || e.slug === slug) && (retryErrors || e.status !== 'error'));
        for (const e of rows) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) { res.stoppedOffline = true; break; }
          // Toujours vérifier qu'un autre onglet ne l'a pas déjà envoyée
          const fresh = await idbGet('queue', e.id).catch(() => null);
          if (!fresh) continue;
          try {
            const result = await sender(fresh);
            await idbDelete('queue', e.id);
            res.sent++;
            emit();
            if (onSent) { try { onSent(fresh, result); } catch { /* rien */ } }
          } catch (err) {
            if (isNetworkError(err)) {
              await idbPut('queue', { ...fresh, attempts: fresh.attempts + 1, lastTryAt: Date.now() }).catch(() => {});
              res.stoppedOffline = true;
              break;
            }
            await idbPut('queue', { ...fresh, attempts: fresh.attempts + 1, lastTryAt: Date.now(), status: 'error', error: String(err?.message || err).slice(0, 300) }).catch(() => {});
            res.failed++;
            emit();
          }
        }
        res.remaining = await api.count(slug);
        return res;
      };
      // Verrou inter-onglets si disponible : une seule borne envoie à la fois.
      const locked = typeof navigator !== 'undefined' && navigator.locks?.request
        ? navigator.locks.request(`bde-forms-flush-${name}`, run)
        : run();
      flushing = Promise.resolve(locked).finally(() => { flushing = null; emit(); });
      return flushing;
    },
  };
  queues.set(name, api);
  return api;
}

/** File du mode borne. */
export const kioskQueue = createQueue('kiosk');
/** File des envois différés de la page publique (coupure réseau à l'envoi). */
export const outboxQueue = createQueue('outbox');

/** Hook : nombre d'entrées (en attente + en erreur) d'une file, mis à jour en direct. */
export function usePendingCount(queue, slug = null) {
  const [state, setState] = useState({ pending: 0, errors: 0 });
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      queue.list(slug).then(rows => {
        if (alive) setState({ pending: rows.filter(r => r.status !== 'error').length, errors: rows.filter(r => r.status === 'error').length });
      });
    };
    refresh();
    const off = queue.subscribe(refresh);
    return () => { alive = false; off(); };
  }, [queue, slug]);
  return state;
}
