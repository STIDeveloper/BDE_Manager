// Hooks d'interface de la gestion des rôles (mise en page, glisser-déposer, dialogues).
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { reorderIds, sameOrder } from './helpers.js';

// ------------------------------------------------------------
// MISE EN PAGE RESPONSIVE
// ------------------------------------------------------------
// Choix UX : la disposition change réellement de structure (3 colonnes,
// 2 colonnes + tiroir, pas-à-pas mobile) et pas seulement de largeur : on
// lit donc les media queries en JS plutôt qu'avec des classes Tailwind.

const MQ_DESKTOP = '(min-width: 1024px)';
const MQ_TABLET = '(min-width: 768px)';

function subscribeLayout(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const lists = [window.matchMedia(MQ_DESKTOP), window.matchMedia(MQ_TABLET)];
  lists.forEach(l => l.addEventListener('change', callback));
  return () => lists.forEach(l => l.removeEventListener('change', callback));
}

function getLayoutSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia(MQ_DESKTOP).matches) return 'desktop';
  if (window.matchMedia(MQ_TABLET).matches) return 'tablet';
  return 'mobile';
}

/** 'desktop' (≥1024px) | 'tablet' (≥768px) | 'mobile' */
export function useLayoutMode() {
  return useSyncExternalStore(subscribeLayout, getLayoutSnapshot, () => 'desktop');
}

// ------------------------------------------------------------
// GLISSER-DÉPOSER HTML5 (alternative clavier : boutons ↑/↓)
// ------------------------------------------------------------

/**
 * @param {string[]} ids        ordre actuel
 * @param {(next:string[])=>void} onReorder  appelé seulement si l'ordre change
 */
export function useDragReorder(ids, onReorder) {
  const [drag, setDrag] = useState(null); // { id, overId, position }

  const getItemProps = (id) => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch { /* certains navigateurs refusent */ }
      setDrag({ id, overId: null, position: 'before' });
    },
    onDragOver: (e) => {
      // Une liste n'accepte que ses propres éléments (pas de dépôt inter-pôles).
      if (!drag || !ids.includes(drag.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      if (drag.overId !== id || drag.position !== position) {
        setDrag(d => (d ? { ...d, overId: id, position } : d));
      }
    },
    onDrop: (e) => {
      if (!drag || !ids.includes(drag.id)) return;
      e.preventDefault();
      const next = reorderIds(ids, drag.id, id, drag.position);
      setDrag(null);
      if (!sameOrder(next, ids)) onReorder(next);
    },
    onDragEnd: () => setDrag(null),
  });

  const dropIndicator = (id) => {
    if (!drag || drag.overId !== id || drag.id === id) return null;
    return drag.position;
  };

  return { getItemProps, draggingId: drag?.id ?? null, dropIndicator };
}

// ------------------------------------------------------------
// COMPORTEMENT DE DIALOGUE (plein écran, tiroir)
// ------------------------------------------------------------

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Focus initial + restauré, défilement de la page bloqué, Échap pour fermer
 * et focus piégé (Tab). Retourne le gestionnaire onKeyDown du panneau.
 * Les événements venant d'un dialogue « porté » ailleurs (Modal, menu) sont
 * ignorés : c'est la fenêtre au premier plan qui les gère.
 */
export function useDialogBehavior(panelRef, { onClose, initialFocusRef } = {}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => {
      (initialFocusRef?.current || panelRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [panelRef, initialFocusRef]);

  // Filet : si le focus est retombé sur <body> (élément supprimé, clic dans
  // le vide…), Échap doit quand même fermer le dialogue au premier plan.
  useEffect(() => {
    const onDocKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.activeElement && document.activeElement !== document.body) return;
      // Seul le dialogue le plus récent (dernier dans le DOM) réagit.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      e.preventDefault();
      onCloseRef.current?.();
    };
    document.addEventListener('keydown', onDocKeyDown);
    return () => document.removeEventListener('keydown', onDocKeyDown);
  }, [panelRef]);

  return useCallback((e) => {
    const panel = panelRef.current;
    if (!panel || !(e.target instanceof Node) || !panel.contains(e.target)) return;
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current?.();
      return;
    }
    if (e.key !== 'Tab') return;
    // Le dialogue le plus profond gère seul la tabulation.
    e.stopPropagation();
    const nodes = Array.from(panel.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }, [panelRef]);
}
