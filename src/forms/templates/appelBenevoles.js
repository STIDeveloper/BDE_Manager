// Modèle : appel à bénévoles pour un événement
import { baseDefinition, page, q, opts } from './helpers.js';

export default {
  id: 'appel-benevoles',
  title: 'Appel à bénévoles',
  category: 'Événements',
  kind: 'registration',
  icon: 'HandHeart',
  description: 'Mobilise des bénévoles : missions souhaitées, créneaux de disponibilité, expérience, taille de t-shirt et permis si logistique.',
  highlights: ['Missions au choix', 'Créneaux avec capacité', 'Question permis si logistique', 'Taille de t-shirt'],
  build: () => baseDefinition({
    title: 'Deviens bénévole pour le gala',
    description: 'Le gala a besoin de toi ! Choisis tes missions et tes créneaux.',
    kind: 'registration',
    theme: 'forest',
    pages: [
      page('p_benevole', 'Toi', [
        q('identite', 'name', 'Prénom et nom', { required: true }),
        q('email', 'email', 'Adresse e-mail', { required: true, prefillFrom: 'member.email' }),
        q('telephone', 'phone', 'Téléphone', { required: true, prefillFrom: 'member.phone' }),
      ]),
      page('p_missions', 'Missions et disponibilités', [
        q('missions', 'multiple_choice', 'Missions qui t\'intéressent', {
          required: true,
          options: opts('Accueil et billetterie', 'Bar', 'Logistique (montage / démontage)', 'Communication et photos', 'Sécurité / prévention'),
          validation: { minSelected: 1, maxSelected: 3 },
        }),
        q('permis', 'yes_no', 'As-tu le permis B ?', { showIf: 'CONTIENT(missions; "logistique_montage_demontage")', required: true }),
        q('disponibilites', 'slots', 'Créneaux où tu es disponible', {
          required: true, multiple: true,
          options: [
            { value: 'montage', label: 'Montage (14 h – 18 h)', capacity: 15 },
            { value: 'soiree_1', label: 'Soirée (19 h – 23 h)', capacity: 25 },
            { value: 'soiree_2', label: 'Nuit (23 h – 3 h)', capacity: 20 },
            { value: 'demontage', label: 'Démontage (lendemain 10 h)', capacity: 15 },
          ],
        }),
        q('experience', 'yes_no', 'As-tu déjà été bénévole sur un événement ?'),
        q('tshirt', 'dropdown', 'Taille de t-shirt', { required: true, options: opts('XS', 'S', 'M', 'L', 'XL', 'XXL') }),
      ]),
    ],
    settings: {
      onePerPerson: true,
      allowEdit: 'until_close',
      notifications: { onSubmit: [], respondentReceipt: true },
      confirmation: { title: 'Merci de ton engagement !', message: 'Le pôle événementiel te contactera pour confirmer tes créneaux.', redirectUrl: '' },
      retentionDays: 120,
    },
  }),
};
