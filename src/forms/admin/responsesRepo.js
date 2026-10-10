// ============================================================
// ADMINISTRATION DES RÉPONSES — source des réponses (dépôt)
// ============================================================
// Une même interface, deux origines :
//  - mode « serveur » (espace connecté + formulaire publié) : listResponses
//    paginé/filtré côté serveur, traitement par bulkUpdate, notes et
//    historique (form_response_events), fichiers par URL signées ;
//  - mode « local » : réponses locales du store des automatisations
//    (borne reprise, saisie manuelle) + entrées de la file locale (mode
//    borne / envois différés) encore en attente sur cet appareil.
//
// Réponse normalisée (AdminResponse) :
// { id, formId, version, status, answers, computed, score, respondent: { userId?, memberId?, email?, name? },
//   waitlisted, paymentStatus, paymentAmount, tags: string[], assignee, notes: [{ at, by, text }],
//   history: [{ at, by?, action, from?, to?, text? }], submittedAt, updatedAt,
//   source: 'serveur'|'local'|'borne'|'hors-ligne', pending?: boolean, queueEntryId?, files?: {key → Blob} }
//
// const repo = createResponsesRepo({ def, mode, serverFormId, actor })
//   repo.list({ filters, page, pageSize, sort }) → { rows, total, page, pageSize }
//   repo.loadAll({ filters, sort, onProgress, max }) → rows
//   repo.update(rows, patch | (row) => patch) → nombre modifié (rows : réponses ou ids)
//   repo.remove(rows) / repo.restore(rows)
//   repo.addNote(id, text) / repo.history(id)
//   repo.fileUrl(ref, row) → URL (signée ou blob locale)
//   repo.subscribe(cb) → désabonnement (écoute locale ; serveur : temps réel, repli sur interrogation périodique)
//   repo.funnel → () → entonnoir anonymisé des brouillons (serveur, migration 0003) ; null en local
//   repo.versions() → { [version]: definition } (serveur)
//   repo.capabilities : { mode, notes, history, files, email, live, restore, drafts }
// ============================================================

import { formsApi, useAutomationsStore, loadQueues, loadAutomationPipeline } from './integrations.js';

const localStoreLoader = Object.values(import.meta.glob('../runtime/localStore.js'))[0] || null;
export const POLL_MS = 30000;
const SERVER_PAGE = 500;
export const MAX_LOAD = 20000;

const asArray = v => (Array.isArray(v) ? v : []);

/** Ligne serveur (form_responses) → réponse normalisée. */
export function fromServerRow(r) {
  return {
    id: r.id,
    formId: r.form_id,
    version: r.version,
    status: r.status || 'received',
    answers: r.answers || {},
    computed: r.computed || {},
    score: r.score === null || r.score === undefined ? null : Number(r.score),
    respondent: { userId: r.respondent_user || null, memberId: r.respondent_member || null, email: r.respondent_email || null },
    waitlisted: !!r.waitlisted,
    paymentStatus: r.payment_status || null,
    paymentAmount: Number.isFinite(r.payment_amount_cents) ? r.payment_amount_cents / 100 : null,
    tags: asArray(r.tags),
    assignee: r.assignee || null,
    notes: [],
    history: [],
    submittedAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at || null,
    source: 'serveur',
  };
}

/** Réponse locale (store automatisations) → réponse normalisée. */
export function fromLocalRecord(r) {
  return {
    id: r.id,
    formId: r.formId,
    version: r.version ?? null,
    status: r.status || 'received',
    answers: r.answers || {},
    computed: r.computed || {},
    score: Number.isFinite(r.score) ? r.score : null,
    respondent: r.respondent || {},
    waitlisted: !!r.waitlisted,
    paymentStatus: r.paymentStatus || null,
    paymentAmount: Number.isFinite(r.paymentAmount) ? r.paymentAmount : null,
    tags: asArray(r.tags),
    assignee: r.assignee || null,
    notes: asArray(r.notes),
    history: asArray(r.history),
    submittedAt: r.submittedAt || r.createdAt,
    updatedAt: r.updatedAt || r.submittedAt,
    source: r.source === 'borne' || r.source === 'kiosk' ? 'borne' : 'local',
  };
}

/** Entrée de file locale (IndexedDB) → réponse normalisée en lecture seule. */
function fromQueueEntry(e, formId) {
  const at = new Date(e.createdAt || Date.now()).toISOString();
  return {
    id: `q:${e.id}`,
    queueEntryId: e.id,
    formId,
    version: null,
    status: 'received',
    answers: e.answers || {},
    computed: {},
    score: null,
    respondent: {},
    waitlisted: false,
    paymentStatus: null,
    paymentAmount: null,
    tags: [],
    assignee: null,
    notes: [],
    history: [{ at, action: 'submitted' }],
    submittedAt: at,
    updatedAt: at,
    source: e.queue === 'kiosk' ? 'borne' : 'hors-ligne',
    pending: true,
    queueError: e.status === 'error' ? e.error || 'Refusée par le serveur' : null,
    files: Object.fromEntries(asArray(e.files).map(f => [f.key, f])),
  };
}

// ── Filtres côté serveur (sous-ensemble pris en charge par listResponses) ──
export function serverFilters(f = {}) {
  const out = {};
  if (Array.isArray(f.status) && f.status.length) out.status = f.status;
  if (f.tag) out.tag = f.tag;
  if (f.assignee && f.assignee !== '__none') out.assignee = f.assignee;
  if (f.waitlisted === true || f.waitlisted === false) out.waitlisted = f.waitlisted;
  if (f.paymentStatus) out.paymentStatus = f.paymentStatus;
  if (f.from) out.from = new Date(`${f.from}T00:00:00`).toISOString();
  if (f.to) out.to = new Date(`${f.to}T23:59:59.999`).toISOString();
  if (f.deleted) out.deleted = true;
  return out;
}

const SORT_FIELDS = { submittedAt: 'created_at', updatedAt: 'updated_at', status: 'status', score: 'score' };

export function sortRows(rows, sort = { field: 'submittedAt', dir: 'desc' }) {
  const dir = sort?.dir === 'asc' ? 1 : -1;
  const f = sort?.field || 'submittedAt';
  const get = typeof sort?.get === 'function' ? sort.get : (r => r[f]);
  return [...rows].sort((a, b) => {
    const va = get(a), vb = get(b);
    if (va === vb) return String(a.id).localeCompare(String(b.id));
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * dir;
  });
}

function localMatchesServerFilters(r, f) {
  if (Array.isArray(f.status) && f.status.length && !f.status.includes(r.status)) return false;
  if (f.tag && !r.tags.includes(f.tag)) return false;
  if (f.assignee && r.assignee !== f.assignee) return false;
  if (typeof f.waitlisted === 'boolean' && r.waitlisted !== f.waitlisted) return false;
  if (f.from && r.submittedAt < f.from) return false;
  if (f.to && r.submittedAt > f.to) return false;
  return true;
}

/**
 * @param {{ def: object, mode: 'server'|'local', serverFormId?: string, actor?: string }} opts
 */
export function createResponsesRepo({ def, mode, serverFormId = null, actor = '' }) {
  if (mode === 'server') return serverRepo({ def, serverFormId });
  return localRepo({ def, actor });
}

// ────────────────────────────────────────────────────────────
function serverRepo({ serverFormId }) {
  const api = formsApi;
  if (!api || !serverFormId) throw new Error('Serveur des formulaires indisponible.');
  let versionsCache = null;

  const list = async ({ filters = {}, page = 1, pageSize = 50, sort } = {}) => {
    const res = await api.listResponses(serverFormId, {
      filters: serverFilters(filters), page, pageSize,
      sort: { field: SORT_FIELDS[sort?.field] || 'created_at', dir: sort?.dir === 'asc' ? 'asc' : 'desc' },
    });
    return { ...res, rows: res.rows.map(fromServerRow) };
  };

  /** rows : réponses (ou ids) ; patch : objet ou (row) → objet (regroupé par valeur identique). */
  const update = async (rows, patch) => {
    const list = rows.map(r => (typeof r === 'object' ? r : { id: r }));
    const groups = new Map();
    for (const row of list) {
      const p = typeof patch === 'function' ? patch(row) : patch;
      if (!p) continue;
      const k = JSON.stringify(p);
      if (!groups.has(k)) groups.set(k, { patch: p, ids: [] });
      groups.get(k).ids.push(row.id);
    }
    let n = 0;
    for (const g of groups.values()) {
      for (let i = 0; i < g.ids.length; i += 1000) n += await api.bulkUpdate(g.ids.slice(i, i + 1000), g.patch);
    }
    return n;
  };
  const idsOf = rows => rows.map(r => (typeof r === 'object' ? r.id : r));

  return {
    capabilities: { mode: 'server', notes: true, history: true, files: true, email: 'brevo', live: typeof api.subscribeResponses === 'function' ? 'realtime' : 'poll', restore: true, drafts: typeof api.getFormFunnel === 'function' },
    list,
    async loadAll({ filters = {}, sort, onProgress, max = MAX_LOAD } = {}) {
      const first = await list({ filters, page: 1, pageSize: SERVER_PAGE, sort });
      const rows = [...first.rows];
      const total = Math.min(first.total, max);
      onProgress?.(rows.length, total);
      for (let p = 2; rows.length < total; p++) {
        const next = await list({ filters, page: p, pageSize: SERVER_PAGE, sort });
        if (!next.rows.length) break;
        rows.push(...next.rows);
        onProgress?.(rows.length, total);
      }
      return { rows: rows.slice(0, max), total: first.total, truncated: first.total > max };
    },
    update,
    async remove(rows) {
      const ids = idsOf(rows);
      let n = 0;
      for (let i = 0; i < ids.length; i += 1000) n += await api.deleteResponses(ids.slice(i, i + 1000));
      return n;
    },
    async restore(rows) {
      const ids = idsOf(rows);
      let n = 0;
      for (let i = 0; i < ids.length; i += 1000) n += await api.restoreResponses(ids.slice(i, i + 1000));
      return n;
    },
    addNote: (id, text) => api.addResponseNote(id, text),
    async history(id) {
      const rows = await api.getResponseHistory(id);
      return asArray(rows).map(e => ({
        at: e.at, by: e.actor || '', action: e.action,
        from: e.payload?.from ?? undefined, to: e.payload?.to ?? undefined, text: e.payload?.text,
      }));
    },
    fileUrl: ref => api.getUploadUrl(ref?.path),
    async versions() {
      if (versionsCache) return versionsCache;
      const list2 = await api.listFormVersions(serverFormId);
      versionsCache = Object.fromEntries(asArray(list2).map(v => [v.version, v.definition]));
      return versionsCache;
    },
    sendEmail: ({ rows, subject, message }) => api.sendFormEmail({ responseIds: idsOf(rows), subject, message }),
    funnel: typeof api.getFormFunnel === 'function' ? () => api.getFormFunnel(serverFormId) : null,
    /**
     * Temps réel (migration 0003 : form_responses publiée, RLS appliquée par
     * Supabase Realtime) ; repli sur l'interrogation périodique tant que le
     * canal n'est pas actif (migration absente, réseau, Realtime désactivé).
     */
    subscribe(cb) {
      let last = null;
      let stopped = false;
      let live = false;
      const offLive = typeof api.subscribeResponses === 'function'
        ? api.subscribeResponses(serverFormId, () => { if (!stopped) cb({ live: true }); }, (status) => {
          const was = live;
          live = status === 'SUBSCRIBED';
          if (was && !live) last = null;      // canal perdu : reprise du sondage
        })
        : () => {};
      const tick = async () => {
        if (stopped || live || (typeof document !== 'undefined' && document.hidden)) return;
        try {
          const r = await list({ page: 1, pageSize: 1, sort: { field: 'submittedAt', dir: 'desc' } });
          const sig = `${r.total}:${r.rows[0]?.id || ''}:${r.rows[0]?.updatedAt || ''}`;
          if (last !== null && sig !== last) cb({ total: r.total });
          last = sig;
        } catch { /* réseau : on réessaiera */ }
      };
      tick();
      const t = setInterval(tick, POLL_MS);
      return () => { stopped = true; clearInterval(t); offLive(); };
    },
  };
}

// ────────────────────────────────────────────────────────────
function localRepo({ def, actor }) {
  const store = useAutomationsStore;
  const formId = def.id;

  const localRows = () => {
    if (!store) return [];
    const all = store.getState().responses || {};
    return Object.values(all).filter(r => r && r.formId === formId).map(fromLocalRecord);
  };
  const queueRows = async () => {
    const queues = await loadQueues();
    const ingested = store?.getState().ingested || {};
    const out = [];
    for (const q of queues) {
      let entries;
      try { entries = await q.list(); } catch { entries = []; }
      entries.filter(e => (e.slug && e.slug === def.slug) || (e.formId && e.formId === formId))
        .filter(e => !ingested[e.id])
        .forEach(e => out.push(fromQueueEntry(e, formId)));
    }
    return out;
  };
  const all = async () => [...localRows(), ...(await queueRows())];

  /** Une entrée de file devient une réponse locale avant tout traitement. */
  const ingest = async (row) => {
    if (!row?.pending) return row.id;
    if (!store) throw new Error('Traitement impossible : le module Automatisations (réponses locales) est absent.');
    const st = store.getState();
    if (st.ingested?.[row.queueEntryId]) return st.ingested[row.queueEntryId];
    const input = { formId, answers: row.answers, source: row.source === 'borne' ? 'borne' : 'hors-ligne', submittedAt: row.submittedAt };
    const pipeline = loadAutomationPipeline ? await loadAutomationPipeline().catch(() => null) : null;
    const rec = pipeline?.addLocalResponse ? pipeline.addLocalResponse(input) : st.addResponse(input);
    st.markIngested?.(row.queueEntryId, rec.id);
    return rec.id;
  };

  const write = async (rows, patchFn) => {
    if (!store) throw new Error('Les réponses locales ne sont pas disponibles sur cet appareil.');
    let n = 0;
    for (const row of rows) {
      const id = await ingest(row);
      const cur = store.getState().responses[id];
      if (!cur) continue;
      const p = patchFn(fromLocalRecord(cur));
      if (!p) continue;
      const history = [];
      const at = new Date().toISOString();
      if (p.tags !== undefined && JSON.stringify(p.tags) !== JSON.stringify(cur.tags || [])) history.push({ at, by: actor, action: 'tags', from: cur.tags || [], to: p.tags });
      if (p.assignee !== undefined && p.assignee !== (cur.assignee || null)) history.push({ at, by: actor, action: 'assignee', from: cur.assignee || null, to: p.assignee });
      if (p.waitlisted !== undefined && p.waitlisted !== !!cur.waitlisted) history.push({ at, by: actor, action: 'waitlist', to: p.waitlisted });
      const { status, ...rest } = p;
      const next = { ...rest };
      if (history.length) next.history = [...(cur.history || []), ...history].slice(-100);
      // Écriture directe : updateResponse du store reconstruit l'historique et ignorerait le nôtre.
      if (Object.keys(next).length) store.setState(s => ({ responses: { ...s.responses, [id]: { ...s.responses[id], ...next, updatedAt: new Date().toISOString() } } }));
      if (status !== undefined && status !== cur.status) {
        // Le pipeline des automatisations déclenche « changement de statut » ; à défaut, simple mise à jour.
        const pipeline = loadAutomationPipeline ? await loadAutomationPipeline().catch(() => null) : null;
        if (pipeline?.changeLocalResponseStatus) pipeline.changeLocalResponseStatus(id, status);
        else store.getState().updateResponse(id, { status }, { by: actor });
      }
      n++;
    }
    return n;
  };

  const resolveRows = async (ids) => {
    const map = new Map((await all()).map(r => [r.id, r]));
    return ids.map(x => map.get(typeof x === 'object' ? x.id : x)).filter(Boolean);
  };

  return {
    capabilities: { mode: 'local', notes: !!store, history: !!store, files: true, email: 'mailto', live: 'local', restore: false, drafts: false },
    async list({ filters = {}, page = 1, pageSize = 50, sort } = {}) {
      const rows = sortRows((await all()).filter(r => localMatchesServerFilters(r, serverFilters(filters))), sort);
      const size = Math.max(1, pageSize);
      return { rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size };
    },
    async loadAll({ filters = {}, sort, onProgress } = {}) {
      const rows = sortRows((await all()).filter(r => localMatchesServerFilters(r, serverFilters(filters))), sort);
      onProgress?.(rows.length, rows.length);
      return { rows, total: rows.length, truncated: false };
    },
    async update(ids, patch) {
      const rows = await resolveRows(ids);
      return write(rows, typeof patch === 'function' ? patch : () => patch);
    },
    async remove(ids) {
      const rows = await resolveRows(ids);
      const queues = await loadQueues();
      let n = 0;
      for (const r of rows) {
        if (r.pending) {
          for (const q of queues) { try { await q.remove(r.queueEntryId); } catch { /* absente de cette file */ } }
          n++;
        } else if (store) { store.getState().deleteResponse(r.id); n++; }
      }
      return n;
    },
    restore: async () => { throw new Error('Restauration indisponible en mode local.'); },
    async addNote(id, text) {
      const t = String(text || '').trim();
      if (!t) throw new Error('Note vide.');
      if (t.length > 5000) throw new Error('Note trop longue (5000 caractères maximum).');
      const [row] = await resolveRows([id]);
      if (!row) throw new Error('Réponse introuvable.');
      const at = new Date().toISOString();
      await write([row], cur => ({ notes: [...(cur.notes || []), { at, by: actor, text: t }], history: [...(cur.history || []), { at, by: actor, action: 'note', text: t }].slice(-100) }));
    },
    async history(id) {
      const [row] = await resolveRows([id]);
      return row ? row.history : [];
    },
    async fileUrl(ref, row) {
      // Fichier joint resté sur l'appareil (file locale)
      const local = row?.files ? Object.values(row.files).find(f => f && (f.blob || f.file) && (!ref?.name || f.name === ref.name)) : null;
      if (local) return URL.createObjectURL(local.blob || local.file);
      if (ref?.local && ref.id) {
        const blob = localStoreLoader ? await (await localStoreLoader()).getBlob(ref.id) : null;
        if (blob) return URL.createObjectURL(blob);
      }
      throw new Error('Fichier non disponible sur cet appareil (envoyé au serveur ou supprimé).');
    },
    versions: async () => ({}),
    sendEmail: null,
    funnel: null,
    subscribe(cb) {
      const offs = [];
      if (store) {
        let prev = store.getState().responses;
        offs.push(store.subscribe(s => { if (s.responses !== prev) { prev = s.responses; cb({}); } }));
      }
      let alive = true;
      loadQueues().then(queues => { if (alive) queues.forEach(q => offs.push(q.subscribe(() => cb({})))); });
      return () => { alive = false; offs.forEach(off => off()); };
    },
  };
}
