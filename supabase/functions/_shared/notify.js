// ============================================================
// Cœur de la fonction Edge « brevo-send » (messages d'organisateurs).
// L'appelant doit être connecté et avoir « formulaires » en écriture dans
// l'espace. Les destinataires sont résolus CÔTÉ SERVEUR : répondants de
// l'espace (identifiants de réponses) ou comptes membres de l'espace —
// impossible d'écrire à une adresse arbitraire.
// ============================================================

import { HttpError } from './http.js';
import { sha256Hex, isPlainObject, logTech, UUID_RX } from './util.js';
import { adminMessageEmail } from './emails.js';

export function parseNotifyBody(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'Requête invalide.');
  const { workspaceId, responseIds = [], to = [], subject, message, link } = body;
  if (typeof workspaceId !== 'string' || !UUID_RX.test(workspaceId)) throw new HttpError(400, 'Espace invalide.');
  if (!Array.isArray(responseIds) || responseIds.length > 500 || !responseIds.every(id => typeof id === 'string' && UUID_RX.test(id))) {
    throw new HttpError(400, 'Liste de réponses invalide (500 maximum).');
  }
  if (!Array.isArray(to) || to.length > 200 || !to.every(e => typeof e === 'string' && e.length <= 254)) {
    throw new HttpError(400, 'Liste de destinataires invalide (200 maximum).');
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 180) throw new HttpError(400, 'Objet requis (180 caractères maximum).');
  if (typeof message !== 'string' || !message.trim() || message.length > 10000) throw new HttpError(400, 'Message requis (10 000 caractères maximum).');
  let safeLink = null;
  if (link !== undefined && link !== null) {
    if (!isPlainObject(link) || typeof link.url !== 'string' || !/^https:\/\/[^\s"<>]{1,500}$/.test(link.url)) throw new HttpError(400, 'Lien invalide (https uniquement).');
    safeLink = { url: link.url, label: typeof link.label === 'string' ? link.label.slice(0, 60) : 'Ouvrir' };
  }
  return { workspaceId, responseIds, to, subject: subject.trim(), message: message.trim(), link: safeLink };
}

/** @returns {Promise<{ status, body }>} */
export async function handleNotify({ body, userJwt }, deps) {
  if (!deps.sendEmail) throw new HttpError(503, 'Envoi d’e-mails non configuré (BREVO_API_KEY / BREVO_SENDER_EMAIL).');
  if (!userJwt) throw new HttpError(401, 'Connexion requise.');
  const user = await deps.getUser(userJwt);
  if (!user) throw new HttpError(401, 'Session expirée : reconnecte-toi.');
  const input = parseNotifyBody(body);

  const cap = await deps.rpc('forms_user_capability', { p_user: user.id, p_ws: input.workspaceId, p_capability: 'forms', p_level: 'write' });
  if (cap.error) { logTech('brevo-send', 'contrôle des droits', cap.error); throw new HttpError(500, 'Erreur du serveur.'); }
  if (cap.data !== true) throw new HttpError(403, 'Droit « formulaires » en écriture requis dans cet espace.');

  const rl = await deps.rpc('forms_rate_limit_hit', { p_key_hash: await sha256Hex(`brevo|${input.workspaceId}`), p_limit: 30, p_window_seconds: 3600 });
  if (rl.error) { logTech('brevo-send', 'limitation', rl.error); throw new HttpError(500, 'Erreur du serveur.'); }
  if (rl.data !== true) throw new HttpError(429, 'Trop d’envois pour cet espace : réessaie dans une heure.');

  const rec = await deps.rpc('forms_resolve_recipients', { p_ws: input.workspaceId, p_response_ids: input.responseIds, p_emails: input.to });
  if (rec.error) { logTech('brevo-send', 'destinataires', rec.error); throw new HttpError(500, 'Erreur du serveur.'); }
  const emails = Array.isArray(rec.data?.emails) ? rec.data.emails : [];
  if (!emails.length) throw new HttpError(422, 'Aucun destinataire valide (répondants ou membres de l’espace uniquement).');

  const mail = adminMessageEmail({ subject: input.subject, message: input.message, link: input.link, orgName: deps.orgName });
  let sent = 0;
  for (let i = 0; i < emails.length; i += 50) {
    const batch = emails.slice(i, i + 50);
    const r = await deps.sendEmail({ to: batch.map(email => ({ email })), ...mail });
    if (r?.ok) sent += batch.length;
    else logTech('brevo-send', 'lot refusé par Brevo', { code: r?.status });
  }
  const requested = input.responseIds.length + input.to.length;
  return { status: sent ? 200 : 502, body: { ok: sent > 0, sent, ignored: Math.max(requested - emails.length, 0), ...(sent ? {} : { error: 'Brevo a refusé l’envoi : vérifie la clé et l’expéditeur.' }) } };
}
