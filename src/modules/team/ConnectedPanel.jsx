// Espace connecté : état, membres, invitations, matrice des droits, journal.
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Users, Mail, Copy, Trash2, Loader2, RefreshCw, ShieldCheck, History, LogOut, Unplug, DoorOpen, Pencil, Check, X, Send,
} from 'lucide-react';
import * as engine from '../../backend/engine.js';
import { useBackendState, STATUS_META } from '../../backend/state.js';
import { CAPABILITIES, useCan } from '../../core/permissions.js';
import { useStore } from '../../store.js';
import { fullName } from '../../documents/context.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import {
  LEVEL_LABELS, LEVEL_ORDER, ROLE_LABELS, ROLE_BADGE, EDITABLE_ROLES, ACTION_LABELS,
  collectionLabel, inviteLink, formatDateTime,
} from './labels.js';

const card = 'bg-surface border border-line rounded-2xl p-4 sm:p-5';

function SectionTitle({ icon: Icon, id, children, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h3 id={id} className="font-semibold text-ink flex items-center gap-2"><Icon size={17} className="text-blue-500" aria-hidden="true" /> {children}</h3>
      {action}
    </div>
  );
}

function Overview() {
  const s = useBackendState();
  const meta = STATUS_META[s.status] || STATUS_META.local;
  const isOwner = s.role === 'owner';
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const nameId = useId();
  const [busy, setBusy] = useState('');

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try { await fn(); if (okMsg) toast.success(okMsg); } catch (err) { toast.error('Action impossible', err?.message); } finally { setBusy(''); }
  };

  const disconnect = async () => {
    if (!(await confirmDialog({
      title: 'Arrêter la synchronisation sur cet appareil ?',
      message: 'Les données restent sur l’appareil (mode local) mais ne seront plus partagées. Tu pourras reconnecter l’appareil plus tard (ses données seront alors remplacées par celles de l’espace).',
      details: s.pending ? [`${s.pending} modification(s) pas encore envoyée(s) seront perdues pour l’espace.`] : undefined,
      tone: 'warning', confirmLabel: 'Arrêter la synchro',
    }))) return;
    engine.disconnectWorkspace();
    toast.info('Synchronisation arrêtée', 'Cet appareil est repassé en mode local.');
  };
  const leave = async () => {
    if (!(await confirmDialog({
      title: `Quitter l’espace « ${s.workspaceName} » ?`,
      message: 'Tu perdras l’accès aux données partagées (une nouvelle invitation sera nécessaire). Les données déjà présentes sur cet appareil y restent.',
      tone: 'danger', confirmLabel: 'Quitter l’espace',
    }))) return;
    run('leave', () => engine.leaveWorkspace(), 'Tu as quitté l’espace');
  };
  const logout = async () => {
    if (s.pending && !(await confirmDialog({
      title: 'Se déconnecter maintenant ?',
      message: `${s.pending} modification(s) n’ont pas encore été envoyées au serveur.`, tone: 'warning', confirmLabel: 'Se déconnecter',
    }))) return;
    run('logout', () => engine.signOut(), 'Déconnecté·e');
  };
  const saveName = async (e) => {
    e.preventDefault();
    await run('rename', () => engine.renameWorkspace(name), 'Espace renommé');
    setEditing(false);
  };

  return (
    <section className={card} aria-labelledby="ov-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <form onSubmit={saveName} className="flex items-center gap-2">
              <label htmlFor={nameId} className="sr-only">Nom de l’espace</label>
              <input id={nameId} className="input" maxLength={80} value={name} onChange={e => setName(e.target.value)} autoFocus />
              <button type="submit" className="btn-primary" aria-label="Enregistrer le nom" disabled={!name.trim()}><Check size={15} aria-hidden="true" /></button>
              <button type="button" className="btn-ghost" aria-label="Annuler" onClick={() => setEditing(false)}><X size={15} aria-hidden="true" /></button>
            </form>
          ) : (
            <h3 id="ov-title" className="text-lg font-semibold text-ink flex items-center gap-2">
              {s.workspaceName || 'Espace'}
              {isOwner && (
                <button type="button" className="btn-ghost !p-1.5" aria-label="Renommer l’espace" onClick={() => { setName(s.workspaceName); setEditing(true); }}>
                  <Pencil size={14} aria-hidden="true" />
                </button>
              )}
            </h3>
          )}
          <p className="text-sm text-dim mt-1">
            {s.user?.email} · <span className={`badge ${ROLE_BADGE[s.role] || 'badge-neutral'}`}>{ROLE_LABELS[s.role] || 'rôle inconnu'}</span>
          </p>
          <p className="text-sm mt-2" role="status">
            <strong className="text-ink">{meta.label}</strong>
            <span className="text-dim"> — {meta.hint}{s.pending ? ` ${s.pending} en attente.` : ''}{s.lastSyncAt ? ` Dernier échange : ${formatDateTime(s.lastSyncAt)}.` : ''}</span>
          </p>
          {s.error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300 mt-1">{s.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={busy === 'sync'} onClick={() => run('sync', () => engine.syncNow(), 'Synchronisation effectuée')}>
            <RefreshCw size={15} className={busy === 'sync' ? 'animate-spin' : ''} aria-hidden="true" /> Synchroniser
          </button>
          <button type="button" className="btn-ghost" onClick={disconnect}><Unplug size={15} aria-hidden="true" /> Arrêter la synchro</button>
          <button type="button" className="btn-ghost" onClick={leave} disabled={busy === 'leave'}><DoorOpen size={15} aria-hidden="true" /> Quitter l’espace</button>
          <button type="button" className="btn-ghost" onClick={logout} disabled={busy === 'logout'}><LogOut size={15} aria-hidden="true" /> Se déconnecter</button>
        </div>
      </div>
    </section>
  );
}

function Members({ members, reload, canManage }) {
  const me = useBackendState(s => s.user?.id);
  const myRole = useBackendState(s => s.role);
  const bdeMembers = useStore(s => s.members);
  const options = useMemo(() => [...bdeMembers]
    .map(m => ({ id: m.id, label: fullName(m) || 'Sans nom' }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr')), [bdeMembers]);
  const labelOf = useMemo(() => new Map(options.map(o => [o.id, o.label])), [options]);

  const act = async (fn, ok) => {
    try { await fn(); toast.success(ok); await reload(); } catch (err) { toast.error('Action impossible', err?.message); }
  };
  const remove = async (m) => {
    if (!(await confirmDialog({ title: `Retirer ${m.email || 'ce compte'} de l’espace ?`, message: 'La personne perdra immédiatement l’accès aux données partagées.', tone: 'danger', confirmLabel: 'Retirer' }))) return;
    act(() => engine.removeMember(m.user_id), 'Membre retiré');
  };

  return (
    <section className={card} aria-labelledby="mem-title">
      <SectionTitle icon={Users} id="mem-title" action={<button type="button" className="btn-ghost" onClick={reload} aria-label="Actualiser les membres"><RefreshCw size={15} aria-hidden="true" /></button>}>
        Comptes de l’espace ({members?.length ?? '…'})
      </SectionTitle>
      {!members ? <p role="status" className="text-sm text-dim">Chargement…</p> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[560px]">
            <caption className="sr-only">Comptes ayant accès à l’espace</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="font-medium p-2">Compte</th>
                <th scope="col" className="font-medium p-2">Rôle d’accès</th>
                <th scope="col" className="font-medium p-2">Fiche membre du BDE</th>
                <th scope="col" className="font-medium p-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map(m => {
                const self = m.user_id === me;
                const canEditRole = canManage && (myRole === 'owner' || m.role !== 'owner');
                return (
                  <tr key={m.user_id}>
                    <td className="p-2 text-ink break-all">{m.email || 'compte'}{self && <span className="badge badge-brand ml-1.5">toi</span>}</td>
                    <td className="p-2">
                      {canEditRole ? (
                        <select className="input !py-1.5 !w-auto" aria-label={`Rôle d’accès de ${m.email || 'ce compte'}`} value={m.role}
                          onChange={e => act(() => engine.setMemberRole(m.user_id, e.target.value), 'Rôle modifié')}>
                          {Object.entries(ROLE_LABELS).filter(([id]) => id !== 'owner' || myRole === 'owner').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                        </select>
                      ) : <span className={`badge ${ROLE_BADGE[m.role] || 'badge-neutral'}`}>{ROLE_LABELS[m.role] || m.role}</span>}
                    </td>
                    <td className="p-2">
                      {canManage ? (
                        <select className="input !py-1.5 !w-auto max-w-[220px]" aria-label={`Fiche membre liée à ${m.email || 'ce compte'}`} value={m.member_id || ''}
                          onChange={e => act(() => engine.linkMember(m.user_id, e.target.value || null), e.target.value ? 'Compte lié à la fiche' : 'Lien retiré')}>
                          <option value="">— Aucune —</option>
                          {m.member_id && !labelOf.has(m.member_id) && <option value={m.member_id}>Fiche introuvable sur cet appareil</option>}
                          {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      ) : <span className="text-dim">{m.member_id ? (labelOf.get(m.member_id) || 'Fiche liée') : '—'}</span>}
                    </td>
                    <td className="p-2 text-right">
                      {canManage && !self && (myRole === 'owner' || m.role !== 'owner') && (
                        <button type="button" className="btn-ghost !p-2" aria-label={`Retirer ${m.email || 'ce compte'}`} onClick={() => remove(m)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Invitations({ invitations, reload }) {
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('membre');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  const workspaceName = useBackendState(s => s.workspaceName);

  const mailto = (to, token) => `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Invitation à l’espace « ${workspaceName} » (BDE Manager)`)}&body=${encodeURIComponent(
    `Bonjour,\n\nTu es invité·e à rejoindre l’espace « ${workspaceName} » sur BDE Manager.\n\n1. Ouvre ce lien : ${inviteLink(token)}\n2. Crée ton compte (ou connecte-toi) avec CETTE adresse e-mail : ${to}\n3. Accepte l’invitation.\n\nLe lien expire dans 14 jours.\n`)}`;

  const copy = async (token) => {
    try { await navigator.clipboard.writeText(inviteLink(token)); toast.success('Lien copié', 'Envoie-le à la personne invitée.'); } catch { toast.error('Copie impossible', inviteLink(token)); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const token = await engine.inviteMember(email, role);
      setLast({ email: email.trim().toLowerCase(), token });
      setEmail('');
      toast.success('Invitation créée', 'Copie le lien ou envoie-le par e-mail.');
      await reload();
    } catch (err) {
      toast.error('Invitation impossible', err?.message);
    } finally { setBusy(false); }
  };

  const revoke = async (inv) => {
    if (!(await confirmDialog({ title: `Annuler l’invitation de ${inv.email} ?`, message: 'Le lien ne fonctionnera plus.', tone: 'danger', confirmLabel: 'Annuler l’invitation' }))) return;
    try { await engine.revokeInvitation(inv.id); toast.success('Invitation annulée'); await reload(); } catch (err) { toast.error('Action impossible', err?.message); }
  };

  return (
    <section className={card} aria-labelledby="inv-title">
      <SectionTitle icon={Mail} id="inv-title">Invitations</SectionTitle>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end mb-3">
        <div>
          <label htmlFor={emailId} className="block text-xs font-medium text-dim mb-1">Adresse e-mail</label>
          <input id={emailId} type="email" className="input" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor={roleId} className="block text-xs font-medium text-dim mb-1">Rôle d’accès</label>
          <select id={roleId} className="input" value={role} onChange={e => setRole(e.target.value)}>
            {EDITABLE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />} Inviter
        </button>
      </form>
      {last && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 mb-3 text-sm">
          <p className="text-ink font-medium mb-1">Lien d’invitation pour {last.email}</p>
          <p className="font-mono text-xs break-all text-dim mb-2">{inviteLink(last.token)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => copy(last.token)}><Copy size={14} aria-hidden="true" /> Copier le lien</button>
            <a className="btn-secondary" href={mailto(last.email, last.token)}><Mail size={14} aria-hidden="true" /> Envoyer par e-mail</a>
          </div>
        </div>
      )}
      {!invitations ? <p role="status" className="text-sm text-dim">Chargement…</p> : invitations.length === 0 ? (
        <p className="text-sm text-dim">Aucune invitation.</p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-xl">
          {invitations.map(inv => {
            const { expired } = inv;
            return (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="text-ink break-all">{inv.email} <span className={`badge ${ROLE_BADGE[inv.role]}`}>{ROLE_LABELS[inv.role]}</span></p>
                  <p className="text-xs text-muted">
                    {inv.accepted_at ? `Acceptée le ${formatDateTime(inv.accepted_at)}` : expired ? 'Expirée' : `En attente — expire le ${formatDateTime(inv.expires_at)}`}
                  </p>
                </div>
                {!inv.accepted_at && (
                  <div className="flex gap-1">
                    {!expired && <button type="button" className="btn-ghost !p-2" aria-label={`Copier le lien d’invitation de ${inv.email}`} onClick={() => copy(inv.token)}><Copy size={15} aria-hidden="true" /></button>}
                    {!expired && <a className="btn-ghost !p-2" aria-label={`Envoyer l’invitation par e-mail à ${inv.email}`} href={mailto(inv.email, inv.token)}><Mail size={15} aria-hidden="true" /></a>}
                    <button type="button" className="btn-ghost !p-2" aria-label={`Annuler l’invitation de ${inv.email}`} onClick={() => revoke(inv)}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function GrantMatrix({ rows, reload }) {
  const isOwner = useBackendState(s => s.role === 'owner');
  const [saving, setSaving] = useState('');
  const levelOf = useMemo(() => {
    const m = new Map();
    (rows || []).forEach(r => m.set(`${r.role}|${r.capability}`, r.level));
    return m;
  }, [rows]);

  const change = async (role, cap, level) => {
    const key = `${role}|${cap}`;
    setSaving(key);
    try {
      await engine.setGrant(role, cap, level);
      await reload();
      toast.success('Droit modifié', `${ROLE_LABELS[role]} · ${CAPABILITIES.find(c => c.id === cap)?.label} : ${LEVEL_LABELS[level]}`);
    } catch (err) {
      toast.error('Modification refusée', err?.message);
    } finally { setSaving(''); }
  };

  return (
    <section className={card} aria-labelledby="mx-title">
      <SectionTitle icon={ShieldCheck} id="mx-title">Droits par rôle d’accès</SectionTitle>
      <p className="text-sm text-dim mb-3">
        {isOwner
          ? 'Modifie un niveau : il s’applique immédiatement, côté serveur, à tous les comptes du rôle. Le propriétaire a toujours tous les droits.'
          : 'Seul le propriétaire de l’espace peut modifier cette matrice (elle est appliquée par le serveur).'}
        {' '}Niveaux : Lecture &lt; Écriture &lt; Validation (ex. valider une dépense) &lt; Gestion.
      </p>
      {!rows ? <p role="status" className="text-sm text-dim">Chargement…</p> : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[640px]">
            <caption className="sr-only">Matrice des droits : capacités en lignes, rôles d’accès en colonnes</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="font-medium p-2">Capacité</th>
                <th scope="col" className="font-medium p-2">{ROLE_LABELS.owner}</th>
                {EDITABLE_ROLES.map(r => <th key={r} scope="col" className="font-medium p-2">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CAPABILITIES.map(cap => (
                <tr key={cap.id}>
                  <th scope="row" className="p-2 text-left font-medium text-ink">{cap.label}</th>
                  <td className="p-2 text-dim">Gestion</td>
                  {EDITABLE_ROLES.map(role => {
                    const key = `${role}|${cap.id}`;
                    const level = levelOf.get(key) || 'none';
                    return (
                      <td key={role} className="p-1.5">
                        {isOwner ? (
                          <select className="input !py-1 !px-2 !text-xs" value={level} disabled={saving === key}
                            aria-label={`${cap.label} — ${ROLE_LABELS[role]}`} onChange={e => change(role, cap.id, e.target.value)}>
                            {LEVEL_ORDER.map(l => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
                          </select>
                        ) : <span className={level === 'none' ? 'text-muted' : 'text-ink'}>{LEVEL_LABELS[level]}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AuditLog({ entries, members, reload }) {
  const emailOf = useMemo(() => new Map((members || []).map(m => [m.user_id, m.email])), [members]);
  return (
    <section className={card} aria-labelledby="au-title">
      <SectionTitle icon={History} id="au-title" action={<button type="button" className="btn-ghost" onClick={reload} aria-label="Actualiser le journal"><RefreshCw size={15} aria-hidden="true" /></button>}>
        Journal d’activité
      </SectionTitle>
      <p className="text-xs text-muted mb-2">Qui a fait quoi et quand (100 dernières actions). Le contenu des données n’y figure jamais.</p>
      {!entries ? <p role="status" className="text-sm text-dim">Chargement…</p> : entries.length === 0 ? <p className="text-sm text-dim">Aucune activité.</p> : (
        <ul className="divide-y divide-line max-h-[420px] overflow-y-auto text-sm">
          {entries.map(e => (
            <li key={e.id} className="py-2 flex flex-wrap gap-x-2">
              <span className="text-muted tabular-nums shrink-0">{formatDateTime(e.at)}</span>
              <span className="text-ink">{e.user_id ? (emailOf.get(e.user_id) || 'ancien membre') : 'système'}</span>
              <span className="text-dim">{ACTION_LABELS[e.action] || e.action}</span>
              {e.collection && <span className="text-ink">« {collectionLabel(e.collection)} »</span>}
              {e.record_id && !e.action.includes('.') && <span className="text-muted font-mono text-xs self-center">#{String(e.record_id).slice(0, 8)}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const safe = (p, set) => p.then(set).catch((err) => { set([]); toast.error('Chargement impossible', err?.message); });

export default function ConnectedPanel() {
  const workspaceId = useBackendState(s => s.workspaceId);
  const canManage = useCan('admin', 'manage');
  const canAudit = useCan('admin', 'read');
  const [members, setMembers] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [grants, setGrants] = useState(null);
  const [audit, setAudit] = useState(null);

  const loadMembers = useCallback(() => safe(engine.listMembers(), setMembers), []);
  const loadInvitations = useCallback(() => (canManage ? safe(engine.listInvitations(), setInvitations) : Promise.resolve()), [canManage]);
  const loadGrants = useCallback(() => safe(engine.loadGrantMatrix(), setGrants), []);
  const loadAudit = useCallback(() => (canAudit ? safe(engine.loadAudit(100), setAudit) : Promise.resolve()), [canAudit]);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    const guard = (set) => (v) => { if (alive) set(v); };
    const fail = (set) => (err) => { if (alive) { set([]); toast.error('Chargement impossible', err?.message); } };
    engine.listMembers().then(guard(setMembers), fail(setMembers));
    engine.loadGrantMatrix().then(guard(setGrants), fail(setGrants));
    if (canManage) engine.listInvitations().then(guard(setInvitations), fail(setInvitations));
    if (canAudit) engine.loadAudit(100).then(guard(setAudit), fail(setAudit));
    return () => { alive = false; };
  }, [workspaceId, canManage, canAudit]);

  return (
    <div className="space-y-5">
      <Overview />
      <Members members={members} reload={loadMembers} canManage={canManage} />
      {canManage && <Invitations invitations={invitations} reload={loadInvitations} />}
      <GrantMatrix rows={grants} reload={loadGrants} />
      {canAudit && <AuditLog entries={audit} members={members} reload={loadAudit} />}
    </div>
  );
}
