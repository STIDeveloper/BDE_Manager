// ============================================================
// STUDIO FORMULAIRES — opérations immuables sur une définition
// ============================================================
// Toutes les fonctions renvoient une NOUVELLE définition (le moteur met la
// compilation en cache par identité : ne jamais muter).
//
// Conteneur d'éléments (cible d'insertion / de déplacement), en chaîne :
//   'page:<pageId>'           → page.items
//   'sec:<sectionId>'         → section.items
//   'col:<columnsId>:<index>' → columns.columns[index]

import { QUESTION_TYPES } from '../../forms/schema.js';
import { newKeyFromLabel, flattenItems } from '../../forms/engine/index.js';

export const uid = (prefix = 'i') => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export const pageContainer = pageId => `page:${pageId}`;
export const sectionContainer = id => `sec:${id}`;
export const columnContainer = (id, i) => `col:${id}:${i}`;

export function parseContainer(cid) {
  const s = String(cid || '');
  if (s.startsWith('page:')) return { kind: 'page', id: s.slice(5) };
  if (s.startsWith('sec:')) return { kind: 'sec', id: s.slice(4) };
  if (s.startsWith('col:')) {
    const i = s.lastIndexOf(':');
    return { kind: 'col', id: s.slice(4, i), index: Number(s.slice(i + 1)) };
  }
  return null;
}

/** Liste des éléments d'un conteneur (ou null). */
export function getContainerItems(def, cid) {
  const c = parseContainer(cid);
  if (!c) return null;
  if (c.kind === 'page') return def.pages.find(p => p.id === c.id)?.items || null;
  const found = findItem(def, c.id);
  if (!found) return null;
  if (c.kind === 'sec') return found.item.items || [];
  return found.item.columns?.[c.index] || null;
}

/** Remplace récursivement les éléments (fn appelée sur chaque liste). */
function mapLists(items, fn) {
  const mapped = fn(items);
  return mapped.map(it => {
    if (it.kind === 'section') {
      const inner = mapLists(it.items || [], fn);
      return inner === it.items ? it : { ...it, items: inner };
    }
    if (it.kind === 'columns') {
      const cols = (it.columns || []).map(col => mapLists(col || [], fn));
      return { ...it, columns: cols };
    }
    return it;
  });
}

/** Applique fn(items) → items au conteneur visé. */
export function setContainerItems(def, cid, fn) {
  const c = parseContainer(cid);
  if (!c) return def;
  if (c.kind === 'page') {
    return { ...def, pages: def.pages.map(p => (p.id === c.id ? { ...p, items: fn(p.items || []) } : p)) };
  }
  return mapItems(def, it => {
    if (it.id !== c.id) return it;
    if (c.kind === 'sec' && it.kind === 'section') return { ...it, items: fn(it.items || []) };
    if (c.kind === 'col' && it.kind === 'columns') {
      const columns = (it.columns || []).map((col, i) => (i === c.index ? fn(col || []) : col));
      return { ...it, columns };
    }
    return it;
  });
}

/** Transforme chaque élément (profondeur d'abord). */
export function mapItems(def, fn) {
  const walk = items => (items || []).map(it => {
    let next = it;
    if (it.kind === 'section') next = { ...it, items: walk(it.items) };
    else if (it.kind === 'columns') next = { ...it, columns: (it.columns || []).map(col => walk(col)) };
    return fn(next);
  });
  return { ...def, pages: def.pages.map(p => ({ ...p, items: walk(p.items) })) };
}

/** → { item, pageId, container, index, parentId } ou null. */
export function findItem(def, id) {
  for (const page of def.pages || []) {
    const r = findIn(page.items || [], id, pageContainer(page.id), page.id);
    if (r) return r;
  }
  return null;
}

function findIn(items, id, container, pageId) {
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.id === id) return { item: it, pageId, container, index: i };
    if (it.kind === 'section') {
      const r = findIn(it.items || [], id, sectionContainer(it.id), pageId);
      if (r) return r;
    } else if (it.kind === 'columns') {
      for (let c = 0; c < (it.columns || []).length; c++) {
        const r = findIn(it.columns[c] || [], id, columnContainer(it.id, c), pageId);
        if (r) return r;
      }
    }
  }
  return null;
}

/** Ensemble des clés utilisées (questions, sections répétables, variables). */
export function usedKeys(def, exceptItemId) {
  const keys = new Set();
  for (const e of flattenItems(def)) if (e.item.key && e.item.id !== exceptItemId) keys.add(e.item.key);
  for (const v of def.variables || []) if (v?.key) keys.add(v.key);
  return keys;
}

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t.label]));

/** Nouvelle question par défaut pour un type. */
export function newQuestion(type, def) {
  const label = {
    short_text: 'Nouvelle question', long_text: 'Ta réponse détaillée', name: 'Prénom et nom', email: 'Adresse e-mail',
    phone: 'Téléphone', address: 'Adresse', url: 'Lien', consent: 'J\'accepte les conditions', payment: 'Paiement',
    calculated: 'Résultat calculé', hidden: 'Champ caché',
  }[type] || TYPE_LABEL[type] || 'Question';
  const item = { id: uid('q'), kind: 'question', type, label, key: newKeyFromLabel(label, usedKeys(def)) };
  switch (type) {
    case 'single_choice': case 'multiple_choice': case 'dropdown': case 'ranking':
      item.options = [{ value: 'option_1', label: 'Option 1' }, { value: 'option_2', label: 'Option 2' }];
      break;
    case 'image_choice':
      item.options = [{ value: 'choix_1', label: 'Choix 1' }, { value: 'choix_2', label: 'Choix 2' }];
      break;
    case 'slots':
      item.options = [{ value: 'creneau_1', label: 'Créneau 1', capacity: 10 }, { value: 'creneau_2', label: 'Créneau 2', capacity: 10 }];
      break;
    case 'matrix':
      item.options = [{ value: 'ligne_1', label: 'Ligne 1' }, { value: 'ligne_2', label: 'Ligne 2' }];
      item.columns = [{ value: 'faible', label: 'Faible' }, { value: 'moyen', label: 'Moyen' }, { value: 'fort', label: 'Fort' }];
      break;
    case 'rating': item.max = 5; break;
    case 'scale': item.min = 1; item.max = 10; item.minLabel = ''; item.maxLabel = ''; break;
    case 'consent': item.required = true; break;
    case 'payment': item.amount = 10; item.currency = 'EUR'; break;
    case 'calculated': item.expr = '1 + 1'; item.valueType = 'number'; break;
    case 'file': item.validation = { maxFiles: 1, maxFileSizeMb: 10 }; break;
    default: break;
  }
  return item;
}

export function newBlock(kind, def) {
  if (kind === 'section') return { id: uid('s'), kind: 'section', title: 'Nouvelle section', description: '', items: [] };
  if (kind === 'columns') return { id: uid('c'), kind: 'columns', columns: [[], []] };
  if (kind === 'divider') return { id: uid('t'), kind: 'content', format: 'divider' };
  if (kind === 'image') return { id: uid('t'), kind: 'content', format: 'image', image: null, alt: '' };
  void def;
  return { id: uid('t'), kind: 'content', format: 'text', text: 'Texte d\'information' };
}

/** Insère un élément dans un conteneur à l'index (fin par défaut). */
export function insertItem(def, cid, item, index) {
  return setContainerItems(def, cid, items => {
    const next = [...items];
    const at = index === undefined || index === null || index < 0 || index > next.length ? next.length : index;
    next.splice(at, 0, item);
    return next;
  });
}

export function removeItem(def, id) {
  const pages = def.pages.map(p => ({
    ...p,
    items: mapLists(p.items || [], list => (list.some(it => it.id === id) ? list.filter(it => it.id !== id) : list)),
  }));
  return { ...def, pages };
}

export function updateItem(def, id, patchOrFn) {
  return mapItems(def, it => {
    if (it.id !== id) return it;
    const next = typeof patchOrFn === 'function' ? patchOrFn(it) : { ...it, ...patchOrFn };
    // Les valeurs undefined suppriment le champ (JSON propre)
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    return next;
  });
}

/** Vrai si `targetCid` est à l'intérieur de l'élément `id` (empêche de déposer un bloc en lui-même). */
export function isInside(def, id, targetCid) {
  const c = parseContainer(targetCid);
  if (!c || c.kind === 'page') return false;
  if (c.id === id) return true;
  const found = findItem(def, id);
  if (!found) return false;
  const ids = new Set();
  const walk = it => {
    ids.add(it.id);
    if (it.kind === 'section') (it.items || []).forEach(walk);
    if (it.kind === 'columns') (it.columns || []).forEach(col => (col || []).forEach(walk));
  };
  walk(found.item);
  return ids.has(c.id);
}

/** Déplace un élément vers un conteneur / index (index dans la liste APRÈS retrait). */
export function moveItem(def, id, targetCid, index) {
  const found = findItem(def, id);
  if (!found || isInside(def, id, targetCid)) return def;
  const without = removeItem(def, id);
  return insertItem(without, targetCid, found.item, index);
}

/** Copie profonde d'un élément avec nouveaux ids et nouvelles clés uniques. */
export function cloneItemFresh(item, def) {
  const keys = usedKeys(def);
  const copy = clone(item);
  const walk = it => {
    it.id = uid(it.kind === 'question' ? 'q' : it.kind === 'section' ? 's' : it.kind === 'columns' ? 'c' : 't');
    if (it.key) {
      const k = newKeyFromLabel(it.key, keys);
      keys.add(k);
      it.key = k;
    }
    if (it.kind === 'section') (it.items || []).forEach(walk);
    if (it.kind === 'columns') (it.columns || []).forEach(col => (col || []).forEach(walk));
  };
  walk(copy);
  if (copy.kind === 'question' && copy.label) copy.label = `${copy.label} (copie)`;
  if (copy.kind === 'section' && copy.title) copy.title = `${copy.title} (copie)`;
  return copy;
}

export function duplicateItem(def, id) {
  const found = findItem(def, id);
  if (!found) return { def, newId: null };
  const copy = cloneItemFresh(found.item, def);
  return { def: insertItem(def, found.container, copy, found.index + 1), newId: copy.id };
}

// ── Pages ───────────────────────────────────────────────────

export function addPage(def, afterIndex) {
  const page = { id: uid('p'), title: `Page ${def.pages.length + 1}`, items: [] };
  const pages = [...def.pages];
  pages.splice(afterIndex === undefined ? pages.length : afterIndex + 1, 0, page);
  return { def: { ...def, pages }, pageId: page.id };
}

export function updatePage(def, pageId, patch) {
  return {
    ...def,
    pages: def.pages.map(p => {
      if (p.id !== pageId) return p;
      const next = typeof patch === 'function' ? patch(p) : { ...p, ...patch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      return next;
    }),
  };
}

export function removePage(def, pageId) {
  if (def.pages.length <= 1) return def;
  // Les règles de saut vers la page supprimée sont retirées.
  const pages = def.pages.filter(p => p.id !== pageId).map(p => {
    if (!p.logic?.next?.some(r => r.goTo === pageId)) return p;
    return { ...p, logic: { ...p.logic, next: p.logic.next.filter(r => r.goTo !== pageId) } };
  });
  return { ...def, pages };
}

export function movePage(def, from, to) {
  if (from === to || from < 0 || to < 0 || from >= def.pages.length || to >= def.pages.length) return def;
  const pages = [...def.pages];
  const [p] = pages.splice(from, 1);
  pages.splice(to, 0, p);
  return { ...def, pages };
}

export function duplicatePage(def, pageId) {
  const i = def.pages.findIndex(p => p.id === pageId);
  if (i < 0) return { def, pageId: null };
  const src = def.pages[i];
  let tmp = def;
  const items = [];
  for (const it of src.items || []) {
    const c = cloneItemFresh(it, tmp);
    items.push(c);
    tmp = { ...tmp, pages: [...tmp.pages, { id: '__tmp', items: [c] }] };
  }
  const page = { ...clone(src), id: uid('p'), title: `${src.title || `Page ${i + 1}`} (copie)`, items };
  const pages = [...def.pages];
  pages.splice(i + 1, 0, page);
  return { def: { ...def, pages }, pageId: page.id };
}

// ── Divers ──────────────────────────────────────────────────

/** Libellé lisible d'un élément (arbre, problèmes). */
export function itemLabel(item) {
  if (!item) return '';
  if (item.kind === 'question') return item.label || item.key || 'Question sans titre';
  if (item.kind === 'section') return item.title || 'Section';
  if (item.kind === 'columns') return `Colonnes (${item.columns?.length || 0})`;
  if (item.format === 'divider') return 'Séparateur';
  if (item.format === 'image') return item.alt || 'Image';
  const t = String(item.text || '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 40 ? `${t.slice(0, 40)}…` : t) : 'Texte';
}

/** Retire les conditions d'affichage (canevas : tout est visible). */
export function stripVisibility(item) {
  const { showIf: _s, ...rest } = item;
  if (rest.kind === 'section') return { ...rest, items: (rest.items || []).map(stripVisibility) };
  if (rest.kind === 'columns') return { ...rest, columns: (rest.columns || []).map(col => (col || []).map(stripVisibility)) };
  if (Array.isArray(rest.options) && rest.options.some(o => o?.showIf)) {
    return { ...rest, options: rest.options.map(({ showIf: _o, ...o }) => o) };
  }
  return rest;
}

/** Empreinte stable du contenu publiable (détection « modifications non publiées »). */
export function contentHash(def) {
  if (!def) return '';
  const { updatedAt: _u, createdAt: _c, status: _s, publishedVersion: _p, ...rest } = def;
  const s = JSON.stringify(rest);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${s.length.toString(36)}-${h.toString(36)}`;
}
