// ============================================================
// PORTAIL « MON ESPACE » — accès aux données du compte connecté
// ============================================================
// Uniquement des lectures autorisées par le serveur (RLS / RPC) :
//  - get_my_responses() : mes réponses (sans étiquettes, responsable ni
//    notes internes — filtrage côté serveur) ;
//  - workspace_members (ma ligne) + my_grants : rôle et fiche membre liée ;
//  - records 'events.events' contenant ma fiche ou mon adresse ;
//  - records 'core.documentLog' émis à mon nom (références + empreintes) ;
//  - forms publiés réservés aux membres de l'espace.
// Les données des autres personnes (autres participants d'un événement…)
// sont retirées dès la réception et ne sont jamais conservées.
// `setPortalApi()` remplace tout ou partie des fonctions (banc d'essai).
// ============================================================

import { getBackendConfig } from '../../backend/config.js';
import { getMyResponses, verifyBallot as verifyBallotRpc, formsErrorMessage } from '../../backend/forms.js';

let override = null;
export function setPortalApi(impl) { override = impl || null; }
const pick = (name, real) => (override && typeof override[name] === 'function' ? override[name] : real);

async function engine() { return import('../../backend/engine.js'); }
async function client() {
  const c = await (await engine()).getBackendClient();
  if (!c) throw new Error('Espace connecté non configuré.');
  return c;
}
const check = ({ data, error }) => { if (error) throw new Error(formsErrorMessage(error)); return data; };

/** L'application est-elle reliée à un serveur (Supabase) ? */
export const isConfigured = () => pick('isConfigured', () => !!getBackendConfig())();

/** → { id, email } | null (session persistée du navigateur). */
export const getSessionUser = () => pick('getSessionUser', async () => {
  const c = await client();
  const { data } = await c.auth.getSession();
  const u = data?.session?.user;
  return u ? { id: u.id, email: String(u.email || '').toLowerCase() } : null;
})();

/** Abonnement aux changements de session → fonction de désabonnement. */
export const onAuthChange = (cb) => pick('onAuthChange', (fn) => {
  let sub = null;
  let stopped = false;
  client().then((c) => {
    if (stopped) return;
    const { data } = c.auth.onAuthStateChange((_e, s) => fn(s?.user ? { id: s.user.id, email: String(s.user.email || '').toLowerCase() } : null));
    sub = data?.subscription;
  }).catch(() => { /* non configuré */ });
  return () => { stopped = true; sub?.unsubscribe?.(); };
})(cb);

/** Lien de connexion par e-mail ; retour prévu sur #/espace. */
export const sendLoginLink = (email) => pick('sendLoginLink', async (e) => {
  try { localStorage.setItem('bde-forms-return', '#/espace'); } catch { /* stockage indisponible */ }
  await (await engine()).sendMagicLink(e);
})(email);

export const signOut = () => pick('signOut', async () => { await (await engine()).signOut(); })();

/** Mes réponses : [{ id, form_id, slug, title, status, status_label, answers, waitlisted, payment_status, created_at, updated_at, editable }] */
export const myResponses = () => pick('myResponses', getMyResponses)();

export const verifyBallot = (formId, code) => pick('verifyBallot', verifyBallotRpc)(formId, code);

/** Espaces dont je suis membre : [{ id, name, role, memberId }] */
export const myWorkspaces = (user) => pick('myWorkspaces', async (u) => {
  const c = await client();
  const rows = check(await c.from('workspace_members').select('workspace_id, role, member_id, workspaces(name)').eq('user_id', u.id));
  return (rows || []).map(r => ({ id: r.workspace_id, role: r.role, memberId: r.member_id || null, name: r.workspaces?.name || 'Espace' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
})(user);

const clean = (s) => String(s ?? '').trim();

/** Mes inscriptions aux événements (fiche membre liée et/ou adresse du compte). */
export const myEvents = (ws, user) => pick('myEvents', async (w, u) => {
  const c = await client();
  const filters = [];
  if (w.memberId) filters.push({ v: { participants: [{ memberId: w.memberId }] } });
  if (u.email) filters.push({ v: { participants: [{ email: u.email }] } });
  const byId = new Map();
  for (const f of filters) {
    const rows = check(await c.from('records').select('id, data').eq('workspace_id', w.id).eq('collection', 'events.events')
      .eq('deleted', false).contains('data', f).limit(200));
    (rows || []).forEach((r) => {
      const ev = r.data?.v;
      if (!ev || byId.has(r.id)) return;
      const me = (ev.participants || []).find(p => (w.memberId && p.memberId === w.memberId) || (u.email && clean(p.email).toLowerCase() === u.email));
      if (!me) return;
      // Seuls les champs publics de l'événement et MA ligne sont gardés.
      byId.set(r.id, { id: r.id, title: ev.title || 'Événement', start: ev.start || '', end: ev.end || '', location: ev.location || '', status: ev.status || '', me: { status: me.status, paid: !!me.paid } });
    });
  }
  return [...byId.values()].sort((a, b) => String(b.start).localeCompare(String(a.start)));
})(ws, user);

/** Documents émis à mon nom (registre) : [{ ref, title, createdAt, fingerprint }] */
export const myDocuments = (ws) => pick('myDocuments', async (w) => {
  if (!w.memberId) return [];
  const c = await client();
  const rows = check(await c.from('records').select('id, data').eq('workspace_id', w.id).eq('collection', 'core.documentLog')
    .eq('deleted', false).contains('data', { v: { memberIds: [w.memberId] } }).limit(300));
  return (rows || []).map(r => r.data?.v).filter(e => e?.ref)
    .map(e => ({ ref: e.ref, title: e.title || 'Document', createdAt: e.createdAt || '', fingerprint: e.fingerprint || '' }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
})(ws);

/** Formulaires ouverts réservés aux membres de l'espace. */
export const memberForms = (ws) => pick('memberForms', async (w) => {
  const c = await client();
  const rows = check(await c.from('forms').select('slug, title, kind, status, access, opens_at, closes_at')
    .eq('workspace_id', w.id).eq('status', 'published').eq('access', 'members').order('updated_at', { ascending: false }).limit(100));
  const now = Date.now();
  return (rows || []).filter(f => (!f.opens_at || new Date(f.opens_at).getTime() <= now) && (!f.closes_at || new Date(f.closes_at).getTime() > now));
})(ws);

/** Jeton de modification gardé par la page répondant sur cet appareil (IndexedDB). */
export const localEditToken = (slug, responseId) => pick('localEditToken', async (s, id) => {
  const { kvGet } = await import('../runtime/localStore.js');
  const last = await kvGet(`last:${s}`).catch(() => null);
  return last?.responseId === id && last?.editToken ? last.editToken : null;
})(slug, responseId);
