// Modèle : inscription à un événement (WEI, gala, voyage…)
// Créneaux de navette avec capacité, régime alimentaire, autorisation
// parentale affichée seulement si AGE(date_naissance) < 18, tarif calculé
// selon la formule et l'adhésion, paiement du montant calculé.
import { baseDefinition, page, q, opts, text } from './helpers.js';

export default {
  id: 'inscription-evenement',
  title: 'Inscription à un événement',
  category: 'Événements',
  kind: 'registration',
  icon: 'PartyPopper',
  description: 'Inscriptions avec créneaux de transport, régime alimentaire, autorisation parentale pour les mineurs et paiement selon le tarif.',
  highlights: ['Créneaux avec capacité', 'Page « autorisation parentale » si mineur', 'Tarif calculé (formule − réduction adhérent)', 'Quota et liste d\'attente'],
  build: () => baseDefinition({
    title: 'Inscription — Week-end d\'intégration',
    description: 'Réserve ta place pour le week-end ! Les places sont limitées : premier arrivé, premier servi.',
    kind: 'registration',
    theme: 'night',
    pages: [
      page('p_toi', 'Toi', [
        q('identite', 'name', 'Prénom et nom', { required: true }),
        q('email', 'email', 'Adresse e-mail', { required: true, prefillFrom: 'member.email', help: 'Ta confirmation et ton billet y seront envoyés.' }),
        q('telephone', 'phone', 'Téléphone', { required: true, prefillFrom: 'member.phone' }),
        q('date_naissance', 'date', 'Date de naissance', { required: true, sensitive: true, validation: { max: 'today' } }),
        q('adherent', 'yes_no', 'Es-tu adhérent·e du BDE ?', { required: true, help: 'Les adhérent·e·s bénéficient de 5 € de réduction.' }),
      ]),
      page('p_participation', 'Ta participation', [
        q('formule', 'single_choice', 'Formule', {
          required: true,
          options: opts({ value: 'complete', label: 'Week-end complet (transport, hébergement, repas)', price: 45 }, { value: 'soiree', label: 'Soirée du samedi uniquement', price: 20 }),
        }),
        q('navette', 'slots', 'Navette aller', {
          required: 'formule = "complete"', showIf: 'formule = "complete"',
          help: 'Choisis ton horaire de départ (50 places par car).',
          options: opts({ value: 'ven_17h', label: 'Vendredi 17 h 00', capacity: 50 }, { value: 'ven_18h30', label: 'Vendredi 18 h 30', capacity: 50 }, { value: 'sam_9h', label: 'Samedi 9 h 00', capacity: 50 }),
        }),
        q('regime', 'single_choice', 'Régime alimentaire', {
          required: true,
          options: opts('Aucun', 'Végétarien', 'Végan', 'Sans porc', 'Sans gluten', 'Autre'),
        }),
        q('regime_autre', 'short_text', 'Précise ton régime', { showIf: 'regime = "autre"', required: true }),
        q('allergies', 'long_text', 'Allergies ou informations médicales utiles', { sensitive: true, help: 'Uniquement transmis aux responsables sécurité.' }),
      ]),
      page('p_parent', 'Autorisation parentale', [
        text('t_parent', 'Tu es mineur·e : un parent ou responsable légal doit compléter cette page.'),
        q('parent_nom', 'name', 'Nom du responsable légal', { required: true }),
        q('parent_email', 'email', 'E-mail du responsable légal', { required: true }),
        q('parent_telephone', 'phone', 'Téléphone joignable pendant l\'événement', { required: true }),
        q('autorisation_parentale', 'consent', 'J\'autorise mon enfant à participer à l\'événement et les organisateurs à prendre toute mesure d\'urgence médicale nécessaire.', { required: true }),
        q('signature_parent', 'signature', 'Signature du responsable légal', { required: true }),
      ], { logic: { showIf: 'AGE(date_naissance) < 18' } }),
      page('p_paiement', 'Paiement', [
        q('recap_tarif', 'calculated', 'Montant à régler', { expr: 'tarif', valueType: 'number', help: 'Calculé selon ta formule et ton adhésion.' }),
        q('paiement', 'payment', 'Paiement', { required: true, amount: { expr: 'tarif' }, currency: 'EUR' }),
        q('rgpd', 'consent', 'J\'accepte que mes données soient utilisées pour l\'organisation de l\'événement.', { required: true }),
      ]),
    ],
    variables: [
      { key: 'tarif', label: 'Tarif à payer (€)', type: 'number', expr: 'MAX(0; CHOIX(formule; "complete"; 45; "soiree"; 20; 0) - SI(adherent; 5; 0))' },
    ],
    settings: {
      onePerPerson: true,
      waitlist: true,
      maxResponses: 150,
      quotas: [{ expr: 'formule = "complete"', max: 120, message: 'Le week-end complet est complet : tu es inscrit·e sur liste d\'attente.' }],
      pdfReceipt: true,
      notifications: { onSubmit: [], respondentReceipt: true },
      confirmation: { title: 'Inscription enregistrée 🎉', message: 'Tu recevras un e-mail de confirmation. À très vite !', redirectUrl: '' },
      retentionDays: 180,
    },
  }),
};
