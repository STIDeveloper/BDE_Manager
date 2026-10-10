// Modèle : formulaire de contact
import { baseDefinition, page, q, opts } from './helpers.js';

export default {
  id: 'contact',
  title: 'Formulaire de contact',
  category: 'Communication',
  kind: 'standard',
  icon: 'Mail',
  description: 'Le formulaire de contact simple et efficace : sujet, message, réponse souhaitée, protection anti-spam.',
  highlights: ['Sujet aiguillé', 'Anti-spam', 'Accusé de réception', 'Intégrable sur un site'],
  build: () => baseDefinition({
    title: 'Contacter le BDE',
    description: 'Une question, une idée, un souci ? Écris-nous, on te répond vite.',
    kind: 'standard',
    theme: 'light',
    pages: [
      page('p_contact', 'Contact', [
        q('identite', 'name', 'Prénom et nom', { required: true }),
        q('email', 'email', 'Adresse e-mail', { required: true, prefillFrom: 'member.email' }),
        q('sujet', 'dropdown', 'Sujet', { required: true, options: opts('Adhésion', 'Événements', 'Partenariat', 'Problème / réclamation', 'Autre') }),
        q('message', 'long_text', 'Message', { required: true, validation: { minLength: 10, maxLength: 3000 } }),
        q('rappel', 'yes_no', 'Souhaites-tu être rappelé·e ?'),
        q('telephone', 'phone', 'Téléphone', { showIf: 'rappel', required: 'rappel' }),
        q('source', 'hidden', 'Provenance', { prefillFrom: 'url:source' }),
      ]),
    ],
    settings: {
      access: 'public',
      identity: 'anonymous',
      showSummary: false,
      antiSpam: { turnstile: true, honeypot: true, rateLimitPerHour: 10 },
      embed: { allowed: true, origins: [] },
      notifications: { onSubmit: [], respondentReceipt: true },
      confirmation: { title: 'Message envoyé', message: 'Merci ! Nous te répondons sous 48 h.', redirectUrl: '' },
      retentionDays: 365,
    },
  }),
};
