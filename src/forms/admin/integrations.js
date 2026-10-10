// ============================================================
// ADMINISTRATION DES RÉPONSES — liens vers les autres briques
// ============================================================
// Modules développés en parallèle (automatisations, tâches, événements,
// centre de notifications, moteur de rôles) : lus via import.meta.glob pour
// que l'administration fonctionne même si l'un d'eux est absent.

// ── Client serveur des formulaires ──
export const formsApi = Object.values(import.meta.glob('../../backend/forms.js', { eager: true }))[0] || null;
const stateMod = Object.values(import.meta.glob('../../backend/state.js', { eager: true }))[0] || null;
export const useBackendState = stateMod?.useBackendState || null;

// ── Automatisations (store local : réponses locales, automatisations, journal) ──
const autoStoreMod = Object.values(import.meta.glob('../../automations/store.js', { eager: true }))[0] || null;
export const useAutomationsStore = autoStoreMod?.useAutomationsStore || null;

// Chargés à la demande (gros modules : actions vers tous les modules)
const lazyOne = (globbed) => { const f = Object.values(globbed)[0]; return f ? () => f() : null; };
/** Pipeline d'exécution (runActions, changeLocalResponseStatus…) s'il existe. */
export const loadAutomationPipeline = lazyOne(import.meta.glob('../../automations/pipeline.js'));
export const loadAutomationServer = lazyOne(import.meta.glob('../../automations/server.js'));
// ── Centre de notifications (module automatisations) ──
const notifLoader = lazyOne(import.meta.glob('../../automations/notifications.js'));
/**
 * Publie une notification dans le centre de notifications s'il existe.
 * → true si le centre l'a prise en charge, false sinon (repli : badge local).
 */
export async function pushNotification(n) {
  if (!notifLoader) return false;
  try {
    const mod = await notifLoader();
    const fn = mod.notify || mod.pushNotification || mod.addNotification
      || mod.useNotificationsStore?.getState?.().add || mod.useNotificationsStore?.getState?.().push;
    if (typeof fn !== 'function') return false;
    await fn(n);
    return true;
  } catch { return false; }
}
export const hasNotificationCenter = !!notifLoader;

// ── Tâches ──
const tasksLoader = lazyOne(import.meta.glob('../../modules/tasks/actions.js'));
export const hasTasks = !!tasksLoader;
export async function createTaskFor(input) {
  if (!tasksLoader) throw new Error('Le module Tâches n\'est pas disponible.');
  const mod = await tasksLoader();
  return mod.createTask(input);
}

// ── Événements ──
const eventsMod = Object.values(import.meta.glob('../../modules/events/store.js', { eager: true }))[0] || null;
const useEventsStore = eventsMod?.useEventsStore || null;
const EMPTY = {};
const selectEvents = s => s.events;
export const useEventsMap = useEventsStore ? () => useEventsStore(selectEvents) : () => EMPTY;

// ── File locale (mode borne / envois différés) ──
const queueLoader = lazyOne(import.meta.glob('../runtime/kioskQueue.js'));
export async function loadQueues() {
  if (!queueLoader) return [];
  try {
    const mod = await queueLoader();
    return [mod.kioskQueue, mod.outboxQueue].filter(Boolean);
  } catch { return []; }
}
