// ============================================================
// MOTEUR CRYPTOGRAPHIQUE DU COFFRE-FORT
// ============================================================

const PBKDF2_ITERATIONS = 250_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const VERIFIER_PLAINTEXT = 'BDE_VAULT_OK_v1';

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToBytes(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSalt() { return crypto.getRandomValues(new Uint8Array(SALT_LENGTH)); }
export function generateIv()   { return crypto.getRandomValues(new Uint8Array(IV_LENGTH)); }
export function saltToBase64(salt) { return bytesToBase64(salt); }
export function base64ToSalt(b64)  { return base64ToBytes(b64); }

export async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptWithKey(key, plaintext) {
  const iv = generateIv();
  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
  );
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(cipherBuffer)) };
}

export async function decryptWithKey(key, blob) {
  if (!blob || !blob.iv || !blob.ct) throw new Error('Blob chiffré invalide');
  const iv = base64ToBytes(blob.iv);
  const ct = base64ToBytes(blob.ct);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plainBuffer);
}

export async function createVerifier(key) {
  return encryptWithKey(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(key, verifier) {
  try {
    const plain = await decryptWithKey(key, verifier);
    return plain === VERIFIER_PLAINTEXT;
  } catch { return false; }
}

export async function setupVault(password) {
  if (!password || password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères.');
  }
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const verifier = await createVerifier(key);
  const entriesBlob = await encryptWithKey(key, JSON.stringify([]));
  return { salt: saltToBase64(salt), verifier, entriesBlob, key };
}

export async function unlockVault(password, saltB64, verifier, entriesBlob) {
  const salt = base64ToSalt(saltB64);
  const key = await deriveKey(password, salt);
  const ok = await checkVerifier(key, verifier);
  if (!ok) throw new Error('Mot de passe incorrect.');
  const entriesJson = await decryptWithKey(key, entriesBlob);
  const entries = JSON.parse(entriesJson);
  if (!Array.isArray(entries)) throw new Error('Données du coffre corrompues.');
  return { key, entries };
}

export async function encryptEntries(key, entries) {
  return encryptWithKey(key, JSON.stringify(entries));
}

export async function decryptEntries(key, entriesBlob) {
  const json = await decryptWithKey(key, entriesBlob);
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('Données du coffre corrompues.');
  return parsed;
}

export { VERIFIER_PLAINTEXT, PBKDF2_ITERATIONS };