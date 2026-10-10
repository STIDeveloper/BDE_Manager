// ============================================================
// TABLEAU DE BORD — calculs purs (aucun accès aux stores)
// ============================================================
// Tout est dérivé en direct des données des stores (aucune donnée fictive).

import { academicYear, daysBetween, formatMoney, isPlaceholderMember, toDate } from '../../documents/context.js';
import { roundMoney } from '../contracts.js';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ANCIEN = 'Ancien Membre';
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// ------------------------------------------------------------
// Membres & postes
// ------------------------------------------------------------

/** Membre parti : badge « Ancien Membre » ou fin de fonctions dépassée. */
export function hasLeft(m, today) {
  if (Array.isArray(m?.badges) && m.badges.includes(ANCIEN)) return true;
  return !!toDate(m?.mandateEnd) && daysBetween(today, m.mandateEnd) < 0;
}

/** Membres réels (hors fiches « poste vacant ») et actifs. */
export function activeMembers(members = [], today = new Date()) {
  return members.filter(m => !isPlaceholderMember(m) && !hasLeft(m, today));
}

/**
 * Postes vacants du catalogue : rôles dont la capacité dépasse le nombre
 * de titulaires actifs. Essentiels en premier.
 */
export function vacancies(roleList = [], active = []) {
  const count = new Map();
  active.forEach(m => { if (m.mainRole) count.set(m.mainRole, (count.get(m.mainRole) || 0) + 1); });
  const list = roleList
    .map(r => ({ role: r, holders: count.get(r.id) || 0, free: Math.max(0, (Number(r.capacity) || 1) - (count.get(r.id) || 0)) }))
    .filter(x => x.free > 0)
    .sort((a, b) => (b.role.essential ? 1 : 0) - (a.role.essential ? 1 : 0) || (b.role.leadership ? 1 : 0) - (a.role.leadership ? 1 : 0));
  const essentials = roleList.filter(r => r.essential);
  return {
    list,
    // Poste essentiel vacant = aucun titulaire (une place libre sur un rôle à capacité 2 n'est pas une vacance).
    essentialVacant: essentials.filter(r => !count.get(r.id)),
    essentialTotal: essentials.length,
    essentialFilled: essentials.filter(r => (count.get(r.id) || 0) > 0).length,
    seats: list.reduce((s, x) => s + x.free, 0),
    leadershipVacant: list.filter(x => x.role.leadership && x.holders === 0).map(x => x.role),
  };
}

/** Répartition des membres actifs par pôle (ordre du catalogue). */
export function poleDistribution(active = [], catalog, poleList = []) {
  const counts = new Map();
  active.forEach(m => {
    const pole = catalog.roles?.[m.mainRole]?.pole || '__none__';
    counts.set(pole, (counts.get(pole) || 0) + 1);
  });
  const rows = poleList.filter(p => counts.get(p.id)).map(p => ({ id: p.id, label: p.label, color: p.color, count: counts.get(p.id) }));
  if (counts.get('__none__')) rows.push({ id: '__none__', label: 'Sans rôle', color: null, count: counts.get('__none__') });
  return rows;
}

// ------------------------------------------------------------
// Trésorerie
// ------------------------------------------------------------

const signed = (t) => (t.type === 'income' ? 1 : -1) * (Number(t.amount) || 0);

/** Solde validé (ouverture + opérations validées depuis la date d'ouverture) avant `until` (exclu). */
export function balanceBefore(transactions = {}, settings = {}, until = '') {
  let total = Number(settings?.openingBalance) || 0;
  const from = settings?.openingDate || '';
  Object.values(transactions || {}).forEach(t => {
    if (t?.status !== 'validated' || !t.date) return;
    if (from && t.date < from) return;
    if (until && t.date >= until) return;
    total += signed(t);
  });
  return roundMoney(total);
}

/** Indicateurs de trésorerie + solde de fin de mois sur les 6 derniers mois. */
export function treasuryStats(transactions = {}, settings = {}, today = new Date()) {
  const list = Object.values(transactions || {}).filter(Boolean);
  const pending = list.filter(t => t.status === 'pending' && t.type === 'expense');
  const t0 = ymd(today);
  const oldPending = pending.filter(t => t.date && daysBetween(t.date, t0) > 14);
  const validatedExpenses = list.filter(t => t.status === 'validated' && t.type === 'expense');
  const withProof = validatedExpenses.filter(t => Array.isArray(t.attachments) && t.attachments.length > 0).length;
  const series = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const next = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const key = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
    const month = list.filter(t => t.status === 'validated' && String(t.date || '').startsWith(key));
    series.push({
      key,
      label: start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
      balance: balanceBefore(transactions, settings, i === 0 ? '' : ymd(next)),
      income: roundMoney(month.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)),
      expense: roundMoney(month.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)),
    });
  }
  return {
    hasData: list.length > 0 || Number(settings?.openingBalance) > 0,
    balance: balanceBefore(transactions, settings),
    pendingCount: pending.length,
    pendingAmount: roundMoney(pending.reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    oldPendingCount: oldPending.length,
    validatedExpenses: validatedExpenses.length,
    proofRatio: validatedExpenses.length ? withProof / validatedExpenses.length : 1,
    series,
  };
}

// ------------------------------------------------------------
// Adhésions
// ------------------------------------------------------------

/** Cotisations de la campagne en cours (module adhésions), sinon d'après les fiches membres. */
export function membershipStats({ memberships, settings, available }, active = [], today = new Date()) {
  if (available) {
    const campaign = settings?.campaignYear || academicYear(today);
    const list = Object.values(memberships || {}).filter(x => x && x.year === campaign);
    const paid = list.filter(x => x.status === 'paid');
    const due = list.filter(x => x.status === 'due');
    return {
      source: 'module', campaign,
      paid: paid.length, total: paid.length + due.length, due: due.length,
      amount: roundMoney(paid.reduce((s, x) => s + (Number(x.amount) || 0), 0)),
      dueDate: settings?.dueDate || '',
    };
  }
  const year = academicYear(today);
  const paid = active.filter(m => toDate(m.feePaidAt) && academicYear(m.feePaidAt) === year);
  return {
    source: 'fiches', campaign: year,
    paid: paid.length, total: active.length, due: active.length - paid.length,
    amount: roundMoney(paid.reduce((s, m) => s + (Number(m.feeAmount) || 0), 0)),
    dueDate: '',
  };
}

// ------------------------------------------------------------
// Événements
// ------------------------------------------------------------

const SEAT = ['registered', 'present'];

export function eventStats(upcoming = [], events = {}, today = new Date()) {
  const t0 = ymd(today);
  const registered = upcoming.reduce((s, e) => s + (e.participants || []).filter(p => SEAT.includes(p.status)).length, 0);
  const overdueTasks = [];
  Object.values(events || {}).forEach(ev => {
    if (!ev || ev.status === 'cancelled') return;
    const late = (ev.tasks || []).filter(t => !t.done && t.due && String(t.due).slice(0, 10) < t0);
    if (late.length) overdueTasks.push({ event: ev, tasks: late });
  });
  return { count: upcoming.length, registered, next: upcoming[0] || null, overdueTasks };
}

// ------------------------------------------------------------
// Santé globale
// ------------------------------------------------------------

/**
 * Score de santé (0–100) : moyenne des composantes disponibles, chacune
 * expliquée. La trésorerie n'est comptée que si le module est présent et
 * renseigné.
 */
export function healthScore({ vac, organization, agendaItems = [], treasury, financeAvailable, suggestions = [] }) {
  const parts = [];
  // 1. Postes essentiels
  if (vac.essentialTotal > 0) {
    const missing = vac.essentialVacant.map(r => r.label);
    parts.push({
      id: 'roles', label: 'Postes essentiels pourvus',
      score: vac.essentialFilled / vac.essentialTotal,
      detail: missing.length ? `${vac.essentialFilled}/${vac.essentialTotal} pourvus — manque : ${missing.join(', ')}` : `${vac.essentialTotal}/${vac.essentialTotal} pourvus`,
    });
  }
  // 2. Conformité
  const org = organization || {};
  const comp = [
    { ok: !!(String(org.address || '').trim() && String(org.city || '').trim()), label: 'profil de l\'association (adresse)' },
    { ok: !agendaItems.some(i => i.source === 'dirigeants' && !i.done && (i.severity === 'overdue' || i.asap)), label: 'déclaration des dirigeants' },
    { ok: !agendaItems.some(i => i.source === 'ag' && !i.done && (i.severity === 'overdue' || i.asap)), label: 'assemblée générale' },
    { ok: !agendaItems.some(i => (i.source === 'insurance' || (i.source === 'reminder' && i.category === 'conformite')) && i.severity === 'overdue'), label: 'échéances de conformité' },
  ];
  const compKo = comp.filter(c => !c.ok).map(c => c.label);
  parts.push({
    id: 'compliance', label: 'Conformité',
    score: comp.filter(c => c.ok).length / comp.length,
    detail: compKo.length ? `À régulariser : ${compKo.join(', ')}` : 'Profil, AG, dirigeants et échéances à jour',
  });
  // 3. Trésorerie
  if (financeAvailable && treasury?.hasData) {
    const checks = [
      { ok: treasury.balance >= 0, label: 'solde négatif' },
      { ok: treasury.oldPendingCount === 0, label: `${treasury.oldPendingCount} dépense(s) en attente depuis plus de 14 j` },
      { ok: treasury.proofRatio >= 0.8, label: `justificatifs manquants (${Math.round(treasury.proofRatio * 100)} % des dépenses justifiées)` },
    ];
    const ko = checks.filter(c => !c.ok).map(c => c.label);
    parts.push({
      id: 'treasury', label: 'Trésorerie',
      score: checks.filter(c => c.ok).length / checks.length,
      detail: ko.length ? ko.join(' ; ') : 'Solde positif, dépenses validées et justifiées',
    });
  }
  // 4. Documents
  const high = suggestions.filter(s => s.priority === 'high').length;
  const medium = suggestions.filter(s => s.priority === 'medium').length;
  parts.push({
    id: 'documents', label: 'Documents',
    score: Math.max(0, 1 - high * 0.2 - medium * 0.05),
    detail: high + medium ? `${high} document(s) prioritaire(s), ${medium} recommandé(s) à produire` : 'Aucun document en attente',
  });
  const score = Math.round(100 * parts.reduce((s, p) => s + p.score, 0) / parts.length);
  return { score, parts, level: score >= 80 ? 'good' : score >= 55 ? 'warning' : 'critical' };
}

// ------------------------------------------------------------
// « À traiter »
// ------------------------------------------------------------

/**
 * Liste priorisée et actionnable. Chaque ligne :
 * { id, priority, title, detail, category, action: { label, section, path?, query?, link? } }
 */
export function buildTodo({
  agendaItems = [], treasury, financeAvailable, suggestions = [], driveDanger = [], membership,
  events, handoverCandidates = [], vac, today = new Date(),
}) {
  const out = [];
  const push = (x) => out.push(x);

  // Agenda : conformité et rappels en retard / du jour (tâches et cotisations traitées à part).
  const hasDirigeants = agendaItems.some(i => i.source === 'dirigeants' && !i.done);
  agendaItems
    .filter(i => !i.done && (i.actionable !== false || i.asap) && ['ag', 'dirigeants', 'insurance', 'reminder'].includes(i.source))
    .forEach(i => {
      let priority = null;
      if (i.severity === 'overdue') priority = 'high';
      else if (i.severity === 'today' || i.asap) priority = 'medium';
      else if (i.severity === 'soon' && i.category === 'conformite') priority = 'low';
      if (!priority) return;
      push({
        id: `agenda:${i.key}`, priority, category: i.category === 'conformite' ? 'Conformité' : 'Agenda',
        title: i.title, detail: i.severity === 'overdue' ? `En retard depuis le ${i.date.split('-').reverse().join('/')}` : (i.subtitle || ''),
        action: { label: 'Traiter', link: i.link || { section: 'calendar' }, fallback: i.fallbackLink },
      });
    });

  // Dépenses à valider
  if (financeAvailable && treasury?.pendingCount) {
    push({
      id: 'finance:pending', priority: treasury.oldPendingCount ? 'high' : 'medium', category: 'Trésorerie',
      title: `${treasury.pendingCount} dépense(s) à valider`,
      detail: `${formatMoney(treasury.pendingAmount)}${treasury.oldPendingCount ? ` — dont ${treasury.oldPendingCount} en attente depuis plus de 14 jours` : ''}`,
      action: { label: 'Valider', section: 'finance', path: 'operations' },
    });
  }

  // Passations à démarrer
  handoverCandidates.slice(0, 5).forEach(({ member, reason, roleLabel }) => {
    push({
      id: `handover:${member.id}`, priority: reason.kind === 'ended' || (reason.days !== null && reason.days <= 14) ? 'high' : 'medium',
      category: 'Équipe', title: `Préparer la passation de ${`${member.firstName || ''} ${member.lastName || ''}`.trim()}`,
      detail: `${roleLabel || 'Sans rôle'} — ${reason.label}`,
      action: { label: 'Démarrer', section: 'handover', path: 'new', query: { outgoing: member.id } },
    });
  });
  if (handoverCandidates.length > 5) {
    push({ id: 'handover:more', priority: 'medium', category: 'Équipe', title: `${handoverCandidates.length - 5} autre(s) passation(s) à prévoir`, detail: '', action: { label: 'Voir', section: 'handover' } });
  }

  // Suggestions du studio documents (prioritaires)
  suggestions
    .filter(s => s.priority === 'high' || s.priority === 'medium')
    .filter(s => !(hasDirigeants && String(s.templateId).startsWith('liste-dirigeants')))
    .filter(s => !(handoverCandidates.length && s.templateId === 'kit-passation'))
    .forEach(s => {
      push({
        id: `doc:${s.templateId}:${s.id}`, priority: s.priority, category: 'Documents',
        title: s.title, detail: s.reason || '',
        action: { label: 'Préparer', section: 'documents', path: s.templateId },
      });
    });

  // Drive : incohérences critiques
  if (driveDanger.length) {
    push({
      id: 'drive:danger', priority: 'high', category: 'Drive',
      title: `${driveDanger.length} incohérence(s) Drive critique(s)`,
      detail: driveDanger[0].title + (driveDanger.length > 1 ? '…' : ''),
      action: { label: 'Corriger', section: 'drive' },
    });
  }

  // Cotisations impayées
  if (membership?.source === 'module' && membership.due > 0) {
    const late = membership.dueDate && membership.dueDate < ymd(today);
    push({
      id: 'membership:due', priority: late ? 'high' : 'low', category: 'Adhésions',
      title: `${membership.due} cotisation(s) impayée(s)`,
      detail: `Campagne ${membership.campaign}${membership.dueDate ? ` — date limite ${membership.dueDate.split('-').reverse().join('/')}` : ''}`,
      action: { label: 'Relancer', section: 'membership' },
    });
  }

  // Tâches d'événements en retard
  (events?.overdueTasks || []).forEach(({ event, tasks }) => {
    push({
      id: `tasks:${event.id}`, priority: 'medium', category: 'Événements',
      title: `${tasks.length} tâche(s) en retard — ${event.title || 'événement'}`,
      detail: tasks.slice(0, 2).map(t => t.title).join(', ') + (tasks.length > 2 ? '…' : ''),
      action: { label: 'Ouvrir', section: 'events', path: event.id },
    });
  });

  // Postes essentiels vacants
  (vac?.essentialVacant || []).forEach(r => {
    push({
      id: `vacant:${r.id}`, priority: 'medium', category: 'Équipe',
      title: `Poste essentiel vacant : ${r.label}`, detail: 'Attribue ce rôle à un membre ou recrute.',
      action: { label: 'Attribuer', section: 'kanban' },
    });
  });

  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => PRIORITY_RANK[a.x.priority] - PRIORITY_RANK[b.x.priority] || a.i - b.i)
    .map(({ x }) => x);
}

// ------------------------------------------------------------
// Dernières activités
// ------------------------------------------------------------

const time = (iso) => { const t = new Date(iso || 0).getTime(); return Number.isFinite(t) ? t : 0; };

export function recentActivity({ documentLog = [], transactions = {}, events = {}, handovers = {}, members = [] }, limit = 8) {
  const name = (id) => { const m = members.find(x => x.id === id); return m ? `${m.firstName || ''} ${m.lastName || ''}`.trim() : ''; };
  const items = [];
  documentLog.slice(0, 30).forEach(e => {
    if (!e?.createdAt) return;
    items.push({ id: `doc:${e.id}`, at: e.createdAt, kind: 'document', title: `Document émis : ${e.title || e.templateId}`, detail: [e.ref, (e.memberIds || []).map(name).filter(Boolean).join(', ')].filter(Boolean).join(' · '), action: { section: 'documents' } });
  });
  Object.values(transactions || {}).forEach(t => {
    const at = t?.updatedAt || t?.createdAt;
    if (!at) return;
    items.push({ id: `tx:${t.id}`, at, kind: 'finance', title: `${t.type === 'income' ? 'Recette' : 'Dépense'} : ${t.label}`, amount: t.type === 'income' ? t.amount : -t.amount, status: t.status, action: { section: 'finance', path: 'operations' } });
  });
  Object.values(events || {}).forEach(ev => {
    const at = ev?.updatedAt || ev?.createdAt;
    if (!at) return;
    const created = Math.abs(time(ev.updatedAt) - time(ev.createdAt)) < 2000;
    items.push({ id: `ev:${ev.id}`, at, kind: 'event', title: `${created ? 'Événement créé' : 'Événement modifié'} : ${ev.title || 'Sans titre'}`, action: { section: 'events', path: ev.id } });
  });
  Object.values(handovers || {}).forEach(h => {
    if (!h?.updatedAt) return;
    items.push({ id: `ho:${h.id}`, at: h.updatedAt, kind: 'handover', title: `Passation ${h.status === 'done' ? 'terminée' : 'mise à jour'} : ${name(h.outgoingId) || 'membre'}`, action: { section: 'handover', path: h.id } });
  });
  return items.sort((a, b) => time(b.at) - time(a.at)).slice(0, limit);
}

// ------------------------------------------------------------
// Widgets (personnalisation)
// ------------------------------------------------------------

export const WIDGETS = [
  { id: 'kpis', label: 'Indicateurs clés' },
  { id: 'todo', label: 'À traiter' },
  { id: 'upcoming', label: 'Prochaines échéances' },
  { id: 'treasury', label: 'Trésorerie (6 mois)' },
  { id: 'poles', label: 'Membres par pôle' },
  { id: 'activity', label: 'Dernières activités' },
];

/** Ordre effectif : ordre enregistré + widgets nouveaux à la fin. */
export function resolveLayout(order = [], hidden = []) {
  const ids = WIDGETS.map(w => w.id);
  const kept = (order || []).filter(id => ids.includes(id));
  const full = [...kept, ...ids.filter(id => !kept.includes(id))];
  const hiddenSet = new Set((hidden || []).filter(id => ids.includes(id)));
  return { order: full, hidden: hiddenSet };
}
