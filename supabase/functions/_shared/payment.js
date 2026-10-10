// ============================================================
// Cœur de la fonction Edge « helloasso » (paiement d'une réponse).
//  - checkout : { responseId, editToken } → URL de paiement HelloAsso.
//    Le montant est celui calculé PAR LE SERVEUR à l'envoi (colonne
//    payment_amount_cents), jamais un montant fourni par le navigateur.
//  - webhook : notification HelloAsso. Le corps sert uniquement à savoir
//    QUEL paiement revérifier : l'état est relu auprès de l'API HelloAsso
//    (checkout intent → commande → paiements) avant toute mise à jour.
// deps : rpc, helloasso: { config, token(), createIntent(), getIntent() }, env: { appUrl, webhookToken }
// ============================================================

import { HttpError } from './http.js';
import { sha256Hex, isPlainObject, logTech, UUID_RX, isEmail } from './util.js';
import { intentPaid, webhookCandidates } from './helloasso.js';

const TOKEN_RX = /^[a-f0-9]{64}$/;

export async function handleCheckout(body, deps) {
  if (!deps.helloasso) throw new HttpError(503, 'Paiement en ligne non configuré (HelloAsso).');
  if (!isPlainObject(body) || typeof body.responseId !== 'string' || !UUID_RX.test(body.responseId)
      || typeof body.editToken !== 'string' || !TOKEN_RX.test(body.editToken)) {
    throw new HttpError(400, 'Paramètres de paiement invalides.');
  }
  const { data: ctx, error } = await deps.rpc('forms_payment_context', { p_response: body.responseId, p_edit_hash: await sha256Hex(body.editToken) });
  if (error) { logTech('helloasso', 'contexte', error); throw new HttpError(500, 'Erreur du serveur.'); }
  if (!ctx) throw new HttpError(404, 'Réponse introuvable (lien invalide).');
  if (ctx.payment_status === 'paid' || ctx.payment_status === 'manual') throw new HttpError(409, 'Cette réponse est déjà réglée.');
  const cents = Number(ctx.amount_cents) || 0;
  if (cents < 100) throw new HttpError(400, cents > 0 ? 'Montant inférieur au minimum accepté par HelloAsso (1 €).' : 'Aucun paiement n’est attendu pour cette réponse.');

  const base = `${deps.env.appUrl}/f/${encodeURIComponent(ctx.slug)}`;
  const token = await deps.helloasso.token();
  const intent = await deps.helloasso.createIntent(token, {
    cents,
    itemName: `${ctx.title}`.slice(0, 250),
    backUrl: `${base}?paiement=annule`,
    errorUrl: `${base}?paiement=erreur`,
    returnUrl: `${base}?paiement=retour`,
    payer: isEmail(ctx.email || '') ? { email: ctx.email } : null,
    metadata: { responseId: ctx.response_id, formId: ctx.form_id },
  });
  const set = await deps.rpc('forms_set_payment', { p_response: ctx.response_id, p_ref: intent.id, p_status: 'pending', p_amount_cents: cents });
  if (set.error) { logTech('helloasso', 'enregistrement du paiement', set.error); throw new HttpError(500, 'Erreur du serveur.'); }
  return { status: 200, body: { ok: true, url: intent.redirectUrl, amountCents: cents } };
}

/** Vérifie un checkout intent auprès de l'API puis marque la réponse payée. */
async function confirmIntent(deps, token, intentId, expectedResponseId) {
  const intent = await deps.helloasso.getIntent(token, intentId);
  if (!intent) return false;
  const responseId = intent?.metadata?.responseId;
  if (typeof responseId !== 'string' || !UUID_RX.test(responseId)) return false;
  if (expectedResponseId && expectedResponseId !== responseId) return false;
  const { data: resp, error } = await deps.rpc('forms_payment_by_response', { p_response: responseId });
  if (error) { logTech('helloasso', 'lecture de la réponse', error); throw new HttpError(500, 'Erreur du serveur.'); }
  if (!resp) return false;
  if (!intentPaid(intent, Number(resp.amount_cents) || 0)) return false;
  const set = await deps.rpc('forms_set_payment', { p_response: responseId, p_ref: String(intentId), p_status: 'paid', p_amount_cents: Number(resp.amount_cents) || null });
  if (set.error) { logTech('helloasso', 'mise à jour du paiement', set.error); throw new HttpError(500, 'Erreur du serveur.'); }
  return !!set.data?.ok;
}

export async function handleWebhook({ body, token: urlToken }, deps) {
  if (!deps.helloasso) throw new HttpError(503, 'HelloAsso non configuré.');
  if (deps.env.webhookToken && urlToken !== deps.env.webhookToken) throw new HttpError(401, 'Jeton de notification invalide.');
  const cand = webhookCandidates(body);
  // Seules les notifications de commande / paiement nous concernent.
  if (cand.eventType && !['Order', 'Payment'].includes(cand.eventType)) return { status: 200, body: { ok: true, ignored: true } };
  const token = await deps.helloasso.token();
  let updated = 0;
  for (const id of cand.intentIds.slice(0, 3)) {
    if (await confirmIntent(deps, token, id, cand.responseId && UUID_RX.test(cand.responseId) ? cand.responseId : null)) updated++;
  }
  if (!updated && cand.responseId && UUID_RX.test(cand.responseId)) {
    const { data: resp } = await deps.rpc('forms_payment_by_response', { p_response: cand.responseId });
    if (resp?.payment_ref && await confirmIntent(deps, token, resp.payment_ref, cand.responseId)) updated++;
  }
  // Toujours 200 : HelloAsso réessaie sinon ; l'état n'a changé que si l'API l'a confirmé.
  return { status: 200, body: { ok: true, updated } };
}
