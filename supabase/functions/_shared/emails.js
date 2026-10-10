// ============================================================
// Modèles d'e-mails (HTML sobre + texte brut), en français.
// Toute donnée insérée est échappée.
// ============================================================

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const safeUrl = (u) => (/^https:\/\/[^\s"<>]+$/.test(String(u || '')) ? String(u) : '');

function layout({ title, intro, bodyHtml = '', button, footer }) {
  const btn = button && safeUrl(button.url)
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>`
    : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>
${intro ? `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(intro).replace(/\n/g, '<br>')}</p>` : ''}
${bodyHtml}${btn}
</div>
<p style="font-size:12px;color:#71717a;margin:12px 4px;line-height:1.5">${escapeHtml(footer || 'Message automatique : merci de ne pas y répondre directement.')}</p>
</div></body></html>`;
}

/** Résumé [{ label, value }] → tableau HTML + texte. */
function summaryBlock(summary) {
  const rows = (Array.isArray(summary) ? summary : []).filter(r => r && r.label).slice(0, 80);
  if (!rows.length) return { html: '', text: '' };
  const html = `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">${rows.map(r =>
    `<tr><td style="padding:6px 8px;border-top:1px solid #f4f4f5;color:#52525b;vertical-align:top;width:40%">${escapeHtml(r.label)}</td><td style="padding:6px 8px;border-top:1px solid #f4f4f5;vertical-align:top">${escapeHtml(r.value).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>`;
  const text = rows.map(r => `- ${r.label} : ${r.value}`).join('\n');
  return { html, text };
}

/** Accusé de réception envoyé au répondant. */
export function receiptEmail({ formTitle, orgName, summary, editUrl, waitlisted, confirmationMessage }) {
  const title = `Réponse bien reçue : ${formTitle}`;
  const intro = [
    waitlisted ? 'Ta réponse a bien été enregistrée sur la liste d’attente.' : 'Ta réponse a bien été enregistrée.',
    confirmationMessage ? String(confirmationMessage).slice(0, 1000) : '',
  ].filter(Boolean).join('\n\n');
  const s = summaryBlock(summary);
  const html = layout({
    title, intro,
    bodyHtml: s.html ? `<p style="margin:16px 0 4px;font-weight:600">Récapitulatif</p>${s.html}` : '',
    button: editUrl ? { label: 'Consulter ou modifier ma réponse', url: editUrl } : null,
    footer: `${orgName ? `${orgName} — ` : ''}Message automatique. Garde ce message : le lien ci-dessus est personnel.`,
  });
  const text = `${title}\n\n${intro}\n\n${s.text ? `Récapitulatif :\n${s.text}\n\n` : ''}${editUrl ? `Consulter ou modifier : ${editUrl}\n` : ''}`;
  return { subject: title.slice(0, 180), html, text };
}

/** Notification aux organisateurs : aucune donnée de réponse, seulement un lien. */
export function newResponseEmail({ formTitle, appUrl, waitlisted }) {
  const title = `Nouvelle réponse : ${formTitle}`;
  const intro = waitlisted ? 'Une nouvelle réponse a été placée sur liste d’attente.' : 'Une nouvelle réponse vient d’être envoyée.';
  const html = layout({ title, intro, button: appUrl ? { label: 'Voir les réponses', url: appUrl } : null,
    footer: 'Les réponses ne sont jamais copiées dans les e-mails : consulte-les dans l’application.' });
  return { subject: title.slice(0, 180), html, text: `${title}\n\n${intro}\n${appUrl ? `\n${appUrl}\n` : ''}` };
}

/** Message libre d'un organisateur (brevo-send). */
export function adminMessageEmail({ subject, message, orgName, link }) {
  const html = layout({ title: subject, intro: message, button: link ? { label: link.label || 'Ouvrir', url: link.url } : null,
    footer: `${orgName ? `${orgName} — ` : ''}Tu reçois ce message car tu as répondu à un formulaire ou tu es membre de l’espace.` });
  return { subject: String(subject).slice(0, 180), html, text: `${subject}\n\n${message}\n${link?.url ? `\n${link.url}\n` : ''}` };
}
