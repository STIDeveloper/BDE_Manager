// Modèle : demande de partenariat (entreprises, associations, commerces)
import { baseDefinition, page, q, opts, columns } from './helpers.js';

export default {
  id: 'partenariat',
  title: 'Demande de partenariat',
  category: 'Communication',
  kind: 'application',
  icon: 'Handshake',
  description: 'Recueille les propositions de partenaires : structure, contact, type de partenariat, budget envisagé et présentation.',
  highlights: ['Coordonnées de la structure', 'Types de partenariat', 'Budget conditionnel', 'Pièce jointe (plaquette)'],
  build: () => baseDefinition({
    title: 'Devenir partenaire du BDE',
    description: 'Vous souhaitez soutenir la vie étudiante ? Présentez-nous votre structure, nous revenons vers vous sous une semaine.',
    kind: 'application',
    theme: 'light',
    pages: [
      page('p_structure', 'Votre structure', [
        q('entreprise', 'short_text', 'Nom de la structure', { required: true }),
        q('secteur', 'dropdown', 'Secteur', { options: opts('Commerce / restauration', 'Banque / assurance', 'Tech / numérique', 'Industrie', 'Association', 'Autre') }),
        q('site', 'url', 'Site web'),
        q('contact', 'name', 'Personne à contacter', { required: true }),
        columns('c_coord',
          [q('email', 'email', 'E-mail', { required: true })],
          [q('telephone', 'phone', 'Téléphone')],
        ),
      ]),
      page('p_proposition', 'Votre proposition', [
        q('types', 'multiple_choice', 'Type de partenariat envisagé', {
          required: true,
          options: opts('Sponsoring financier', 'Dotations / lots', 'Réductions pour les étudiants', 'Visibilité lors d\'un événement', 'Recrutement / stages'),
        }),
        q('budget', 'number', 'Budget envisagé (€)', { showIf: 'CONTIENT(types; "sponsoring_financier")', validation: { min: 0 } }),
        q('message', 'long_text', 'Présentez votre proposition', { required: true, validation: { minLength: 30, maxLength: 3000 } }),
        q('plaquette', 'file', 'Plaquette de présentation', { validation: { maxFiles: 1, maxFileSizeMb: 10, accept: ['application/pdf'] } }),
        q('rgpd', 'consent', 'J\'accepte que ces informations soient utilisées pour étudier ma demande.', { required: true }),
      ]),
    ],
    settings: {
      access: 'public',
      identity: 'anonymous',
      antiSpam: { turnstile: true, honeypot: true, rateLimitPerHour: 5 },
      statuses: [
        { id: 'received', label: 'Reçue', color: 'blue' },
        { id: 'in_review', label: 'En discussion', color: 'amber' },
        { id: 'accepted', label: 'Partenariat signé', color: 'emerald', final: true },
        { id: 'rejected', label: 'Sans suite', color: 'zinc', final: true },
      ],
      confirmation: { title: 'Merci !', message: 'Votre demande a bien été reçue. Nous revenons vers vous rapidement.', redirectUrl: '' },
      notifications: { onSubmit: [], respondentReceipt: true },
      retentionDays: 730,
    },
  }),
};
