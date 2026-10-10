import { useId, useMemo, useRef, useState } from 'react';
import { Archive, ExternalLink, FileImage, FileText, Loader2, Pencil, Search, Tag, Trash2, Upload } from 'lucide-react';
import Modal from '../Modal';
import { useDocsStore, ARCHIVE_CATEGORIES } from '../../modules/docs/store';
import { saveAttachment, openAttachment, deleteAttachment, MAX_ATTACHMENT_BYTES } from '../../core/attachments';
import { useCan } from '../../core/permissions';
import { formatDateLong, isoDate } from '../../documents/context';
import { confirmDialog } from '../ui/confirmStore';
import { toast } from '../ui/toastStore';
import { normalizeSearch } from './studioHelpers';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic';
const categoryLabel = (id) => ARCHIVE_CATEGORIES.find(c => c.id === id)?.label || 'Autre';
const sizeLabel = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);
const titleFromFile = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();

/**
 * Archives numériques : PDF et scans (statuts, récépissé de préfecture,
 * contrats signés…). Fichiers en IndexedDB (core/attachments), métadonnées
 * dans le store « docs » (tranche archives).
 */
export default function ArchivesPanel() {
  const uid = useId();
  const canWrite = useCan('documents', 'write');
  const archivesMap = useDocsStore(s => s.archives);
  const addArchive = useDocsStore(s => s.addArchive);
  const updateArchive = useDocsStore(s => s.updateArchive);
  const removeArchive = useDocsStore(s => s.removeArchive);
  const fileRef = useRef(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [form, setForm] = useState(null); // { mode: 'new'|'edit', file?, id?, title, category, date, tags, notes }
  const [busy, setBusy] = useState(false);

  const archives = useMemo(() => Object.values(archivesMap || {}).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt))), [archivesMap]);
  const rows = useMemo(() => {
    const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
    return archives.filter(a => {
      if (category && a.category !== category) return false;
      if (!words.length) return true;
      const hay = normalizeSearch([a.title, a.notes, categoryLabel(a.category), ...(a.tags || []), a.attachment?.name, a.date].join(' '));
      return words.every(w => hay.includes(w));
    });
  }, [archives, query, category]);

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) { toast.error('Fichier trop volumineux', 'Maximum 10 Mo par fichier.'); return; }
    setForm({ mode: 'new', file, title: titleFromFile(file.name), category: 'autre', date: isoDate(new Date()), tags: '', notes: '' });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.warn('Titre manquant'); return; }
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    setBusy(true);
    try {
      if (form.mode === 'new') {
        const attachment = await saveAttachment(form.file, { scope: 'archives' });
        addArchive({ title: form.title.trim(), category: form.category, date: form.date, tags, notes: form.notes, attachment });
        toast.success('Archive importée', form.title.trim());
      } else {
        updateArchive(form.id, { title: form.title.trim(), category: form.category, date: form.date, tags, notes: form.notes });
        toast.success('Archive mise à jour', form.title.trim());
      }
      setForm(null);
    } catch (err) {
      toast.error('Import impossible', err?.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const open = async (a) => {
    try { await openAttachment(a.attachment); } catch (e) { toast.error('Ouverture impossible', e?.message); }
  };

  const remove = async (a) => {
    const ok = await confirmDialog({
      title: `Supprimer « ${a.title} » ?`,
      message: 'Le fichier archivé est supprimé de cet appareil (et du serveur si la synchronisation est active).',
      details: ['Cette action est définitive : garde une copie si tu en as besoin.'],
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    await deleteAttachment(a.attachment?.id);
    removeArchive(a.id);
    toast.success('Archive supprimée', a.title);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" aria-hidden="true"><Archive size={19} /></span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-ink">Archives numériques</h3>
            <p className="text-xs text-dim">Statuts, récépissés de préfecture, contrats signés, PV scannés… (PDF ou image, 10 Mo max). Stockés sur cet appareil.</p>
          </div>
        </div>
        {canWrite && (
          <>
            <input ref={fileRef} id={`${uid}-file`} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Fichier à archiver" onChange={(e) => pickFile(e.target.files?.[0])} />
            <button type="button" className="btn-primary shrink-0" onClick={() => fileRef.current?.click()}>
              <Upload size={15} aria-hidden="true" /> Importer un fichier
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor={`${uid}-q`} className="sr-only">Rechercher dans les archives</label>
          <input id={`${uid}-q`} type="search" className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Titre, étiquette, note…" />
        </div>
        <label htmlFor={`${uid}-c`} className="sr-only">Catégorie</label>
        <select id={`${uid}-c`} className="input sm:w-56" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          {ARCHIVE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      {archives.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <Archive size={24} className="mx-auto text-muted" aria-hidden="true" />
          <p className="mt-2 font-semibold text-ink">Aucune archive</p>
          <p className="text-sm text-dim mt-1">Importe les documents officiels scannés pour les retrouver au moment de la passation.</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-dim text-center py-8" aria-live="polite">Aucune archive ne correspond.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Archives">
          {rows.map(a => {
            const isPdf = /pdf/i.test(a.attachment?.type || '');
            const I = isPdf ? FileText : FileImage;
            return (
              <li key={a.id} className="rounded-2xl border border-line bg-surface p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${isPdf ? 'bg-red-500/10 text-red-500' : 'bg-violet-500/10 text-violet-500'}`} aria-hidden="true"><I size={17} /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink break-words">{a.title}</p>
                    <p className="text-[11px] text-dim">{categoryLabel(a.category)} · {formatDateLong(a.date)} · {a.attachment ? sizeLabel(a.attachment.size || 0) : '—'}</p>
                  </div>
                </div>
                {a.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">{a.tags.map(t => <span key={t} className="badge badge-neutral"><Tag size={9} aria-hidden="true" /> {t}</span>)}</div>
                )}
                {a.notes && <p className="text-xs text-dim line-clamp-3 whitespace-pre-line">{a.notes}</p>}
                <div className="mt-auto flex items-center gap-1 pt-1">
                  <button type="button" className="btn-secondary py-1 px-2 text-xs flex-1" onClick={() => open(a)}>
                    <ExternalLink size={13} aria-hidden="true" /> Ouvrir
                  </button>
                  {canWrite && (
                    <>
                      <button type="button" className="tap btn-ghost p-1.5" aria-label={`Modifier ${a.title}`}
                        onClick={() => setForm({ mode: 'edit', id: a.id, title: a.title, category: a.category, date: a.date, tags: (a.tags || []).join(', '), notes: a.notes || '' })}>
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button type="button" className="tap btn-ghost p-1.5 hover:!text-red-500" aria-label={`Supprimer ${a.title}`} onClick={() => remove(a)}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={!!form} onClose={() => !busy && setForm(null)} closeDisabled={busy}
        title={form?.mode === 'edit' ? 'Modifier l\'archive' : 'Importer dans les archives'}
        description={form?.mode === 'new' ? `${form.file?.name} — ${sizeLabel(form.file?.size || 0)}` : undefined}
        footer={(
          <>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)} disabled={busy}>Annuler</button>
            <button type="submit" form={`${uid}-form`} className="btn-primary" disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} {form?.mode === 'edit' ? 'Enregistrer' : 'Importer'}
            </button>
          </>
        )}>
        {form && (
          <form id={`${uid}-form`} onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor={`${uid}-t`} className="text-[13px] font-semibold text-ink">Titre</label>
              <input id={`${uid}-t`} className="input" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} maxLength={200} required data-autofocus />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${uid}-cat`} className="text-[13px] font-semibold text-ink">Catégorie</label>
                <select id={`${uid}-cat`} className="input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                  {ARCHIVE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${uid}-d`} className="text-[13px] font-semibold text-ink">Date du document</label>
                <input id={`${uid}-d`} type="date" className="input" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
            </div>
            <div>
              <label htmlFor={`${uid}-tags`} className="text-[13px] font-semibold text-ink">Étiquettes <span className="font-normal text-dim">(séparées par des virgules)</span></label>
              <input id={`${uid}-tags`} className="input" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="original, signé, préfecture" />
            </div>
            <div>
              <label htmlFor={`${uid}-n`} className="text-[13px] font-semibold text-ink">Notes</label>
              <textarea id={`${uid}-n`} rows={3} className="input" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} maxLength={4000} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
