import { useId, useMemo, useState } from 'react';
import {
  Check, ClipboardCheck, Download, FileUp, Search, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import { useEventsStore } from './store.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import Modal from '../../components/Modal.jsx';
import {
  PARTICIPANT_STATUSES, downloadFile, eventStats, parseParticipantList, safeName,
} from './logic.js';
import { useMembers } from './hooks.js';
import { EmptyState, MemberSelect, ParticipantBadge, Progress } from './ui.jsx';
import CheckinTools from './checkin/CheckinTools.jsx';

const announcePromoted = (promoted) => {
  if (promoted?.length) toast.info('Liste d\'attente', `${promoted.map(p => p.name).join(', ')} passe(nt) en inscrit(s).`);
};

export default function ParticipantsTab({ ev, canWrite }) {
  const uid = useId();
  const addParticipants = useEventsStore(s => s.addParticipants);
  const updateParticipant = useEventsStore(s => s.updateParticipant);
  const removeParticipant = useEventsStore(s => s.removeParticipant);
  const members = useMembers();
  const st = eventStats(ev);
  const [mode, setMode] = useState('list'); // list | checkin
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [importing, setImporting] = useState(false);
  const paying = Number(ev.price) > 0;

  const participants = useMemo(() => ev.participants || [], [ev.participants]);
  const takenMembers = useMemo(() => new Set(participants.filter(p => p.memberId && p.status !== 'cancelled').map(p => p.memberId)), [participants]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('fr');
    return participants.filter(p => (!statusFilter || p.status === statusFilter)
      && (!needle || `${p.name} ${p.email || ''}`.toLocaleLowerCase('fr').includes(needle)));
  }, [participants, q, statusFilter]);

  const add = (list) => {
    const res = addParticipants(ev.id, list);
    if (res.added) {
      toast.success(`${res.added} participant(s) ajouté(s)`, [
        res.waitlisted ? `${res.waitlisted} en liste d'attente (complet)` : '',
        res.duplicates ? `${res.duplicates} doublon(s) ignoré(s)` : '',
      ].filter(Boolean).join(' · ') || undefined);
    } else if (res.duplicates) toast.warn('Déjà inscrit(s)', `${res.duplicates} doublon(s) ignoré(s).`);
    return res;
  };

  const submit = (e) => {
    e.preventDefault();
    if (memberId) {
      const m = members.byId.get(memberId);
      add([{ name: `${m.firstName || ''} ${m.lastName || ''}`.trim(), email: m.email || '', memberId }]);
      setMemberId('');
      return;
    }
    if (!name.trim()) { document.getElementById(`${uid}-name`)?.focus(); toast.warn('Choisis un membre ou saisis un nom'); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { document.getElementById(`${uid}-email`)?.focus(); toast.warn('E-mail invalide'); return; }
    add([{ name, email }]);
    setName(''); setEmail('');
    document.getElementById(`${uid}-name`)?.focus();
  };

  const setStatus = (p, status) => {
    const res = updateParticipant(ev.id, p.id, { status });
    if (!res.ok) { toast.warn('Impossible', res.error); return; }
    announcePromoted(res.promoted);
  };

  const remove = async (p) => {
    if (!(await confirmDialog({ title: `Retirer ${p.name} ?`, message: 'Le participant est supprimé de la liste. Pour garder une trace, préfère le statut « Annulé ».', confirmLabel: 'Retirer', tone: 'danger' }))) return;
    const res = removeParticipant(ev.id, p.id);
    toast.success('Participant retiré', p.name);
    announcePromoted(res.promoted);
  };

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Nom', 'E-mail', 'Membre', 'Statut', 'Payé'], ...participants.map(p => [
      p.name, p.email || '', p.memberId ? 'oui' : 'non', PARTICIPANT_STATUSES.find(s => s.id === p.status)?.label || p.status, p.paid ? 'oui' : 'non',
    ])];
    const bom = String.fromCharCode(0xFEFF); // Excel : UTF-8
    const csv = `${bom}# Usage interne — données personnelles (${ev.title})\r\n${rows.map(r => r.map(esc).join(';')).join('\r\n')}\r\n`;
    downloadFile(csv, `participants_${safeName(ev.title)}_usage_interne.csv`, 'text/csv;charset=utf-8');
    toast.success('Liste exportée', 'CSV à usage interne uniquement.');
  };

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-ink font-medium">{st.seats}{st.capacity ? ` / ${st.capacity}` : ''} place(s) occupée(s)</span>
          <span className="text-dim">{st.waitlist} en attente</span>
          <span className="text-dim">{st.present} présent(s)</span>
          <span className="text-dim">{st.absent} absent(s)</span>
          {paying && <span className="text-dim">{st.paid} payé(s)</span>}
        </div>
        {st.capacity && <Progress value={st.fillRate} label={`Remplissage ${st.fillRate} %`} tone={st.fillRate >= 100 ? 'bg-amber-500' : 'bg-blue-500'} />}
        {st.capacity && st.seats >= st.capacity && <p className="text-xs text-amber-600">Complet : les nouvelles inscriptions passent en liste d'attente et sont promues automatiquement dès qu'une place se libère.</p>}
      </div>

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Mode">
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${mode === 'list' ? 'bg-elevated text-ink' : 'text-dim'}`}><Users size={14} aria-hidden="true" /> Liste</button>
          <button type="button" aria-pressed={mode === 'checkin'} onClick={() => setMode('checkin')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 border-l border-line ${mode === 'checkin' ? 'bg-elevated text-ink' : 'text-dim'}`}><ClipboardCheck size={14} aria-hidden="true" /> Pointage</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Billets QR personnels et scanner de présence (./checkin/) */}
          <CheckinTools ev={ev} canWrite={canWrite} />
          {canWrite && <button type="button" className="btn-secondary" onClick={() => setImporting(true)}><FileUp size={14} aria-hidden="true" /> Importer</button>}
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!participants.length}><Download size={14} aria-hidden="true" /> CSV</button>
        </div>
      </div>

      {canWrite && mode === 'list' && (
        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-3 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor={`${uid}-m`} className="block text-xs text-dim mb-1">Membre</label>
            <MemberSelect id={`${uid}-m`} value={memberId} onChange={(v) => { setMemberId(v); if (v) { setName(''); setEmail(''); } }}
              members={members.list.filter(m => !takenMembers.has(m.id))} placeholder="— Membre de l'asso —" />
          </div>
          <span className="text-xs text-muted text-center pb-2">ou</span>
          <div>
            <label htmlFor={`${uid}-name`} className="block text-xs text-dim mb-1">Nom (externe)</label>
            <input id={`${uid}-name`} className="input" value={name} disabled={!!memberId} onChange={(e) => setName(e.target.value)} placeholder="Prénom Nom" />
          </div>
          <div>
            <label htmlFor={`${uid}-email`} className="block text-xs text-dim mb-1">E-mail (facultatif)</label>
            <input id={`${uid}-email`} type="email" className="input" value={email} disabled={!!memberId} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary"><UserPlus size={16} aria-hidden="true" /> Inscrire</button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un participant</label>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input id={`${uid}-q`} type="search" className="input pl-8" placeholder="Rechercher un participant…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {mode === 'list' && (
          <select aria-label="Filtrer par statut" className="input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            {PARTICIPANT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>

      {participants.length === 0 ? (
        <EmptyState icon={Users} title="Aucun participant">Inscris des membres ou des externes, ou importe une liste (CSV ou copier-coller).</EmptyState>
      ) : mode === 'checkin' ? (
        <CheckIn ev={ev} list={filtered} canWrite={canWrite} setStatus={setStatus} paying={paying} updateParticipant={updateParticipant} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-dim text-center py-6">Aucun participant ne correspond.</p>
      ) : (
        <ul className="bg-surface border border-line rounded-2xl divide-y divide-line">
          {filtered.map((p) => {
            const waitRank = p.status === 'waitlist' ? participants.filter(x => x.status === 'waitlist').indexOf(p) + 1 : 0;
            return (
              <li key={p.id} className="p-3 flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm text-ink">{p.name} {p.memberId && <span className="badge badge-brand ml-1">Membre</span>}</p>
                  {p.email && <p className="text-xs text-dim">{p.email}</p>}
                </div>
                {waitRank > 0 && <span className="text-xs text-amber-600">n° {waitRank} en attente</span>}
                {canWrite ? (
                  <select aria-label={`Statut de ${p.name}`} className="input w-auto py-1 text-xs" value={p.status} onChange={(e) => setStatus(p, e.target.value)}>
                    {PARTICIPANT_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                ) : <ParticipantBadge status={p.status} />}
                {(paying || p.paid) && (
                  <label className="flex items-center gap-1 text-xs text-dim">
                    <input type="checkbox" checked={!!p.paid} disabled={!canWrite} onChange={(e) => updateParticipant(ev.id, p.id, { paid: e.target.checked })} /> Payé
                  </label>
                )}
                {canWrite && <button type="button" className="btn-ghost p-2" aria-label={`Retirer ${p.name}`} onClick={() => remove(p)}><Trash2 size={14} aria-hidden="true" /></button>}
              </li>
            );
          })}
        </ul>
      )}

      {importing && <ImportModal members={members.list} onClose={() => setImporting(false)} onImport={(list) => { add(list); setImporting(false); }} />}
    </div>
  );
}

/** Pointage rapide (mobile) : gros boutons Présent / Absent. */
function CheckIn({ list, canWrite, setStatus, paying, ev, updateParticipant }) {
  const rows = list.filter(p => ['registered', 'present', 'absent'].includes(p.status));
  const done = rows.filter(p => p.status !== 'registered').length;
  if (!rows.length) return <p className="text-sm text-dim text-center py-6">Personne à pointer (seuls les inscrits sont listés).</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-dim" aria-live="polite">{done}/{rows.length} pointé(s)</p>
      <ul className="space-y-2">
        {rows.map(p => (
          <li key={p.id} className={`bg-surface border rounded-2xl p-3 flex items-center gap-2 ${p.status === 'present' ? 'border-emerald-500/50' : p.status === 'absent' ? 'border-rose-500/40' : 'border-line'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-base text-ink truncate">{p.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <ParticipantBadge status={p.status} />
                {paying && (
                  <button type="button" disabled={!canWrite} onClick={() => updateParticipant(ev.id, p.id, { paid: !p.paid })}
                    className={`badge ${p.paid ? 'badge-emerald' : 'badge-amber'}`} aria-pressed={!!p.paid} aria-label={`${p.name} : ${p.paid ? 'payé' : 'non payé'} (basculer)`}>
                    {p.paid ? 'Payé' : 'Non payé'}
                  </button>
                )}
              </div>
            </div>
            <button type="button" disabled={!canWrite} aria-pressed={p.status === 'present'} aria-label={`Marquer ${p.name} présent`}
              onClick={() => setStatus(p, p.status === 'present' ? 'registered' : 'present')}
              className={`w-12 h-12 rounded-xl flex items-center justify-center border ${p.status === 'present' ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-line text-dim'}`}>
              <Check size={22} aria-hidden="true" />
            </button>
            <button type="button" disabled={!canWrite} aria-pressed={p.status === 'absent'} aria-label={`Marquer ${p.name} absent`}
              onClick={() => setStatus(p, p.status === 'absent' ? 'registered' : 'absent')}
              className={`w-12 h-12 rounded-xl flex items-center justify-center border ${p.status === 'absent' ? 'bg-rose-600 border-rose-600 text-white' : 'border-line text-dim'}`}>
              <X size={22} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportModal({ members, onClose, onImport }) {
  const uid = useId();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseParticipantList(text, members), [text, members]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Fichier trop volumineux', '2 Mo maximum.'); return; }
    try { setText(await file.text()); } catch { toast.error('Lecture impossible', file.name); }
    e.target.value = '';
  };

  return (
    <Modal isOpen onClose={onClose} title="Importer des participants" maxWidth="max-w-2xl"
      description="Colle une liste (un nom par ligne, e-mail facultatif) ou charge un CSV avec en-têtes (Nom, Prénom, E-mail). Les membres sont reconnus automatiquement."
      footer={(
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Annuler</button>
          <button type="button" className="btn-primary" disabled={!parsed.length} onClick={() => onImport(parsed)}>Importer {parsed.length || ''}</button>
        </div>
      )}>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${uid}-file`} className="block text-xs text-dim mb-1">Fichier CSV</label>
          <input id={`${uid}-file`} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="text-sm text-dim" />
        </div>
        <div>
          <label htmlFor={`${uid}-txt`} className="block text-xs text-dim mb-1">Ou colle la liste</label>
          <textarea id={`${uid}-txt`} rows={7} className="input font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Camille Martin\nLéo Durand <leo@exemple.fr>\nNom;Prénom;E-mail'} />
        </div>
        {parsed.length > 0 && (
          <div>
            <p className="text-xs text-dim mb-1">Aperçu : {parsed.length} personne(s), dont {parsed.filter(p => p.memberId).length} membre(s) reconnu(s).</p>
            <ul className="max-h-48 overflow-y-auto border border-line rounded-lg divide-y divide-line text-sm">
              {parsed.map((p, i) => (
                <li key={`${p.name}-${i}`} className="px-3 py-1.5 flex justify-between gap-2">
                  <span className="text-ink">{p.name}{p.memberId && <span className="badge badge-brand ml-2">Membre</span>}</span>
                  <span className="text-xs text-dim truncate">{p.email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
