// ============================================================
// STUDIO FORMULAIRES — liens vers les autres briques (sans dépendance d'ordre)
// ============================================================
// Le moteur d'affichage (src/forms/runtime/FormRenderer.jsx), le client
// serveur (src/backend/forms.js) et le store des événements peuvent être
// absents pendant le développement : lus via import.meta.glob.

import { lazy, useMemo } from 'react';
import { useStore } from '../../store.js';
import { useCatalog } from '../../core/useCatalog.js';

// ── Moteur d'affichage ──
const rendererLoader = Object.values(import.meta.glob('../../forms/runtime/FormRenderer.jsx'))[0] || null;
export const FormRenderer = rendererLoader ? lazy(rendererLoader) : null;

// Avertissements de thème calculés par le rendu (contraste effectif)
const themeMod = Object.values(import.meta.glob('../../forms/runtime/theme.js', { eager: true }))[0] || null;
/** Préréglages du moteur d'affichage (source de vérité des thèmes). */
export const runtimeThemePresets = Array.isArray(themeMod?.THEME_PRESETS) ? themeMod.THEME_PRESETS : null;
export const runtimeThemeWarnings = typeof themeMod?.themeWarnings === 'function' ? themeMod.themeWarnings : null;

// ── Client serveur ──
export const formsApi = Object.values(import.meta.glob('../../backend/forms.js', { eager: true }))[0] || null;
const stateMod = Object.values(import.meta.glob('../../backend/state.js', { eager: true }))[0] || null;
const useBackendStateHook = stateMod?.useBackendState || null;
const selectWorkspace = s => s.workspaceId;
const useNoWorkspace = () => null;
/** Id de l'espace collaboratif connecté (null en mode local). */
export const useWorkspaceId = useBackendStateHook ? () => useBackendStateHook(selectWorkspace) : useNoWorkspace;

// ── Événements (module events) ──
const eventsMod = Object.values(import.meta.glob('../events/store.js', { eager: true }))[0] || null;
const useEventsStore = eventsMod?.useEventsStore || null;
const selectEvents = s => s.events;
const EMPTY = {};
const useNoEvents = () => EMPTY;
const useEventsMap = useEventsStore ? () => useEventsStore(selectEvents) : useNoEvents;

/**
 * Contexte passé au rendu (aperçu) : données du BDE pour les sources
 * (membres, événements, rôles, pôles) et les sélecteurs.
 */
export function useRendererContext() {
  const members = useStore(s => s.members);
  const eventsMap = useEventsMap();
  const { roleList, poleList } = useCatalog();
  return useMemo(() => {
    const memberOpts = (members || []).map(m => ({
      value: m.id,
      label: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name || m.email || 'Membre',
    }));
    const eventOpts = Object.values(eventsMap || {})
      .filter(e => e && e.status !== 'cancelled')
      .sort((a, b) => String(b.start || '').localeCompare(String(a.start || '')))
      .map(e => ({ value: e.id, label: e.title || 'Événement' }));
    const roleOpts = (roleList || []).map(r => ({ value: r.id, label: r.label || r.name || r.id }));
    const poleOpts = (poleList || []).map(p => ({ value: p.id, label: p.label || p.name || p.id }));
    return {
      mode: 'preview',
      now: new Date(),
      member: null,
      params: {},
      // Forme attendue par FormRenderer (sélecteurs) : [{ id, label }]
      members: memberOpts.map(o => ({ id: o.value, label: o.label })),
      events: eventOpts.map(o => ({ id: o.value, label: o.label })),
      sources: { members: memberOpts, events: eventOpts, roles: roleOpts, poles: poleOpts },
      lookup: { members: memberOpts.map(o => o.value), events: eventOpts.map(o => o.value) },
    };
  }, [members, eventsMap, roleList, poleList]);
}

/** Lien public d'un formulaire. */
export function publicLink(slug) {
  const base = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  return `${base}#/f/${slug}`;
}

const resolvedCache = new WeakMap();
/**
 * Remplace les choix « source » (membres, événements, rôles, pôles) par des
 * options figées issues des données du BDE : utilisé pour l'aperçu et à la
 * publication (le répondant n'a pas accès aux données internes).
 */
export function resolveSources(def, context) {
  if (!def || !context?.sources) return def;
  const byCtx = resolvedCache.get(def);
  if (byCtx?.ctx === context) return byCtx.out;
  let changed = false;
  const walk = items => (items || []).map(it => {
    if (it.kind === 'section') return { ...it, items: walk(it.items) };
    if (it.kind === 'columns') return { ...it, columns: (it.columns || []).map(walk) };
    if (it.kind === 'question' && it.source && !(Array.isArray(it.options) && it.options.length)) {
      const list = context.sources[it.source];
      if (Array.isArray(list)) { changed = true; return { ...it, options: list.map(o => ({ value: String(o.value), label: o.label })) }; }
    }
    return it;
  });
  const pages = def.pages.map(p => ({ ...p, items: walk(p.items) }));
  const out = changed ? { ...def, pages } : def;
  resolvedCache.set(def, { ctx: context, out });
  return out;
}
