// ============================================================
// PASSATIONS — store du module (voir src/modules/contracts.js)
// ============================================================
// handovers : { [id]: { id, outgoingId, successorId?, roleId,
//   status: 'draft'|'in_progress'|'done',
//   steps: { [stepId]: { done, at?, note? } }, documentRefs: string[],
//   startedAt, completedAt?, createdAt, updatedAt } }
// Champs ajoutés au contrat (facultatifs, ignorables par les autres modules) :
//   handoverDate ('AAAA-MM-JJ'), exitMode ('clear'|'keep'),
//   driveSnapshot ({ [folderId]: niveau } : accès du sortant avant retrait,
//     pour le script de retrait), vaultChecks ({ [entryId]: { label, done, at } }),
//   finalChecks ({ [checkId]: boolean }), notes.
// Les modifications des membres / accès Drive passent par les actions du
// store principal (annulables par Ctrl+Z) ; ce store ne garde que le suivi.
// ============================================================

import { createModuleStore, newId, nowIso } from '../../core/createModuleStore.js';

export const HANDOVER_STATUS = {
  draft: { label: 'À démarrer', badge: 'badge-neutral' },
  in_progress: { label: 'En cours', badge: 'badge-amber' },
  done: { label: 'Terminée', badge: 'badge-emerald' },
};

export const useHandoverStore = createModuleStore({
  name: 'handover',
  label: 'Passations',
  version: 1,
  initialState: { handovers: {} },
  slices: [{ key: 'handovers', kind: 'map', capability: 'handover', sensitive: true }],
  actions: (set, get, h) => {
    const read = (id) => get().handovers[id];
    // Remplacement complet (h.upsert fusionne et ne permet pas de retirer une clé).
    const patch = (id, fn) => {
      const cur = read(id);
      if (!cur) return null;
      const next = { ...fn(cur), id, createdAt: cur.createdAt, updatedAt: nowIso() };
      set(s => ({ handovers: { ...s.handovers, [id]: next } }));
      return next;
    };
    return {
      /** Crée une passation (statut « en cours ») et renvoie son id. */
      createHandover: ({ outgoingId, roleId = '', successorId = '', handoverDate = '' }) => {
        if (!outgoingId) throw new Error('Titulaire sortant requis');
        const t = nowIso();
        const rec = h.upsert('handovers', {
          id: newId(), outgoingId, roleId, ...(successorId ? { successorId } : {}),
          handoverDate, status: 'in_progress', steps: {}, documentRefs: [],
          startedAt: t,
        });
        return rec.id;
      },
      updateHandover: (id, data) => patch(id, (cur) => {
        const next = { ...cur, ...data, id };
        if ('successorId' in data && !data.successorId) delete next.successorId;
        return next;
      }),
      /** Enregistre l'état d'une étape (done, note) avec horodatage. */
      setStep: (id, stepId, { done = true, note } = {}) => patch(id, (cur) => ({
        ...cur,
        status: cur.status === 'draft' ? 'in_progress' : cur.status,
        steps: {
          ...cur.steps,
          [stepId]: { ...(cur.steps?.[stepId] || {}), done: !!done, at: nowIso(), ...(note !== undefined ? { note } : {}) },
        },
      })),
      addDocumentRefs: (id, refs = []) => patch(id, (cur) => ({
        ...cur, documentRefs: [...new Set([...(cur.documentRefs || []), ...refs.filter(Boolean)])],
      })),
      setVaultCheck: (id, entryId, label, done) => patch(id, (cur) => ({
        ...cur, vaultChecks: { ...(cur.vaultChecks || {}), [entryId]: { label, done: !!done, at: nowIso() } },
      })),
      setFinalCheck: (id, checkId, done) => patch(id, (cur) => ({
        ...cur, finalChecks: { ...(cur.finalChecks || {}), [checkId]: !!done },
      })),
      completeHandover: (id) => patch(id, (cur) => ({
        ...cur, status: 'done', completedAt: nowIso(),
        steps: { ...cur.steps, closing: { done: true, at: nowIso() } },
      })),
      reopenHandover: (id) => patch(id, (cur) => {
        const { completedAt: _c, ...rest } = cur;
        return { ...rest, status: 'in_progress', steps: { ...cur.steps, closing: { ...(cur.steps?.closing || {}), done: false } } };
      }),
      deleteHandover: (id) => h.remove('handovers', id),
    };
  },
});

/** Liste triée (récentes d'abord) — dériver avec useMemo. */
export const listHandovers = (map) => Object.values(map || {})
  .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
