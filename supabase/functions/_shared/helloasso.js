// ============================================================
// HelloAsso API v5 : jeton OAuth2 (client credentials), « checkout intent »,
// vérification d'un paiement. Secrets : HELLOASSO_CLIENT_ID,
// HELLOASSO_CLIENT_SECRET, HELLOASSO_ORG_SLUG, HELLOASSO_ENV (sandbox|prod).
// ============================================================

import { fetchWithTimeout, isPlainObject, listQuestions } from './util.js';

export function helloassoConfig(env) {
  const clientId = env('HELLOASSO_CLIENT_ID');
  const clientSecret = env('HELLOASSO_CLIENT_SECRET');
  const orgSlug = env('HELLOASSO_ORG_SLUG');
  if (!clientId || !clientSecret || !/^[a-z0-9-]{1,120}$/.test(orgSlug || '')) return null;
  const sandbox = (env('HELLOASSO_ENV') || '').toLowerCase() === 'sandbox';
  return {
    clientId, clientSecret, orgSlug,
    api: sandbox ? 'https://api.helloasso-sandbox.com' : 'https://api.helloasso.com',
  };
}

/**
 * Montant dû (en centimes) : valeur de la question « payment » telle que
 * VALIDÉE PAR LE MOTEUR côté serveur ({ amount, currency, option? } :
 * prix de la formule choisie, montant calculé, montant fixe ou montant libre
 * borné). Jamais un montant brut envoyé par le navigateur.
 * @returns {{ cents: number, label: string } | null} null si aucun paiement
 */
export function computePaymentAmount(definition, cleanedAnswers) {
  const pay = listQuestions(definition).find(q => q.type === 'payment' && !q._repeatKey);
  if (!pay) return null;
  const v = cleanedAnswers?.[pay.key];
  if (!isPlainObject(v) || typeof v.amount !== 'number' || !Number.isFinite(v.amount)) return null;
  if (v.currency && v.currency !== 'EUR') throw new Error('Seuls les paiements en euros sont pris en charge par HelloAsso.');
  const cents = Math.round(v.amount * 100);
  if (cents > 1_000_000) throw new Error('Montant supérieur au plafond autorisé (10 000 €).');
  return { cents: Math.max(cents, 0), label: String(pay.label || definition?.title || 'Paiement').slice(0, 250) };
}

export async function helloassoToken(cfg, fetchImpl = fetch) {
  const res = await fetchWithTimeout(fetchImpl, `${cfg.api}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
  }, 8000);
  if (!res.ok) throw new Error(`HelloAsso : authentification refusée (${res.status})`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('HelloAsso : jeton absent');
  return data.access_token;
}

/**
 * Crée une intention de paiement. returnUrl / backUrl / errorUrl en https.
 * @returns {Promise<{ id: string, redirectUrl: string }>}
 */
export async function createCheckoutIntent(cfg, token, { cents, itemName, backUrl, errorUrl, returnUrl, payer, metadata }, fetchImpl = fetch) {
  const body = {
    totalAmount: cents,
    initialAmount: cents,
    itemName: String(itemName).slice(0, 250),
    backUrl, errorUrl, returnUrl,
    containsDonation: false,
    ...(payer && payer.email ? { payer } : {}),
    metadata,
  };
  const res = await fetchWithTimeout(fetchImpl, `${cfg.api}/v5/organizations/${encodeURIComponent(cfg.orgSlug)}/checkout-intents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  }, 10000);
  if (!res.ok) throw new Error(`HelloAsso : création du paiement refusée (${res.status})`);
  const data = await res.json();
  if (!data?.redirectUrl || data?.id === undefined) throw new Error('HelloAsso : réponse inattendue');
  return { id: String(data.id), redirectUrl: String(data.redirectUrl) };
}

export async function getCheckoutIntent(cfg, token, id, fetchImpl = fetch) {
  const res = await fetchWithTimeout(fetchImpl,
    `${cfg.api}/v5/organizations/${encodeURIComponent(cfg.orgSlug)}/checkout-intents/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    }, 8000);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HelloAsso : lecture du paiement impossible (${res.status})`);
  return res.json();
}

/**
 * Un checkout intent est payé si une commande y est rattachée avec au moins
 * un paiement « Authorized » ou « Processed » couvrant le montant attendu.
 */
export function intentPaid(intent, expectedCents) {
  const order = intent?.order;
  if (!order) return false;
  const payments = Array.isArray(order.payments) ? order.payments : [];
  const okStates = new Set(['Authorized', 'Processed', 'Registered']);
  const paid = payments.filter(p => okStates.has(p?.state)).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (paid <= 0) return false;
  return !expectedCents || paid >= expectedCents;
}

/** Identifiant de checkout intent / réponse candidats dans le corps d'une notification. */
export function webhookCandidates(body) {
  const data = isPlainObject(body?.data) ? body.data : {};
  const meta = isPlainObject(body?.metadata) ? body.metadata : (isPlainObject(data.metadata) ? data.metadata : {});
  const ids = [data.checkoutIntentId, body?.checkoutIntentId, meta.checkoutIntentId]
    .filter(v => v !== undefined && v !== null && /^[0-9A-Za-z_-]{1,64}$/.test(String(v))).map(String);
  const responseId = typeof meta.responseId === 'string' ? meta.responseId : null;
  return { eventType: String(body?.eventType || ''), intentIds: [...new Set(ids)], responseId };
}
