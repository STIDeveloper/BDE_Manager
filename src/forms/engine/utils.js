// ============================================================
// Moteur de formulaires — utilitaires (liens courts, clés)
// ============================================================

import { KEY_RX } from '../schema.js';
import { RESERVED_KEYS } from './compile.js';

const stripAccents = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** « WEI 2027 — Inscriptions ! » → « wei-2027-inscriptions » (60 caractères max). */
export function slugify(title) {
  const s = stripAccents(title)
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || 'formulaire';
}

function toKeySet(existing) {
  if (!existing) return new Set();
  if (existing instanceof Set) return existing;
  if (existing instanceof Map) return new Set(existing.keys());
  if (Array.isArray(existing)) return new Set(existing);
  if (typeof existing === 'object') return new Set(Object.keys(existing));
  return new Set();
}

/**
 * Propose une clé de variable à partir d'un intitulé, unique parmi `existingKeys`
 * (Set, tableau ou objet) : « Date de naissance ? » → « date_de_naissance ».
 */
export function newKeyFromLabel(label, existingKeys) {
  const taken = toKeySet(existingKeys);
  let base = stripAccents(label)
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '');
  if (!base) base = 'question';
  if (!/^[a-z]/.test(base)) base = `q_${base}`.slice(0, 40);
  if (RESERVED_KEYS.has(base)) base = `${base}_q`;
  let key = base;
  for (let i = 2; taken.has(key) || !KEY_RX.test(key); i++) {
    key = `${base}_${i}`;
    if (i > 9999) { key = `q_${Date.now().toString(36)}`; break; }
  }
  return key;
}
