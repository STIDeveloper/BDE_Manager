import { useId } from 'react';
import { FileDown, FileType, Loader2, Printer, ShieldCheck } from 'lucide-react';

const LABELS = { pdf: 'Génération du PDF…', print: 'Préparation de l\'impression…', word: 'Création du fichier Word…' };

/**
 * Barre d'export. Tout export (hors brouillon) = ÉMISSION : numéro unique,
 * empreinte et inscription au registre.
 */
export default function ExportBar({ count, busy, onExport, draft, onDraftChange, blocked }) {
  const draftId = useId();
  const plural = count > 1;
  return (
    <div className="px-3 py-2.5 border-b border-line bg-surface space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onExport('pdf')} disabled={!!busy || !count}
          className="btn-primary flex-1 sm:flex-none" aria-describedby={`${draftId}-hint`}>
          {busy === 'pdf' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileDown size={15} aria-hidden="true" />}
          Télécharger le PDF
          {plural && <span className="tabular-nums opacity-80">({count})</span>}
        </button>
        <button type="button" onClick={() => onExport('print')} disabled={!!busy || !count} className="btn-secondary">
          {busy === 'print' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Printer size={15} aria-hidden="true" />}
          Imprimer
        </button>
        <button type="button" onClick={() => onExport('word')} disabled={!!busy || !count} className="btn-secondary">
          {busy === 'word' ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <FileType size={15} aria-hidden="true" />}
          Word <span className="text-dim font-normal">(.doc)</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={draftId} className="inline-flex items-center gap-2 text-xs text-ink cursor-pointer">
          <input id={draftId} type="checkbox" checked={draft} onChange={(e) => onDraftChange(e.target.checked)} className="h-3.5 w-3.5 accent-amber-500" />
          Ne pas numéroter (brouillon)
        </label>
        <p id={`${draftId}-hint`} className="text-[11px] text-dim flex items-center gap-1" role={busy ? 'status' : undefined}>
          {busy ? (
            <>{LABELS[busy]}</>
          ) : draft ? (
            <span className="text-amber-700 dark:text-amber-300">Brouillon : ni numéro ni inscription au registre.</span>
          ) : blocked ? (
            <span className="text-red-500">{blocked}</span>
          ) : (
            <>
              <ShieldCheck size={12} className="text-emerald-500" aria-hidden="true" />
              {plural ? `${count} numéros uniques` : 'Numéro unique'} + empreinte, inscrits au registre.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
