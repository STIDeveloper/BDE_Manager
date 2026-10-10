// ============================================================
// MODULE « DOCS » — données avancées du studio documents
// ============================================================
// customTemplates : { [id]: CustomTemplate }   (voir documents/customTemplates.js)
// signatures      : { [docLogId]: { id, logId, ref, memberId, signerName, signedAt,
//                     image, blockId, slotIndex, approved: true } }
// archives        : { [id]: { id, title, category, date, attachment: AttachmentMeta,
//                     tags: string[], notes, createdAt, updatedAt } }
// L'écran reste l'onglet « Documents » (components/documents/) : pas de Page.jsx.
// Les modèles personnalisés sont branchés sur le registre des modèles
// (documents/registry.js) : la galerie se met à jour en direct.
// ============================================================

import { createModuleStore } from '../../core/createModuleStore.js';
import { setCustomTemplateSource } from '../../documents/registry.js';
import { normalizeCustomTemplate, CUSTOM_PREFIX } from '../../documents/customTemplates.js';

export const ARCHIVE_CATEGORIES = [
  { id: 'statuts', label: 'Statuts & règlement' },
  { id: 'prefecture', label: 'Préfecture / greffe' },
  { id: 'ag', label: 'Assemblées générales' },
  { id: 'contrat', label: 'Contrats & conventions' },
  { id: 'banque', label: 'Banque & assurance' },
  { id: 'finance', label: 'Comptabilité' },
  { id: 'autre', label: 'Autre' },
];

const isDataImage = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v) && v.length < 600_000;

export const useDocsStore = createModuleStore({
  name: 'docs',
  label: 'Documents avancés (modèles, signatures, archives)',
  version: 1,
  initialState: { customTemplates: {}, signatures: {}, archives: {} },
  slices: [
    { key: 'customTemplates', kind: 'map', capability: 'documents' },
    { key: 'signatures', kind: 'map', capability: 'documents', sensitive: true },
    { key: 'archives', kind: 'map', capability: 'documents' },
  ],
  actions: (set, get, h) => ({
    /** Crée ou remplace un modèle personnalisé. @returns l'enregistrement normalisé */
    saveCustomTemplate: (record) => {
      const prev = record?.id ? get().customTemplates[record.id] : null;
      const id = prev ? prev.id : (record?.id && !get().customTemplates[record.id] ? record.id : `${CUSTOM_PREFIX}${h.newId()}`);
      const t = h.nowIso();
      const rec = { ...normalizeCustomTemplate({ ...record, id }), createdAt: prev?.createdAt || t, updatedAt: t };
      set(s => ({ customTemplates: { ...s.customTemplates, [id]: rec } }));
      return rec;
    },
    removeCustomTemplate: (id) => h.remove('customTemplates', id),

    /** Enregistre la signature d'un document émis (entrée du registre). */
    recordSignature: (logId, sig) => {
      if (!logId) throw new Error('Document inconnu.');
      if (!isDataImage(sig?.image)) throw new Error('Signature invalide ou trop lourde.');
      const rec = {
        id: logId,
        logId,
        ref: String(sig.ref || ''),
        memberId: sig.memberId || null,
        signerName: String(sig.signerName || '').slice(0, 120),
        signedAt: sig.signedAt || h.nowIso(),
        image: sig.image,
        blockId: sig.blockId || null,
        slotIndex: Number.isInteger(sig.slotIndex) ? sig.slotIndex : 0,
        approved: true,
      };
      set(s => ({ signatures: { ...s.signatures, [logId]: rec } }));
      return rec;
    },
    removeSignature: (logId) => h.remove('signatures', logId),

    addArchive: (data) => h.upsert('archives', {
      id: h.newId(),
      title: String(data.title || data.attachment?.name || 'Sans titre').slice(0, 200),
      category: ARCHIVE_CATEGORIES.some(c => c.id === data.category) ? data.category : 'autre',
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : new Date().toISOString().slice(0, 10),
      attachment: data.attachment,
      tags: (data.tags || []).map(t => String(t).trim()).filter(Boolean).slice(0, 20),
      notes: String(data.notes || '').slice(0, 4000),
    }),
    updateArchive: (id, patch) => {
      const prev = get().archives[id];
      if (!prev) return null;
      return h.upsert('archives', { ...prev, ...patch, id, attachment: prev.attachment });
    },
    removeArchive: (id) => h.remove('archives', id),
  }),
});

// Alias du contrat (src/modules/contracts.js : « useDocumentsExtraStore »).
export const useDocumentsExtraStore = useDocsStore;

// Branche les modèles personnalisés sur le registre des modèles.
setCustomTemplateSource({
  getRecords: () => useDocsStore.getState().customTemplates,
  subscribe: (fn) => useDocsStore.subscribe((s, prev) => { if (s.customTemplates !== prev.customTemplates) fn(); }),
});
