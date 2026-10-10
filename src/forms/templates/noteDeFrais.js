// Modèle : note de frais (remboursement de dépenses avancées)
import { baseDefinition, page, q, section, OFFICIAL_THEME } from './helpers.js';

export default {
  id: 'note-de-frais',
  title: 'Note de frais',
  category: 'Finances',
  kind: 'standard',
  icon: 'Receipt',
  description: 'Demande de remboursement : dépenses répétables avec justificatif, total calculé automatiquement, RIB et suivi du traitement.',
  highlights: ['Dépenses répétables', 'Total calculé (SOMME)', 'Justificatifs obligatoires', 'Statuts : validée, remboursée'],
  build: () => baseDefinition({
    title: 'Note de frais',
    description: 'Tu as avancé des frais pour le BDE ? Déclare-les ici avec les justificatifs.',
    kind: 'standard',
    theme: OFFICIAL_THEME,
    pages: [
      page('p_demandeur', 'Demandeur', [
        q('demandeur', 'member_picker', 'Membre du BDE', { required: true }),
        q('evenement', 'event_picker', 'Événement concerné', { help: 'Laisse vide si la dépense ne concerne pas un événement.' }),
      ]),
      page('p_depenses', 'Dépenses', [
        section('s_depenses', 'Dépense', [
          q('date_depense', 'date', 'Date', { required: true, validation: { max: 'today' } }),
          q('libelle', 'short_text', 'Objet de la dépense', { required: true, placeholder: 'ex. Courses pour la soirée' }),
          q('montant', 'number', 'Montant TTC (€)', { required: true, validation: { min: 0.01, max: 5000 } }),
          q('justificatif', 'file', 'Justificatif (ticket, facture)', { required: true, validation: { maxFiles: 2, maxFileSizeMb: 5, accept: ['application/pdf', 'image/*'] } }),
        ], { key: 'depenses', repeat: { min: 1, max: 20, addLabel: 'Ajouter une dépense' } }),
        q('total', 'calculated', 'Total à rembourser (€)', { expr: 'SOMME(montant)', valueType: 'number' }),
      ]),
      page('p_remboursement', 'Remboursement', [
        q('rib', 'file', 'RIB', { required: true, sensitive: true, validation: { maxFiles: 1, maxFileSizeMb: 5, accept: ['application/pdf', 'image/*'] } }),
        q('certification', 'consent', 'Je certifie l\'exactitude des dépenses déclarées.', { required: true }),
      ]),
    ],
    settings: {
      access: 'members',
      identity: 'required',
      allowEdit: 'until_review',
      retentionDays: 3650,
      statuses: [
        { id: 'received', label: 'Reçue', color: 'blue' },
        { id: 'in_review', label: 'En vérification', color: 'amber' },
        { id: 'accepted', label: 'Validée', color: 'emerald' },
        { id: 'paid', label: 'Remboursée', color: 'violet', final: true },
        { id: 'rejected', label: 'Refusée', color: 'red', final: true },
      ],
      confirmation: { title: 'Note de frais envoyée', message: 'Le trésorier vérifie ta demande. Tu seras prévenu·e du remboursement.', redirectUrl: '' },
      notifications: { onSubmit: [], respondentReceipt: true },
    },
  }),
};
