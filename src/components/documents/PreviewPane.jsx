import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, FileQuestion, Loader2, PenLine, RotateCcw, Users } from 'lucide-react';
import SheetView from './SheetView';
import { docKey } from './registryHelpers';

/** Au-delà, les vignettes deviennent une liste compacte (performances). */
const MAX_VISUAL_THUMBS = 12;

/**
 * Aperçu A4 en direct : pagination d'un lot, vignettes, mode retouche.
 *
 * @param {{ docs: object[], error: Error|null, stale: boolean, index: number, onIndex: (i:number)=>void,
 *   organization: object, editMode: boolean, onToggleEdit: ()=>void, overrides: object,
 *   onEdit: (key:string, blockId:string, text:string)=>void, onResetOverrides: ()=>void,
 *   retouchCount: number, docLabel: (doc:object, i:number)=>string, emptyMessage: string }} props
 */
export default function PreviewPane({
  docs, error, stale, index, onIndex, organization, editMode, onToggleEdit, overrides, onEdit,
  onResetOverrides, retouchCount, docLabel, emptyMessage,
}) {
  const count = docs.length;
  const doc = docs[index] || null;
  const key = doc ? docKey(doc, index) : '';
  const stripRef = useRef(null);
  const hasEditable = !!doc?.blocks?.some(b => b.editable);
  // Callback stable : l'aperçu (mémoïsé) n'est pas reconstruit à chaque rendu.
  const handleEdit = useCallback((blockId, text) => onEdit(key, blockId, text), [onEdit, key]);

  // Vignette active toujours visible.
  useEffect(() => {
    stripRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [index]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
        {count > 1 ? (
          <div className="flex items-center gap-1" role="group" aria-label="Navigation dans le lot">
            <button type="button" className="tap btn-ghost p-1.5" onClick={() => onIndex(index - 1)} disabled={index <= 0} aria-label="Document précédent">
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-xs font-medium text-ink tabular-nums min-w-[96px] text-center" aria-live="polite">
              Document {index + 1} / {count}
            </span>
            <button type="button" className="tap btn-ghost p-1.5" onClick={() => onIndex(index + 1)} disabled={index >= count - 1} aria-label="Document suivant">
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <span className="text-xs font-medium text-dim">{count === 1 ? 'Aperçu A4' : 'Aperçu'}</span>
        )}
        {stale && (
          <span className="inline-flex items-center gap-1 text-[11px] text-dim" role="status">
            <Loader2 size={12} className="animate-spin" aria-hidden="true" /> Mise à jour…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {retouchCount > 0 && (
            <button type="button" onClick={onResetOverrides} className="btn-ghost px-2 py-1 text-xs" title="Annule toutes les retouches de texte du lot"
              aria-label={`Réinitialiser les retouches (${retouchCount})`}>
              <RotateCcw size={13} aria-hidden="true" /> <span className="hidden sm:inline">Réinitialiser les retouches</span>
              <span className="sm:hidden">Réinit.</span>
              <span className="tabular-nums">({retouchCount})</span>
            </button>
          )}
          <button type="button" onClick={onToggleEdit} aria-pressed={editMode} disabled={!doc || !hasEditable}
            title={hasEditable ? 'Clique sur un paragraphe de l\'aperçu pour le modifier' : 'Aucun texte retouchable dans ce document'}
            className={`btn px-2.5 py-1 text-xs border ${editMode
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
              : 'bg-surface border-line text-ink hover:bg-elevated'}`}>
            <PenLine size={13} aria-hidden="true" /> Retoucher le texte
          </button>
        </div>
      </div>

      {editMode && doc && (
        <p className="px-3 py-1.5 text-[11px] bg-amber-500/10 text-amber-800 dark:text-amber-200 border-b border-amber-500/20">
          Mode retouche : clique sur un paragraphe surligné pour le réécrire. Les retouches s'appliquent à ce document uniquement
          et sont prises en compte dans l'empreinte.
        </p>
      )}

      {/* Vignettes du lot */}
      {count > 1 && (
        <div ref={stripRef} className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-line bg-elevated/40" aria-label="Documents du lot">
          {docs.map((d, i) => {
            const active = i === index;
            const label = docLabel(d, i);
            return (
              <button key={docKey(d, i)} type="button" onClick={() => onIndex(i)} aria-current={active ? 'true' : undefined}
                aria-label={`Document ${i + 1} : ${label}`} title={label}
                className={`shrink-0 rounded-lg border text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                  active ? 'border-blue-500 ring-1 ring-blue-500/40 bg-surface' : 'border-line bg-surface hover:border-line-strong'}`}>
                {count <= MAX_VISUAL_THUMBS ? (
                  <span className="block w-[78px] p-1">
                    <span className="block rounded-sm overflow-hidden bg-white border border-black/5 max-h-[104px]">
                      <SheetView doc={d} organization={organization} thumbnail />
                    </span>
                    <span className="block text-[10px] text-dim truncate mt-1 px-0.5">{i + 1}. {label}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink max-w-[160px]">
                    <span className="tabular-nums text-dim">{i + 1}.</span>
                    <span className="truncate">{label}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Feuille */}
      <div className="flex-1 min-h-0 overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgb(var(--c-line))_1px,transparent_0)] [background-size:16px_16px] bg-elevated/60 p-3 sm:p-5">
        {error ? (
          <div role="alert" className="max-w-md mx-auto mt-10 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
            <p className="font-semibold text-ink">Le modèle n'a pas pu générer le document.</p>
            <p className="text-dim mt-1 break-words">{error.message || String(error)}</p>
          </div>
        ) : doc ? (
          <div className={`mx-auto max-w-[900px] rounded-sm shadow-[0_8px_30px_-6px_rgba(0,0,0,0.35)] ${editMode ? 'ring-2 ring-amber-400/60' : ''}`}>
            <SheetView
              doc={doc}
              organization={organization}
              editable={editMode}
              overrides={overrides[key]}
              onEdit={handleEdit}
            />
          </div>
        ) : (
          <div className="max-w-sm mx-auto mt-16 text-center text-sm text-dim">
            <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-surface border border-line grid place-items-center">
              {emptyMessage?.includes('membre') ? <Users size={20} aria-hidden="true" /> : <FileQuestion size={20} aria-hidden="true" />}
            </div>
            {emptyMessage || 'Rien à afficher pour l\'instant.'}
          </div>
        )}
      </div>
    </div>
  );
}
