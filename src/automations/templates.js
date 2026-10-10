// ============================================================
// AUTOMATISATIONS — modèles prêts à l'emploi
// ============================================================
// Chaque modèle cible un modèle de formulaire du Studio (clés de questions
// de src/forms/templates/*.js) : à l'application, l'utilisateur choisit le
// formulaire ; le formulaire le plus compatible (clés présentes) est proposé.
// ============================================================

import { newId } from '../core/createModuleStore.js';
import { defaultParams } from './actions/index.js';
import { normalizeAutomation } from './model.js';
import { knownKeys, tokensOf } from './mapping.js';

const act = (type, params = {}) => ({ id: newId(), type, params: { ...defaultParams(type), ...params } });

export const AUTOMATION_TEMPLATES = [
  {
    id: 'candidature-acceptee',
    title: 'Candidature acceptée → membre + moteur + attestation',
    description: 'Quand une candidature passe à « Retenue » : crée (ou complète) la fiche membre, ajoute le candidat au moteur d\'affectation et émet l\'attestation d\'adhésion (registre). Validation humaine demandée.',
    formTemplate: 'candidature-bureau',
    build: () => ({
      name: 'Candidature acceptée → membre + moteur + attestation',
      requiresApproval: true,
      trigger: { type: 'response.status_changed', status: 'accepted' },
      actions: [
        act('member.upsert', {
          firstName: '{reponse.prenom_nom.firstName}', lastName: '{reponse.prenom_nom.lastName}', email: '{reponse.email}',
          phone: '{reponse.telephone}', program: '{reponse.formation}', year: '{reponse.annee}', mainRole: '{reponse.choix_1}',
        }),
        act('recruitment.addCandidate'),
        act('document.issue', { templateId: 'attestation-adhesion', memberId: '{membre.id}', format: 'none' }),
      ],
    }),
  },
  {
    id: 'inscription-payee',
    title: 'Inscription payée → recette + participant',
    description: 'Quand le paiement d\'une inscription est confirmé : recette « billetterie » en trésorerie puis inscription du participant (liste d\'attente si complet), reliée à la recette. Choisis l\'événement dans les deux étapes.',
    formTemplate: 'inscription-evenement',
    build: () => ({
      name: 'Inscription payée → recette + participant',
      trigger: { type: 'payment.paid' },
      actions: [
        act('finance.transaction', { type: 'income', amount: '{info.montant}', label: 'Inscription — {reponse.identite}', categoryId: 'billetterie', method: 'helloasso', status: 'validated' }),
        act('event.register', { name: '{reponse.identite}', email: '{reponse.email}', paid: true, transactionId: '{etape.transactionId}' }),
      ],
    }),
  },
  {
    id: 'note-frais-validee',
    title: 'Note de frais validée → opération en attente',
    description: 'Quand une note de frais passe à « Validée » : dépense « en attente » en trésorerie (validation du trésorier), liée au demandeur et à l\'événement, et notification.',
    formTemplate: 'note-de-frais',
    build: () => ({
      name: 'Note de frais validée → opération en attente',
      trigger: { type: 'response.status_changed', status: 'accepted' },
      actions: [
        act('finance.transaction', { type: 'expense', amount: '{reponse.total}', label: 'Note de frais — {reponse.libelle}', categoryId: 'autre', method: 'virement', status: 'pending', memberId: '{reponse.demandeur}', eventId: '{reponse.evenement}' }),
        act('app.notify', { title: 'Note de frais à rembourser', body: 'Une dépense attend ta validation en trésorerie.', level: 'warn', section: 'finance' }),
      ],
    }),
  },
  {
    id: 'partenariat-tache',
    title: 'Nouvelle demande de partenariat → tâche au responsable',
    description: 'À chaque demande de partenariat : tâche prioritaire assignée au responsable partenariats (échéance 3 jours) et réponse passée « En discussion ».',
    formTemplate: 'partenariat',
    build: () => ({
      name: 'Demande de partenariat → tâche au responsable',
      trigger: { type: 'response.created' },
      actions: [
        act('task.create', {
          title: 'Partenariat : {reponse.entreprise}',
          description: 'Contact : {reponse.contact} — {reponse.email} — {reponse.telephone}\nTypes : {reponse.types|libelle}\nBudget : {reponse.budget} €\n\n{reponse.message}',
          assigneeRoles: ['responsable_partenariats'], dueInDays: 3, priority: 'high', labels: 'partenariat',
        }),
        act('response.setStatus', { status: 'in_review' }),
      ],
    }),
  },
  {
    id: 'adhesion-payee',
    title: 'Adhésion payée → membre + cotisation + reçu',
    description: 'Quand le paiement d\'une adhésion est confirmé : fiche membre, cotisation de l\'année marquée payée (recette liée) et reçu de cotisation inscrit au registre.',
    formTemplate: 'adhesion',
    build: () => ({
      name: 'Adhésion payée → membre + cotisation + reçu',
      trigger: { type: 'payment.paid' },
      actions: [
        act('member.upsert', { firstName: '{reponse.identite.firstName}', lastName: '{reponse.identite.lastName}', email: '{reponse.email}', phone: '{reponse.telephone}', program: '{reponse.formation}', year: '{reponse.annee|libelle}', birthDate: '{reponse.date_naissance}' }),
        act('membership.markPaid', { memberId: '{membre.id}', amount: '{info.montant}' }),
        act('document.issue', { templateId: 'recu-cotisation', memberId: '{membre.id}', format: 'none' }),
      ],
    }),
  },
  {
    id: 'relance-candidature',
    title: 'Candidature non traitée après 7 jours → rappel',
    description: 'Exemple de déclencheur planifié : 7 jours après la réception, si la réponse est toujours « Reçue », crée un rappel d\'agenda et une notification.',
    formTemplate: null,
    build: () => ({
      name: 'Réponse non traitée après 7 jours → rappel',
      trigger: { type: 'schedule', schedule: { from: 'submitted', offsetDays: 7, time: '09:00' } },
      conditions: { mode: 'all', rules: [{ field: 'info.statut', op: 'eq', value: 'received' }], formula: '' },
      actions: [
        act('calendar.reminder', { title: 'Traiter la réponse de {info.email} ({info.formulaire})', inDays: '0', category: 'equipe' }),
        act('app.notify', { title: 'Réponse en attente depuis 7 jours', body: '{info.formulaire} : pense à la traiter.', level: 'warn', section: 'forms' }),
      ],
    }),
  },
];

/** Clés de réponse utilisées par une automatisation. */
export function usedAnswerKeys(automation) {
  const keys = new Set();
  const walk = (v) => {
    if (typeof v === 'string') tokensOf(v).forEach(t => { if (t.startsWith('reponse.')) keys.add(t.split('.')[1]); });
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  (automation.actions || []).forEach(a => walk(a.params));
  (automation.conditions?.rules || []).forEach(r => { if (r.field && !r.field.startsWith('info.')) keys.add(r.field.replace(/^reponse\./, '').split('.')[0]); });
  return [...keys];
}

/** Clés utilisées absentes du formulaire choisi. */
export function missingKeys(automation, definition) {
  if (!definition) return [];
  const known = knownKeys(definition);
  return usedAnswerKeys(automation).filter(k => !known.has(k));
}

/** Formulaire le plus compatible avec un modèle (clés présentes). */
export function bestFormFor(template, definitions) {
  const draft = normalizeAutomation(template.build());
  const keys = usedAnswerKeys(draft);
  let best = null;
  let bestScore = 0;
  Object.values(definitions || {}).forEach(def => {
    if (def.status === 'archived') return;
    const known = knownKeys(def);
    const score = keys.filter(k => known.has(k)).length / Math.max(1, keys.length);
    if (score > bestScore) { best = def; bestScore = score; }
  });
  return bestScore >= 0.6 ? best : null;
}

/** Automatisation (désactivée) prête à être relue dans l'éditeur. */
export function instantiateTemplate(template, formId = null) {
  return normalizeAutomation({ ...template.build(), id: newId(), formId, enabled: false, templateId: template.id, description: template.description });
}
