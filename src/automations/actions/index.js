// ============================================================
// CATALOGUE DES ACTIONS D'AUTOMATISATION
// ============================================================
// Action = { id, label, description, module, icon, capability: [famille, niveau],
//   params: [{ key, label, type, required?, default?, options?, help?, mappable? }],
//   run(params résolus, ctx) → { ok, summary, links?, output? } (async possible) }
// Types de paramètres (éditeur) : text, textarea, number, boolean, select,
//   member, members, event, board, column-tasks, column-members, template,
//   status, role, roles, category, keyvalues.
// Un paramètre « mappable » (par défaut) accepte jetons {reponse.cle} et
// formules « = … » (voir ../mapping.js).
// ctx : { simulate, key, automation, response, definition, scope, outputs,
//   user, connected, formsApi, warn(msg), statusLabel(id), setResponseStatus(id) }
// En simulation (ctx.simulate), une action ne fait AUCUNE écriture : elle
// décrit ce qu'elle ferait.
// ============================================================

import { memberUpsert, candidateAdd } from './members.js';
import { documentIssue, eventRegister, financeTransaction, membershipPaid, taskCreate, calendarReminder } from './activities.js';
import { responseStatus, emailSend, appNotify } from './communication.js';

export const ACTIONS = [
  memberUpsert, candidateAdd, documentIssue, eventRegister, financeTransaction,
  membershipPaid, taskCreate, calendarReminder, responseStatus, emailSend, appNotify,
];

export const ACTIONS_BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
export const getAction = (id) => ACTIONS_BY_ID[id] || null;

/** Paramètres par défaut d'une action. */
export function defaultParams(actionId) {
  const a = getAction(actionId);
  if (!a) return {};
  return Object.fromEntries(a.params.filter(p => p.default !== undefined).map(p => [p.key, p.default]));
}

export { ActionError } from './helpers.js';
