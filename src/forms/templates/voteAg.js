// Modèle : vote d'assemblée générale / élection du bureau
// Bulletin secret : le serveur stocke séparément l'identité (droit de vote
// consommé) et le bulletin (voir VoteSettings dans src/forms/schema.js).
import { baseDefinition, page, q, opts, text, OFFICIAL_THEME } from './helpers.js';

const ballot = { sensitive: true, required: true };

export default {
  id: 'vote-ag',
  title: 'Vote d\'AG / élection',
  category: 'Démocratie',
  kind: 'vote',
  icon: 'Vote',
  description: 'Bulletin de vote d\'assemblée générale : approbation des comptes, rapport moral et élection du bureau, avec quorum et majorité.',
  highlights: ['Liste électorale (membres)', 'Bulletin secret', 'Quorum et majorité', 'Résultats après clôture'],
  build: () => baseDefinition({
    title: 'Assemblée générale — votes',
    description: 'Un seul vote par adhérent·e. Ton bulletin est secret : il est enregistré séparément de ton identité.',
    kind: 'vote',
    theme: OFFICIAL_THEME,
    pages: [
      page('p_resolutions', 'Résolutions', [
        text('t_intro', 'Pour chaque résolution, choisis Pour, Contre ou Abstention. Les documents (rapport moral, comptes) ont été envoyés avec la convocation.'),
        q('rapport_moral', 'single_choice', 'Résolution 1 — Approbation du rapport moral', { ...ballot, options: opts('Pour', 'Contre', 'Abstention') }),
        q('comptes', 'single_choice', 'Résolution 2 — Approbation des comptes de l\'exercice', { ...ballot, options: opts('Pour', 'Contre', 'Abstention') }),
        q('cotisation_montant', 'single_choice', 'Résolution 3 — Cotisation fixée à 15 € pour l\'année prochaine', { ...ballot, options: opts('Pour', 'Contre', 'Abstention') }),
      ]),
      page('p_election', 'Élection du bureau', [
        q('presidence', 'single_choice', 'Présidence', { ...ballot, options: opts('Liste « Ensemble »', 'Liste « Renouveau »', 'Vote blanc') }),
        q('tresorerie', 'single_choice', 'Trésorerie', { ...ballot, options: opts('Candidat·e A', 'Candidat·e B', 'Vote blanc') }),
      ]),
    ],
    settings: {
      access: 'members',
      identity: 'required',
      onePerPerson: true,
      allowEdit: 'never',
      saveDraft: false,
      showSummary: false,
      retentionDays: 90,
      confirmation: { title: 'Vote enregistré', message: 'Merci d\'avoir voté. Conserve ton reçu : il te permet de vérifier que ton bulletin a été compté.', redirectUrl: '' },
      vote: { electoralRoll: 'members', list: [], anonymous: true, resultsVisibility: 'after_close', quorumPercent: 25, majority: 'simple' },
    },
  }),
};
