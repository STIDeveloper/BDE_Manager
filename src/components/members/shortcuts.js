// ============================================================
// RACCOURCIS CLAVIER — annuler / rétablir (helpers purs)
// ============================================================

const TYPING_TAGS = new Set(['input', 'textarea', 'select']);

/**
 * true si l'élément est un champ de saisie : on laisse alors le navigateur
 * gérer Ctrl+Z (annulation de la frappe) au lieu d'annuler une action du store.
 * Une fenêtre modale ouverte bloque aussi les raccourcis globaux.
 */
export function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = String(el.tagName || '').toLowerCase();
  if (TYPING_TAGS.has(tag)) return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === 'function' && el.closest('[contenteditable=""],[contenteditable="true"],[aria-modal="true"]')) return true;
  return false;
}

/**
 * Action correspondant à un évènement clavier :
 *  - Ctrl/Cmd+Z → 'undo'
 *  - Ctrl/Cmd+Shift+Z, Ctrl+Y → 'redo'
 * `e.key` vaut 'Z' (majuscule) avec Maj ou Verr. Maj : on compare en minuscules.
 * @returns {'undo'|'redo'|null}
 */
export function undoShortcutAction(e) {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const key = String(e.key || '').toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !e.shiftKey) return 'redo';
  return null;
}
