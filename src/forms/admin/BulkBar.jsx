// Traitement en masse de la sélection : statut, étiquette, assignation,
// export, suppression (confirmation forte), restauration (corbeille).
import { useId, useState } from 'react';
import { X, Tag, Trash2, FileSpreadsheet, FileText, Loader2, ArchiveRestore, Mail } from 'lucide-react';
import { statusesOf } from './analytics.js';
import { exportCsv, exportXlsx } from './exporters.js';
import { respondentEmail } from './columns.js';
import { toast } from '../../components/ui/toastStore.js';
import { confirmDialog } from '../../components/ui/confirmStore.js';

export default function BulkBar({ ctx }) {
  const uid = useId();
  const { def, filtered, selected, setSelected, repo, canWrite, canManage, members, columns, trash, questions } = ctx;
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState('');
  // Sécurité : une action en masse ne porte QUE sur les réponses sélectionnées
  // ET actuellement affichées. Une sélection masquée par la recherche ou les
  // filtres est ignorée (et signalée) — jamais modifiée ni supprimée à l'aveugle.
  const sel = filtered.filter(r => selected.has(r.id));
  const hiddenSelected = selected.size - sel.length;
  const statuses = statusesOf(def);

  const run = async (label, fn) => {
    if (!repo || busy || sel.length === 0) return;
    setBusy(true);
    try {
      const n = await fn();
      toast.success(label, `${n} réponse${n > 1 ? 's' : ''} traitée${n > 1 ? 's' : ''}.`);
      ctx.reload();
    } catch (err) {
      toast.error('Action impossible', err?.message || String(err));
    } finally { setBusy(false); }
  };

  const setStatus = (status) => {
    if (!status) return;
    const label = statuses.find(s => s.id === status)?.label || status;
    run(`Statut « ${label} » appliqué`, () => repo.update(sel, { status }));
  };
  const addTag = () => {
    const t = tag.trim().slice(0, 40);
    if (!t) return;
    run(`Étiquette « ${t} » ajoutée`, () => repo.update(sel, r => ((r.tags || []).includes(t) ? null : { tags: [...(r.tags || []), t] })));
    setTag('');
  };
  const removeTag = () => {
    const t = tag.trim();
    if (!t) return;
    run(`Étiquette « ${t} » retirée`, () => repo.update(sel, r => ((r.tags || []).includes(t) ? { tags: r.tags.filter(x => x !== t) } : null)));
    setTag('');
  };
  const assign = (v) => {
    if (v === '') return;
    run(v === '__none' ? 'Assignation retirée' : 'Réponses assignées', () => repo.update(sel, { assignee: v === '__none' ? null : v }));
  };
  const exportSel = async (kind) => {
    const cols = columns.filter(c => canManage || !c.sensitive);
    try {
      const name = kind === 'csv' ? exportCsv(def, sel, cols) : await exportXlsx(def, sel, cols, { includeSummary: false });
      toast.success('Export téléchargé', `${name} — usage interne${canManage ? '' : ' (colonnes sensibles exclues)'}.`);
    } catch (err) { toast.error('Export impossible', err?.message || String(err)); }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `Supprimer ${sel.length} réponse${sel.length > 1 ? 's' : ''} ?`,
      message: ctx.mode === 'server'
        ? 'Les réponses passent dans la corbeille du serveur (restaurables par un gestionnaire) et disparaissent des statistiques et des exports.'
        : 'Les réponses sont supprimées DÉFINITIVEMENT de cet appareil (les réponses de la borne encore en attente ne seront jamais envoyées).',
      confirmLabel: 'Supprimer', tone: 'danger', requireWord: 'SUPPRIMER',
    });
    if (!ok) return;
    await run('Réponses supprimées', async () => { const n = await repo.remove(sel); setSelected(new Set()); return n; });
  };
  const restore = () => run('Réponses restaurées', async () => { const n = await repo.restore(sel); setSelected(new Set()); return n; });
  const mailto = () => {
    const emails = [...new Set(sel.map(r => respondentEmail(r, questions)).filter(Boolean))];
    if (!emails.length) { toast.warn('Aucune adresse', 'Les réponses sélectionnées ne contiennent pas d\'e-mail.'); return; }
    window.location.assign(`mailto:?bcc=${encodeURIComponent(emails.slice(0, 80).join(','))}&subject=${encodeURIComponent(def.title)}`);
    if (emails.length > 80) toast.warn('Liste tronquée', '80 destinataires maximum par message.');
  };

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 p-2 rounded-2xl border border-blue-500/30 bg-blue-500/[0.06]" role="region" aria-label="Actions sur la sélection">
      <span className="text-sm font-semibold text-ink">{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
      {hiddenSelected > 0 && (
        <span className="text-xs text-amber-600" role="status">
          {hiddenSelected} masquée{hiddenSelected > 1 ? 's' : ''} par les filtres (ignorée{hiddenSelected > 1 ? 's' : ''})
        </span>
      )}
      <button type="button" className="btn-ghost !p-1" aria-label="Vider la sélection" onClick={() => setSelected(new Set())}><X size={14} aria-hidden="true" /></button>
      {busy && <Loader2 size={15} className="animate-spin text-dim" aria-label="Traitement en cours" />}
      {canWrite && !trash && (
        <>
          <label htmlFor={`${uid}-st`} className="sr-only">Changer le statut</label>
          <select id={`${uid}-st`} className="input !w-auto max-w-full !py-1 !text-xs" value="" disabled={busy || sel.length === 0} onChange={e => setStatus(e.target.value)}>
            <option value="">Statut…</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label htmlFor={`${uid}-as`} className="sr-only">Assigner</label>
          <select id={`${uid}-as`} className="input !w-auto max-w-full !py-1 !text-xs" value="" disabled={busy || sel.length === 0} onChange={e => assign(e.target.value)}>
            <option value="">Assigner…</option>
            <option value="__none">Personne (retirer)</option>
            {(members || []).map(m => <option key={m.id} value={m.id}>{[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}</option>)}
          </select>
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-tag`} className="sr-only">Étiquette</label>
            <input id={`${uid}-tag`} className="input !w-32 !py-1 !text-xs" placeholder="Étiquette" value={tag} maxLength={40} onChange={e => setTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTag(); }} />
            <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy || sel.length === 0 || !tag.trim()} onClick={addTag}><Tag size={12} aria-hidden="true" /> Ajouter</button>
            <button type="button" className="btn-ghost !py-1 !text-xs" disabled={busy || sel.length === 0 || !tag.trim()} onClick={removeTag}>Retirer</button>
          </span>
        </>
      )}
      <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => exportSel('csv')}><FileText size={13} aria-hidden="true" /> CSV</button>
      <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => exportSel('xlsx')}><FileSpreadsheet size={13} aria-hidden="true" /> Excel</button>
      <button type="button" className="btn-ghost !py-1 !text-xs" onClick={mailto}><Mail size={13} aria-hidden="true" /> E-mail</button>
      {canManage && trash && <button type="button" className="btn-secondary !py-1 !text-xs" disabled={busy || sel.length === 0} onClick={restore}><ArchiveRestore size={13} aria-hidden="true" /> Restaurer</button>}
      {canManage && !trash && <button type="button" className="btn-ghost !py-1 !text-xs !text-red-600" disabled={busy || sel.length === 0} onClick={remove}><Trash2 size={13} aria-hidden="true" /> Supprimer…</button>}
    </div>
  );
}
