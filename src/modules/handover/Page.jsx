import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock, Lock, Plus, Repeat, Trash2, UserMinus } from 'lucide-react';
import { useStore } from '../../store.js';
import { useCan } from '../../core/permissions.js';
import { navigate, useRoute } from '../../core/router.js';
import { useCatalog } from '../../core/useCatalog.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateLong } from '../../documents/context.js';
import { useHandoverStore, listHandovers, HANDOVER_STATUS } from './store.js';
import { handoverCandidates, memberName, progressOf, STEPS } from './logic.js';
import Wizard from './Wizard.jsx';

export default function HandoverPage() {
  const route = useRoute();
  const canRead = useCan('handover', 'read');
  const handovers = useHandoverStore(s => s.handovers);
  const id = route.rest[0];

  if (!canRead) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-dim">
        <Lock size={28} className="mx-auto mb-2" aria-hidden="true" />
        <p className="font-medium text-ink">Accès aux passations non autorisé</p>
        <p className="text-sm mt-1">Demande un accès « Passations » à un administrateur.</p>
      </div>
    );
  }
  if (id === 'new') {
    return <Wizard key={`new:${route.query.get('outgoing') || ''}`} handover={null} initialOutgoing={route.query.get('outgoing') || ''} />;
  }
  if (id) {
    const h = handovers[id];
    if (!h) {
      return (
        <div className="max-w-xl mx-auto p-6 text-center">
          <p className="font-medium text-ink">Passation introuvable</p>
          <p className="text-sm text-dim mt-1">Elle a peut-être été supprimée.</p>
          <button type="button" className="btn-secondary mt-4" onClick={() => navigate('handover')}>Retour aux passations</button>
        </div>
      );
    }
    return <Wizard key={h.id} handover={h} initialStep={route.rest[1]} />;
  }
  return <HandoverList handovers={handovers} />;
}

function HandoverList({ handovers }) {
  const canWrite = useCan('handover', 'write');
  const members = useStore(s => s.members);
  const documentLog = useStore(s => s.documentLog);
  const deleteHandover = useHandoverStore(s => s.deleteHandover);
  const { roleLabel } = useCatalog();
  const [today] = useState(() => new Date());

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const candidates = useMemo(() => handoverCandidates(members, handovers, documentLog, today), [members, handovers, documentLog, today]);
  const all = useMemo(() => listHandovers(handovers), [handovers]);
  const ongoing = all.filter(h => h.status !== 'done');
  const done = all.filter(h => h.status === 'done');

  const remove = async (h) => {
    const ok = await confirmDialog({
      title: 'Supprimer le suivi de passation ?',
      message: `Le suivi de la passation de ${memberName(byId.get(h.outgoingId))} sera supprimé. Les membres, accès Drive et documents émis ne sont pas modifiés.`,
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    deleteHandover(h.id);
    toast.success('Suivi supprimé');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2"><Repeat size={20} aria-hidden="true" /> Passations</h2>
          <p className="text-sm text-dim">Transmettre un poste pas à pas : rôle, accès Drive, coffre-fort, documents, clôture.</p>
        </div>
        {canWrite && (
          <button type="button" className="btn-primary" onClick={() => navigate('handover', 'new')}>
            <Plus size={14} aria-hidden="true" /> Nouvelle passation
          </button>
        )}
      </div>

      <Section title="À prévoir" count={candidates.length} icon={UserMinus}
        hint="Fin de mandat dans moins de 60 jours (ou dépassée), ou badge « Ancien Membre ».">
        {candidates.length === 0 ? (
          <p className="text-sm text-dim">Aucun départ à préparer pour l'instant. Renseigne les dates de fin de fonctions dans les fiches membres pour être prévenu(e).</p>
        ) : (
          <ul className="divide-y divide-line">
            {candidates.map(({ member, reason }) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink truncate">{memberName(member)}</p>
                  <p className="text-xs text-dim">
                    {roleLabel(member.mainRole) || 'Sans rôle'} · <span className={reason.kind === 'ended' ? 'text-rose-600 dark:text-rose-400' : ''}>{reason.label}</span>
                    {member.mandateEnd ? ` (${formatDateLong(member.mandateEnd)})` : ''}
                  </p>
                </div>
                {canWrite && (
                  <button type="button" className="btn-secondary" onClick={() => navigate('handover', 'new', { outgoing: member.id })}
                    aria-label={`Démarrer la passation de ${memberName(member)}`}>
                    Démarrer <ArrowRight size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="En cours" count={ongoing.length} icon={Clock}>
        {ongoing.length === 0 ? <p className="text-sm text-dim">Aucune passation en cours.</p> : (
          <HandoverRows list={ongoing} byId={byId} roleLabel={roleLabel} onDelete={canWrite ? remove : null} />
        )}
      </Section>

      <Section title="Terminées" count={done.length} icon={CheckCircle2}>
        {done.length === 0 ? <p className="text-sm text-dim">Aucune passation terminée.</p> : (
          <HandoverRows list={done} byId={byId} roleLabel={roleLabel} onDelete={canWrite ? remove : null} />
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, icon: Icon, hint, children }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4" aria-label={title}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className="text-dim" aria-hidden="true" />
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="badge badge-neutral">{count}</span>
      </div>
      {hint && <p className="text-xs text-muted mb-2">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function HandoverRows({ list, byId, roleLabel, onDelete }) {
  return (
    <ul className="divide-y divide-line">
      {list.map(h => {
        const st = HANDOVER_STATUS[h.status] || HANDOVER_STATUS.draft;
        const p = progressOf(h);
        return (
          <li key={h.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink truncate">
                {memberName(byId.get(h.outgoingId))} <ArrowRight size={12} className="inline text-dim" aria-label="vers" /> {h.successorId ? memberName(byId.get(h.successorId)) : <span className="text-dim">successeur à choisir</span>}
              </p>
              <p className="text-xs text-dim">
                {roleLabel(h.roleId) || 'Rôle non défini'} · <span className={`badge ${st.badge}`}>{st.label}</span> · {p}/{STEPS.length} étapes
                {h.completedAt ? ` · terminée le ${formatDateLong(h.completedAt)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-secondary" onClick={() => navigate('handover', h.id)}>
                {h.status === 'done' ? 'Consulter' : 'Reprendre'}
              </button>
              {onDelete && (
                <button type="button" className="btn-ghost" onClick={() => onDelete(h)} aria-label={`Supprimer le suivi de passation de ${memberName(byId.get(h.outgoingId))}`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
