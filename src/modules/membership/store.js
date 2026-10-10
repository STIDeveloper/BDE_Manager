// ============================================================
// ADHÉSIONS & COTISATIONS — store du module (voir src/modules/contracts.js)
// ============================================================
// Une cotisation = un membre (store principal) × une année universitaire.
// Le paiement crée une recette liée dans la trésorerie (catégorie
// « cotisations », membershipId) et met à jour feePaidAt / feeAmount sur la
// fiche du membre (cohérence des modèles de documents).
// Champs ajoutés au contrat (facultatifs) : tariff ('normal'|'reduit'|'libre'),
// reference, refundTransactionId, notes.
// ============================================================

import { createModuleStore, newId } from '../../core/createModuleStore.js';
import { roundMoney } from '../contracts.js';
import { academicYear, isoDate } from '../../documents/context.js';
import { useStore } from '../../store.js';
import { useFinanceStore, COTISATION_CATEGORY_ID } from '../finance/store.js';

export const MEMBERSHIP_STATUS = {
  due: { label: 'À payer', badge: 'badge-amber' },
  paid: { label: 'Payée', badge: 'badge-emerald' },
  exempt: { label: 'Exonéré', badge: 'badge-violet' },
  refunded: { label: 'Remboursée', badge: 'badge-neutral' },
};

export const DEFAULT_REMINDER = {
  subject: 'Cotisation {annee} — petit rappel',
  body: 'Bonjour {prenom},\n\nSauf erreur de notre part, ta cotisation au BDE pour l\'année {annee} ({montant}) n\'a pas encore été réglée.\n\nTu peux la payer en ligne ou auprès d\'un membre du bureau.\n\nMerci et à bientôt !\nLe bureau',
};

/** Date limite par défaut : 31 octobre de l'année de début de campagne. */
export const defaultDueDate = (campaignYear) => `${String(campaignYear || academicYear()).slice(0, 4)}-10-31`;

export const DEFAULT_MEMBERSHIP_SETTINGS = {
  defaultAmount: 10,
  reducedAmount: 5,
  campaignYear: academicYear(),
  reminderTemplate: DEFAULT_REMINDER,
  dueDate: defaultDueDate(academicYear()), // date limite de paiement (lue par l'agenda)
};

const now = () => new Date().toISOString();

/** Cotisation d'un membre pour une année (ou undefined). */
export const findMembership = (memberships, memberId, year) =>
  Object.values(memberships || {}).find(m => m.memberId === memberId && m.year === year);

function memberLabel(memberId) {
  const m = useStore.getState().members.find(x => x.id === memberId);
  return m ? [m.firstName, m.lastName].filter(Boolean).join(' ') : 'membre';
}

export const useMembershipStore = createModuleStore({
  name: 'membership',
  label: 'Adhésions',
  version: 2,
  initialState: {
    memberships: {},
    settings: { ...DEFAULT_MEMBERSHIP_SETTINGS },
  },
  slices: [
    { key: 'memberships', kind: 'map', capability: 'membership', sensitive: true },
    { key: 'settings', kind: 'singleton', capability: 'membership' },
  ],
  actions: (set, get, h) => {
    /** Crée (ou renvoie) l'enregistrement d'un membre pour une année. */
    const ensure = (memberId, year) => {
      const existing = findMembership(get().memberships, memberId, year);
      if (existing) return existing;
      return h.upsert('memberships', {
        id: newId(), memberId, year, amount: roundMoney(get().settings.defaultAmount), status: 'due', reminders: [], source: 'manuel',
      });
    };

    return {
      ensureMembership: ensure,

      /**
       * Enregistre un paiement : cotisation « payée » + recette validée liée +
       * champs administratifs du membre. Renvoie la cotisation.
       */
      markPaid: (memberId, year, { amount, paidAt, method = 'especes', reference = '', tariff = 'normal', source = 'manuel', validatedBy = '' } = {}) => {
        const ms = ensure(memberId, year);
        const value = roundMoney(Math.abs(Number(amount) || 0));
        const date = paidAt || isoDate();
        const finance = useFinanceStore.getState();
        let transactionId = ms.transactionId;
        const txData = {
          date, type: 'income', amount: value, label: `Cotisation ${year} — ${memberLabel(memberId)}`,
          categoryId: COTISATION_CATEGORY_ID, method, memberId, membershipId: ms.id, reference,
          status: 'validated', validatedBy, validatedAt: now(), createdBy: validatedBy, attachments: [],
        };
        if (transactionId && finance.transactions[transactionId]) finance.updateTransaction(transactionId, txData);
        else transactionId = finance.addTransaction(txData).id;
        const next = h.upsert('memberships', {
          ...get().memberships[ms.id], amount: value, status: 'paid', paidAt: date, method, reference, tariff, source, transactionId,
        });
        useStore.getState().updateMember(memberId, { feePaidAt: date, feeAmount: value });
        return next;
      },

      /**
       * Annule un paiement : la cotisation repasse « à payer ». Si
       * `deleteTransaction`, la recette liée est supprimée ; sinon elle est
       * conservée mais déliée (membershipId retiré).
       */
      cancelPayment: (id, { deleteTransaction = true } = {}) => {
        const ms = get().memberships[id];
        if (!ms) return;
        const finance = useFinanceStore.getState();
        if (ms.transactionId && finance.transactions[ms.transactionId]) {
          if (deleteTransaction) finance.deleteTransaction(ms.transactionId);
          else finance.updateTransaction(ms.transactionId, { membershipId: undefined });
        }
        h.upsert('memberships', { ...ms, status: 'due', paidAt: '', method: '', transactionId: undefined, receiptRef: '' });
        const member = useStore.getState().members.find(m => m.id === ms.memberId);
        if (member && member.feePaidAt === ms.paidAt) useStore.getState().updateMember(ms.memberId, { feePaidAt: '', feeAmount: '' });
      },

      /** Appelé par la trésorerie quand une recette liée est supprimée. */
      onTransactionDeleted: (membershipId, transactionId) => {
        const ms = get().memberships[membershipId];
        if (!ms || ms.transactionId !== transactionId) return;
        h.upsert('memberships', { ...ms, status: 'due', paidAt: '', method: '', transactionId: undefined, receiptRef: '' });
        const member = useStore.getState().members.find(m => m.id === ms.memberId);
        if (member && member.feePaidAt === ms.paidAt) useStore.getState().updateMember(ms.memberId, { feePaidAt: '', feeAmount: '' });
      },

      setExempt: (memberId, year, exempt = true) => {
        const ms = ensure(memberId, year);
        h.upsert('memberships', { ...get().memberships[ms.id], status: exempt ? 'exempt' : 'due', amount: exempt ? 0 : roundMoney(get().settings.defaultAmount) });
      },

      /** Remboursement : statut « remboursée » + dépense (en attente de validation). */
      refund: (id, { method = 'virement', by = '' } = {}) => {
        const ms = get().memberships[id];
        if (!ms || ms.status !== 'paid') return null;
        const tx = useFinanceStore.getState().addTransaction({
          date: isoDate(), type: 'expense', amount: ms.amount, label: `Remboursement cotisation ${ms.year} — ${memberLabel(ms.memberId)}`,
          categoryId: COTISATION_CATEGORY_ID, method, memberId: ms.memberId, membershipId: ms.id, status: 'pending', createdBy: by, attachments: [],
        });
        return h.upsert('memberships', { ...ms, status: 'refunded', refundTransactionId: tx.id });
      },

      setReceiptRef: (id, receiptRef) => {
        const ms = get().memberships[id];
        if (ms) h.upsert('memberships', { ...ms, receiptRef });
      },

      /** Ajoute une relance à plusieurs membres (crée les cotisations « à payer » si besoin). */
      addReminders: (memberIds, year, channel = 'email') => {
        const at = now();
        memberIds.forEach(memberId => {
          const ms = ensure(memberId, year);
          const cur = get().memberships[ms.id];
          h.upsert('memberships', { ...cur, reminders: [...(cur.reminders || []), { at, channel }] });
        });
      },

      deleteMembership: (id) => h.remove('memberships', id),

      updateSettings: (patch) => set(s => ({ settings: { ...s.settings, ...patch, updatedAt: now() } })),
    };
  },
  // v2 : ajout de settings.dueDate (date limite de la campagne).
  migrate: (persisted) => {
    const settings = { ...DEFAULT_MEMBERSHIP_SETTINGS, ...(persisted?.settings || {}) };
    if (!settings.dueDate) settings.dueDate = defaultDueDate(settings.campaignYear);
    return { ...persisted, settings };
  },
});
