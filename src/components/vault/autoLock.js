// ============================================================
// VERROUILLAGE AUTOMATIQUE DU COFFRE
// ------------------------------------------------------------
// Module global (pas un composant) : il suit `_vaultKey` dans le store,
// donc l'auto-verrouillage continue même si l'utilisateur quitte
// l'onglet "Coffre-fort" de l'app.
//  - 5 min sans activité (souris / clavier / tactile / molette) → verrouillage
//  - onglet du navigateur masqué plus d'1 min → verrouillage
// ============================================================
import { create } from 'zustand';
import { useStore } from '../../store';
import { toast } from '../ui/toastStore';

export const IDLE_LOCK_MS = 5 * 60 * 1000;
export const HIDDEN_LOCK_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 1000;
const ACTIVITY_THROTTLE_MS = 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focusin'];

/** Échéance (timestamp ms) du prochain verrouillage pour inactivité, null si coffre verrouillé. */
export const useAutoLockClock = create(() => ({ deadline: null }));

let running = false;
let intervalId = null;
let hiddenTimeoutId = null;
let hiddenAt = null;
let lastBump = 0;

function lockNow(reason) {
  const s = useStore.getState();
  if (!s._vaultKey) return;
  s.vaultLock();
  toast.info(reason, 'Coffre-fort verrouillé');
}

function bump() {
  const now = Date.now();
  if (now - lastBump < ACTIVITY_THROTTLE_MS) return;
  lastBump = now;
  useAutoLockClock.setState({ deadline: now + IDLE_LOCK_MS });
}

function check() {
  const now = Date.now();
  if (hiddenAt !== null && now - hiddenAt >= HIDDEN_LOCK_MS) {
    lockNow('Onglet masqué depuis plus d\'une minute.');
    return;
  }
  const { deadline } = useAutoLockClock.getState();
  if (deadline !== null && now >= deadline) {
    lockNow('Verrouillage automatique après 5 min d\'inactivité.');
  }
}

function onVisibility() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    clearTimeout(hiddenTimeoutId);
    // Les timers en arrière-plan sont ralentis par le navigateur : on vérifie aussi au retour.
    hiddenTimeoutId = setTimeout(check, HIDDEN_LOCK_MS + 50);
  } else {
    clearTimeout(hiddenTimeoutId);
    check(); // verrouille si l'onglet est resté masqué trop longtemps
    hiddenAt = null;
    if (useStore.getState()._vaultKey) { lastBump = 0; bump(); }
  }
}

function start() {
  if (running || typeof window === 'undefined') return;
  running = true;
  hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
  lastBump = 0;
  bump();
  ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, bump, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', onVisibility);
  intervalId = setInterval(check, CHECK_INTERVAL_MS);
}

function stop() {
  if (!running) return;
  running = false;
  ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, bump, { capture: true }));
  document.removeEventListener('visibilitychange', onVisibility);
  clearInterval(intervalId);
  clearTimeout(hiddenTimeoutId);
  intervalId = null;
  hiddenTimeoutId = null;
  hiddenAt = null;
  useAutoLockClock.setState({ deadline: null });
}

function sync(state) {
  if (state._vaultKey) start();
  else stop();
}

const unsubscribe = useStore.subscribe((state, prev) => {
  if (!!state._vaultKey !== !!prev._vaultKey) sync(state);
});
sync(useStore.getState());

if (import.meta.hot) {
  import.meta.hot.dispose(() => { unsubscribe(); stop(); });
}
