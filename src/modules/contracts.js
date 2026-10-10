// ============================================================
// CONTRATS DE DONNÉES INTER-MODULES
// ============================================================
// Source de vérité des formes de données partagées. Chaque module possède
// son store (src/modules/<module>/store.js, créé avec createModuleStore) et
// expose des actions ; les AUTRES modules lisent ses données via les
// sélecteurs exportés, jamais en écrivant directement dans son état.
//
// Identifiants : UUID (newId()). Dates : 'AAAA-MM-JJ' ; date-heure : ISO.
// Montants : nombres en euros (2 décimales), toujours POSITIFS ; le sens
// est porté par `type`.
// Liens : par id (memberId → store principal `members`, eventId → events…).
//
// ── finance (useFinanceStore, src/modules/finance/store.js) ──
// transactions: { [id]: {
//   id, date, type: 'income'|'expense', amount, label, categoryId,
//   method: 'virement'|'carte'|'especes'|'cheque'|'helloasso'|'autre',
//   status: 'draft'|'pending'|'validated'|'rejected',   // validation trésorier
//   eventId?, memberId?, membershipId?, counterparty?, reference?,
//   attachments: AttachmentMeta[],   // justificatifs (core/attachments.js)
//   notes?, createdBy?, validatedBy?, validatedAt?, createdAt, updatedAt } }
// categories: { [id]: { id, label, type: 'income'|'expense'|'both', color } }
// budgets: { [id]: { id, label, eventId?, year, lines: [{ categoryId, label, planned, type }] } }
// settings: { openingBalance, openingDate, fiscalYearStart: 'MM-DD', bankLabel }
//
// ── membership (useMembershipStore, src/modules/membership/store.js) ──
// memberships: { [id]: {
//   id, memberId, year: '2026-2027', amount, status: 'due'|'paid'|'exempt'|'refunded',
//   paidAt?, method?, transactionId?, receiptRef? (registre documents),
//   reminders: [{ at, channel: 'email'|'manuel' }], source?: 'manuel'|'helloasso'|'formulaire',
//   createdAt, updatedAt } }
// settings: { defaultAmount, reducedAmount, campaignYear, reminderTemplate,
//             dueDate? ('AAAA-MM-JJ' : date limite de paiement de la campagne, lue par l'agenda) }
//
// ── events (useEventsStore, src/modules/events/store.js) ──
// events: { [id]: {
//   id, title, description, type: 'soiree'|'sport'|'culture'|'reunion'|'ag'|'formation'|'autre',
//   status: 'draft'|'planned'|'open'|'done'|'cancelled',
//   start (ISO), end (ISO), location, poleId?, responsibleIds: memberId[],
//   capacity?, price?, budgetId?,                     // lien trésorerie
//   tasks: [{ id, title, assigneeId?, due?, done }],
//   volunteers: [{ id, memberId, role, slot? }],
//   participants: [{ id, name, email?, memberId?, status: 'registered'|'waitlist'|'present'|'absent'|'cancelled', paid?, transactionId? }],
//   review?: { summary, attendance, satisfaction?, lessons },
//   createdAt, updatedAt } }
//
// ── calendar (useCalendarStore, src/modules/calendar/store.js) ──
// reminders: { [id]: { id, title, date, time?, notes?, recurrence: 'none'|'weekly'|'monthly'|'yearly',
//                       category: 'conformite'|'finance'|'equipe'|'evenement'|'autre', done, doneAt?,
//                       doneDates?: string[] /* occurrences faites d'un rappel récurrent */ } }
// settings: { notifications: boolean, lastNotifiedAt?, agDate?, agIntervalMonths?,
//             insuranceRenewal?, insuranceLabel?, dirigeantsChange? }
// Composant réutilisable : src/modules/calendar/UpcomingWidget.jsx ({ limit }).
// + éléments CALCULÉS (non stockés) : événements, fins de mandat, AG annuelle,
//   déclaration des dirigeants (3 mois), échéances de cotisation, rappels.
//   → getAgendaItems(ctx) dans src/modules/calendar/agenda.js.
//
// ── handover (useHandoverStore, src/modules/handover/store.js) ──
// handovers: { [id]: { id, outgoingId, successorId?, roleId, status: 'draft'|'in_progress'|'done',
//                       steps: { [stepId]: { done, at?, note? } }, documentRefs: string[],
//                       startedAt, completedAt?, createdAt, updatedAt,
//                       handoverDate?, exitMode?, driveSnapshot?, vaultChecks?, finalChecks?, notes? } }
//
// ── documents avancés (store principal + useDocumentsExtraStore) ──
// customTemplates: { [id]: CustomTemplate }   (modèles personnalisés no-code)
// signatures: { [docLogId]: { signedAt, signerName, image } }   (circuit de signature)
// archives: { [id]: { id, title, category, date, attachment: AttachmentMeta, tags, notes } }
//
// AttachmentMeta = { id, name, type, size, createdAt }  (src/core/attachments.js)
// ============================================================

export const PAYMENT_METHODS = [
  { id: 'virement', label: 'Virement' },
  { id: 'carte', label: 'Carte bancaire' },
  { id: 'especes', label: 'Espèces' },
  { id: 'cheque', label: 'Chèque' },
  { id: 'helloasso', label: 'HelloAsso' },
  { id: 'autre', label: 'Autre' },
];

export const EVENT_TYPES = [
  { id: 'soiree', label: 'Soirée', emoji: '🎉' },
  { id: 'sport', label: 'Sport', emoji: '🏅' },
  { id: 'culture', label: 'Culture', emoji: '🎭' },
  { id: 'reunion', label: 'Réunion', emoji: '🗂️' },
  { id: 'ag', label: 'Assemblée générale', emoji: '🏛️' },
  { id: 'formation', label: 'Formation / atelier', emoji: '🎓' },
  { id: 'autre', label: 'Autre', emoji: '📌' },
];

export const EVENT_STATUSES = [
  { id: 'draft', label: 'Brouillon' },
  { id: 'planned', label: 'Planifié' },
  { id: 'open', label: 'Inscriptions ouvertes' },
  { id: 'done', label: 'Terminé' },
  { id: 'cancelled', label: 'Annulé' },
];

/** Arrondi monétaire (évite 0.1 + 0.2). */
export const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
