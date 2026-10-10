// Modèle : adhésion / cotisation annuelle
import { baseDefinition, page, q, opts, columns } from './helpers.js';

export default {
  id: 'adhesion',
  title: 'Adhésion et cotisation',
  category: 'Vie associative',
  kind: 'standard',
  icon: 'IdCard',
  description: 'Bulletin d\'adhésion complet : identité, formation, formule de cotisation payée en ligne, droit à l\'image et acceptation des statuts.',
  highlights: ['Formules de cotisation avec prix', 'Droit à l\'image', 'Acceptation des statuts', 'Reçu PDF'],
  build: () => baseDefinition({
    title: 'Adhésion au BDE',
    description: 'Deviens adhérent·e et profite des réductions sur tous les événements de l\'année.',
    kind: 'standard',
    theme: 'light',
    pages: [
      page('p_adherent', 'Tes informations', [
        q('identite', 'name', 'Prénom et nom', { required: true }),
        columns('c_contact',
          [q('email', 'email', 'Adresse e-mail', { required: true, prefillFrom: 'member.email' })],
          [q('telephone', 'phone', 'Téléphone', { prefillFrom: 'member.phone' })],
        ),
        q('date_naissance', 'date', 'Date de naissance', { required: true, sensitive: true, validation: { max: 'today' } }),
        q('formation', 'short_text', 'Formation', { required: true, placeholder: 'ex. BUT GEA' }),
        q('annee', 'dropdown', 'Année d\'études', { required: true, options: opts('1re année', '2e année', '3e année', 'Master', 'Autre') }),
      ]),
      page('p_cotisation', 'Cotisation', [
        q('cotisation', 'payment', 'Formule de cotisation', {
          required: true, currency: 'EUR',
          options: opts(
            { value: 'annuelle', label: 'Adhésion annuelle', price: 15 },
            { value: 'semestrielle', label: 'Adhésion semestrielle', price: 10 },
            { value: 'soutien', label: 'Adhésion de soutien', price: 30 },
          ),
        }),
        q('droit_image', 'yes_no', 'J\'autorise le BDE à publier des photos où j\'apparais (réseaux sociaux, site).', { required: true }),
        q('statuts', 'consent', 'J\'ai pris connaissance des statuts et du règlement intérieur du BDE et je les accepte.', { required: true }),
      ]),
    ],
    settings: {
      onePerPerson: true,
      pdfReceipt: true,
      notifications: { onSubmit: [], respondentReceipt: true },
      confirmation: { title: 'Bienvenue au BDE !', message: 'Ton adhésion est enregistrée. Ton reçu t\'est envoyé par e-mail.', redirectUrl: '' },
      retentionDays: 400,
    },
  }),
};
