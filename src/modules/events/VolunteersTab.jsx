import { useId, useMemo, useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import { useEventsStore } from './store.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { useMembers } from './hooks.js';
import { EmptyState, MemberSelect } from './ui.jsx';

const ROLE_SUGGESTIONS = ['Accueil / billetterie', 'Bar', 'Sécurité', 'Vestiaire', 'Installation', 'Rangement', 'Photo / vidéo', 'Secourisme', 'Logistique'];

export default function VolunteersTab({ ev, canWrite }) {
  const uid = useId();
  const addVolunteer = useEventsStore(s => s.addVolunteer);
  const updateVolunteer = useEventsStore(s => s.updateVolunteer);
  const removeVolunteer = useEventsStore(s => s.removeVolunteer);
  const members = useMembers();
  const [memberId, setMemberId] = useState('');
  const [role, setRole] = useState('');
  const [slot, setSlot] = useState('');

  // Regroupement par créneau (planning).
  const groups = useMemo(() => {
    const m = new Map();
    (ev.volunteers || []).forEach(v => {
      const k = v.slot || 'Sans créneau';
      m.set(k, [...(m.get(k) || []), v]);
    });
    return [...m.entries()].sort(([a], [b]) => (a === 'Sans créneau') - (b === 'Sans créneau') || a.localeCompare(b, 'fr', { numeric: true }));
  }, [ev.volunteers]);

  const slots = useMemo(() => [...new Set((ev.volunteers || []).map(v => v.slot).filter(Boolean))], [ev.volunteers]);

  // Un même membre sur deux créneaux identiques : conflit.
  const conflicts = useMemo(() => {
    const seen = new Map(); const out = new Set();
    (ev.volunteers || []).forEach(v => {
      const k = `${v.memberId}|${v.slot || ''}`;
      if (seen.has(k)) { out.add(v.id); out.add(seen.get(k)); } else seen.set(k, v.id);
    });
    return out;
  }, [ev.volunteers]);

  const submit = (e) => {
    e.preventDefault();
    if (!memberId) { document.getElementById(`${uid}-m`)?.focus(); toast.warn('Choisis un membre'); return; }
    addVolunteer(ev.id, { memberId, role, slot });
    toast.success('Bénévole ajouté', `${members.name(memberId)} — ${role || 'Bénévole'}`);
    setMemberId('');
  };

  const remove = async (v) => {
    if (!(await confirmDialog({ title: 'Retirer ce bénévole ?', message: `${members.name(v.memberId)} — ${v.role}${v.slot ? ` (${v.slot})` : ''}`, confirmLabel: 'Retirer', tone: 'danger' }))) return;
    removeVolunteer(ev.id, v.id);
    toast.success('Bénévole retiré');
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <div>
            <label htmlFor={`${uid}-m`} className="block text-xs text-dim mb-1">Membre</label>
            <MemberSelect id={`${uid}-m`} value={memberId} onChange={setMemberId} members={members.list} />
          </div>
          <div>
            <label htmlFor={`${uid}-r`} className="block text-xs text-dim mb-1">Rôle</label>
            <input id={`${uid}-r`} className="input" list={`${uid}-roles`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex. Bar" />
            <datalist id={`${uid}-roles`}>{ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          <div>
            <label htmlFor={`${uid}-s`} className="block text-xs text-dim mb-1">Créneau</label>
            <input id={`${uid}-s`} className="input" list={`${uid}-slots`} value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="Ex. 19:00–21:00" />
            <datalist id={`${uid}-slots`}>{slots.map(s => <option key={s} value={s} />)}</datalist>
          </div>
          <button type="submit" className="btn-primary"><Plus size={16} aria-hidden="true" /> Ajouter</button>
        </form>
      )}
      {members.list.length === 0 && <p className="text-sm text-amber-600">Aucun membre dans l'application : ajoute des membres (onglet Membres) pour constituer l'équipe.</p>}

      {groups.length === 0 ? (
        <EmptyState icon={UserCheck} title="Aucun bénévole">Affecte des membres à des rôles et créneaux (bar, accueil, sécurité…).</EmptyState>
      ) : groups.map(([slotName, list]) => (
        <section key={slotName} className="bg-surface border border-line rounded-2xl" aria-label={`Créneau ${slotName}`}>
          <h3 className="px-4 py-2 border-b border-line text-sm font-semibold text-ink flex justify-between">
            <span>{slotName}</span><span className="text-xs text-dim font-normal">{list.length} personne(s)</span>
          </h3>
          <ul className="divide-y divide-line">
            {list.map(v => (
              <li key={v.id} className="p-3 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[140px] text-sm text-ink">{members.name(v.memberId)}</span>
                {canWrite ? (
                  <>
                    <input aria-label={`Rôle de ${members.name(v.memberId)}`} className="input w-auto py-1 text-xs max-w-[160px]" list={`${uid}-roles`}
                      defaultValue={v.role} onBlur={(e) => e.target.value !== v.role && updateVolunteer(ev.id, v.id, { role: e.target.value })} />
                    <input aria-label={`Créneau de ${members.name(v.memberId)}`} className="input w-auto py-1 text-xs max-w-[140px]" list={`${uid}-slots`}
                      defaultValue={v.slot || ''} onBlur={(e) => e.target.value !== (v.slot || '') && updateVolunteer(ev.id, v.id, { slot: e.target.value })} />
                    <button type="button" className="btn-ghost p-2" aria-label={`Retirer ${members.name(v.memberId)}`} onClick={() => remove(v)}><Trash2 size={14} aria-hidden="true" /></button>
                  </>
                ) : <span className="badge badge-neutral">{v.role}</span>}
                {conflicts.has(v.id) && <span className="badge badge-amber">Doublon sur ce créneau</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
