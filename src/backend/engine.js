// ============================================================
// BACKEND COLLABORATIF — orchestrateur (Supabase)
// ============================================================
// Chargé à la demande (import dynamique) : en mode local, ni ce fichier ni
// @supabase/supabase-js ne sont téléchargés.
// Rôles :
//  - client Supabase (clé publique uniquement, session persistée, PKCE) ;
//  - authentification (mot de passe, lien magique, réinitialisation) ;
//  - espaces : liste, création, invitation, connexion (publication initiale
//    ou remplacement des données locales), déconnexion ;
//  - droits : my_grants → core/permissions (mode « remote ») ;
//  - pièces jointes → Supabase Storage ; numérotation → RPC serveur ;
//  - un seul onglet synchronise (verrou navigator.locks), les autres
//    reçoivent les données via la synchro entre onglets existante.
// ============================================================

import { getBackendConfig } from './config.js';
import { useBackendState, setBackendState } from './state.js';
import { SyncSession } from './session.js';
import { setRemoteRefReserver } from './documentRefs.js';
import { setPermissionSource, CAPABILITIES } from '../core/permissions.js';
import { setRemoteAttachmentAdapter } from '../core/attachments.js';
import { getSyncSlices, exportModules } from '../core/moduleRegistry.js';
import { readSlice } from './syncCore.js';
import { useStore } from '../store.js';
import { useRolesStore } from '../roleEngine/store.js';
import { buildFullBackup, backupFileName } from '../components/members/backupHelpers.js';
import { setRemoteVerifier } from '../documents/verification.js';

const BINDING_KEY = 'bde-backend-binding';
const AUTH_STORAGE_KEY = 'bde-supabase-auth';

let client = null;
let clientSignature = '';
let startPromise = null;
let authSubscription = null;
let session = null;
let releaseLeader = null;
let grantsTimer = null;
let grantsChannel = null;

export const ACCESS_ROLES = [
  { id: 'owner', label: 'Propriétaire', hint: 'Tous les droits, y compris la matrice des droits.' },
  { id: 'bureau', label: 'Bureau', hint: 'Modifie presque tout ; consulte l’administration.' },
  { id: 'tresorier', label: 'Trésorier·e', hint: 'Valide les dépenses ; adhésions et documents.' },
  { id: 'membre', label: 'Membre', hint: 'Consulte l’agenda, les événements et les documents.' },
  { id: 'lecteur', label: 'Lecteur', hint: 'Lecture seule (hors coffre et recrutement).' },
];

// ── Client ─────────────────────────────────────────────────────
export async function getBackendClient() {
  const cfg = getBackendConfig();
  if (!cfg) return null;
  const sig = `${cfg.url}|${cfg.key}`;
  if (client && sig === clientSignature) return client;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: AUTH_STORAGE_KEY },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  clientSignature = sig;
  return client;
}

/** Erreurs Supabase / réseau → message français compréhensible. */
export function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (/Invalid login credentials/i.test(msg)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(msg)) return 'Adresse e-mail non confirmée : ouvre le lien reçu par e-mail.';
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cette adresse : connecte-toi.';
  if (/Password should be at least|weak password/i.test(msg)) return 'Mot de passe trop faible (8 caractères minimum, mélange lettres et chiffres).';
  if (/rate limit|too many/i.test(msg)) return 'Trop de tentatives : patiente quelques minutes.';
  if (/Unable to validate email|invalid format/i.test(msg)) return 'Adresse e-mail invalide.';
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return 'Serveur injoignable : vérifie ta connexion et l’URL du projet.';
  if (/JWT|apikey|Invalid API key/i.test(msg)) return 'Clé du projet refusée : vérifie la configuration.';
  if (/function .* does not exist|relation .* does not exist|Could not find the function/i.test(msg)) return 'La base n’est pas initialisée : exécute la migration SQL (voir les étapes de configuration).';
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : (msg || 'Erreur inconnue.');
}

const check = ({ data, error }) => { if (error) throw new Error(friendlyError(error), { cause: error }); return data; };

function readBinding() {
  try { return JSON.parse(localStorage.getItem(BINDING_KEY) || 'null'); } catch { return null; }
}
function writeBinding(b) {
  try { if (b) localStorage.setItem(BINDING_KEY, JSON.stringify(b)); else localStorage.removeItem(BINDING_KEY); } catch { /* ignoré */ }
}

const redirectUrl = () => `${window.location.origin}${window.location.pathname}`;

/** Après un lien e-mail (PKCE : ?code=…), on nettoie l'URL et on ouvre « Équipe & accès ». */
function cleanAuthUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('code') && !url.searchParams.has('error_description')) return;
  const err = url.searchParams.get('error_description');
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  window.history.replaceState(null, '', `${url.pathname}${url.search}#/team`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (err) setBackendState({ error: err });
}

function setUser(user) {
  setBackendState({ user: user ? { id: user.id, email: user.email } : null });
}

// ── Démarrage ──────────────────────────────────────────────────
/** Idempotent. Sans configuration : mode local, rien n'est chargé. */
export function startBackend() {
  if (!startPromise) {
    startPromise = (async () => {
      const c = await getBackendClient();
      if (!c) { setBackendState({ configured: false, ready: true, status: 'local' }); return; }
      setBackendState({ configured: true, status: readBinding() ? 'starting' : 'local' });
      // Vérification publique (#/verifier) : RPC anonyme, sans connexion.
      setRemoteVerifier(remoteVerifier);
      let current = null;
      try {
        const { data } = await c.auth.getSession();
        current = data?.session || null;
      } catch { /* hors ligne : session locale éventuelle relue plus tard */ }
      setUser(current?.user);
      cleanAuthUrl();
      authSubscription?.unsubscribe?.();
      const { data: sub } = c.auth.onAuthStateChange((event, s) => {
        setUser(s?.user);
        if (event === 'PASSWORD_RECOVERY') setBackendState({ recovery: true });
        if (event === 'SIGNED_OUT') stopSync({ keepBinding: true });
        if (event === 'SIGNED_IN' && !session && !releaseLeader) setTimeout(() => { resume(); }, 0);
      });
      authSubscription = sub?.subscription;
      await resume();
      setBackendState({ ready: true });
    })().catch((err) => {
      setBackendState({ ready: true, status: 'error', error: friendlyError(err) });
    });
  }
  return startPromise;
}

/** Après un changement de configuration : tout est réinitialisé. */
export async function resetBackend() {
  stopSync({ keepBinding: false });
  setRemoteVerifier(null);
  authSubscription?.unsubscribe?.();
  authSubscription = null;
  client = null;
  clientSignature = '';
  startPromise = null;
  setBackendState({ configured: false, ready: false, user: null, workspaceId: null, workspaceName: '', role: null, status: 'local', error: null });
  return startBackend();
}

/**
 * Vérificateur distant pour la page publique #/verifier (contrat de
 * src/documents/verification.js). Clé publique seule : aucune connexion
 * requise, le serveur ne renvoie que validité, intitulé générique et date.
 */
async function remoteVerifier(ref, fingerprint) {
  const r = await verifyDocumentRemote(ref, fingerprint);
  if (r?.valid) {
    return { status: 'match', entry: { ref: String(ref).toUpperCase(), fingerprint, title: r.title || 'Document', createdAt: r.issued_at } };
  }
  if (r?.ref_found) return { status: fingerprint ? 'mismatch' : 'found', entry: { ref: String(ref).toUpperCase() } };
  return { status: 'not-found' };
}

async function resume() {
  const b = readBinding();
  const user = useBackendState.getState().user;
  if (!b || !user) { if (!b) setBackendState({ status: 'local' }); return; }
  if (b.userId !== user.id) { writeBinding(null); setBackendState({ status: 'local' }); return; }
  await activate(b.workspaceId, b.workspaceName, 'resume');
}

// ── Authentification ───────────────────────────────────────────
export async function signInWithPassword(email, password) {
  const c = await getBackendClient();
  const data = check(await c.auth.signInWithPassword({ email: String(email).trim(), password }));
  setUser(data.user);
  return data.user;
}

export async function signUp(email, password) {
  const c = await getBackendClient();
  const data = check(await c.auth.signUp({ email: String(email).trim(), password, options: { emailRedirectTo: redirectUrl() } }));
  if (data.session) setUser(data.user);
  return { needsConfirmation: !data.session };
}

export async function sendMagicLink(email) {
  const c = await getBackendClient();
  check(await c.auth.signInWithOtp({ email: String(email).trim(), options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } }));
}

export async function sendPasswordReset(email) {
  const c = await getBackendClient();
  check(await c.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: redirectUrl() }));
}

export async function updatePassword(password) {
  const c = await getBackendClient();
  check(await c.auth.updateUser({ password }));
  setBackendState({ recovery: false });
}

export async function signOut() {
  stopSync({ keepBinding: false });
  const c = await getBackendClient();
  try { await c?.auth.signOut(); } catch { /* hors ligne : session locale effacée quand même */ }
  setUser(null);
}

// ── Espaces ────────────────────────────────────────────────────
export async function listMyWorkspaces() {
  const c = await getBackendClient();
  const user = useBackendState.getState().user;
  if (!user) return [];
  const rows = check(await c.from('workspace_members').select('workspace_id, role, workspaces(name, created_at)').eq('user_id', user.id));
  return (rows || []).map(r => ({ id: r.workspace_id, role: r.role, name: r.workspaces?.name || 'Espace', createdAt: r.workspaces?.created_at }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function createWorkspace(name) {
  const c = await getBackendClient();
  return check(await c.rpc('create_workspace', { p_name: String(name || '').trim() }));
}

export async function acceptInvitation(token) {
  const c = await getBackendClient();
  return check(await c.rpc('accept_invitation', { p_token: String(token || '').trim().toLowerCase() }));
}

/** Résumé des données locales et distantes avant la connexion. */
export async function inspectWorkspace(workspaceId) {
  const c = await getBackendClient();
  const { count, error } = await c.from('records').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('deleted', false);
  if (error) throw new Error(friendlyError(error), { cause: error });
  const local = getSyncSlices().map(s => ({ collection: s.collection, capability: s.capability, count: readSlice(s, s.store.getState()).size }))
    .filter(x => x.count > 0);
  return { remoteCount: count || 0, local };
}

/** Sauvegarde JSON complète de l'appareil (avant remplacement). */
export function downloadLocalBackup() {
  let engineCfg = null;
  try { engineCfg = useRolesStore.getState().exportConfig(); } catch { /* facultatif */ }
  const backup = buildFullBackup(useStore.getState().exportAllData(), engineCfg);
  backup.modules = exportModules();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName('BDE_Backup_avant_synchro');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Connecte l'appareil à un espace.
 * @param {'publish'|'replace'} mode publish : l'espace est vide, on y publie
 *   les données locales ; replace : les données locales sont remplacées.
 */
export async function connectWorkspace(workspaceId, workspaceName, mode) {
  const c = await getBackendClient();
  const user = useBackendState.getState().user;
  if (!user) throw new Error('Connecte-toi d’abord.');
  stopSync({ keepBinding: false });
  const grants = await refreshGrants(workspaceId, workspaceName);
  if (!grants) throw new Error('Tu n’es pas (ou plus) membre de cet espace.');
  const s = new SyncSession({ client: c, workspaceId, userId: user.id, onStatus: onSessionStatus });
  s.clearPersisted();
  const progress = (p) => setBackendState({ progress: p });
  let result;
  try {
    if (mode === 'publish') {
      result = await s.publishAll(progress);
      await alignSequences(c, workspaceId);
      result.attachments = await uploadLocalAttachments(c, workspaceId, progress);
    } else {
      downloadLocalBackup();
      result = await s.replaceAll(progress);
      await pullSequences(c, workspaceId);
      useStore.setState({ _history: { past: [], future: [] } });
    }
  } finally {
    setBackendState({ progress: null });
  }
  writeBinding({ workspaceId, workspaceName, userId: user.id });
  await activate(workspaceId, workspaceName, 'fresh', s);
  return result;
}

/** Arrête la synchronisation (les données restent sur l'appareil). */
export function disconnectWorkspace() {
  stopSync({ keepBinding: false });
}

export async function leaveWorkspace() {
  const { workspaceId, user } = useBackendState.getState();
  if (!workspaceId || !user) return;
  const c = await getBackendClient();
  check(await c.rpc('remove_member', { p_ws: workspaceId, p_user: user.id }));
  stopSync({ keepBinding: false });
}

export function syncNow() {
  if (!session) return Promise.resolve();
  session.setOnline(true);
  return Promise.all([session.catchUp(), session.flush()]);
}

async function activate(workspaceId, workspaceName, mode, prepared = null) {
  const c = await getBackendClient();
  const user = useBackendState.getState().user;
  setBackendState({ workspaceId, workspaceName, status: 'starting', error: null });
  let grants;
  try {
    grants = await refreshGrants(workspaceId, workspaceName);
  } catch (err) {
    // Hors ligne au démarrage : droits de la dernière session inconnus →
    // lecture seule par prudence, nouvelle tentative au retour du réseau.
    setPermissionSource({ mode: 'remote', grants: {}, user: { id: user.id, email: user.email, role: null } });
    setBackendState({ status: 'offline', error: friendlyError(err) });
    const retry = () => { window.removeEventListener('online', retry); activate(workspaceId, workspaceName, mode, prepared); };
    window.addEventListener('online', retry);
    return;
  }
  if (!grants) {
    writeBinding(null);
    setPermissionSource({ mode: 'local' });
    setBackendState({ workspaceId: null, workspaceName: '', role: null, status: 'local', error: 'Tu ne fais plus partie de cet espace : synchronisation arrêtée (données conservées sur l’appareil).' });
    return;
  }
  watchGrants(c, workspaceId, workspaceName);

  const startSession = async () => {
    const s = prepared || new SyncSession({ client: c, workspaceId, userId: user.id, onStatus: onSessionStatus });
    session = s;
    setRemoteAttachmentAdapter(attachmentAdapter(c, workspaceId));
    setRemoteRefReserver(async (count, year) => check(await c.rpc('reserve_document_refs', { p_ws: workspaceId, p_year: year, p_count: count })));
    await s.start(mode === 'fresh' ? 'fresh' : 'resume');
  };

  // Un seul onglet synchronise ; les autres attendent le verrou.
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    let acquiredNow = false;
    const hold = new Promise((resolve) => {
      navigator.locks.request(`bde-sync:${workspaceId}`, async () => {
        acquiredNow = true;
        if (useBackendState.getState().workspaceId !== workspaceId) return;
        await new Promise((release) => { releaseLeader = release; startSession().catch(err => setBackendState({ status: 'error', error: friendlyError(err) })).finally(resolve); });
      });
    });
    await Promise.race([hold, new Promise(r => setTimeout(r, 300))]);
    if (!acquiredNow) setBackendState({ status: 'follower' });
  } else {
    await startSession();
  }
}

function stopSync({ keepBinding }) {
  if (session) { session.stop(); session = null; }
  if (releaseLeader) { releaseLeader(); releaseLeader = null; }
  clearInterval(grantsTimer);
  grantsTimer = null;
  if (grantsChannel && client) { try { client.removeChannel(grantsChannel); } catch { /* ignoré */ } }
  grantsChannel = null;
  setRemoteAttachmentAdapter(null);
  setRemoteRefReserver(null);
  setPermissionSource({ mode: 'local' });
  if (!keepBinding) writeBinding(null);
  setBackendState({ workspaceId: null, workspaceName: '', role: null, memberId: null, status: 'local', pending: 0, error: null });
}

function onSessionStatus({ status, pending, lastSyncAt, error }) {
  if (!session) return;
  setBackendState({ status, pending, lastSyncAt, error });
}

// ── Droits ─────────────────────────────────────────────────────
async function refreshGrants(workspaceId, workspaceName) {
  const c = await getBackendClient();
  const user = useBackendState.getState().user;
  const g = check(await c.rpc('my_grants', { p_ws: workspaceId }));
  if (!g) return null;
  const grants = g.role === 'owner' ? Object.fromEntries(CAPABILITIES.map(x => [x.id, 'manage'])) : (g.grants || {});
  setPermissionSource({ mode: 'remote', grants, user: { id: user?.id, email: user?.email, role: g.role, memberId: g.member_id || null } });
  setBackendState({ role: g.role, memberId: g.member_id || null, workspaceName: workspaceName || useBackendState.getState().workspaceName });
  return grants;
}

function watchGrants(c, workspaceId, workspaceName) {
  clearInterval(grantsTimer);
  const refresh = () => refreshGrants(workspaceId, workspaceName).then((g) => {
    if (g === null) {
      stopSync({ keepBinding: false });
      setBackendState({ error: 'Tu as été retiré·e de l’espace : synchronisation arrêtée (données conservées sur l’appareil).' });
    }
  }).catch(() => { /* hors ligne */ });
  grantsTimer = setInterval(refresh, 5 * 60_000);
  if (grantsChannel) { try { c.removeChannel(grantsChannel); } catch { /* ignoré */ } }
  grantsChannel = c.channel(`grants:${workspaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'roles_grants', filter: `workspace_id=eq.${workspaceId}` }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_members', filter: `workspace_id=eq.${workspaceId}` }, refresh)
    .subscribe();
}

export async function refreshMyGrants() {
  const { workspaceId, workspaceName } = useBackendState.getState();
  if (workspaceId) await refreshGrants(workspaceId, workspaceName);
}

// ── Numérotation ───────────────────────────────────────────────
async function alignSequences(c, workspaceId) {
  const counters = useStore.getState().documentCounters || {};
  for (const [year, n] of Object.entries(counters)) {
    const y = Number(year);
    if (Number.isInteger(y) && Number(n) > 0) {
      const { error } = await c.rpc('bump_document_sequence', { p_ws: workspaceId, p_year: y, p_at_least: Number(n) });
      if (error && !/Droit/.test(error.message || '')) throw new Error(friendlyError(error), { cause: error });
    }
  }
}

async function pullSequences(c, workspaceId) {
  const { data } = await c.from('document_sequences').select('year,last_value').eq('workspace_id', workspaceId);
  if (!data?.length) return;
  useStore.setState((s) => {
    const next = { ...s.documentCounters };
    data.forEach(r => { next[r.year] = Math.max(next[r.year] || 0, r.last_value); });
    return { documentCounters: next };
  });
}

// ── Pièces jointes ─────────────────────────────────────────────
function attachmentAdapter(c, workspaceId) {
  const bucket = () => c.storage.from('attachments');
  const path = (id) => `${workspaceId}/${id}`;
  return {
    upload: async (meta, blob) => {
      const { error } = await bucket().upload(path(meta.id), blob, { upsert: true, contentType: meta.type || 'application/octet-stream' });
      if (error) throw error;
    },
    download: async (id) => {
      const { data, error } = await bucket().download(path(id));
      if (error) throw error;
      return data;
    },
    remove: async (id) => {
      const { error } = await bucket().remove([path(id)]);
      if (error) throw error;
    },
  };
}

function readLocalAttachments() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve([]); return; }
    const req = indexedDB.open('bde-attachments', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const all = db.transaction('files', 'readonly').objectStore('files').getAll();
        all.onsuccess = () => { resolve(all.result || []); db.close(); };
        all.onerror = () => { resolve([]); db.close(); };
      } catch { resolve([]); db.close(); }
    };
  });
}

async function uploadLocalAttachments(c, workspaceId, progress) {
  const files = (await readLocalAttachments()).filter(f => f?.id && f.blob);
  const adapter = attachmentAdapter(c, workspaceId);
  let sent = 0;
  for (let i = 0; i < files.length; i++) {
    progress({ label: 'Envoi des pièces jointes', done: i, total: files.length });
    try { await adapter.upload(files[i], files[i].blob); sent++; } catch { /* réessayé au prochain enregistrement */ }
  }
  return { total: files.length, sent };
}

// ── Administration de l'espace ─────────────────────────────────
const wsId = () => {
  const id = useBackendState.getState().workspaceId;
  if (!id) throw new Error('Aucun espace connecté.');
  return id;
};

export async function listMembers() {
  const c = await getBackendClient();
  return check(await c.from('workspace_members').select('user_id, role, member_id, email, created_at').eq('workspace_id', wsId()).order('created_at'));
}

export async function listInvitations() {
  const c = await getBackendClient();
  const rows = check(await c.from('invitations').select('id, email, role, token, expires_at, accepted_at, created_at').eq('workspace_id', wsId()).order('created_at', { ascending: false }));
  const now = Date.now();
  return (rows || []).map(r => ({ ...r, expired: !r.accepted_at && new Date(r.expires_at).getTime() < now }));
}

export async function inviteMember(email, role) {
  const c = await getBackendClient();
  return check(await c.rpc('invite_member', { p_ws: wsId(), p_email: String(email).trim(), p_role: role }));
}

export async function revokeInvitation(id) {
  const c = await getBackendClient();
  check(await c.from('invitations').delete().eq('id', id).eq('workspace_id', wsId()));
}

export async function setMemberRole(userId, role) {
  const c = await getBackendClient();
  check(await c.rpc('set_member_role', { p_ws: wsId(), p_user: userId, p_role: role }));
  await refreshMyGrants();
}

export async function linkMember(userId, memberId) {
  const c = await getBackendClient();
  check(await c.rpc('link_member', { p_ws: wsId(), p_user: userId, p_member_id: memberId || null }));
  await refreshMyGrants();
}

export async function removeMember(userId) {
  const c = await getBackendClient();
  check(await c.rpc('remove_member', { p_ws: wsId(), p_user: userId }));
}

export async function loadGrantMatrix() {
  const c = await getBackendClient();
  return check(await c.from('roles_grants').select('role, capability, level').eq('workspace_id', wsId()));
}

export async function setGrant(role, capability, level) {
  const c = await getBackendClient();
  check(await c.rpc('set_grant', { p_ws: wsId(), p_role: role, p_capability: capability, p_level: level }));
}

export async function loadAudit(limit = 100) {
  const c = await getBackendClient();
  return check(await c.from('audit_log').select('id, user_id, action, collection, record_id, at').eq('workspace_id', wsId())
    .order('at', { ascending: false }).limit(Math.min(500, limit)));
}

export async function renameWorkspace(name) {
  const c = await getBackendClient();
  const n = String(name || '').trim();
  if (!n || n.length > 80) throw new Error('Nom d’espace invalide (1 à 80 caractères).');
  check(await c.from('workspaces').update({ name: n }).eq('id', wsId()));
  const b = readBinding();
  if (b) writeBinding({ ...b, workspaceName: n });
  setBackendState({ workspaceName: n });
}

/** Vérification publique d'un document (fonctionne sans être connecté). */
export async function verifyDocumentRemote(ref, fingerprint) {
  const c = await getBackendClient();
  if (!c) throw new Error('Backend non configuré.');
  return check(await c.rpc('verify_document', { p_ref: String(ref || '').trim(), p_fingerprint: String(fingerprint || '').trim() }));
}
