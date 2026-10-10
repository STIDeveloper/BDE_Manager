// ============================================================
// STUDIO FORMULAIRES — stockage local du répondant (IndexedDB)
// ============================================================
// Base « bde-forms-runtime », propre à la page répondant (aucun lien avec
// les données de l'application) :
//   - kv     : brouillons, réglages légers ({ key, value }) ;
//   - blobs  : fichiers joints en attente d'envoi ({ id, blob, name, type, size }) ;
//   - queue  : envois différés (file d'attente, voir kioskQueue.js).
// Repli localStorage pour kv si IndexedDB est indisponible (navigation
// privée stricte) ; les fichiers exigent IndexedDB.

const DB_NAME = 'bde-forms-runtime';
const VERSION = 1;
let dbPromise = null;

export function hasIndexedDb() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch { return false; }
}

function openDb() {
  if (!hasIndexedDb()) return Promise.reject(new Error('Stockage local indisponible dans ce navigateur.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error || new Error('Ouverture du stockage local impossible.')); };
      req.onblocked = () => { dbPromise = null; reject(new Error('Stockage local bloqué par un autre onglet.')); };
    });
  }
  return dbPromise;
}

const reqP = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Exécute `fn(store)` dans une transaction ; résout avec la valeur renvoyée par fn (promesse de requête). */
export async function withStore(name, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(name, mode);
    let result;
    Promise.resolve(fn(t.objectStore(name))).then(r => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Opération annulée.'));
  });
}

export const idbGet = (store, key) => withStore(store, 'readonly', s => reqP(s.get(key)));
export const idbPut = (store, value) => withStore(store, 'readwrite', s => reqP(s.put(value)));
export const idbDelete = (store, key) => withStore(store, 'readwrite', s => reqP(s.delete(key)));
export const idbAll = store => withStore(store, 'readonly', s => reqP(s.getAll()));

const LS_PREFIX = 'bde-forms-rt:';

/** Lecture d'une valeur (brouillon…) : IndexedDB, sinon localStorage. */
export async function kvGet(key) {
  try {
    const rec = await idbGet('kv', key);
    return rec ? rec.value : null;
  } catch {
    try { const raw = localStorage.getItem(LS_PREFIX + key); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
}

export async function kvSet(key, value) {
  try {
    await idbPut('kv', { key, value });
  } catch {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* quota plein : brouillon non conservé */ }
  }
}

export async function kvDelete(key) {
  try { await idbDelete('kv', key); } catch { /* rien */ }
  try { localStorage.removeItem(LS_PREFIX + key); } catch { /* rien */ }
}

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

/** Range un fichier choisi par le répondant. → référence { id, name, size, type, local: true } */
export async function putBlob(file) {
  const ref = { id: newId(), name: String(file.name || 'fichier').slice(0, 200), size: file.size, type: file.type || 'application/octet-stream' };
  await idbPut('blobs', { ...ref, blob: file, createdAt: Date.now() });
  return { ...ref, local: true };
}

export async function getBlob(id) {
  try { const rec = await idbGet('blobs', id); return rec?.blob || null; } catch { return null; }
}

export async function deleteBlob(id) {
  try { await idbDelete('blobs', id); } catch { /* rien */ }
}

/** Supprime les fichiers locaux de plus de `maxAgeMs` non référencés par `keepIds`. */
export async function pruneBlobs(keepIds = new Set(), maxAgeMs = 7 * 24 * 3600 * 1000) {
  try {
    const all = await idbAll('blobs');
    const now = Date.now();
    await Promise.all(all.filter(b => !keepIds.has(b.id) && now - (b.createdAt || 0) > maxAgeMs).map(b => idbDelete('blobs', b.id)));
  } catch { /* rien */ }
}
