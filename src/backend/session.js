// ============================================================
// SESSION DE SYNCHRONISATION D'UN ESPACE
// ============================================================
// Observe les tranches du registre des modules et les garde alignées avec
// la table `records` d'un espace Supabase :
//  - envoi : à chaque modification d'un store, diff par référence puis par
//    empreinte de contenu ; les enregistrements modifiés / supprimés entrent
//    dans une file d'attente persistée (hors ligne) envoyée par lots ;
//  - réception : temps réel (postgres_changes) + rattrapage au démarrage et
//    à la reconnexion ; application SANS renvoi (empreintes mises à jour) ;
//  - conflits : dernier écrit gagne, par enregistrement (horodatage serveur).
//    Une modification locale en attente l'emporte sur une réception (elle
//    sera écrite après, donc gagnera côté serveur) ;
//  - droits : refus RLS → la modification locale est annulée (valeur serveur
//    restaurée) et un toast l'explique.
// Le client Supabase est injecté (un client factice peut être utilisé pour
// tester le moteur dans la page).
// ============================================================

import { getSyncSlices, onRegistryChange } from '../core/moduleRegistry.js';
import { can, CAPABILITIES } from '../core/permissions.js';
import { toast } from '../components/ui/toastStore.js';
import * as core from './syncCore.js';

const BATCH_ROWS = 200;
const BATCH_BYTES = 1_500_000;
const PAGE = 1000;
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];

const keyOf = (c, id) => `${c}\u0000${id}`;
const capLabel = (cap) => CAPABILITIES.find(c => c.id === cap)?.label || cap;

export class SyncSession {
  /**
   * @param {{ client: object, workspaceId: string, userId?: string,
   *           storage?: Storage, onStatus?: (s: object) => void, notify?: object }} opts
   */
  constructor({ client, workspaceId, userId = null, storage = globalThis.localStorage, onStatus = () => {}, notify = toast }) {
    this.client = client;
    this.ws = workspaceId;
    this.userId = userId;
    this.storage = storage;
    this.onStatus = onStatus;
    this.notify = notify;
    this.seen = new Map();        // collection → Map(id → { refs, hash })
    this.positions = new Map();   // collection → Map(id → pos) (tableaux)
    this.top = new Map();         // collection → références de premier niveau
    this.server = new Map();      // clé → { data, deleted } dernière valeur serveur connue
    this.queue = new Map();       // clé → { c, id, data, deleted, t }
    this.seq = 0;
    this.applying = 0;
    this.flushing = false;
    this.pulling = 0;
    this.started = false;
    this.stopped = false;
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    this.realtime = 'idle';
    this.error = null;
    this.lastPulledAt = null;
    this.lastSyncAt = null;
    this.retry = 0;
    this.timers = {};
    this.unsubs = [];
    this.incoming = [];
    this.lastToast = new Map();
    this.storeSubs = new Map();
  }

  // ── Persistance locale (file d'attente + empreintes) ─────────
  get metaKey() { return `bde-sync-meta:${this.ws}`; }
  get queueKey() { return `bde-sync-queue:${this.ws}`; }

  loadPersisted() {
    try {
      const meta = JSON.parse(this.storage?.getItem(this.metaKey) || 'null');
      if (meta) {
        this.lastPulledAt = meta.lastPulledAt || null;
        Object.entries(meta.h || {}).forEach(([c, ids]) => {
          this.seen.set(c, new Map(Object.entries(ids).map(([id, hash]) => [id, { refs: null, hash }])));
        });
        Object.entries(meta.pos || {}).forEach(([c, ids]) => this.positions.set(c, new Map(Object.entries(ids))));
      }
      const q = JSON.parse(this.storage?.getItem(this.queueKey) || 'null');
      if (Array.isArray(q)) q.forEach(e => { if (e?.c && e.id) this.queue.set(keyOf(e.c, e.id), { ...e, t: ++this.seq }); });
    } catch { /* données locales illisibles : on repart de zéro */ }
  }

  saveMeta(immediate = false) {
    clearTimeout(this.timers.meta);
    const write = () => {
      const h = {};
      this.seen.forEach((ids, c) => { h[c] = {}; ids.forEach((e, id) => { h[c][id] = e.hash; }); });
      const pos = {};
      this.positions.forEach((ids, c) => { pos[c] = Object.fromEntries(ids); });
      try { this.storage?.setItem(this.metaKey, JSON.stringify({ lastPulledAt: this.lastPulledAt, h, pos })); } catch { /* quota */ }
    };
    if (immediate) write(); else this.timers.meta = setTimeout(write, 400);
  }

  saveQueue() {
    try {
      const list = [...this.queue.values()].map(({ t: _t, ...e }) => e);
      if (list.length) this.storage?.setItem(this.queueKey, JSON.stringify(list));
      else this.storage?.removeItem(this.queueKey);
    } catch (err) {
      this.setError('Stockage local plein : la file d’attente de synchronisation n’a pas pu être enregistrée.', err);
    }
  }

  clearPersisted() {
    try { this.storage?.removeItem(this.metaKey); this.storage?.removeItem(this.queueKey); } catch { /* ignoré */ }
  }

  // ── Tranches ─────────────────────────────────────────────────
  slices() { return getSyncSlices(); }
  sliceOf(collection) { return this.slices().find(s => s.collection === collection); }
  seenOf(c) { if (!this.seen.has(c)) this.seen.set(c, new Map()); return this.seen.get(c); }
  posOf(c) { if (!this.positions.has(c)) this.positions.set(c, new Map()); return this.positions.get(c); }

  /** Les empreintes deviennent l'état local actuel (rien à envoyer). */
  baseline(slice, state = slice.store.getState()) {
    const cur = core.readSlice(slice, state);
    const seen = this.seenOf(slice.collection);
    const next = new Map();
    cur.forEach((e, id) => {
      const prev = seen.get(id);
      next.set(id, prev && prev.refs && core.sameRefs(prev.refs, e.refs) ? prev : { refs: e.refs, hash: core.hashValue(e.value) });
    });
    this.seen.set(slice.collection, next);
    if (slice.kind === 'array') {
      const known = this.posOf(slice.collection);
      const ids = core.arrayIds(slice, state);
      const filtered = new Map(ids.filter(id => known.has(id)).map(id => [id, Number(known.get(id))]));
      const { pos } = core.computePositions(ids, filtered);
      this.positions.set(slice.collection, pos);
    }
    this.top.set(slice.collection, core.topRefs(slice, state));
  }

  baselineAll() { this.slices().forEach(s => this.baseline(s)); this.saveMeta(); }

  /** Calcule les changements locaux d'une tranche et les met en file. */
  diffSlice(slice, state = slice.store.getState(), { force = false } = {}) {
    const c = slice.collection;
    const refs = core.topRefs(slice, state);
    if (!force && core.sameRefs(refs, this.top.get(c))) return [];
    this.top.set(c, refs);
    const cur = core.readSlice(slice, state);
    const seen = this.seenOf(c);
    let pos = null;
    let posChanged = new Set();
    if (slice.kind === 'array') {
      const known = this.posOf(c);
      const ids = core.arrayIds(slice, state);
      const filtered = new Map(ids.filter(id => known.has(id) && seen.has(id)).map(id => [id, Number(known.get(id))]));
      const r = core.computePositions(ids, filtered);
      pos = r.pos;
      posChanged = r.changed;
      this.positions.set(c, pos);
    }
    const changes = [];
    cur.forEach((e, id) => {
      const s = seen.get(id);
      const moved = posChanged.has(id);
      if (!moved && s?.refs && core.sameRefs(s.refs, e.refs)) return;
      const hash = core.hashValue(e.value);
      if (!moved && s && s.hash === hash) { s.refs = e.refs; return; }
      seen.set(id, { refs: e.refs, hash });
      changes.push({ id, data: core.toData(slice, e.value, pos?.get(id)), deleted: false });
    });
    [...seen.keys()].forEach((id) => {
      if (cur.has(id)) return;
      seen.delete(id);
      if (pos) pos.delete(id);
      changes.push({ id, data: {}, deleted: true });
    });
    if (!changes.length) return [];
    this.saveMeta();
    if (!can(slice.capability, 'write')) {
      this.warn(`perm:${c}`, 'Modification annulée', `Ton rôle ne permet pas de modifier « ${capLabel(slice.capability)} » dans cet espace.`);
      this.revert(slice, changes.map(ch => ch.id));
      return [];
    }
    changes.forEach(ch => this.queue.set(keyOf(c, ch.id), { c, id: ch.id, data: ch.data, deleted: ch.deleted, t: ++this.seq }));
    this.saveQueue();
    this.scheduleFlush();
    this.emit();
    return changes;
  }

  diffAll() { this.slices().forEach(s => this.diffSlice(s, undefined, { force: true })); }

  onStoreChange(store, state) {
    if (this.applying || this.stopped) return;
    this.slices().filter(s => s.store === store).forEach(s => this.diffSlice(s, state));
  }

  attachStores() {
    this.slices().forEach((s) => {
      if (this.storeSubs.has(s.store)) return;
      this.storeSubs.set(s.store, s.store.subscribe((state) => this.onStoreChange(s.store, state)));
    });
  }

  // ── Application de données distantes ────────────────────────
  /**
   * @param {{ collection, id, data, deleted }[]} rows
   * @param {{ replace?: boolean }} opts replace : les tranches concernées
   *   deviennent exactement les lignes reçues (tranches absentes vidées).
   */
  applyRows(rows, { replace = false } = {}) {
    const byCollection = new Map();
    rows.forEach(r => {
      if (!byCollection.has(r.collection)) byCollection.set(r.collection, []);
      byCollection.get(r.collection).push(r);
    });
    const targets = replace ? this.slices() : this.slices().filter(s => byCollection.has(s.collection));
    if (!targets.length) return;
    const patches = new Map();
    let vaultChanged = false;
    targets.forEach((slice) => {
      const state = slice.store.getState();
      const sliceRows = byCollection.get(slice.collection) || [];
      if (replace && !sliceRows.length && slice.kind === 'singleton') return;
      const patch = core.buildPatch(slice, state, sliceRows, { replace, positions: this.posOf(slice.collection) });
      if (!patch) return;
      if (slice.collection === 'core.vault') vaultChanged = true;
      patches.set(slice.store, { ...(patches.get(slice.store) || {}), ...patch });
    });
    this.applying++;
    try {
      patches.forEach((patch, store) => {
        const st = store.getState();
        if (vaultChanged && st._vaultKey !== undefined && st._vaultKey) {
          // Coffre modifié ailleurs : on le reverrouille (clé de l'ancien contenu).
          patch._vaultKey = null;
          patch.vaultEntries = [];
          this.notify.info('Coffre-fort mis à jour', 'Modifié par un autre membre : déverrouille-le à nouveau.');
        }
        store.setState(patch);
      });
    } finally {
      this.applying--;
    }
    // Les empreintes suivent l'état appliqué : aucun renvoi en boucle.
    this.slices().forEach(s => this.baseline(s));
    this.saveMeta();
  }

  /** Lignes reçues (temps réel ou rattrapage). */
  receive(rows) {
    const toApply = [];
    rows.forEach((r) => {
      if (!r?.collection || r.id === undefined) return;
      const k = keyOf(r.collection, r.id);
      this.server.set(k, { data: r.data, deleted: !!r.deleted });
      if (r.updated_at && (!this.lastPulledAt || r.updated_at > this.lastPulledAt)) this.lastPulledAt = r.updated_at;
      if (this.queue.has(k)) return;                 // modification locale en attente : elle gagnera
      const slice = this.sliceOf(r.collection);
      if (!slice) return;                            // module absent de cette version
      const s = this.seenOf(r.collection).get(String(r.id));
      if (r.deleted) { if (s) toApply.push(r); return; }
      const sameContent = s && s.hash === core.hashValue(r.data?.v);
      const samePos = slice.kind !== 'array' || !Number.isFinite(r.data?.pos) || Number(this.posOf(r.collection).get(String(r.id))) === r.data.pos;
      if (sameContent && samePos) return;            // écho de notre propre écriture
      toApply.push(r);
    });
    if (toApply.length) this.applyRows(toApply);
    this.saveMeta();
    this.lastSyncAt = new Date().toISOString();
    this.emit();
  }

  // ── Envoi ────────────────────────────────────────────────────
  scheduleFlush(delay = 300) {
    if (this.stopped) return;
    clearTimeout(this.timers.flush);
    this.timers.flush = setTimeout(() => { this.flush(); }, delay);
  }

  async flush() {
    if (this.flushing || this.stopped || !this.started) return;
    if (!this.online) { this.emit(); return; }
    this.flushing = true;
    this.emit();
    try {
      while (this.queue.size && !this.stopped) {
        const entries = [...this.queue.values()];
        const groups = new Map();
        entries.forEach(e => { if (!groups.has(e.c)) groups.set(e.c, []); groups.get(e.c).push(e); });
        for (const group of groups.values()) {
          for (const chunk of chunkBySize(group)) {
            const ok = await this.sendChunk(chunk);
            if (ok === 'stop') return;
          }
        }
      }
      this.retry = 0;
      this.error = null;
      this.lastSyncAt = new Date().toISOString();
    } finally {
      this.flushing = false;
      this.saveQueue();
      this.emit();
    }
  }

  /** @returns {Promise<true|'stop'>} */
  async sendChunk(chunk) {
    const rows = chunk.map(e => ({ workspace_id: this.ws, collection: e.c, id: e.id, data: e.data, deleted: e.deleted }));
    let error;
    try {
      ({ error } = await this.client.from('records').upsert(rows, { onConflict: 'workspace_id,collection,id' }));
    } catch (err) {
      error = err;
    }
    if (!error) {
      chunk.forEach((e) => {
        const k = keyOf(e.c, e.id);
        if (this.queue.get(k) === e) this.queue.delete(k);
        this.server.set(k, { data: e.data, deleted: e.deleted });
      });
      return true;
    }
    if (core.isNetworkError(error)) {
      this.setOnline(false);
      this.scheduleRetry();
      return 'stop';
    }
    if (core.isPermissionError(error) || /^(22|23)/.test(String(error.code || ''))) {
      if (chunk.length > 1) {
        for (const e of chunk) { const r = await this.sendChunk([e]); if (r === 'stop') return 'stop'; }
        return true;
      }
      const e = chunk[0];
      this.queue.delete(keyOf(e.c, e.id));
      const slice = this.sliceOf(e.c);
      this.warn(`rls:${e.c}`, 'Modification refusée par le serveur',
        core.isPermissionError(error)
          ? `${/row-level security|permission denied/i.test(error.message || '') || !error.message || error.message.length > 120 ? 'Droit insuffisant' : error.message} — « ${capLabel(slice?.capability || e.c)} ». La valeur du serveur a été rétablie.`
          : 'Donnée invalide : la valeur du serveur a été rétablie.');
      if (slice) await this.revert(slice, [e.id]);
      return true;
    }
    this.setError('Le serveur a renvoyé une erreur : nouvelle tentative automatique.', error);
    this.scheduleRetry();
    return 'stop';
  }

  scheduleRetry() {
    clearTimeout(this.timers.retry);
    const delay = RETRY_DELAYS[Math.min(this.retry, RETRY_DELAYS.length - 1)];
    this.retry++;
    this.timers.retry = setTimeout(() => { this.flush(); }, delay);
  }

  /** Rétablit la valeur serveur (ou supprime un ajout refusé). */
  async revert(slice, ids) {
    const rows = [];
    for (const id of ids) {
      const k = keyOf(slice.collection, id);
      let srv = this.server.get(k);
      if (!srv) {
        try {
          const { data } = await this.client.from('records').select('collection,id,data,deleted')
            .eq('workspace_id', this.ws).eq('collection', slice.collection).eq('id', id).maybeSingle();
          if (data) srv = { data: data.data, deleted: data.deleted };
        } catch { /* hors ligne : on restaure au mieux */ }
      }
      if (srv) rows.push({ collection: slice.collection, id, data: srv.data, deleted: srv.deleted });
      else if (slice.kind !== 'singleton') rows.push({ collection: slice.collection, id, data: {}, deleted: true });
    }
    if (rows.length) this.applyRows(rows);
  }

  // ── Réception ────────────────────────────────────────────────
  async fetchPages(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async pullAll() {
    return this.fetchPages(() => this.client.from('records').select('collection,id,data,deleted,updated_at')
      .eq('workspace_id', this.ws).order('collection').order('id'));
  }

  /** Rattrapage des changements depuis la dernière réception. */
  async catchUp() {
    if (this.stopped) return;
    this.pulling++;
    this.emit();
    try {
      const since = this.lastPulledAt
        ? new Date(new Date(this.lastPulledAt).getTime() - 30_000).toISOString()
        : '1970-01-01T00:00:00Z';
      const rows = await this.fetchPages(() => this.client.from('records').select('collection,id,data,deleted,updated_at')
        .eq('workspace_id', this.ws).gt('updated_at', since).order('updated_at').order('collection').order('id'));
      this.receive(rows);
      this.setOnline(true);
    } catch (err) {
      if (core.isNetworkError(err)) this.setOnline(false);
      else this.setError('Réception des modifications impossible.', err);
    } finally {
      this.pulling--;
      this.emit();
    }
  }

  onRealtimeRow(row) {
    if (!row) return;
    if (row.workspace_id && row.workspace_id !== this.ws) return;
    this.incoming.push(row);
    clearTimeout(this.timers.incoming);
    this.timers.incoming = setTimeout(async () => {
      const batch = this.incoming.splice(0);
      // Ligne trop volumineuse pour le temps réel : relue depuis la base.
      const full = [];
      for (const r of batch) {
        if (r.data === undefined && r.collection) {
          try {
            const { data } = await this.client.from('records').select('collection,id,data,deleted,updated_at')
              .eq('workspace_id', this.ws).eq('collection', r.collection).eq('id', r.id).maybeSingle();
            if (data) full.push(data);
          } catch { /* rattrapé à la reconnexion */ }
        } else full.push(r);
      }
      this.receive(full);
    }, 60);
  }

  subscribeRealtime() {
    if (!this.client.channel) return;
    this.channel = this.client.channel(`records:${this.ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `workspace_id=eq.${this.ws}` },
        (payload) => this.onRealtimeRow(payload?.new))
      .subscribe((status) => {
        this.realtime = status;
        if (status === 'SUBSCRIBED') { this.setOnline(true); this.catchUp(); this.flush(); }
        this.emit();
      });
  }

  // ── Cycle de vie ─────────────────────────────────────────────
  /**
   * @param {'resume'|'fresh'} mode
   *   resume : reprise (empreintes persistées → les changements faits hors
   *            connexion sont envoyés) ; fresh : l'état local vient d'être
   *            publié ou remplacé (empreintes = état actuel).
   */
  async start(mode = 'resume') {
    this.stopped = false;
    if (mode === 'resume') this.loadPersisted();
    else this.baselineAll();
    this.attachStores();
    this.unsubs.push(onRegistryChange(() => { this.attachStores(); this.slices().forEach(s => { if (!this.top.has(s.collection)) this.diffSlice(s, undefined, { force: true }); }); }));
    if (typeof window !== 'undefined') {
      const on = () => { this.setOnline(true); this.catchUp(); this.flush(); };
      const off = () => this.setOnline(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      this.unsubs.push(() => { window.removeEventListener('online', on); window.removeEventListener('offline', off); });
    }
    this.started = true;
    if (mode === 'resume') this.diffAll();       // modifications faites hors connexion
    else this.slices().forEach(s => { this.top.set(s.collection, core.topRefs(s, s.store.getState())); });
    await this.catchUp();
    this.subscribeRealtime();
    this.flush();
    this.emit();
  }

  stop() {
    this.stopped = true;
    this.started = false;
    Object.values(this.timers).forEach(t => clearTimeout(t));
    this.storeSubs.forEach(unsub => unsub());
    this.storeSubs.clear();
    this.unsubs.forEach(fn => fn());
    this.unsubs = [];
    if (this.channel) { try { this.client.removeChannel(this.channel); } catch { /* ignoré */ } this.channel = null; }
    this.saveMeta(true);
    this.saveQueue();
  }

  // ── Publication / remplacement initial ───────────────────────
  /** Envoie TOUTES les données locales (espace vide). */
  async publishAll(onProgress = () => {}) {
    const rows = [];
    this.slices().forEach((slice) => {
      const state = slice.store.getState();
      const cur = core.readSlice(slice, state);
      const ids = slice.kind === 'array' ? core.arrayIds(slice, state) : [...cur.keys()];
      ids.forEach((id, i) => {
        const e = cur.get(id);
        if (e) rows.push({ c: slice.collection, id, data: core.toData(slice, e.value, slice.kind === 'array' ? i : undefined), deleted: false });
      });
    });
    const skipped = new Set();
    let done = 0;
    for (const chunk of chunkBySize(rows)) {
      const { error } = await this.client.from('records').upsert(
        chunk.map(e => ({ workspace_id: this.ws, collection: e.c, id: e.id, data: e.data, deleted: false })),
        { onConflict: 'workspace_id,collection,id' });
      if (error) {
        if (core.isNetworkError(error)) throw new Error('Connexion perdue pendant la publication : relance-la (les données déjà envoyées sont conservées).', { cause: error });
        if (!core.isPermissionError(error)) throw error;
        chunk.forEach(e => skipped.add(e.c));
      }
      done += chunk.length;
      onProgress({ label: 'Publication des données', done, total: rows.length });
    }
    this.positions.clear();
    this.baselineAll();
    this.lastPulledAt = await this.serverNow();
    this.saveMeta(true);
    return { records: rows.length, skipped: [...skipped] };
  }

  /** Remplace les données locales par celles de l'espace. */
  async replaceAll(onProgress = () => {}) {
    onProgress({ label: 'Téléchargement des données de l’espace', done: 0, total: 1 });
    const rows = (await this.pullAll()).filter(r => !r.deleted);
    this.queue.clear();
    this.saveQueue();
    this.positions.clear();
    this.applyRows(rows, { replace: true });
    rows.forEach(r => this.server.set(keyOf(r.collection, r.id), { data: r.data, deleted: false }));
    this.lastPulledAt = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), this.lastPulledAt || '1970-01-01T00:00:00Z');
    this.saveMeta(true);
    onProgress({ label: 'Téléchargement des données de l’espace', done: 1, total: 1 });
    return { records: rows.length };
  }

  async serverNow() {
    try {
      const { data } = await this.client.from('records').select('updated_at').eq('workspace_id', this.ws)
        .order('updated_at', { ascending: false }).limit(1);
      return data?.[0]?.updated_at || null;
    } catch { return null; }
  }

  // ── État ─────────────────────────────────────────────────────
  setOnline(v) { if (this.online !== v) { this.online = v; if (v) this.error = null; this.emit(); } }

  setError(message, err) {
    this.error = message;
    // Jamais de données dans la console : uniquement le code / message technique.
    console.warn('[synchro]', message, err?.code || '', String(err?.message || '').slice(0, 160));
    this.emit();
  }

  warn(key, title, detail) {
    const now = Date.now();
    if (now - (this.lastToast.get(key) || 0) < 4000) return;
    this.lastToast.set(key, now);
    this.notify.error(title, detail);
  }

  get status() {
    if (!this.online) return 'offline';
    if (this.error) return 'error';
    if (this.queue.size || this.flushing || this.pulling) return 'syncing';
    return 'synced';
  }

  emit() {
    this.onStatus({ status: this.status, pending: this.queue.size, lastSyncAt: this.lastSyncAt, error: this.error });
  }
}

/** Découpe une liste d'enregistrements en lots (nombre et taille bornés). */
function chunkBySize(entries) {
  const chunks = [];
  let cur = [];
  let size = 0;
  entries.forEach((e) => {
    const s = JSON.stringify(e.data).length;
    if (cur.length && (cur.length >= BATCH_ROWS || size + s > BATCH_BYTES)) { chunks.push(cur); cur = []; size = 0; }
    cur.push(e);
    size += s;
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}
