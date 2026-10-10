// ============================================================
// PIÈCES JOINTES (justificatifs, archives, photos)
// ============================================================
// Les fichiers sont trop lourds pour localStorage (~5 Mo) : ils sont rangés
// dans IndexedDB (base « bde-attachments »). Les modules ne stockent que la
// référence { id, name, type, size, createdAt }.
// Avec le backend collaboratif, un adaptateur distant (Supabase Storage)
// peut être branché via setRemoteAttachmentAdapter() : les fichiers sont
// alors aussi envoyés au serveur et récupérables depuis un autre appareil.
// ============================================================

const DB_NAME = 'bde-attachments';
const STORE = 'files';
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 Mo par fichier

let dbPromise = null;
let remote = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Stockage de fichiers indisponible dans ce navigateur.'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Ouverture du stockage de fichiers impossible.'));
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Opération annulée'));
  }));
}

const reqP = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** Adaptateur distant facultatif : { upload(meta, blob), download(id), remove(id) }. */
export function setRemoteAttachmentAdapter(adapter) { remote = adapter; }

/**
 * Enregistre un fichier. @returns {Promise<{id,name,type,size,createdAt}>}
 */
export async function saveAttachment(file, { name, scope = 'general' } = {}) {
  if (!file) throw new Error('Aucun fichier.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo, maximum 10 Mo).`);
  const meta = {
    id: crypto.randomUUID(),
    name: name || file.name || 'fichier',
    type: file.type || 'application/octet-stream',
    size: file.size,
    scope,
    createdAt: new Date().toISOString(),
  };
  await tx('readwrite', store => store.put({ ...meta, blob: file }));
  if (remote) remote.upload(meta, file).catch(err => console.error('[pièces jointes] envoi distant', err));
  return meta;
}

/** @returns {Promise<Blob|null>} */
export async function getAttachmentBlob(id) {
  if (!id) return null;
  const rec = await tx('readonly', store => reqP(store.get(id))).catch(() => null);
  if (rec?.blob) return rec.blob;
  if (remote) {
    const blob = await remote.download(id).catch(() => null);
    if (blob) await tx('readwrite', store => store.put({ id, blob, name: 'fichier', type: blob.type, size: blob.size, createdAt: new Date().toISOString() })).catch(() => {});
    return blob;
  }
  return null;
}

export async function deleteAttachment(id) {
  if (!id) return;
  await tx('readwrite', store => store.delete(id)).catch(() => {});
  if (remote) remote.remove(id).catch(() => {});
}

/** Ouvre la pièce jointe dans un nouvel onglet (ou la télécharge). */
export async function openAttachment(meta) {
  const blob = await getAttachmentBlob(meta?.id);
  if (!blob) throw new Error('Fichier introuvable sur cet appareil.');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    const a = document.createElement('a');
    a.href = url; a.download = meta.name || 'fichier';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Espace utilisé (approximation fournie par le navigateur). */
export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
