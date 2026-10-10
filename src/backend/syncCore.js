// ============================================================
// SYNCHRONISATION — logique pure (sans réseau)
// ============================================================
// Conversion entre l'état des stores (tranches du registre des modules) et
// les enregistrements du serveur, et calcul des différences.
//
// Enregistrement serveur : { collection, id, data: { v, pos? }, deleted }
//   map       : un enregistrement par clé            (v = valeur)
//   array     : un enregistrement par objet { id }  (v = objet, pos = ordre)
//   singleton : un seul enregistrement id 'value'   (v = valeur, ou
//               { clé: valeur } quand la tranche couvre plusieurs clés)
//
// Ordre des tableaux : positions fractionnaires. Un élément inséré reçoit
// une position entre ses voisins (seul lui est envoyé) ; si l'ordre relatif
// des éléments existants change (déplacement), tout le tableau est renuméroté.
// ============================================================

export const SINGLETON_ID = 'value';

/** JSON à clés triées : deux contenus égaux donnent la même chaîne (jsonb réordonne les clés). */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(v => (v === undefined || typeof v === 'function' ? 'null' : stableStringify(v))).join(',')}]`;
  const keys = Object.keys(value).filter(k => value[k] !== undefined && typeof value[k] !== 'function').sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/** Empreinte courte (cyrb53) d'un contenu — sert à détecter les modifications. */
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export const hashValue = (v) => hashString(stableStringify(v));
export const sliceKeys = (slice) => (Array.isArray(slice.key) ? slice.key : [slice.key]);

/** Références de premier niveau d'une tranche (raccourci : rien n'a changé). */
export const topRefs = (slice, state) => sliceKeys(slice).map(k => state[k]);
export const sameRefs = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Lit une tranche : Map id → { value, refs }.
 * @param {object} slice
 * @param {object} state état du store
 */
export function readSlice(slice, state) {
  const out = new Map();
  if (slice.kind === 'singleton') {
    if (Array.isArray(slice.key)) {
      const v = {};
      slice.key.forEach(k => { if (state[k] !== undefined) v[k] = state[k]; });
      out.set(SINGLETON_ID, { value: v, refs: slice.key.map(k => state[k]) });
    } else if (state[slice.key] !== undefined) {
      out.set(SINGLETON_ID, { value: state[slice.key], refs: [state[slice.key]] });
    }
    return out;
  }
  const raw = state[slice.key];
  if (slice.kind === 'array') {
    (Array.isArray(raw) ? raw : []).forEach((item) => {
      if (item && typeof item === 'object' && item.id !== undefined && item.id !== null && item.id !== '') {
        out.set(String(item.id), { value: item, refs: [item] });
      }
    });
    return out;
  }
  if (raw && typeof raw === 'object') {
    Object.entries(raw).forEach(([id, value]) => { if (value !== undefined) out.set(id, { value, refs: [value] }); });
  }
  return out;
}

/** Ordre des ids d'une tranche « array ». */
export const arrayIds = (slice, state) => (Array.isArray(state[slice.key]) ? state[slice.key] : [])
  .filter(x => x && x.id !== undefined && x.id !== null && x.id !== '').map(x => String(x.id));

/**
 * Positions d'un tableau après modification locale.
 * @param {string[]} ids ordre actuel
 * @param {Map<string, number>} known positions connues (avant)
 * @returns {{ pos: Map<string, number>, changed: Set<string> }} nouvelles positions et ids dont la position a changé
 */
export function computePositions(ids, known) {
  const pos = new Map();
  const changed = new Set();
  const existing = ids.filter(id => known.has(id));
  let ordered = true;
  for (let i = 1; i < existing.length; i++) {
    if (!(known.get(existing[i - 1]) < known.get(existing[i]))) { ordered = false; break; }
  }
  const renumber = () => {
    ids.forEach((id, i) => { pos.set(id, i); if (known.get(id) !== i) changed.add(id); });
    return { pos, changed };
  };
  if (!ordered) return renumber();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (known.has(id)) { pos.set(id, known.get(id)); continue; }
    const prev = i > 0 ? pos.get(ids[i - 1]) : undefined;
    let next;
    for (let j = i + 1; j < ids.length; j++) if (known.has(ids[j])) { next = known.get(ids[j]); break; }
    let p;
    if (prev === undefined && next === undefined) p = i;
    else if (prev === undefined) p = next - 1;
    else if (next === undefined) p = prev + 1;
    else p = (prev + next) / 2;
    if ((prev !== undefined && !(p > prev)) || (next !== undefined && !(p < next)) || !Number.isFinite(p)) {
      pos.clear(); changed.clear();
      return renumber();          // précision épuisée : renumérotation complète
    }
    pos.set(id, p);
    changed.add(id);
  }
  return { pos, changed };
}

/** Enveloppe d'un enregistrement pour le serveur. */
export const toData = (slice, value, pos) => (slice.kind === 'array' && pos !== undefined ? { v: value, pos } : { v: value });

/**
 * Construit le patch d'état qui applique des enregistrements distants.
 * @param {object} slice
 * @param {object} state état actuel du store
 * @param {{ id: string, data: object, deleted: boolean }[]} rows
 * @param {{ replace?: boolean, positions?: Map<string, number> }} opts
 *   replace : la tranche devient exactement `rows` (remplacement complet)
 *   positions : positions connues (tableaux), mises à jour sur place
 * @returns {object|null} patch (null si rien à faire)
 */
export function buildPatch(slice, state, rows, { replace = false, positions = new Map() } = {}) {
  if (slice.kind === 'singleton') {
    const row = rows.filter(r => r.id === SINGLETON_ID).pop();
    if (!row || row.deleted || !row.data || !('v' in row.data)) return null;
    if (Array.isArray(slice.key)) {
      const v = row.data.v && typeof row.data.v === 'object' ? row.data.v : {};
      const patch = {};
      slice.key.forEach(k => { if (k in v) patch[k] = v[k]; });
      return Object.keys(patch).length ? patch : null;
    }
    return { [slice.key]: row.data.v };
  }

  if (slice.kind === 'array') {
    const current = Array.isArray(state[slice.key]) ? state[slice.key] : [];
    const items = new Map();
    if (!replace) current.forEach((x, i) => {
      if (!x || x.id === undefined || x.id === null || x.id === '') return;
      const id = String(x.id);
      items.set(id, x);
      if (!positions.has(id)) positions.set(id, i);
    });
    if (replace) positions.clear();
    rows.forEach((r) => {
      if (r.deleted) { items.delete(r.id); positions.delete(r.id); return; }
      const v = r.data?.v;
      if (!v || typeof v !== 'object') return;
      items.set(r.id, v);
      positions.set(r.id, Number.isFinite(r.data?.pos) ? r.data.pos : (positions.get(r.id) ?? Number.MAX_SAFE_INTEGER));
    });
    // Éléments sans identifiant : conservés en tête, tels quels.
    const anonymous = replace ? [] : current.filter(x => !x || x.id === undefined || x.id === null || x.id === '');
    const ordered = [...items.entries()]
      .sort((a, b) => (positions.get(a[0]) - positions.get(b[0])) || (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
    return { [slice.key]: [...anonymous, ...ordered] };
  }

  // map
  const next = replace ? {} : { ...(state[slice.key] && typeof state[slice.key] === 'object' ? state[slice.key] : {}) };
  rows.forEach((r) => {
    if (r.deleted) delete next[r.id];
    else if (r.data && 'v' in r.data) next[r.id] = r.data.v;
  });
  return { [slice.key]: next };
}

/** Résumé lisible d'une tranche (dialogues de migration). */
export function describeSlice(slice, state) {
  const n = readSlice(slice, state).size;
  return { collection: slice.collection, count: n };
}

/** Une erreur Supabase/PostgREST relève-t-elle d'un droit insuffisant ? */
export function isPermissionError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return code === '42501' || code === 'PGRST301' || err.status === 401 || err.status === 403
    || /row-level security|permission denied|Droit|Réservé|Validation réservée/i.test(msg);
}

/** Erreur réseau (hors ligne, serveur injoignable) ? */
export function isNetworkError(err) {
  if (!err) return false;
  const msg = String(err.message || err);
  return err.name === 'TypeError' || err.status === 0 || /Failed to fetch|NetworkError|Load failed|fetch failed|network/i.test(msg);
}
