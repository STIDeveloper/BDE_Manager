// Actions « réponse » et « communication » : statut, email, notification.
import { notify } from '../notifications.js';
import { str, toList, fail, EMAIL_RX } from './helpers.js';

export const responseStatus = {
  id: 'response.setStatus',
  label: 'Changer le statut de la réponse',
  description: 'Fait passer la réponse à un statut du formulaire (ex. « En cours », « Validé »). Déclenche les automatisations « changement de statut ».',
  module: 'Formulaires',
  icon: 'Tags',
  capability: ['forms', 'write'],
  params: [
    { key: 'status', label: 'Nouveau statut', type: 'status', required: true, mappable: false },
  ],
  async run(p, ctx) {
    const status = str(p.status);
    if (!status) fail('Statut manquant.');
    if (!ctx.response?.id) fail('Aucune réponse liée à cette exécution.');
    const label = ctx.statusLabel(status);
    if (ctx.response.status === status) return { ok: true, summary: `La réponse est déjà au statut « ${label} ».` };
    if (ctx.simulate) return { ok: true, summary: `Passerait la réponse de « ${ctx.statusLabel(ctx.response.status)} » à « ${label} ».` };
    await ctx.setResponseStatus(status);
    return { ok: true, summary: `Statut de la réponse : « ${label} ».`, output: { status } };
  },
};

export const emailSend = {
  id: 'email.send',
  label: 'Envoyer un email',
  description: 'Mode connecté : envoi par le serveur (Brevo) au répondant ou aux comptes membres. Mode local : email préparé (lien à ouvrir depuis la notification).',
  module: 'Communication',
  icon: 'Mail',
  capability: ['forms', 'write'],
  params: [
    { key: 'recipient', label: 'Destinataire', type: 'select', default: 'respondent', mappable: false, options: [
      { value: 'respondent', label: 'Le répondant' }, { value: 'custom', label: 'Adresses précisées' },
    ] },
    { key: 'to', label: 'Adresses (si « précisées »)', type: 'text', help: 'Séparées par des virgules. En mode connecté : comptes membres de l\'espace uniquement.' },
    { key: 'subject', label: 'Objet', type: 'text', required: true },
    { key: 'message', label: 'Message', type: 'textarea', required: true },
  ],
  async run(p, ctx) {
    const subject = str(p.subject);
    const message = String(p.message ?? '').trim();
    if (!subject || !message) fail('Objet et message obligatoires.');
    const toRespondent = p.recipient !== 'custom';
    const to = toRespondent ? [str(ctx.scope.info.email)].filter(Boolean) : toList(p.to);
    const invalid = to.filter(e => !EMAIL_RX.test(e));
    if (!to.length) fail(toRespondent ? 'Le répondant n\'a pas laissé d\'adresse email.' : 'Aucune adresse destinataire.');
    if (invalid.length) fail(`Adresse invalide : ${invalid[0]}`);
    if (ctx.connected && ctx.formsApi?.sendFormEmail) {
      if (ctx.simulate) return { ok: true, summary: `Enverrait « ${subject} » à ${to.length} destinataire(s) via le serveur.` };
      const res = await ctx.formsApi.sendFormEmail(toRespondent && ctx.response?.id ? { responseIds: [ctx.response.id], subject, message } : { to, subject, message });
      if (!res.sent) fail(`Email non envoyé (${res.ignored || 0} destinataire(s) ignoré(s) : le serveur n'envoie qu'au répondant ou aux comptes membres).`);
      return { ok: true, summary: `Email « ${subject} » envoyé (${res.sent})${res.ignored ? `, ${res.ignored} ignoré(s)` : ''}.`, output: { sent: res.sent } };
    }
    const href = `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    if (ctx.simulate) return { ok: true, summary: `Préparerait l'email « ${subject} » pour ${to.join(', ')} (mode local : envoi manuel).` };
    notify({ title: `Email à envoyer : ${subject}`, body: `Destinataire(s) : ${to.length}. Ouvre le lien pour l'envoyer depuis ta messagerie.`, level: 'warn', link: { href, label: 'Ouvrir l\'email' }, source: ctx.automation.name });
    return { ok: true, summary: `Email préparé (mode local, envoi manuel) : « ${subject} ».`, links: [{ label: 'Ouvrir l\'email', href }], output: { prepared: true } };
  },
};

export const appNotify = {
  id: 'app.notify',
  label: 'Notifier dans l\'application',
  description: 'Ajoute une notification dans le centre de notifications (cloche de l\'en-tête).',
  module: 'Communication',
  icon: 'Bell',
  capability: ['forms', 'read'],
  params: [
    { key: 'title', label: 'Titre', type: 'text', required: true, default: 'Nouvelle réponse : {info.formulaire}' },
    { key: 'body', label: 'Message', type: 'textarea' },
    { key: 'level', label: 'Importance', type: 'select', default: 'info', mappable: false, options: [
      { value: 'info', label: 'Information' }, { value: 'success', label: 'Succès' }, { value: 'warn', label: 'À traiter' },
    ] },
    { key: 'section', label: 'Lien vers', type: 'select', default: 'forms', mappable: false, options: [
      { value: '', label: 'Aucun' }, { value: 'forms', label: 'Formulaires' }, { value: 'automations', label: 'Automatisations' }, { value: 'kanban', label: 'Membres' },
      { value: 'events', label: 'Événements' }, { value: 'finance', label: 'Trésorerie' }, { value: 'tasks', label: 'Tâches' }, { value: 'calendar', label: 'Agenda' },
    ] },
  ],
  run(p, ctx) {
    const title = str(p.title);
    if (!title) fail('Titre de la notification manquant.');
    if (ctx.simulate) return { ok: true, summary: `Notifierait : « ${title} ».` };
    const n = notify({ title, body: String(p.body ?? '').trim(), level: p.level, link: p.section ? { section: p.section } : null, source: ctx.automation.name, dedupeKey: ctx.key });
    return { ok: true, summary: `Notification ajoutée : « ${n.title} ».`, output: { notificationId: n.id } };
  },
};
