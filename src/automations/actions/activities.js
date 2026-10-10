// Actions vers les modules d'activité : documents, événements, trésorerie,
// adhésions, tâches, agenda. Chaque action passe par l'API publique du
// module concerné (jamais d'écriture directe dans son état).
import { useStore } from '../../store.js';
import { issueDocuments } from '../../documents/issue.js';
import { getTemplate } from '../../documents/registry.js';
import { formatMoney } from '../../documents/context.js';
import { useEventsStore } from '../../modules/events/store.js';
import { participantKey } from '../../modules/events/logic.js';
import { useFinanceStore } from '../../modules/finance/store.js';
import { useMembershipStore, findMembership } from '../../modules/membership/store.js';
import { createTask, findBoard } from '../../modules/tasks/actions.js';
import { useTasksStore } from '../../modules/tasks/store.js';
import { useCalendarStore } from '../../modules/calendar/store.js';
import { can } from '../../core/permissions.js';
import { PAYMENT_METHODS } from '../../modules/contracts.js';
import { str, toAmount, toList, toBool, isoDay, addDays, fail, memberName, EMAIL_RX, SIM_ID, SIM_MEMBER } from './helpers.js';

const memberById = (id) => useStore.getState().members.find(m => m.id === id) || null;
/** Membre réel, ou membre fictif « qui serait créé » en simulation. */
const memberFor = (id, ctx) => (ctx.simulate && id === SIM_ID ? SIM_MEMBER : memberById(id));

// ── Document officiel ───────────────────────────────────────
export const documentIssue = {
  id: 'document.issue',
  label: 'Émettre un document',
  description: 'Émet un document officiel numéroté (modèle + membre + valeurs) et l\'inscrit au registre. Format « registre seulement » : aucun fichier téléchargé.',
  module: 'Documents',
  icon: 'FileBadge',
  capability: ['documents', 'write'],
  params: [
    { key: 'templateId', label: 'Modèle', type: 'template', required: true, default: 'attestation-adhesion', mappable: false },
    { key: 'memberId', label: 'Membre concerné', type: 'member', default: '{membre.id}', help: 'Par défaut : le membre créé / retrouvé à une étape précédente.' },
    { key: 'values', label: 'Valeurs du modèle', type: 'keyvalues', help: 'Clé du champ du modèle → valeur (texte, jeton ou formule).' },
    { key: 'format', label: 'Format', type: 'select', default: 'none', mappable: false, options: [
      { value: 'none', label: 'Registre seulement (aucun fichier)' }, { value: 'pdf', label: 'PDF téléchargé' },
    ] },
  ],
  async run(p, ctx) {
    const template = getTemplate(str(p.templateId));
    if (!template) fail(`Modèle de document inconnu : ${str(p.templateId) || '(vide)'}.`);
    const scoped = template.scope === 'member';
    const memberId = str(p.memberId);
    const member = memberId ? memberFor(memberId, ctx) : null;
    if (scoped && !member) fail('Membre introuvable : ajoute d\'abord une étape « Créer / mettre à jour un membre » ou mappe un membre.');
    // Idempotence : un document par exécution et par étape.
    const already = (useStore.getState().documentLog || []).find(e => e.origin?.automationKey === ctx.key);
    if (already) return { ok: true, summary: `Déjà émis : ${already.ref} (${template.title}).`, links: [{ label: 'Registre des documents', section: 'documents' }], output: { documentRef: already.ref } };
    const values = {};
    (Array.isArray(p.values) ? p.values : []).forEach(({ key, value }) => { if (str(key)) values[str(key)] = value; });
    if (p.values && !Array.isArray(p.values) && typeof p.values === 'object') Object.assign(values, p.values);
    if (ctx.simulate) return { ok: true, summary: `Émettrait « ${template.title} »${member ? ` pour ${memberName(member)}` : ''} (${p.format === 'pdf' ? 'PDF' : 'registre seulement'}).` };
    const res = await issueDocuments({
      templateId: template.id, memberIds: member ? [member.id] : [], values,
      format: p.format === 'pdf' ? 'pdf' : 'none',
      origin: { type: 'automation', automationKey: ctx.key, automationId: ctx.automation.id, responseId: ctx.response?.id || null },
    });
    const ref = res.refs?.[0] || res.entries?.[0]?.ref || '';
    ctx.outputs.documentRef = ref;
    return { ok: true, summary: `Document émis : ${ref} — ${template.title}${member ? ` (${memberName(member)})` : ''}.`, links: [{ label: 'Registre des documents', section: 'documents' }], output: { documentRef: ref } };
  },
};

// ── Inscription à un événement ──────────────────────────────
export const eventRegister = {
  id: 'event.register',
  label: 'Inscrire à un événement',
  description: 'Ajoute la personne aux participants (doublons ignorés ; liste d\'attente automatique si l\'événement est complet).',
  module: 'Événements',
  icon: 'Ticket',
  capability: ['events', 'write'],
  params: [
    { key: 'eventId', label: 'Événement', type: 'event', required: true },
    { key: 'name', label: 'Nom du participant', type: 'text', required: true, default: '{reponse.identite}' },
    { key: 'email', label: 'Email', type: 'text', default: '{info.email}' },
    { key: 'memberId', label: 'Membre (facultatif)', type: 'member', default: '' },
    { key: 'paid', label: 'Inscription payée', type: 'boolean', default: false },
    { key: 'transactionId', label: 'Opération liée', type: 'text', default: '{etape.transactionId}' },
  ],
  run(p, ctx) {
    const ev = useEventsStore.getState().events[str(p.eventId)];
    if (!ev) fail('Événement introuvable : choisis-le dans la liste.');
    if (ev.status === 'cancelled') fail(`L'événement « ${ev.title} » est annulé.`);
    const name = str(p.name);
    if (!name) fail('Nom du participant manquant.');
    const email = str(p.email).toLowerCase();
    const participant = { name, ...(EMAIL_RX.test(email) ? { email } : {}), ...(memberById(str(p.memberId)) ? { memberId: str(p.memberId) } : {}), ...(toBool(p.paid) ? { paid: true } : {}), ...(str(p.transactionId) ? { transactionId: str(p.transactionId) } : {}) };
    const key = participantKey(participant);
    const existing = (ev.participants || []).find(x => x.status !== 'cancelled' && participantKey(x) === key);
    if (existing) {
      ctx.outputs.participantId = existing.id;
      if (!ctx.simulate && participant.paid && !existing.paid) useEventsStore.getState().updateParticipant(ev.id, existing.id, { paid: true, ...(participant.transactionId ? { transactionId: participant.transactionId } : {}) });
      return { ok: true, summary: `${name} est déjà inscrit·e à « ${ev.title} »${participant.paid && !existing.paid ? (ctx.simulate ? ' (serait marqué·e payé·e)' : ' — marqué·e payé·e') : ''}.`, links: [{ label: ev.title, section: 'events', rest: [ev.id] }], output: { participantId: existing.id } };
    }
    if (ctx.simulate) return { ok: true, summary: `Inscrirait ${name} à « ${ev.title} ».` };
    const res = useEventsStore.getState().addParticipants(ev.id, [participant]);
    const fresh = useEventsStore.getState().events[ev.id];
    const added = (fresh?.participants || []).find(x => x.status !== 'cancelled' && participantKey(x) === key);
    if (added) ctx.outputs.participantId = added.id;
    return {
      ok: true,
      summary: res.waitlisted ? `${name} placé·e en liste d'attente de « ${ev.title} » (complet).` : `${name} inscrit·e à « ${ev.title} ».`,
      links: [{ label: ev.title, section: 'events', rest: [ev.id] }],
      output: { participantId: added?.id || null, waitlisted: !!res.waitlisted },
    };
  },
};

// ── Opération de trésorerie ─────────────────────────────────
export const financeTransaction = {
  id: 'finance.transaction',
  label: 'Créer une opération de trésorerie',
  description: 'Recette (ex. inscription payée) ou dépense (ex. note de frais validée, en attente du trésorier).',
  module: 'Trésorerie',
  icon: 'Wallet',
  capability: ['finance', 'write'],
  params: [
    { key: 'type', label: 'Sens', type: 'select', default: 'income', mappable: false, options: [{ value: 'income', label: 'Recette' }, { value: 'expense', label: 'Dépense' }] },
    { key: 'amount', label: 'Montant (€)', type: 'text', required: true, default: '{info.montant}' },
    { key: 'label', label: 'Libellé', type: 'text', required: true, default: '{info.formulaire} — {reponse.identite}' },
    { key: 'categoryId', label: 'Catégorie', type: 'category', default: 'billetterie' },
    { key: 'method', label: 'Moyen de paiement', type: 'select', default: 'helloasso', options: PAYMENT_METHODS.map(m => ({ value: m.id, label: m.label })) },
    { key: 'status', label: 'Statut', type: 'select', default: 'validated', mappable: false, options: [{ value: 'validated', label: 'Validée' }, { value: 'pending', label: 'En attente de validation' }] },
    { key: 'date', label: 'Date', type: 'text', default: '{aujourdhui}' },
    { key: 'eventId', label: 'Événement lié', type: 'event' },
    { key: 'memberId', label: 'Membre lié', type: 'member' },
    { key: 'counterparty', label: 'Tiers', type: 'text' },
  ],
  run(p, ctx) {
    const amount = toAmount(p.amount);
    if (!amount || amount <= 0) fail(`Montant invalide : « ${str(p.amount) || 'vide'} ».`);
    const fin = useFinanceStore.getState();
    const existing = Object.values(fin.transactions).find(t => t.automationKey === ctx.key);
    const type = p.type === 'expense' ? 'expense' : 'income';
    const link = { label: 'Trésorerie', section: 'finance' };
    if (existing) {
      ctx.outputs.transactionId = existing.id;
      return { ok: true, summary: `Opération déjà créée : ${existing.label} (${formatMoney(existing.amount)}).`, links: [link], output: { transactionId: existing.id } };
    }
    let status = p.status === 'pending' ? 'pending' : 'validated';
    if (status === 'validated' && type === 'expense' && !can('finance', 'validate')) {
      status = 'pending';
      ctx.warn('Dépense enregistrée « en attente » : la validation demande le droit trésorerie › valider.');
    }
    const label = str(p.label) || (type === 'income' ? 'Recette' : 'Dépense');
    const categoryId = fin.categories[str(p.categoryId)] ? str(p.categoryId) : 'autre';
    if (ctx.simulate) return { ok: true, summary: `Créerait ${type === 'income' ? 'la recette' : 'la dépense'} « ${label} » de ${formatMoney(amount)} (${status === 'pending' ? 'en attente' : 'validée'}).` };
    const tx = fin.addTransaction({
      type, amount, label, categoryId, status,
      method: PAYMENT_METHODS.some(m => m.id === p.method) ? p.method : 'autre',
      date: isoDay(p.date) || undefined,
      ...(useEventsStore.getState().events[str(p.eventId)] ? { eventId: str(p.eventId) } : {}),
      ...(memberById(str(p.memberId)) ? { memberId: str(p.memberId) } : {}),
      ...(str(p.counterparty) ? { counterparty: str(p.counterparty) } : {}),
      notes: `Créée par l'automatisation « ${ctx.automation.name} ».`,
      createdBy: ctx.user, automationKey: ctx.key, source: 'automatisation',
      ...(status === 'validated' ? { validatedBy: ctx.user, validatedAt: new Date().toISOString() } : {}),
    });
    ctx.outputs.transactionId = tx.id;
    return { ok: true, summary: `${type === 'income' ? 'Recette' : 'Dépense'} créée : « ${tx.label} » ${formatMoney(tx.amount)} (${status === 'pending' ? 'en attente' : 'validée'}).`, links: [link], output: { transactionId: tx.id } };
  },
};

// ── Cotisation payée ────────────────────────────────────────
export const membershipPaid = {
  id: 'membership.markPaid',
  label: 'Marquer une cotisation payée',
  description: 'Enregistre le paiement de la cotisation (recette « cotisations » liée et fiche du membre mise à jour).',
  module: 'Adhésions',
  icon: 'BadgeEuro',
  capability: ['membership', 'write'],
  params: [
    { key: 'memberId', label: 'Membre', type: 'member', required: true, default: '{membre.id}' },
    { key: 'year', label: 'Année (vide = campagne en cours)', type: 'text' },
    { key: 'amount', label: 'Montant (€) (vide = montant par défaut)', type: 'text', default: '{info.montant}' },
    { key: 'method', label: 'Moyen de paiement', type: 'select', default: 'helloasso', options: PAYMENT_METHODS.map(m => ({ value: m.id, label: m.label })) },
  ],
  run(p, ctx) {
    const member = memberFor(str(p.memberId), ctx);
    if (!member) fail('Membre introuvable : ajoute d\'abord une étape « Créer / mettre à jour un membre ».');
    const ms = useMembershipStore.getState();
    const year = str(p.year) || ms.settings.campaignYear;
    const amount = toAmount(p.amount) ?? ms.settings.defaultAmount;
    const cur = findMembership(ms.memberships, member.id, year);
    if (cur?.status === 'paid') {
      if (cur.transactionId) ctx.outputs.transactionId = cur.transactionId;
      return { ok: true, summary: `Cotisation ${year} de ${memberName(member)} déjà payée.`, links: [{ label: 'Adhésions', section: 'membership' }] };
    }
    if (ctx.simulate) return { ok: true, summary: `Marquerait la cotisation ${year} de ${memberName(member)} payée (${formatMoney(amount)}).` };
    const res = ms.markPaid(member.id, year, { amount, method: PAYMENT_METHODS.some(m => m.id === p.method) ? p.method : 'autre', source: 'formulaire', validatedBy: ctx.user, reference: ctx.response?.id ? `Formulaire ${String(ctx.response.id).slice(0, 8)}` : '' });
    if (res?.transactionId) ctx.outputs.transactionId = res.transactionId;
    return { ok: true, summary: `Cotisation ${year} de ${memberName(member)} payée (${formatMoney(amount)}).`, links: [{ label: 'Adhésions', section: 'membership' }], output: { membershipId: res?.id, transactionId: res?.transactionId } };
  },
};

// ── Tâche ───────────────────────────────────────────────────
export const taskCreate = {
  id: 'task.create',
  label: 'Créer une tâche',
  description: 'Crée une carte dans un tableau de tâches (assignés par membre ou par rôle, échéance relative).',
  module: 'Tâches',
  icon: 'KanbanSquare',
  capability: ['tasks', 'write'],
  params: [
    { key: 'board', label: 'Tableau', type: 'board', default: 'board-general' },
    { key: 'column', label: 'Colonne (vide = première)', type: 'column-tasks' },
    { key: 'title', label: 'Titre', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'assigneeIds', label: 'Assigné·es (membres)', type: 'members' },
    { key: 'assigneeRoles', label: 'Assigné·es (titulaires des rôles)', type: 'roles', mappable: false },
    { key: 'dueInDays', label: 'Échéance dans (jours)', type: 'number' },
    { key: 'dueDate', label: 'ou date d\'échéance', type: 'text', help: 'AAAA-MM-JJ, jeton ou formule (=date_event - 2).' },
    { key: 'priority', label: 'Priorité', type: 'select', default: 'normal', options: [
      { value: 'low', label: 'Basse' }, { value: 'normal', label: 'Normale' }, { value: 'high', label: 'Haute' }, { value: 'urgent', label: 'Urgente' },
    ] },
    { key: 'labels', label: 'Étiquettes (séparées par des virgules)', type: 'text' },
  ],
  run(p, ctx) {
    const title = str(p.title);
    if (!title) fail('Titre de la tâche manquant.');
    const board = findBoard(str(p.board)) || null;
    const roles = toList(p.assigneeRoles);
    const members = useStore.getState().members;
    const byRole = roles.length ? members.filter(m => roles.includes(m.mainRole)).map(m => m.id) : [];
    if (roles.length && !byRole.length) ctx.warn('Aucun membre ne tient le rôle choisi : tâche non assignée par rôle.');
    const assigneeIds = [...new Set([...toList(p.assigneeIds).filter(id => members.some(m => m.id === id)), ...byRole])];
    const dueDate = isoDay(p.dueDate) || (str(p.dueInDays) !== '' && Number.isFinite(Number(p.dueInDays)) ? addDays(new Date().toISOString(), Number(p.dueInDays)) : '');
    const responseId = ctx.response?.id || '';
    const existing = Object.values(useTasksStore.getState().tasks).find(t => t.source === 'automatisation' && t.title === title && (t.links?.responseId || '') === responseId);
    if (existing) {
      ctx.outputs.taskId = existing.id;
      return { ok: true, summary: `Tâche déjà créée : « ${existing.title} ».`, links: [{ label: 'Voir la tâche', section: 'tasks', rest: [existing.boardId], query: { task: existing.id } }], output: { taskId: existing.id } };
    }
    const names = assigneeIds.map(id => memberName(members.find(m => m.id === id))).join(', ');
    if (ctx.simulate) return { ok: true, summary: `Créerait la tâche « ${title} »${board ? ` dans « ${board.title} »` : ''}${names ? ` pour ${names}` : ''}${dueDate ? `, échéance ${dueDate}` : ''}.` };
    const memberLink = ctx.outputs.memberId && members.some(m => m.id === ctx.outputs.memberId) ? ctx.outputs.memberId : undefined;
    const task = createTask({
      boardId: board?.id, column: str(p.column) || undefined, title, description: str(p.description),
      assigneeIds, dueDate: dueDate || undefined, priority: p.priority, labels: toList(p.labels),
      links: { formId: ctx.automation.formId || undefined, responseId: responseId || undefined, memberId: memberLink, transactionId: ctx.outputs.transactionId || undefined },
      source: 'automatisation',
    });
    ctx.outputs.taskId = task.id;
    return { ok: true, summary: `Tâche créée : « ${task.title} »${names ? ` (${names})` : ''}${task.dueDate ? `, échéance ${task.dueDate}` : ''}.`, links: [{ label: 'Voir la tâche', section: 'tasks', rest: [task.boardId], query: { task: task.id } }], output: { taskId: task.id } };
  },
};

// ── Rappel d'agenda ─────────────────────────────────────────
export const calendarReminder = {
  id: 'calendar.reminder',
  label: 'Créer un rappel d\'agenda',
  description: 'Ajoute un rappel daté dans l\'agenda du BDE.',
  module: 'Agenda',
  icon: 'CalendarClock',
  capability: ['calendar', 'write'],
  params: [
    { key: 'title', label: 'Titre', type: 'text', required: true },
    { key: 'inDays', label: 'Dans (jours)', type: 'number', default: '' },
    { key: 'date', label: 'ou date', type: 'text', help: 'AAAA-MM-JJ, jeton ou formule.' },
    { key: 'time', label: 'Heure (HH:MM)', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
    { key: 'category', label: 'Catégorie', type: 'select', default: 'autre', mappable: false, options: [
      { value: 'conformite', label: 'Conformité' }, { value: 'finance', label: 'Finance' }, { value: 'equipe', label: 'Équipe' }, { value: 'evenement', label: 'Événement' }, { value: 'autre', label: 'Autre' },
    ] },
  ],
  run(p, ctx) {
    const title = str(p.title);
    if (!title) fail('Titre du rappel manquant.');
    const date = isoDay(p.date) || (str(p.inDays) !== '' && Number.isFinite(Number(p.inDays)) ? addDays(new Date().toISOString(), Number(p.inDays)) : '');
    if (!date) fail('Date du rappel manquante (date ou nombre de jours).');
    const cal = useCalendarStore.getState();
    const existing = Object.values(cal.reminders).find(r => r.title === title.slice(0, 200) && r.date === date);
    if (existing) {
      ctx.outputs.reminderId = existing.id;
      return { ok: true, summary: `Rappel déjà présent : « ${existing.title} » le ${date}.`, links: [{ label: 'Agenda', section: 'calendar' }], output: { reminderId: existing.id } };
    }
    if (ctx.simulate) return { ok: true, summary: `Créerait le rappel « ${title} » le ${date}${str(p.time) ? ` à ${str(p.time)}` : ''}.` };
    const rec = cal.addReminder({ title, date, time: str(p.time), notes: str(p.notes), category: p.category, recurrence: 'none' });
    ctx.outputs.reminderId = rec.id;
    return { ok: true, summary: `Rappel créé : « ${rec.title} » le ${rec.date}${rec.time ? ` à ${rec.time}` : ''}.`, links: [{ label: 'Agenda', section: 'calendar' }], output: { reminderId: rec.id } };
  },
};
