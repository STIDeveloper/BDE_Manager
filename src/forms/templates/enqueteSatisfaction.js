// Modèle : enquête de satisfaction après un événement (NPS + échelles)
import { baseDefinition, page, q, opts } from './helpers.js';

export default {
  id: 'enquete-satisfaction',
  title: 'Enquête de satisfaction',
  category: 'Retours',
  kind: 'survey',
  icon: 'Gauge',
  description: 'Mesure la satisfaction après un événement : recommandation (NPS), notes, grille d\'évaluation et suggestions, de façon anonyme.',
  highlights: ['Score de recommandation (NPS)', 'Grille d\'évaluation', 'Question de relance si note basse', 'Anonyme'],
  build: () => baseDefinition({
    title: 'Ton avis sur l\'événement',
    description: '2 minutes pour nous aider à faire encore mieux la prochaine fois. Tes réponses sont anonymes.',
    kind: 'survey',
    theme: 'sunset',
    pages: [
      page('p_avis', 'Ton avis', [
        q('evenement', 'event_picker', 'À quel événement as-tu participé ?', { required: true }),
        q('recommandation', 'nps', 'Recommanderais-tu cet événement à un·e ami·e ?', { required: true, help: '0 = pas du tout, 10 = absolument' }),
        q('decu', 'long_text', 'Qu\'est-ce qui t\'a déçu·e ?', { showIf: 'recommandation <= 6' }),
        q('note_globale', 'rating', 'Note globale', { required: true, max: 5 }),
        q('ambiance', 'scale', 'Ambiance', { min: 1, max: 10, minLabel: 'Décevante', maxLabel: 'Incroyable' }),
        q('aspects', 'matrix', 'Évalue chaque aspect', {
          options: opts('Communication', 'Lieu', 'Prix', 'Animation', 'Organisation'),
          columns: opts('Pas satisfait·e', 'Moyen', 'Satisfait·e', 'Très satisfait·e'),
        }),
      ]),
      page('p_suggestions', 'Suggestions', [
        q('ameliorations', 'long_text', 'Que pourrions-nous améliorer ?'),
        q('prochain', 'multiple_choice', 'Quels événements aimerais-tu voir ensuite ?', {
          options: opts('Soirée à thème', 'Tournoi sportif', 'Afterwork', 'Sortie culturelle', 'Conférence métier'),
          validation: { maxSelected: 3 },
        }),
      ]),
    ],
    settings: {
      access: 'link',
      identity: 'anonymous',
      showSummary: false,
      confirmation: { title: 'Merci pour ton retour !', message: 'Ton avis compte vraiment pour l\'équipe.', redirectUrl: '' },
      retentionDays: 365,
    },
  }),
};
