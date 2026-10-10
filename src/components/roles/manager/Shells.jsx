// Conteneurs accessibles : panneau plein écran et tiroir latéral (tablette).
import { useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PortalTargetContext } from './constants.js';
import { useDialogBehavior } from './hooks.js';

/**
 * Panneau plein écran (role="dialog", aria-modal). z-[90] : sous les
 * modales partagées (z-[100]) et les toasts (z-[120]) qui s'ouvrent par-dessus.
 */
export function FullscreenShell({ onClose, labelledBy, children }) {
  const panelRef = useRef(null);
  const [panelEl, setPanelEl] = useState(null);
  const setRef = useCallback((el) => { panelRef.current = el; setPanelEl(el); }, []);
  const onKeyDown = useDialogBehavior(panelRef, { onClose });

  return createPortal(
    <div
      ref={setRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[90] bg-base text-ink flex flex-col focus:outline-none"
    >
      <PortalTargetContext.Provider value={panelEl}>
        {children}
      </PortalTargetContext.Provider>
    </div>,
    document.body,
  );
}

/** Tiroir latéral droit (détail d'un rôle sur tablette). */
export function DetailDrawer({ onClose, labelledBy, children }) {
  const parentTarget = useContext(PortalTargetContext);
  const panelRef = useRef(null);
  const onKeyDown = useDialogBehavior(panelRef, { onClose });

  return createPortal(
    <div
      className="fixed inset-0 z-[92] flex justify-end bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="h-full w-full max-w-xl bg-surface border-l border-line shadow-2xl flex flex-col focus:outline-none animate-fade-in"
      >
        {children}
      </div>
    </div>,
    parentTarget || document.body,
  );
}
