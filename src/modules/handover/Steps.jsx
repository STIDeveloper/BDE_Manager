import { useId, useMemo, useState } from 'react';
import { CheckCircle2, Download, FileText, KeyRound, Loader2, Lock, RotateCcw, ShieldOff, Wand2 } from 'lucide-react';
import { useStore, ENTRY_TYPES } from '../../store.js';
import { useCan } from '../../core/permissions.js';
import { navigate } from '../../core/router.js';
import { useCatalog, useCatalogMaps } from '../../core/useCatalog.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';
import { toast } from '../../components/ui/toastStore.js';
import { formatDateLong, isoDate } from '../../documents/context.js';
import { issueDocuments } from '../../documents/issue.js';
import { generateAppsScript } from '../../utils/driveScriptGenerator.js';
import { useHandoverStore } from './store.js';
import {
  FINAL_CHECKS, LEVEL_LABEL, STEPS, buildRemovalScript, compareDrive, downloadText, memberName, slug,
} from './logic.js';

/** Carte d'étape commune. */
export function StepCard({ title, description, done, note, children }) {
  return (
    <section className="bg-surface border border-line rounded-2xl p-4 space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{title}</h3>
          {description && <p className="text-sm text-dim mt-0.5">{description}</p>}
        </div>
        {done && <span className="badge badge-emerald"><CheckCircle2 size={12} aria-hidden="true" /> Étape faite</span>}
      </div>
      {note && <p className="text-xs text-muted border-l-2 border-line pl-2">{note}</p>}
      {children}
    </section>
  );
}

/** Bouton « marquer l'étape comme faite / à refaire ». */
function StepToggle({ handover, stepId, label = 'Marquer l\'étape comme faite' }) {
  const canWrite = useCan('handover', 'write');
  const setStep = useHandoverStore(s => s.setStep);
  const done = !!handover.steps?.[stepId]?.done;
  if (!canWrite || handover.status === 'done') return null;
  return (
    <button type="button" className="btn-ghost text-xs" onClick={() => { setStep(handover.id, stepId, { done: !done }); toast.info(done ? 'Étape rouverte' : 'Étape enregistrée'); }}>
      {done ? <><RotateCcw size={13} aria-hidden="true" /> Rouvrir l'étape</> : <><CheckCircle2 size={13} aria-hidden="true" /> {label}</>}
    </button>
  );
}

const levelCls = (lvl) => (lvl === 'editor' ? 'text-emerald-600 dark:text-emerald-400' : lvl === 'none' ? 'text-muted' : 'text-blue-600 dark:text-blue-400');

// ------------------------------------------------------------
// 3. Accès Drive
// ------------------------------------------------------------
export function StepDrive({ handover }) {
  const canWrite = useCan('handover', 'write');
  const canDrive = useCan('drive', 'write');
  const members = useStore(s => s.members);
  const folders = useStore(s => s.folders);
  const drivePermissions = useStore(s => s.drivePermissions);
  const rolePresets = useStore(s => s.rolePresets);
  const documentLog = useStore(s => s.documentLog);
  const applyRolePresetToMember = useStore(s => s.applyRolePresetToMember);
  const clearMemberPermissions = useStore(s => s.clearMemberPermissions);
  const setPermission = useStore(s => s.setPermission);
  const runBatch = useStore(s => s.runBatch);
  const catalog = useCatalogMaps();
  const { roleLabel } = useCatalog();
  const updateHandover = useHandoverStore(s => s.updateHandover);
  const setStep = useHandoverStore(s => s.setStep);

  const outgoing = members.find(m => m.id === handover.outgoingId);
  const successor = members.find(m => m.id === handover.successorId);
  const outPerms = useMemo(() => drivePermissions[handover.outgoingId] || {}, [drivePermissions, handover.outgoingId]);
  const preset = rolePresets[handover.roleId] || null;
  const succPerms = useMemo(() => drivePermissions[handover.successorId] || {}, [drivePermissions, handover.successorId]);
  const cmp = useMemo(() => compareDrive(folders, outPerms, preset || {}, succPerms), [folders, outPerms, preset, succPerms]);
  const disabled = !canWrite || !canDrive || handover.status === 'done';
  const kitIssued = documentLog.some(e => e?.templateId === 'kit-passation' && e.memberIds?.includes(handover.outgoingId));
  const snapshot = handover.driveSnapshot || null;
  const outCount = Object.keys(outPerms).length;

  const mark = (note) => setStep(handover.id, 'drive', { done: true, note });

  const applyPreset = async () => {
    const ok = await confirmDialog({
      title: 'Appliquer le preset du rôle ?',
      message: `Les accès Drive de ${memberName(successor)} seront remplacés par le preset « ${roleLabel(handover.roleId)} » (${Object.keys(preset).length} dossier(s)).`,
      confirmLabel: 'Appliquer',
    });
    if (!ok) return;
    applyRolePresetToMember(successor.id, handover.roleId);
    mark(`Preset « ${roleLabel(handover.roleId)} » appliqué à ${memberName(successor)}.`);
    toast.success('Accès appliqués au successeur', 'Ctrl+Z pour annuler.');
  };

  const copyOutgoing = async () => {
    const ok = await confirmDialog({
      title: 'Copier les accès du sortant ?',
      message: `Les accès Drive de ${memberName(successor)} seront remplacés par ceux de ${memberName(outgoing)} (${outCount} dossier(s)).`,
      confirmLabel: 'Copier',
    });
    if (!ok) return;
    await runBatch(async () => {
      clearMemberPermissions(successor.id);
      Object.entries(outPerms).forEach(([fid, lvl]) => { if (lvl && lvl !== 'none') setPermission(successor.id, fid, lvl); });
    });
    mark(`Accès de ${memberName(outgoing)} copiés vers ${memberName(successor)}.`);
    toast.success('Accès copiés', 'Ctrl+Z pour annuler.');
  };

  const removeOutgoing = async () => {
    const ok = await confirmDialog({
      title: 'Retirer les accès du sortant ?',
      message: `Tous les accès Drive de ${memberName(outgoing)} (${outCount} dossier(s)) seront retirés dans l'application. Pense à les retirer aussi dans Google Drive (script ci-dessous).`,
      details: kitIssued ? [] : ['Le dossier de passation n\'a pas encore été émis : il liste les accès Drive du sortant. Tu peux l\'émettre d\'abord (étape 5).'],
      confirmLabel: 'Retirer', tone: 'danger',
    });
    if (!ok) return;
    // Instantané conservé pour générer le script de retrait.
    updateHandover(handover.id, { driveSnapshot: { ...outPerms } });
    clearMemberPermissions(outgoing.id);
    mark(`Accès Drive de ${memberName(outgoing)} retirés (${outCount} dossier(s)).`);
    toast.success('Accès du sortant retirés', 'Ctrl+Z pour annuler.');
  };

  const downloadShare = () => {
    const { script, membersWithoutEmail } = generateAppsScript({ members: [successor], folders, drivePermissions }, catalog);
    if (membersWithoutEmail.length) { toast.warn('Email manquant', `${memberName(successor)} n'a pas d'email : renseigne-le dans sa fiche.`); return; }
    downloadText(script, `Passation_partage_${slug(memberName(successor))}.gs`);
    toast.success('Script de partage téléchargé', 'Usage interne — à exécuter dans script.google.com.');
  };
  const downloadRemoval = () => {
    if (!outgoing?.email) { toast.warn('Email manquant', `${memberName(outgoing)} n'a pas d'email : renseigne-le dans sa fiche.`); return; }
    const perms = outCount ? outPerms : (snapshot || {});
    downloadText(buildRemovalScript({ member: outgoing, perms, folders }), `Passation_retrait_${slug(memberName(outgoing))}.gs`);
    toast.success('Script de retrait téléchargé', 'Usage interne — à exécuter dans script.google.com.');
  };

  if (!outgoing || !successor) {
    return <StepCard title="3. Accès Drive"><p className="text-sm text-dim">Choisis d'abord le sortant et le successeur (étape 1).</p></StepCard>;
  }

  return (
    <StepCard title="3. Accès Drive" done={!!handover.steps?.drive?.done} note={handover.steps?.drive?.note}
      description="Compare les accès du sortant au preset du rôle, puis ouvre les accès au successeur et retire ceux du sortant.">
      {cmp.rows.length === 0 ? (
        <p className="text-sm text-dim">Aucun accès Drive pour ce poste (ni preset, ni permissions).</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[480px]">
            <caption className="sr-only">Comparaison des accès Drive par dossier</caption>
            <thead>
              <tr className="text-xs text-dim text-left">
                <th scope="col" className="py-1.5 px-1 font-medium">Dossier</th>
                <th scope="col" className="py-1.5 px-1 font-medium">Sortant</th>
                <th scope="col" className="py-1.5 px-1 font-medium">Preset du rôle</th>
                <th scope="col" className="py-1.5 px-1 font-medium">Successeur</th>
              </tr>
            </thead>
            <tbody>
              {cmp.rows.map(r => (
                <tr key={r.folder.id} className="border-t border-line">
                  <th scope="row" className="py-1.5 px-1 font-normal text-ink text-left"><span className="text-muted font-mono text-xs mr-1">{r.folder.code}</span>{r.folder.name}</th>
                  <td className={`py-1.5 px-1 ${levelCls(r.outgoing)}`}>{LEVEL_LABEL[r.outgoing]}</td>
                  <td className={`py-1.5 px-1 ${levelCls(r.preset)}`}>{LEVEL_LABEL[r.preset]}</td>
                  <td className={`py-1.5 px-1 ${levelCls(r.successor)}`}>{LEVEL_LABEL[r.successor]}{r.successor !== r.preset ? <span className="sr-only"> (différent du preset)</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="text-xs text-dim space-y-0.5">
        <li>{preset ? `${cmp.diffSuccessorVsPreset} dossier(s) où le successeur diffère du preset.` : 'Aucun preset Drive pour ce rôle (Drive › Presets).'}</li>
        {cmp.extraVsPreset > 0 && <li>Le sortant a {cmp.extraVsPreset} accès supérieur(s) au preset : vérifie s'ils doivent être transmis.</li>}
        <li>Sortant : {outCount ? `${outCount} accès actif(s)` : 'aucun accès actif'}{snapshot && !outCount ? ` (retirés — ${Object.keys(snapshot).length} dans l'instantané)` : ''}.</li>
      </ul>

      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={!preset} onClick={applyPreset}><Wand2 size={14} aria-hidden="true" /> Appliquer le preset au successeur</button>
          <button type="button" className="btn-secondary" disabled={!outCount} onClick={copyOutgoing}>Copier les accès du sortant</button>
          <button type="button" className="btn-secondary" disabled={!outCount} onClick={removeOutgoing}><ShieldOff size={14} aria-hidden="true" /> Retirer au sortant</button>
        </div>
      )}
      {!canDrive && <p className="text-xs text-muted">Modification des accès Drive non autorisée pour ton compte.</p>}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <button type="button" className="btn-ghost text-xs" onClick={downloadShare}><Download size={13} aria-hidden="true" /> Script de partage Google Drive (successeur)</button>
        <button type="button" className="btn-ghost text-xs" disabled={!outCount && !snapshot} onClick={downloadRemoval}><Download size={13} aria-hidden="true" /> Script de retrait (sortant)</button>
        <StepToggle handover={handover} stepId="drive" />
      </div>
    </StepCard>
  );
}

// ------------------------------------------------------------
// 4. Coffre-fort (libellés uniquement)
// ------------------------------------------------------------
export function StepVault({ handover }) {
  const canWrite = useCan('handover', 'write');
  const canVault = useCan('vault', 'read');
  const unlocked = useStore(s => !!s._vaultKey);
  const configured = useStore(s => !!(s.vaultSalt && s.vaultVerifier) || !!s._legacyMasterHash);
  const vaultEntries = useStore(s => s.vaultEntries);
  const setVaultCheck = useHandoverStore(s => s.setVaultCheck);
  const setStep = useHandoverStore(s => s.setStep);
  // Seuls l'id, le libellé et le type sont lus : jamais les valeurs.
  const entries = useMemo(() => (unlocked && Array.isArray(vaultEntries) ? vaultEntries : [])
    .map(e => ({ id: e.id, label: e.label || 'Sans titre', type: e.type })), [unlocked, vaultEntries]);
  const checks = handover.vaultChecks || {};
  const doneCount = Object.values(checks).filter(c => c.done).length;
  const disabled = !canWrite || handover.status === 'done';

  const toggle = (e, done) => {
    setVaultCheck(handover.id, e.id, e.label, done);
    const total = entries.length;
    const nextDone = doneCount + (done ? 1 : -1);
    if (total && nextDone >= total) setStep(handover.id, 'vault', { done: true, note: `${total} accès transmis, mots de passe changés.` });
  };

  return (
    <StepCard title="4. Coffre-fort" done={!!handover.steps?.vault?.done} note={handover.steps?.vault?.note}
      description="Liste des accès à transmettre (libellés seulement — les valeurs ne sont jamais affichées ici). Change chaque mot de passe après la passation.">
      {!canVault ? <p className="text-sm text-dim">Accès au coffre-fort non autorisé pour ton compte.</p>
        : !configured ? <p className="text-sm text-dim">Le coffre-fort n'est pas configuré : rien à transmettre.</p>
          : !unlocked ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-dim flex items-center gap-1.5"><Lock size={14} aria-hidden="true" /> Déverrouille le coffre-fort pour afficher la liste des accès.</p>
              <button type="button" className="btn-secondary" onClick={() => navigate('sensitive')}>Ouvrir le coffre-fort</button>
            </div>
          ) : entries.length === 0 ? <p className="text-sm text-dim">Aucune entrée dans le coffre-fort.</p> : (
            <>
              <p className="text-xs text-dim">{doneCount}/{entries.length} mot(s) de passe changé(s).</p>
              <ul className="divide-y divide-line">
                {entries.map(e => {
                  const type = ENTRY_TYPES.find(t => t.id === e.type);
                  const checked = !!checks[e.id]?.done;
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-2">
                      <span aria-hidden="true">{type?.icon || '🔑'}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-ink truncate">{e.label}</span>
                        <span className="block text-xs text-muted">{type?.label || 'Accès'}{checks[e.id]?.at && checked ? ` · ${formatDateLong(checks[e.id].at)}` : ''}</span>
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-dim shrink-0">
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={ev => toggle(e, ev.target.checked)} />
                        Mot de passe changé
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      <StepToggle handover={handover} stepId="vault" />
    </StepCard>
  );
}

// ------------------------------------------------------------
// 5. Documents
// ------------------------------------------------------------
const DOCS = [
  { templateId: 'kit-passation', title: 'Dossier de passation', desc: 'Missions, dossiers en cours, accès Drive, accès du coffre (libellés), contacts. Confidentiel.' },
  { templateId: 'attestation-fin-mandat', title: 'Attestation de fin de fonctions', desc: 'Atteste de la fin des fonctions et de la passation au successeur.' },
];

export function StepDocuments({ handover }) {
  const uid = useId();
  const canWrite = useCan('handover', 'write');
  const canDocs = useCan('documents', 'write');
  const documentLog = useStore(s => s.documentLog);
  const members = useStore(s => s.members);
  const unlocked = useStore(s => !!s._vaultKey);
  const vaultEntries = useStore(s => s.vaultEntries);
  const addDocumentRefs = useHandoverStore(s => s.addDocumentRefs);
  const setStep = useHandoverStore(s => s.setStep);
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState('');
  const outgoing = members.find(m => m.id === handover.outgoingId);
  const disabled = !canWrite || !canDocs || handover.status === 'done';

  const issuedFor = (templateId) => documentLog.filter(e => e?.templateId === templateId && e.memberIds?.includes(handover.outgoingId));

  const emit = async (doc) => {
    const ok = await confirmDialog({
      title: `Émettre : ${doc.title} ?`,
      message: `Un numéro officiel sera attribué et le document inscrit au registre${format === 'none' ? '' : ' (téléchargement du fichier)'}.`,
      confirmLabel: 'Émettre',
    });
    if (!ok) return;
    setBusy(doc.templateId);
    try {
      const date = handover.handoverDate || isoDate();
      const values = doc.templateId === 'kit-passation'
        ? { role: handover.roleId, successeur: handover.successorId || '', datePassation: date }
        : { role: handover.roleId, successeur: handover.successorId || '', ...(outgoing?.mandateEnd ? { dateFin: outgoing.mandateEnd } : {}) };
      const res = await issueDocuments({
        templateId: doc.templateId, memberIds: [handover.outgoingId], values, format, origin: 'handover',
        // Libellés seulement (jamais les valeurs) si le coffre est déverrouillé.
        extraContext: { vaultEntryLabels: unlocked ? vaultEntries.map(e => e.label).filter(Boolean) : null },
      });
      addDocumentRefs(handover.id, res.refs);
      const after = DOCS.every(d => d.templateId === doc.templateId || issuedFor(d.templateId).length > 0);
      if (after) setStep(handover.id, 'documents', { done: true, note: `Documents émis : ${[...(handover.documentRefs || []), ...res.refs].join(', ')}` });
      toast.success('Document émis', `${doc.title} — ${res.refs.join(', ')}`);
    } catch (err) {
      toast.error('Émission impossible', err?.message || String(err));
    } finally {
      setBusy('');
    }
  };

  return (
    <StepCard title="5. Documents" done={!!handover.steps?.documents?.done} note={handover.steps?.documents?.note}
      description="Émets les documents officiels de la passation : ils sont numérotés et inscrits au registre du studio documents.">
      {!outgoing ? <p className="text-sm text-dim">Le sortant n'existe plus dans la liste des membres.</p> : (
        <>
          <div className="max-w-xs">
            <label htmlFor={`${uid}-fmt`} className="block text-xs font-medium text-dim mb-1">Format</label>
            <select id={`${uid}-fmt`} className="input" value={format} onChange={e => setFormat(e.target.value)} disabled={disabled}>
              <option value="pdf">PDF (téléchargement)</option>
              <option value="word">Word (téléchargement)</option>
              <option value="none">Registre seulement (sans fichier)</option>
            </select>
          </div>
          {!unlocked && <p className="text-xs text-muted">Coffre-fort verrouillé : le dossier de passation invitera à le déverrouiller au lieu de lister les accès.</p>}
          <ul className="grid sm:grid-cols-2 gap-3">
            {DOCS.map(d => {
              const issued = issuedFor(d.templateId);
              return (
                <li key={d.templateId} className="rounded-xl border border-line p-3 flex flex-col gap-2">
                  <p className="font-medium text-ink flex items-center gap-1.5"><FileText size={15} aria-hidden="true" /> {d.title}</p>
                  <p className="text-xs text-dim flex-1">{d.desc}</p>
                  {issued.length > 0 && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Émis : {issued.slice(0, 3).map(e => e.ref).join(', ')}{issued.length > 3 ? '…' : ''}</p>
                  )}
                  {!disabled && (
                    <button type="button" className={issued.length ? 'btn-secondary' : 'btn-primary'} disabled={!!busy} onClick={() => emit(d)}>
                      {busy === d.templateId ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                      {issued.length ? 'Émettre à nouveau' : 'Émettre'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!canDocs && <p className="text-xs text-muted">Émission de documents non autorisée pour ton compte.</p>}
          {(handover.documentRefs || []).length > 0 && <p className="text-xs text-dim">Références liées à cette passation : {handover.documentRefs.join(', ')}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost text-xs" onClick={() => navigate('documents')}>Ouvrir le registre des documents</button>
            <StepToggle handover={handover} stepId="documents" />
          </div>
        </>
      )}
    </StepCard>
  );
}

// ------------------------------------------------------------
// 6. Clôture
// ------------------------------------------------------------
export function StepClosing({ handover }) {
  const uid = useId();
  const canWrite = useCan('handover', 'write');
  const members = useStore(s => s.members);
  const drivePermissions = useStore(s => s.drivePermissions);
  const updateHandover = useHandoverStore(s => s.updateHandover);
  const setFinalCheck = useHandoverStore(s => s.setFinalCheck);
  const completeHandover = useHandoverStore(s => s.completeHandover);
  const reopenHandover = useHandoverStore(s => s.reopenHandover);
  const [notes, setNotes] = useState(handover.notes || '');
  const successor = members.find(m => m.id === handover.successorId);
  const done = handover.status === 'done';
  const disabled = !canWrite || done;

  const auto = [
    { label: 'Rôle attribué au successeur', ok: !!successor && successor.mainRole === handover.roleId },
    { label: 'Accès Drive ouverts au successeur', ok: Object.keys(drivePermissions[handover.successorId] || {}).length > 0 },
    { label: 'Accès Drive retirés au sortant', ok: Object.keys(drivePermissions[handover.outgoingId] || {}).length === 0 },
    { label: 'Documents émis', ok: (handover.documentRefs || []).length > 0 },
    ...STEPS.filter(s => s.id !== 'closing').map(s => ({ label: `Étape « ${s.label} »`, ok: !!handover.steps?.[s.id]?.done })),
  ];
  const missing = auto.filter(a => !a.ok);
  const finals = handover.finalChecks || {};

  const saveNotes = () => {
    if (notes === (handover.notes || '')) return;
    updateHandover(handover.id, { notes });
    toast.success('Notes enregistrées');
  };

  const finish = async () => {
    if (notes !== (handover.notes || '')) updateHandover(handover.id, { notes });
    const unchecked = FINAL_CHECKS.filter(c => !finals[c.id]);
    const ok = await confirmDialog({
      title: 'Terminer la passation ?',
      message: missing.length || unchecked.length ? 'Certains points ne sont pas encore validés :' : 'Tous les points sont validés.',
      details: [...missing.map(m => m.label), ...unchecked.map(c => `Checklist : ${c.label}`)],
      confirmLabel: 'Terminer', tone: missing.length || unchecked.length ? 'warning' : 'primary',
    });
    if (!ok) return;
    completeHandover(handover.id);
    toast.success('Passation terminée', `Clôturée le ${formatDateLong(new Date())}.`);
  };

  return (
    <StepCard title="6. Clôture" done={done}
      description="Dernières vérifications, notes et clôture de la passation (horodatée).">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-dim mb-1.5">Contrôles automatiques</p>
          <ul className="space-y-1 text-sm">
            {auto.map(a => (
              <li key={a.label} className="flex items-start gap-2">
                {a.ok ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" aria-hidden="true" /> : <KeyRound size={15} className="text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />}
                <span className={a.ok ? 'text-ink' : 'text-dim'}>{a.label}<span className="sr-only">{a.ok ? ' : fait' : ' : à faire'}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <fieldset>
          <legend className="text-xs font-semibold text-dim mb-1.5">Checklist finale</legend>
          <ul className="space-y-1.5 text-sm">
            {FINAL_CHECKS.map(c => (
              <li key={c.id}>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={!!finals[c.id]} disabled={disabled} onChange={e => setFinalCheck(handover.id, c.id, e.target.checked)} />
                  <span>{c.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
      <div>
        <label htmlFor={`${uid}-notes`} className="block text-xs font-medium text-dim mb-1">Notes de passation</label>
        <textarea id={`${uid}-notes`} className="input min-h-[90px]" value={notes} disabled={disabled}
          onChange={e => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Points d'attention, contacts, conseils…" />
      </div>
      {done ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} aria-hidden="true" /> Passation terminée le {formatDateLong(handover.completedAt)} à {new Date(handover.completedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>
          {canWrite && <button type="button" className="btn-ghost" onClick={() => { reopenHandover(handover.id); toast.info('Passation rouverte'); }}><RotateCcw size={14} aria-hidden="true" /> Rouvrir</button>}
        </div>
      ) : !disabled && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={finish}><CheckCircle2 size={14} aria-hidden="true" /> Terminer la passation</button>
        </div>
      )}
    </StepCard>
  );
}
