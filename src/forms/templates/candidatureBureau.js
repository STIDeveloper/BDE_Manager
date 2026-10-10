// Modèle : candidature au bureau (recrutement de la nouvelle équipe)
// ------------------------------------------------------------
// Compatible avec le moteur de rôles (src/roleEngine/parser.js), qui lit un
// export CSV dont les EN-TÊTES sont les intitulés des questions
// (mapHeader) : les intitulés ci-dessous sont donc choisis pour être
// reconnus. Correspondance clé → champ du moteur :
//   prenom_nom      « Prénom et nom »                → fullName (name : joindre firstName + ' ' + lastName)
//   telephone       « Numéro de téléphone »          → phone
//   email           « Adresse email »                → email
//   formation       « Formation suivie »             → formation
//   alternance      « Es-tu en alternance ? »        → alternance (libellé « Oui » / « Non » : /oui/i)
//   annee           « Ton année »                    → year (valeurs exactes 'BUT 1' | 'BUT 2' | 'BUT 3' | 'Master')
//   choix_1/2/3     « Premier / Deuxième / Troisième choix de rôle » → choice1/2/3
//                   (source 'roles' : la valeur est l'id du rôle du catalogue ; à l'export,
//                    écrire le LIBELLÉ du rôle, que parseRoleLabel() reconnaît)
//   pourquoi        « Pourquoi veux-tu rejoindre le bureau ? »       → whyText
//   decouvrir       « Qu'aimerais-tu découvrir ou apprendre ? »      → discoverText
//   apporter        « Que peux-tu apporter à l'équipe ? »            → contributeText
//   rythme          « Quel rythme d'engagement peux-tu tenir ? »     → availabilityRaw
//                   (libellés reconnus par parseAvailability : « Dispo et réactif »,
//                    « Régulier avec des limites », « Investissement ciblé »,
//                    « Emploi du temps très chargé »)
//   couteau_suisse  « Prêt·e à être couteau suisse (profil hybride) ? » → swissKnifeRaw
//                   (parseSwissKnife : « Carrément », « Pourquoi pas », « Pas vraiment »)
// Pour l'export vers le moteur, utiliser les LIBELLÉS des options (pas les valeurs).
import { baseDefinition, page, q, opts, text } from './helpers.js';

export default {
  id: 'candidature-bureau',
  title: 'Candidature au bureau',
  category: 'Recrutement',
  kind: 'application',
  icon: 'Users',
  description: 'Recrute la prochaine équipe : coordonnées, trois choix de rôles tirés de ton catalogue, motivations, disponibilité. Compatible avec le moteur d\'attribution des rôles.',
  highlights: ['3 choix de rôles alimentés par le catalogue', 'Compatible moteur de rôles', 'Statuts de traitement (entretien, retenu…)', 'Une candidature par personne'],
  build: () => baseDefinition({
    title: 'Candidature au bureau du BDE',
    description: 'Tu veux rejoindre la prochaine équipe ? Dis-nous qui tu es, ce qui te motive et les rôles qui t\'intéressent.',
    kind: 'application',
    theme: 'dark',
    pages: [
      page('p_coordonnees', 'Tes coordonnées', [
        q('prenom_nom', 'name', 'Prénom et nom', { required: true }),
        q('telephone', 'phone', 'Numéro de téléphone', { required: true, sensitive: true }),
        q('email', 'email', 'Adresse email', { required: true }),
        q('formation', 'short_text', 'Formation suivie', { required: true, placeholder: 'ex. BUT Informatique' }),
        q('alternance', 'single_choice', 'Es-tu en alternance ?', { required: true, options: opts('Oui', 'Non') }),
        q('annee', 'single_choice', 'Ton année', {
          required: true,
          options: [{ value: 'BUT 1', label: 'BUT 1' }, { value: 'BUT 2', label: 'BUT 2' }, { value: 'BUT 3', label: 'BUT 3' }, { value: 'Master', label: 'Master' }],
        }),
      ]),
      page('p_roles', 'Les rôles qui t\'intéressent', [
        text('t_roles', 'Classe jusqu\'à trois rôles par ordre de préférence. Les descriptions des rôles sont disponibles auprès du bureau actuel.'),
        q('choix_1', 'dropdown', 'Premier choix de rôle', { required: true, source: 'roles' }),
        q('choix_2', 'dropdown', 'Deuxième choix de rôle', { source: 'roles', showIf: 'NON_VIDE(choix_1)' }),
        q('choix_3', 'dropdown', 'Troisième choix de rôle', { source: 'roles', showIf: 'NON_VIDE(choix_2)' }),
      ]),
      page('p_motivation', 'Motivation et disponibilité', [
        q('pourquoi', 'long_text', 'Pourquoi veux-tu rejoindre le bureau ?', { required: true, validation: { minLength: 50, maxLength: 2000 } }),
        q('decouvrir', 'long_text', 'Qu\'aimerais-tu découvrir ou apprendre ?', { validation: { maxLength: 2000 } }),
        q('apporter', 'long_text', 'Que peux-tu apporter à l\'équipe ?', { validation: { maxLength: 2000 } }),
        q('rythme', 'single_choice', 'Quel rythme d\'engagement peux-tu tenir ?', {
          required: true,
          options: opts('Dispo et réactif', 'Régulier avec des limites', 'Investissement ciblé', 'Emploi du temps très chargé'),
        }),
        q('couteau_suisse', 'single_choice', 'Prêt·e à être couteau suisse (profil hybride) ?', {
          required: true,
          help: 'Accepterais-tu d\'aider sur d\'autres missions que ton rôle ?',
          options: opts('Carrément', 'Pourquoi pas', 'Pas vraiment'),
        }),
        q('rgpd', 'consent', 'J\'accepte que ma candidature soit conservée jusqu\'à la fin du recrutement.', { required: true }),
      ]),
    ],
    settings: {
      identity: 'optional',
      onePerPerson: true,
      allowEdit: 'until_review',
      retentionDays: 120,
      statuses: [
        { id: 'received', label: 'Reçue', color: 'blue' },
        { id: 'interview', label: 'Entretien prévu', color: 'amber' },
        { id: 'shortlist', label: 'Présélectionnée', color: 'violet' },
        { id: 'accepted', label: 'Retenue', color: 'emerald', final: true },
        { id: 'rejected', label: 'Non retenue', color: 'red', final: true },
      ],
      confirmation: { title: 'Candidature envoyée', message: 'Merci ! Le bureau te recontacte pour un entretien.', redirectUrl: '' },
      notifications: { onSubmit: [], respondentReceipt: true },
    },
  }),
};
