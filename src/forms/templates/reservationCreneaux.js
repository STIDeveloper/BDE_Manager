// Modèle : réservation de créneaux (permanences, rendez-vous)
import { baseDefinition, page, q, opts } from './helpers.js';

const slot = (value, label, capacity = 3) => ({ value, label, capacity });

export default {
  id: 'reservation-creneaux',
  title: 'Réservation de créneaux',
  category: 'Vie associative',
  kind: 'booking',
  icon: 'CalendarRange',
  description: 'Prise de rendez-vous sur des créneaux à capacité limitée : permanences du BDE, retrait de commandes, entretiens.',
  highlights: ['Créneaux à capacité', 'Créneaux complets masqués', 'Rappel par e-mail', 'Modification possible'],
  build: () => baseDefinition({
    title: 'Réserve ton créneau de permanence',
    description: 'Choisis un créneau pour passer au local du BDE (retrait de sweats, adhésions, questions).',
    kind: 'booking',
    theme: 'forest',
    pages: [
      page('p_reservation', 'Réservation', [
        q('identite', 'name', 'Prénom et nom', { required: true }),
        q('email', 'email', 'Adresse e-mail', { required: true, prefillFrom: 'member.email' }),
        q('motif', 'dropdown', 'Motif de ta venue', { required: true, options: opts('Retrait de commande', 'Adhésion', 'Question / renseignement', 'Autre') }),
        q('creneau', 'slots', 'Créneau', {
          required: true,
          help: '3 personnes maximum par créneau.',
          options: [
            slot('lun_12h', 'Lundi 12 h – 12 h 30'), slot('lun_12h30', 'Lundi 12 h 30 – 13 h'),
            slot('mar_12h', 'Mardi 12 h – 12 h 30'), slot('mar_12h30', 'Mardi 12 h 30 – 13 h'),
            slot('jeu_17h', 'Jeudi 17 h – 17 h 30'), slot('jeu_17h30', 'Jeudi 17 h 30 – 18 h'),
          ],
        }),
        q('commentaire', 'long_text', 'Commentaire', { validation: { maxLength: 500 } }),
      ]),
    ],
    settings: {
      onePerPerson: true,
      allowEdit: 'until_close',
      notifications: { onSubmit: [], respondentReceipt: true },
      confirmation: { title: 'Créneau réservé', message: 'Ton créneau est confirmé. Tu peux le modifier depuis le lien reçu par e-mail.', redirectUrl: '' },
      retentionDays: 60,
    },
  }),
};
