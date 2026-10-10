// Menu d'actions accessible (bouton « ⋯ »).
// Choix UX : pas d'actions qui n'apparaissent qu'au survol (inutilisable au
// doigt). Les actions secondaires sont regroupées ici ; le menu est « porté »
// en position fixe pour ne jamais être rogné par une colonne défilante.
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { FOCUS_RING, PortalTargetContext } from './constants.js';

const MENU_WIDTH = 216;
const ITEM_HEIGHT = 40;

/**
 * @param {{label:string, items:{id:string,label:string,icon?:any,onSelect:()=>void,danger?:boolean,disabled?:boolean}[]}} props
 */
export default function ActionMenu({ label, items }) {
  const [pos, setPos] = useState(null); // null = fermé
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const portalTarget = useContext(PortalTargetContext);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const height = items.length * ITEM_HEIGHT + 8;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const below = window.innerHeight - r.bottom;
    const top = below < height + 8 && r.top > height + 8 ? r.top - height - 4 : r.bottom + 4;
    setPos({ top, left });
  };

  const closeMenu = (refocus = true) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!pos) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    const onPointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setPos(null);
    };
    // Un défilement / redimensionnement rendrait la position fausse → on ferme.
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) setPos(null); };
    const onResize = () => setPos(null);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [pos]);

  const onMenuKeyDown = (e) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || []);
    const i = nodes.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nodes[(i + 1) % nodes.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      nodes[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    }
  };

  const onButtonKeyDown = (e) => {
    if (e.key === 'ArrowDown' && !pos) {
      e.preventDefault();
      openMenu();
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        aria-controls={pos ? menuId : undefined}
        onClick={() => (pos ? closeMenu(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 text-dim hover:text-ink hover:bg-elevated ${pos ? 'bg-elevated text-ink' : ''} ${FOCUS_RING}`}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {pos && createPortal(
        <ul
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="fixed z-[96] bg-surface border border-line rounded-xl shadow-xl p-1 animate-fade-in"
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
        >
          {items.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => { closeMenu(true); item.onSelect(); }}
                  className={`w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-sm text-left disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING} ${
                    item.danger
                      ? 'text-red-500 hover:bg-red-500/10 focus:bg-red-500/10'
                      : 'text-ink hover:bg-elevated focus:bg-elevated'
                  }`}
                >
                  {Icon && <Icon size={15} aria-hidden="true" className="shrink-0" />}
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>,
        portalTarget || document.body,
      )}
    </>
  );
}
