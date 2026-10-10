import { useId, useMemo, useState } from 'react';
import { Archive, CheckCircle2, FileDown, Loader2, TriangleAlert } from 'lucide-react';
import Modal from '../Modal';
import { useStore } from '../../store';
import { useDocsStore, ARCHIVE_CATEGORIES } from '../../modules/docs/store';
import { academicYear } from '../../documents/context';
import { PACK_ITEMS, inAcademicYear } from '../../documents/pack';
import { toast } from '../ui/toastStore';
import { buildAnnualPack, latestEntryOfYear, reissuableEntries } from './packBuilder';
import { formatDateTime } from './registryHelpers';

const categoryLabel = (id) => ARCHIVE_CATEGORIES.find(c => c.id === id)?.label || 'Autre';

/** Années universitaires proposées : registre, archives et année en cours. */
function yearOptions(documentLog, archives, today) {
  const set = new Set([academicYear(today)]);
  documentLog.forEach(e => set.add(academicYear(new Date(e.createdAt))));
  archives.forEach(a => a.date && set.add(academicYear(a.date)));
  return [...set].filter(y => /^\d{4}-\d{4}$/.test(y)).sort().reverse();
}

/**
 * Assistant « Dossier annuel » (pack de fin de mandat) : un seul PDF avec
 * page de garde, sommaire et documents numérotés au registre.
 * @param {{ ctx: object, onClose: () => void, onDone?: () => void }} props
 */
export default function AnnualPackWizard({ ctx, onClose, onDone }) {
  const uid = useId();
  const documentLog = useStore(s => s.documentLog);
  const reserveDocumentRefs = useStore(s => s.reserveDocumentRefs);
  const logDocuments = useStore(s => s.logDocuments);
  const archivesMap = useDocsStore(s => s.archives);
  const archives = useMemo(() => Object.values(archivesMap || {}), [archivesMap]);
  const years = useMemo(() => yearOptions(documentLog, archives, ctx.today), [documentLog, archives, ctx.today]);
  const [year, setYear] = useState(years[0]);
  const [items, setItems] = useState(() => new Set(PACK_ITEMS.filter(i => !i.fromRegistry).map(i => i.id)));
  const [reissue, setReissue] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const pvEntry = useMemo(() => latestEntryOfYear(documentLog, 'pv-ag', year), [documentLog, year]);
  const candidates = useMemo(() => reissuableEntries(documentLog, year), [documentLog, year]);
  const archivesOfYear = useMemo(() => archives.filter(a => inAcademicYear(a.date, year)), [archives, year]);

  const toggle = (set, setter, id) => setter(() => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const count = [...items].filter(id => id !== 'pv-ag' || pvEntry).length + reissue.size;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await buildAnnualPack({
        year,
        itemIds: [...items],
        reissue: candidates.filter(e => reissue.has(e.id)),
        ctx, archives, documentLog,
        reserveRefs: reserveDocumentRefs,
        logDocuments,
        categoryLabel,
      });
      setResult(res);
      toast.success('Dossier annuel généré', `${res.count} document${res.count > 1 ? 's' : ''} + page de garde (${res.refs[0]})`);
      onDone?.();
    } catch (e) {
      console.error('[Documents] dossier annuel', e?.message);
      toast.error('Dossier impossible', e?.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={() => !busy && onClose()} closeDisabled={busy} maxWidth="max-w-2xl"
      title="Dossier annuel de fin de mandat"
      description="Un seul PDF : page de garde, sommaire et documents officiels de l'année, chacun numéroté au registre."
      footer={result ? (
        <button type="button" className="btn-primary" onClick={onClose}>Terminer</button>
      ) : (
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Annuler</button>
          <button type="button" className="btn-primary" onClick={generate} disabled={busy || count === 0}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileDown size={15} aria-hidden="true" />}
            Générer le dossier ({count + 1} doc.)
          </button>
        </>
      )}>
      {result ? (
        <div className="space-y-3" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><CheckCircle2 size={18} className="text-emerald-500" aria-hidden="true" /> {result.fileName}.pdf téléchargé</p>
          <p className="text-sm text-dim">Page de garde <span className="font-mono">{result.refs[0]}</span> et {result.count} document{result.count > 1 ? 's' : ''} ({result.refs[1]} → {result.refs.at(-1)}) inscrits au registre.</p>
          {result.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 text-[13px]">
              <p className="font-semibold text-ink flex items-center gap-1.5"><TriangleAlert size={14} className="text-amber-500" aria-hidden="true" /> Non inclus</p>
              <ul className="list-disc pl-5 text-dim mt-1">{result.skipped.map(s => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={`${uid}-y`} className="text-[13px] font-semibold text-ink">Année universitaire</label>
            <select id={`${uid}-y`} className="input sm:w-48" value={year} onChange={(e) => { setYear(e.target.value); setReissue(new Set()); }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-semibold text-ink mb-1">Documents officiels (émis à nouveau, numérotés)</legend>
            {PACK_ITEMS.map(item => {
              const unavailable = item.fromRegistry && !pvEntry;
              return (
                <label key={item.id} htmlFor={`${uid}-i-${item.id}`} className={`flex items-start gap-2.5 rounded-xl border border-line p-2.5 ${unavailable ? 'opacity-60' : 'cursor-pointer hover:bg-elevated/50'}`}>
                  <input id={`${uid}-i-${item.id}`} type="checkbox" className="mt-0.5 h-4 w-4" disabled={unavailable}
                    checked={items.has(item.id) && !unavailable} onChange={() => toggle(items, setItems, item.id)} />
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{item.label}</span>
                    <span className="block text-[11px] text-dim">
                      {item.fromRegistry
                        ? (pvEntry ? `Réémis depuis ${pvEntry.ref} (${formatDateTime(pvEntry.createdAt)}).` : `Aucun PV d'AG émis en ${year} : émets-le d'abord depuis le studio.`)
                        : 'Généré avec les données actuelles.'}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <fieldset>
            <legend className="text-[13px] font-semibold text-ink mb-1">Réémettre aussi des documents de l'année ({candidates.length})</legend>
            {candidates.length === 0 ? (
              <p className="text-xs text-dim">Aucun document émis pendant cette année universitaire.</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-line p-2">
                {candidates.map(e => (
                  <li key={e.id}>
                    <label htmlFor={`${uid}-r-${e.id}`} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                      <input id={`${uid}-r-${e.id}`} type="checkbox" className="h-4 w-4" checked={reissue.has(e.id)} onChange={() => toggle(reissue, setReissue, e.id)} />
                      <span className="min-w-0 truncate">{e.title}</span>
                      <span className="ml-auto font-mono text-[11px] text-dim shrink-0">{e.ref}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <p className="flex items-start gap-2 text-[13px] text-dim">
            <Archive size={15} className="shrink-0 mt-0.5 text-cyan-500" aria-hidden="true" />
            {archivesOfYear.length
              ? `${archivesOfYear.length} archive${archivesOfYear.length > 1 ? 's' : ''} de l'année ser${archivesOfYear.length > 1 ? 'ont listées' : 'a listée'} dans la page de garde (les fichiers scannés ne sont pas fusionnés dans le PDF).`
              : 'Aucune archive importée pour cette année (onglet Archives).'}
          </p>
        </div>
      )}
    </Modal>
  );
}
