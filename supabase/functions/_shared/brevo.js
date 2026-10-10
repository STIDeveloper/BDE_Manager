// ============================================================
// Envoi transactionnel via l'API Brevo (https://api.brevo.com/v3/smtp/email)
// Secrets : BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME.
// ============================================================

import { fetchWithTimeout, isEmail } from './util.js';

export function brevoConfig(env) {
  const apiKey = env('BREVO_API_KEY');
  const email = env('BREVO_SENDER_EMAIL');
  if (!apiKey || !isEmail(email || '')) return null;
  return { apiKey, sender: { email, name: (env('BREVO_SENDER_NAME') || 'BDE Manager').slice(0, 70) } };
}

/**
 * @param {{ apiKey, sender }} cfg
 * @param {{ to: {email, name?}[], subject, html, text, replyTo? }} msg
 * @returns {Promise<{ ok: boolean, status: number, messageId?: string }>}
 */
export async function sendBrevoEmail(cfg, msg, fetchImpl = fetch) {
  const to = (msg.to || []).filter(r => isEmail(r?.email)).slice(0, 50)
    .map(r => ({ email: r.email.trim().toLowerCase(), ...(r.name ? { name: String(r.name).slice(0, 70) } : {}) }));
  if (!to.length) return { ok: false, status: 400 };
  const res = await fetchWithTimeout(fetchImpl, 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: cfg.sender,
      // Destinataires masqués entre eux : un envoi par destinataire via messageVersions.
      to: [to[0]],
      ...(to.length > 1 ? { messageVersions: to.map(r => ({ to: [r] })) } : {}),
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      ...(msg.replyTo && isEmail(msg.replyTo) ? { replyTo: { email: msg.replyTo } } : {}),
      tags: ['bde-manager'],
    }),
  }, 10000);
  let messageId;
  try { messageId = (await res.json())?.messageId; } catch { /* corps vide */ }
  return { ok: res.ok, status: res.status, messageId };
}
