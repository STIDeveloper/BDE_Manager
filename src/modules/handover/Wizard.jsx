import { useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, UserPlus } from 'lucide-react';
import { useStore } from '../../store.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { useCatalog } from '../../core/useCatalog.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateLong, isoDate, isPlaceholderMember } from '../../documents/context.js';
import { useHandoverStore, HANDOVER_STATUS } from './store.js';
import { ANCIEN_BADGE, STEPS, memberName, progressOf } from './logic.js';
import { StepDrive, StepVault, StepDocuments, StepClosing, StepCard } from './Steps.jsx';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Assistant de passation (création si `handover` est null). */
export default function Wizard({ handover, initialStep, initialOutgoing = '' }) {
  const [step, setStep] = useState(() => {
    if (!handover) return 'people';
    if (STEPS.some(s => s.id === initialStep)) return initialStep;
    return STEPS.find(s => !handover.steps?.[s.id]?.done)?.id || 'closing';
  });
  const members = useStore(s => s.members);
  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const { roleLabel } = useCatalog();
  const st = handover ? (HANDOVER_STATUS[handover.status] || HANDOVER_STATUS.draft) : null;
  const idx = STEPS.findIndex(s => s.id === step);
  const go = (id) => {
    setStep(id);
    // URL de reprise (#/handover/<id>/<étape>) sans entrée d'historique supplémentaire.
    if (handover) window.history.replaceState(null, '', `#/handover/${encodeURIComponent(handover.id)}/${id}`);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" className="btn-ghost -ml-2 mb-1" onClick={() => navigate('handover')}>
            <ArrowLeft size={14} aria-hidden="true" /> Passations
          </button>
          <h2 className="text-xl font-bold text-ink">
            {handover ? `Passation : ${roleLabel(handover.roleId) || 'poste'}` : 'Nouvelle passation'}
          </h2>
          {handover && (
            <p className="text-sm text-dim">
              {memberName(byId.get(handover.outgoingId))} → {handover.successorId ? memberName(byId.get(handover.successorId)) : 'successeur à choisir'}
              {' · '}<span className={`badge ${st.badge}`}>{st.label}</span> · {progressOf(handover)}/{STEPS.length} étapes
            </p>
          )}
        </div>
      </div>

      <nav aria-label="Étapes de la passation" className="overflow-x-auto -mx-1 px-1">
        <ol className="flex gap-1.5 min-w-max">
          {STEPS.map((s, i) => {
            const done = !!handover?.steps?.[s.id]?.done;
            const disabled = !handover && s.id !== 'people';
            const active = s.id === step;
            return (
              <li key={s.id}>
                <button type="button" disabled={disabled} onClick={() => go(s.id)} aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-40 ${
                    active ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'border-line text-dim hover:text-ink hover:bg-elevated'}`}>
                  {done ? <CheckCircle2 size={14} className="text-emerald-500" aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
                  <span>{i + 1}. {s.short}</span>
                  <span className="sr-only">{done ? '(faite)' : '(à faire)'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === 'people' && <StepPeople handover={handover} initialOutgoing={initialOutgoing} onDone={() => go('role')} />}
      {handover && step === 'role' && <StepRole handover={handover} />}
      {handover && step === 'drive' && <StepDrive handover={handover} />}
      {handover && step === 'vault' && <StepVault handover={handover} />}
      {handover && step === 'documents' && <StepDocuments handover={handover} />}
      {handover && step === 'closing' && <StepClosing handover={handover} />}

      {handover && (
        <div className="flex justify-between gap-2">
          <button type="button" className="btn-secondary" disabled={idx <= 0} onClick={() => go(STEPS[idx - 1].id)}>
            <ArrowLeft size={14} aria-hidden="true" /> Précédent
          </button>
          <button type="button" className="btn-secondary" disabled={idx >= STEPS.length - 1} onClick={() => go(STEPS[idx + 1].id)}>
            Suivant <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// 1. Sortant + successeur
// ------------------------------------------------------------
function StepPeople({ handover, initialOutgoing, onDone }) {
  const uid = useId();
  const canWrite = useCan('handover', 'write');
  const canMembers = useCan('members', 'write');
  const members = useStore(s => s.members);
  const columns = useStore(s => s.columns);
  const addMember = useStore(s => s.addMember);
  const catalog = useCatalog();
  const createHandover = useHandoverStore(s => s.createHandover);
  const updateHandover = useHandoverStore(s => s.updateHandover);
  const setStepState = useHandoverStore(s => s.setStep);

  const people = useMemo(() => members.filter(m => !isPlaceholderMember(m))
    .sort((a, b) => memberName(a).localeCompare(memberName(b), 'fr')), [members]);
  const [outgoingId, setOutgoingId] = useState(handover?.outgoingId || initialOutgoing || '');
  const outgoing = people.find(m => m.id === outgoingId);
  const [roleId, setRoleId] = useState(() => handover?.roleId || members.find(m => m.id === (handover?.outgoingId || initialOutgoing))?.mainRole || '');
  const [successorId, setSuccessorId] = useState(handover?.successorId || '');
  const [date, setDate] = useState(handover?.handoverDate || isoDate());
  const [quick, setQuick] = useState(null); // { firstName, lastName, email }
  const [error, setError] = useState('');

  const pickOutgoing = (id) => {
    setOutgoingId(id);
    const m = members.find(x => x.id === id);
    if (m?.mainRole && catalog.roles[m.mainRole]) setRoleId(m.mainRole);
    if (id === successorId) setSuccessorId('');
  };

  const createQuick = () => {
    const first = quick.firstName.trim();
    if (!first) { setError('Le prénom du successeur est obligatoire.'); return; }
    if (quick.email.trim() && !EMAIL_RX.test(quick.email.trim())) { setError('Adresse email invalide.'); return; }
    const pole = catalog.poles[catalog.roles[roleId]?.pole];
    const columnId = (pole?.columnId && columns.some(c => c.id === pole.columnId) ? pole.columnId : null)
      || outgoing?.columnId || columns[0]?.id || '';
    const id = addMember({ firstName: first, lastName: quick.lastName.trim(), email: quick.email.trim(), mainRole: '', columnId, badges: [], notes: '' });
    setSuccessorId(id);
    setQuick(null);
    setError('');
    toast.success('Membre ajouté', `${first} ${quick.lastName.trim()} — le rôle sera attribué à l'étape 2 (Ctrl+Z pour annuler).`);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!outgoingId) { setError('Choisis le ou la titulaire sortant(e).'); return; }
    if (!roleId) { setError('Choisis le rôle transmis.'); return; }
    if (successorId && successorId === outgoingId) { setError('Le successeur doit être une autre personne.'); return; }
    setError('');
    const note = `${memberName(outgoing)} → ${successorId ? memberName(members.find(m => m.id === successorId)) : '(à définir)'} — ${catalog.roleLabel(roleId)}`;
    if (!handover) {
      const id = createHandover({ outgoingId, roleId, successorId, handoverDate: date });
      setStepState(id, 'people', { done: !!successorId, note });
      toast.success('Passation créée', 'Tu peux la reprendre à tout moment depuis « Passations ».');
      navigate('handover', id, 'role');
    } else {
      updateHandover(handover.id, { outgoingId, roleId, successorId, handoverDate: date });
      setStepState(handover.id, 'people', { done: !!successorId, note });
      toast.success('Étape enregistrée', note);
      onDone();
    }
  };

  const disabled = !canWrite || handover?.status === 'done';
  return (
    <StepCard title="1. Sortant(e), successeur(e) et rôle" done={!!handover?.steps?.people?.done}
      description="Qui quitte quel poste, et qui le reprend. Le successeur peut être un membre existant ou créé ici.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-out`} className="block text-xs font-medium text-dim mb-1">Titulaire sortant(e) *</label>
            <select id={`${uid}-out`} className="input" value={outgoingId} disabled={disabled} onChange={e => pickOutgoing(e.target.value)}>
              <option value="">— Choisir —</option>
              {people.map(m => <option key={m.id} value={m.id}>{memberName(m)}{m.mainRole ? ` — ${catalog.roleLabel(m.mainRole)}` : ''}{m.badges?.includes(ANCIEN_BADGE) ? ' (ancien)' : ''}</option>)}
            </select>
            {outgoing?.mandateEnd && <p className="text-[11px] text-muted mt-1">Fin de fonctions prévue : {formatDateLong(outgoing.mandateEnd)}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-role`} className="block text-xs font-medium text-dim mb-1">Rôle transmis *</label>
            <select id={`${uid}-role`} className="input" value={roleId} disabled={disabled} onChange={e => setRoleId(e.target.value)}>
              <option value="">— Choisir —</option>
              {catalog.poleList.map(p => (catalog.rolesByPole[p.id] || []).length > 0 && (
                <optgroup key={p.id} label={p.label}>
                  {catalog.rolesByPole[p.id].map(r => <option key={r.id} value={r.id}>{r.label}{r.essential ? ' ★' : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-succ`} className="block text-xs font-medium text-dim mb-1">Successeur(e)</label>
            <select id={`${uid}-succ`} className="input" value={successorId} disabled={disabled} onChange={e => setSuccessorId(e.target.value)}>
              <option value="">— À définir —</option>
              {people.filter(m => m.id !== outgoingId).map(m => <option key={m.id} value={m.id}>{memberName(m)}{m.mainRole ? ` — ${catalog.roleLabel(m.mainRole)}` : ''}</option>)}
            </select>
            {canMembers && !disabled && !quick && (
              <button type="button" className="btn-ghost text-xs mt-1 -ml-2" onClick={() => setQuick({ firstName: '', lastName: '', email: '' })}>
                <UserPlus size={13} aria-hidden="true" /> Créer un nouveau membre
              </button>
            )}
          </div>
          <div>
            <label htmlFor={`${uid}-date`} className="block text-xs font-medium text-dim mb-1">Date de passation</label>
            <input id={`${uid}-date`} type="date" className="input" value={date} disabled={disabled} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {quick && (
          <fieldset className="border border-line rounded-xl p-3 space-y-3">
            <legend className="text-xs font-semibold text-dim px-1">Création rapide du successeur</legend>
            <div className="grid sm:grid-cols-3 gap-2">
              <div>
                <label htmlFor={`${uid}-qf`} className="block text-xs font-medium text-dim mb-1">Prénom *</label>
                <input id={`${uid}-qf`} className="input" value={quick.firstName} onChange={e => setQuick(q => ({ ...q, firstName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-ql`} className="block text-xs font-medium text-dim mb-1">Nom</label>
                <input id={`${uid}-ql`} className="input" value={quick.lastName} onChange={e => setQuick(q => ({ ...q, lastName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={`${uid}-qe`} className="block text-xs font-medium text-dim mb-1">Email (accès Drive)</label>
                <input id={`${uid}-qe`} type="email" className="input" value={quick.email} onChange={e => setQuick(q => ({ ...q, email: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost" onClick={() => { setQuick(null); setError(''); }}>Annuler</button>
              <button type="button" className="btn-secondary" onClick={createQuick}><UserPlus size={14} aria-hidden="true" /> Ajouter le membre</button>
            </div>
          </fieldset>
        )}

        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        {!disabled && (
          <div className="flex justify-end">
            <button type="submit" className="btn-primary"><Check size={14} aria-hidden="true" /> {handover ? 'Enregistrer' : 'Créer la passation'}</button>
          </div>
        )}
      </form>
    </StepCard>
  );
}

// ------------------------------------------------------------
// 2. Rôle et mandats
// ------------------------------------------------------------
function StepRole({ handover }) {
  const uid = useId();
  const canWrite = useCan('handover', 'write');
  const canMembers = useCan('members', 'write');
  const members = useStore(s => s.members);
  const columns = useStore(s => s.columns);
  const updateMember = useStore(s => s.updateMember);
  const runBatch = useStore(s => s.runBatch);
  const catalog = useCatalog();
  const updateHandover = useHandoverStore(s => s.updateHandover);
  const setStepState = useHandoverStore(s => s.setStep);

  const outgoing = members.find(m => m.id === handover.outgoingId);
  const successor = members.find(m => m.id === handover.successorId);
  const role = catalog.roles[handover.roleId];
  const date = handover.handoverDate || isoDate();
  const [exitMode, setExitMode] = useState(handover.exitMode || 'clear');
  const [addBadge, setAddBadge] = useState(true);
  const [outEnd, setOutEnd] = useState(outgoing?.mandateEnd && outgoing.mandateEnd <= date ? outgoing.mandateEnd : date);
  const [succStart, setSuccStart] = useState(date);
  const [moveColumn, setMoveColumn] = useState(true);

  const holders = members.filter(m => m.mainRole === handover.roleId && !isPlaceholderMember(m));
  const pole = role ? catalog.poles[role.pole] : null;
  const targetColumn = pole?.columnId && columns.some(c => c.id === pole.columnId) ? pole.columnId : null;
  const transferred = !!successor && successor.mainRole === handover.roleId;
  const disabled = !canWrite || !canMembers || handover.status === 'done';

  if (!outgoing) return <StepCard title="2. Rôle et mandats"><p className="text-sm text-dim">Le ou la titulaire sortant(e) n'existe plus dans la liste des membres.</p></StepCard>;
  if (!successor) {
    return (
      <StepCard title="2. Rôle et mandats">
        <p className="text-sm text-dim">Choisis d'abord le ou la successeur(e) à l'étape 1.</p>
      </StepCard>
    );
  }

  const apply = async () => {
    const outBadges = Array.isArray(outgoing.badges) ? outgoing.badges : [];
    const outPatch = {
      mandateEnd: outEnd,
      ...(exitMode === 'clear' && outgoing.mainRole === handover.roleId ? { mainRole: '' } : {}),
      ...(addBadge && !outBadges.includes(ANCIEN_BADGE) ? { badges: [...outBadges, ANCIEN_BADGE] } : {}),
    };
    const succPatch = {
      mainRole: handover.roleId,
      mandateStart: succStart,
      ...(successor.mandateEnd && successor.mandateEnd < succStart ? { mandateEnd: '' } : {}),
      ...(moveColumn && targetColumn && successor.columnId !== targetColumn ? { columnId: targetColumn } : {}),
    };
    const details = [
      `${memberName(successor)} : rôle « ${role?.label || handover.roleId} », début de fonctions le ${formatDateLong(succStart)}${succPatch.columnId ? ', déplacé dans la colonne du pôle' : ''}.`,
      successor.mainRole && successor.mainRole !== handover.roleId ? `⚠ Son rôle actuel « ${catalog.roleLabel(successor.mainRole)} » sera remplacé.` : null,
      `${memberName(outgoing)} : fin de fonctions le ${formatDateLong(outEnd)}${outPatch.mainRole === '' ? ', rôle retiré' : ', rôle conservé'}${outPatch.badges ? ', badge « Ancien Membre »' : ''}.`,
    ].filter(Boolean);
    const ok = await confirmDialog({
      title: 'Transférer le rôle ?', message: 'Les fiches membres suivantes vont être modifiées :', details,
      confirmLabel: 'Transférer', tone: 'primary',
    });
    if (!ok) return;
    // Une seule entrée d'historique : un Ctrl+Z annule tout le transfert.
    await runBatch(async () => {
      updateMember(successor.id, succPatch);
      updateMember(outgoing.id, outPatch);
    });
    updateHandover(handover.id, { exitMode });
    setStepState(handover.id, 'role', { done: true, note: details.join(' ') });
    toast.success('Rôle transféré', 'Ctrl+Z (ou le bouton Annuler) pour revenir en arrière.');
  };

  const over = role && holders.filter(m => m.id !== outgoing.id || exitMode === 'keep').length + (transferred ? 0 : 1) > (role.capacity || 1);

  return (
    <StepCard title="2. Rôle et mandats" done={!!handover.steps?.role?.done} note={handover.steps?.role?.note}
      description="Attribue le rôle au successeur, fixe les dates de mandat et décide de la sortie du sortant.">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs text-dim">Sortant(e)</p>
          <p className="font-medium text-ink">{memberName(outgoing)}</p>
          <p className="text-xs text-dim">Rôle actuel : {catalog.roleLabel(outgoing.mainRole) || 'aucun'}{outgoing.mandateEnd ? ` · fin ${formatDateLong(outgoing.mandateEnd)}` : ''}</p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs text-dim">Successeur(e)</p>
          <p className="font-medium text-ink">{memberName(successor)}</p>
          <p className="text-xs text-dim">Rôle actuel : {catalog.roleLabel(successor.mainRole) || 'aucun'}{successor.mandateStart ? ` · début ${formatDateLong(successor.mandateStart)}` : ''}</p>
        </div>
      </div>
      {transferred && <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-3 flex items-center gap-1.5"><CheckCircle2 size={14} aria-hidden="true" /> {memberName(successor)} occupe désormais le rôle « {role?.label} ».</p>}
      {over && !transferred && <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">Attention : la capacité du rôle ({role.capacity}) sera dépassée tant que le sortant le conserve.</p>}

      {!disabled && (
        <div className="mt-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-end`} className="block text-xs font-medium text-dim mb-1">Fin de fonctions du sortant</label>
              <input id={`${uid}-end`} type="date" className="input" value={outEnd} onChange={e => setOutEnd(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${uid}-start`} className="block text-xs font-medium text-dim mb-1">Début de fonctions du successeur</label>
              <input id={`${uid}-start`} type="date" className="input" value={succStart} onChange={e => setSuccStart(e.target.value)} />
            </div>
          </div>
          <fieldset>
            <legend className="text-xs font-medium text-dim mb-1">Sortie du sortant</legend>
            <div className="flex flex-col sm:flex-row gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name={`${uid}-exit`} checked={exitMode === 'clear'} onChange={() => setExitMode('clear')} /> Retirer le rôle</label>
              <label className="flex items-center gap-2"><input type="radio" name={`${uid}-exit`} checked={exitMode === 'keep'} onChange={() => setExitMode('keep')} /> Conserver le rôle (transition)</label>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addBadge} onChange={e => setAddBadge(e.target.checked)} /> Ajouter le badge « Ancien Membre » au sortant</label>
          {targetColumn && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={moveColumn} onChange={e => setMoveColumn(e.target.checked)} /> Placer le successeur dans la colonne du pôle « {pole.label} »</label>
          )}
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={apply}>{transferred ? 'Réappliquer les dates' : 'Transférer le rôle'}</button>
          </div>
        </div>
      )}
      {!canMembers && <p className="text-xs text-muted mt-3">Modification des membres non autorisée pour ton compte.</p>}
    </StepCard>
  );
}
