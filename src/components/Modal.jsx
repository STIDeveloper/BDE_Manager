import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Pile des dialogues ouverts : seule la fenêtre au premier plan réagit à
// Échap (une confirmation ouverte par-dessus une modale ne ferme pas les deux).
const openStack = [];

/**
 * Boîte de dialogue accessible, commune à toute l'application :
 * role="dialog", aria-modal, focus initial + piégé + restauré, Échap,
 * clic sur le fond pour fermer, défilement de la page bloqué.
 * Sur mobile, s'affiche en « bottom sheet ».
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  maxWidth = 'max-w-lg',
  closeDisabled = false,
}) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();

  // Dernières versions des callbacks sans relancer l'effet de focus.
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const token = {};
    openStack.push(token);
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Le DOM du dialogue est déjà monté quand l'effet s'exécute : focus
    // immédiat (ne dépend pas du rendu graphique, contrairement à rAF).
    const target = initialFocusRef?.current
      || panelRef.current?.querySelector('[data-autofocus]')
      || panelRef.current?.querySelector(FOCUSABLE)
      || panelRef.current;
    target?.focus();

    return () => {
      const i = openStack.indexOf(token);
      if (i !== -1) openStack.splice(i, 1);
      if (openStack.length === 0) document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen, initialFocusRef]);

  if (!isOpen) return null;

  const requestClose = () => {
    if (!closeDisabledRef.current) onCloseRef.current?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (nodes.length === 0) { e.preventDefault(); return; }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`bg-surface border border-line rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[92vh] flex flex-col focus:outline-none animate-fade-in`}
      >
        <div className="flex justify-between items-start gap-3 p-4 border-b border-line shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="font-bold text-lg text-ink">{title}</h3>
            {description && <p id={descId} className="text-sm text-dim mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={closeDisabled}
            aria-label="Fermer la fenêtre"
            className="shrink-0 text-dim hover:text-ink transition-colors p-1.5 -m-1 rounded-lg disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
        {footer && <div className="p-4 border-t border-line shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
