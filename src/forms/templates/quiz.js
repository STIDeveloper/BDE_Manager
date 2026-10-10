// Modèle : quiz noté (culture de l'école, intégration…)
import { baseDefinition, page, q, opts, text } from './helpers.js';

export default {
  id: 'quiz',
  title: 'Quiz noté',
  category: 'Animation',
  kind: 'quiz',
  icon: 'Trophy',
  description: 'Quiz avec bonnes réponses, points par question, score calculé et message de résultat personnalisé.',
  highlights: ['Bonnes réponses et points', 'Score automatique', 'Résultat calculé (SCORE())', 'Classement possible'],
  build: () => baseDefinition({
    title: 'Quiz — connais-tu bien ton école ?',
    description: '5 questions, 1 point par bonne réponse. Les meilleurs scores gagnent une place pour la prochaine soirée !',
    kind: 'quiz',
    theme: 'dark',
    pages: [
      page('p_joueur', 'Joueur', [
        q('pseudo', 'short_text', 'Ton pseudo', { required: true, validation: { maxLength: 30 } }),
      ]),
      page('p_questions', 'Questions', [
        text('t_regles', 'Une seule réponse par question.'),
        q('q_creation', 'single_choice', 'En quelle année le BDE a-t-il été créé ?', {
          required: true, options: opts('1998', '2005', '2012', '2019'), score: { correct: '2005', points: 1 },
        }),
        q('q_mascotte', 'single_choice', 'Quelle est la mascotte du BDE ?', {
          required: true, options: opts('Un hibou', 'Un renard', 'Un castor'), score: { correct: 'un_renard', points: 1 },
        }),
        q('q_couleurs', 'multiple_choice', 'Quelles sont les couleurs de l\'école ? (plusieurs réponses)', {
          required: true, options: opts('Bleu', 'Rouge', 'Blanc', 'Vert'), score: { perOption: { bleu: 0.5, blanc: 0.5, rouge: -0.5, vert: -0.5 } },
        }),
        q('q_gala', 'yes_no', 'Le gala a-t-il lieu au printemps ?', { required: true, score: { correct: true, points: 1 } }),
        q('q_promo', 'number', 'Combien d\'étudiant·e·s compte la promo de 1re année (environ) ?', { required: true, score: { correct: 120, points: 1 } }),
      ]),
      page('p_resultat', 'Résultat', [
        q('resultat', 'calculated', 'Ton résultat', { expr: 'SI(SCORE() >= 4; "Expert·e ! 🏆"; SI(SCORE() >= 2; "Pas mal du tout !"; "À réviser 😉"))', valueType: 'text' }),
      ]),
    ],
    settings: {
      identity: 'optional',
      showSummary: true,
      confirmation: { title: 'Quiz terminé', message: 'Merci d\'avoir joué ! Les résultats seront annoncés sur nos réseaux.', redirectUrl: '' },
      retentionDays: 90,
    },
  }),
};
