// ============================================================
// STORE DU STUDIO FORMULAIRES (éditeur)
// ============================================================
// Tranches synchronisables :
//   forms.definitions  { [formId]: FormDefinition }         (brouillons)
//   forms.history      { [formId]: Snapshot[] }             (instantanés, 50 max)
//   forms.publications { [formId]: { serverFormId?, versions: [{ version, slug, publishedAt, hash }], publishedHash } }
// Snapshot : { id, at, label, definition }
// Annuler / rétablir : piles en mémoire (non persistées), propres à
// l'éditeur (useFormUndo).
// ============================================================

import { create } from 'zustand';
import { createModuleStore, newId, nowIso } from '../../core/createModuleStore.js';
import { slugify } from '../../forms/engine/index.js';
import { FORM_KINDS } from '../../forms/schema.js';
import { baseDefinition, defaultSettings, themeFromPreset } from '../../forms/templates/index.js';
import { contentHash } from './defOps.js';

export const MAX_SNAPSHOTS = 50;
const MAX_HISTORY_CHARS = 1_200_000; // ~1,2 Mo de JSON par formulaire
const MAX_UNDO = 100;
const COALESCE_MS = 1200;
const KIND_IDS = new Set(FORM_KINDS.map(k => k.id));

const clone = v => JSON.parse(JSON.stringify(v));

/** Lien court unique parmi les brouillons de l'appareil. */
export function uniqueSlug(base, definitions, exceptId) {
  const taken = new Set(Object.values(definitions || {}).filter(d => d.id !== exceptId).map(d => d.slug));
  const root = slugify(base).slice(0, 54) || 'formulaire';
  let s = root;
  for (let i = 2; taken.has(s); i++) s = `${root}-${i}`;
  return s;
}

/** Complète une définition importée / issue d'un modèle (champs manquants). */
export function normalizeDefinition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Le fichier ne contient pas de formulaire.');
  const src = raw.definition && typeof raw.definition === 'object' ? raw.definition : raw; // export enveloppé ou brut
  if (!Array.isArray(src.pages)) throw new Error('Formulaire invalide : la liste des pages est absente.');
  const base = baseDefinition({ title: String(src.title || 'Formulaire importé'), kind: KIND_IDS.has(src.kind) ? src.kind : 'standard' });
  const def = {
    ...base,
    ...clone(src),
    kind: KIND_IDS.has(src.kind) ? src.kind : 'standard',
    pages: src.pages.length ? clone(src.pages) : base.pages,
    variables: Array.isArray(src.variables) ? clone(src.variables) : [],
    theme: { ...themeFromPreset(src.theme?.preset || 'light'), ...(src.theme && typeof src.theme === 'object' ? clone(src.theme) : {}) },
    settings: { ...defaultSettings(KIND_IDS.has(src.kind) ? src.kind : 'standard'), ...(src.settings && typeof src.settings === 'object' ? clone(src.settings) : {}) },
    automations: Array.isArray(src.automations) ? [...src.automations] : [],
  };
  return def;
}

// ── Annuler / rétablir (mémoire) ────────────────────────────
export const useFormUndo = create(() => ({ stacks: {} }));
const stackOf = id => useFormUndo.getState().stacks[id] || { past: [], future: [], lastKey: null, lastAt: 0 };
const setStack = (id, st) => useFormUndo.setState(s => ({ stacks: { ...s.stacks, [id]: st } }));

function trimHistory(list) {
  let out = list.slice(-MAX_SNAPSHOTS);
  let size = JSON.stringify(out).length;
  while (out.length > 1 && size > MAX_HISTORY_CHARS) {
    out = out.slice(1);
    size = JSON.stringify(out).length;
  }
  return out;
}

export const useFormsStore = createModuleStore({
  name: 'forms',
  label: 'Formulaires',
  version: 1,
  initialState: { definitions: {}, history: {}, publications: {} },
  slices: [
    { key: 'definitions', kind: 'map', capability: 'forms' },
    { key: 'history', kind: 'map', capability: 'forms' },
    { key: 'publications', kind: 'map', capability: 'forms' },
  ],
  actions: (set, get) => {
    const write = (def) => {
      set(s => ({ definitions: { ...s.definitions, [def.id]: def } }));
      return def;
    };

    const snapshot = (formId, label, def = get().definitions[formId], { coalesce = false } = {}) => {
      if (!def) return null;
      const list = get().history[formId] || [];
      const last = list[list.length - 1];
      if (last && contentHash(last.definition) === contentHash(def) && last.label === label) return last;
      const snap = { id: newId(), at: nowIso(), label: label || 'Modification', definition: clone(def) };
      // Rafale d'une même action : remplace le dernier instantané (moins de 20 s)
      const replace = coalesce && last && last.label === snap.label && Date.now() - new Date(last.at).getTime() < 20000;
      const next = trimHistory(replace ? [...list.slice(0, -1), snap] : [...list, snap]);
      set(s => ({ history: { ...s.history, [formId]: next } }));
      return snap;
    };

    return {
      /** Crée un formulaire (vide ou à partir d'une définition). → id */
      createForm: (fromDef, label = 'Création') => {
        const id = newId();
        const t = nowIso();
        const src = fromDef ? normalizeDefinition(fromDef) : baseDefinition({ title: 'Nouveau formulaire' });
        const def = {
          ...src,
          id,
          status: 'draft',
          slug: uniqueSlug(src.slug || src.title, get().definitions),
          createdAt: t,
          updatedAt: t,
        };
        delete def.publishedVersion;
        write(def);
        snapshot(id, label, def);
        return id;
      },

      /**
       * Remplace le brouillon (autosauvegarde). opts.coalesce : clé de
       * regroupement pour l'annulation (frappe continue dans un champ) ;
       * opts.snapshot : libellé d'instantané (étape significative).
       */
      updateForm: (id, next, opts = {}) => {
        const prev = get().definitions[id];
        if (!prev) return null;
        const value = typeof next === 'function' ? next(prev) : next;
        if (!value || value === prev) return prev;
        const def = { ...value, id, updatedAt: nowIso() };
        // Pile d'annulation
        const st = stackOf(id);
        const now = Date.now();
        const merge = opts.coalesce && st.lastKey === opts.coalesce && now - st.lastAt < COALESCE_MS;
        setStack(id, {
          past: merge ? st.past : [...st.past, prev].slice(-MAX_UNDO),
          future: [],
          lastKey: opts.coalesce || null,
          lastAt: now,
        });
        write(def);
        if (opts.snapshot) snapshot(id, opts.snapshot, def, { coalesce: true });
        return def;
      },

      undo: (id) => {
        const st = stackOf(id);
        const cur = get().definitions[id];
        if (!st.past.length || !cur) return false;
        const prev = st.past[st.past.length - 1];
        setStack(id, { past: st.past.slice(0, -1), future: [cur, ...st.future].slice(0, MAX_UNDO), lastKey: null, lastAt: 0 });
        write({ ...prev, updatedAt: nowIso() });
        return true;
      },
      redo: (id) => {
        const st = stackOf(id);
        const cur = get().definitions[id];
        if (!st.future.length || !cur) return false;
        const [nextDef, ...rest] = st.future;
        setStack(id, { past: [...st.past, cur].slice(-MAX_UNDO), future: rest, lastKey: null, lastAt: 0 });
        write({ ...nextDef, updatedAt: nowIso() });
        return true;
      },

      snapshot: (id, label) => snapshot(id, label),

      /** Restaure un instantané (l'état courant est d'abord sauvegardé). */
      restoreSnapshot: (id, snapId) => {
        const snap = (get().history[id] || []).find(s => s.id === snapId);
        const cur = get().definitions[id];
        if (!snap || !cur) return false;
        snapshot(id, 'Avant restauration', cur);
        get().updateForm(id, { ...clone(snap.definition), id, slug: cur.slug, status: cur.status, publishedVersion: cur.publishedVersion, createdAt: cur.createdAt });
        snapshot(id, `Restauration (${new Date(snap.at).toLocaleString('fr-FR')})`);
        return true;
      },

      deleteSnapshot: (id, snapId) => set(s => ({ history: { ...s.history, [id]: (s.history[id] || []).filter(x => x.id !== snapId) } })),

      duplicateForm: (id) => {
        const src = get().definitions[id];
        if (!src) return null;
        const copy = clone(src);
        copy.title = `${src.title} (copie)`;
        copy.slug = src.slug;
        return get().createForm(copy, 'Duplication');
      },

      setArchived: (id, archived) => {
        const d = get().definitions[id];
        if (!d) return;
        write({ ...d, status: archived ? 'archived' : (d.publishedVersion ? 'closed' : 'draft'), updatedAt: nowIso() });
      },

      setStatus: (id, status) => {
        const d = get().definitions[id];
        if (!d) return;
        write({ ...d, status, updatedAt: nowIso() });
      },

      deleteForm: (id) => {
        set(s => {
          const { [id]: _d, ...definitions } = s.definitions;
          const { [id]: _h, ...history } = s.history;
          const { [id]: _p, ...publications } = s.publications;
          return { definitions, history, publications };
        });
        useFormUndo.setState(s => {
          const { [id]: _x, ...stacks } = s.stacks;
          return { stacks };
        });
      },

      /** Importe un JSON exporté (nouvel identifiant, lien court unique). → id */
      importForm: (json) => {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        return get().createForm(normalizeDefinition(data), 'Import JSON');
      },

      /** Enregistre une publication réussie (serveur). */
      recordPublication: (id, { version, serverFormId, slug, publishedAt = nowIso() }) => {
        const d = get().definitions[id];
        if (!d) return;
        const prev = get().publications[id] || { versions: [] };
        const hash = contentHash({ ...d, slug: slug || d.slug });
        set(s => ({
          publications: {
            ...s.publications,
            [id]: {
              ...prev,
              serverFormId: serverFormId || prev.serverFormId,
              publishedHash: hash,
              versions: [{ version, slug, publishedAt, hash }, ...(prev.versions || []).filter(v => v.version !== version)].slice(0, 200),
            },
          },
        }));
        write({ ...d, slug: slug || d.slug, status: 'published', publishedVersion: version, updatedAt: d.updatedAt });
        snapshot(id, `Publication v${version}`);
      },
    };
  },
});

/** Formulaire modifié depuis la dernière publication ? */
export function hasUnpublishedChanges(def, publication) {
  if (!def?.publishedVersion || !publication?.publishedHash) return false;
  return contentHash(def) !== publication.publishedHash;
}
