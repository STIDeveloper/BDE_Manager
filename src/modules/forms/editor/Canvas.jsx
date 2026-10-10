// Canevas central : page courante, éléments sélectionnables, barres
// d'insertion « + », réordonnancement, actions rapides ; mode « Rendu
// réel » via FormRenderer (clic = sélection, mise en évidence).
import { Suspense, useMemo, useRef, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2, Filter, Lock, EyeOff, Pencil, Repeat, Eye, LayoutList } from 'lucide-react';
import { QUESTION_TYPES } from '../../../forms/schema.js';
import { pageContainer, sectionContainer, columnContainer, itemLabel, stripVisibility } from '../defOps.js';
import { Segmented, SafeBoundary } from '../ui.jsx';
import { FormRenderer, resolveSources } from '../integrations.js';
import ItemPreview from './ItemPreview.jsx';
import Palette from './Palette.jsx';

const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t.label]));

export default function Canvas({ ctx }) {
  const { def } = ctx;
  const page = def.pages.find(p => p.id === ctx.currentPageId) || def.pages[0];
  const pageIndex = def.pages.indexOf(page);
  const [mode, setMode] = useState('edit');
  const pageSelected = ctx.selection?.kind === 'page' && ctx.selection.id === page.id;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Pages" className="flex flex-wrap gap-1">
          {def.pages.map((p, i) => (
            <button key={p.id} type="button" role="tab" aria-selected={p.id === page.id} onClick={() => ctx.setCurrentPageId(p.id)}
              className={`chip !py-0.5 text-[11px] ${p.id === page.id ? 'chip-active' : 'chip-idle'}`}>{i + 1}. {p.title || 'Page'}</button>
          ))}
          {ctx.canWrite && <button type="button" className="chip chip-idle !py-0.5 text-[11px]" onClick={() => ctx.addPage(pageIndex)} aria-label="Ajouter une page après celle-ci"><Plus size={11} aria-hidden="true" /> Page</button>}
        </div>
        {FormRenderer && (
          <Segmented label="Mode du canevas" size="xs" value={mode} onChange={setMode}
            options={[{ value: 'edit', label: 'Édition', icon: LayoutList }, { value: 'render', label: 'Rendu réel', icon: Eye }]} />
        )}
      </div>

      <div className="rounded-2xl border border-line bg-elevated/50 p-3 sm:p-5" style={{ '--fr': `${{ none: 0, sm: 4, md: 10, lg: 14, full: 18 }[def.theme?.radius] ?? 10}px` }}>
        <div className="max-w-2xl mx-auto space-y-2">
          {pageIndex === 0 && (
            <button type="button" onClick={() => ctx.select({ kind: 'form' })} className="w-full text-left rounded-xl p-3 hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
              <h2 className="text-lg font-bold text-ink">{def.title || 'Sans titre'}</h2>
              {def.description && <p className="text-sm text-dim whitespace-pre-line mt-1">{def.description}</p>}
            </button>
          )}
          <button type="button" onClick={() => ctx.select({ kind: 'page', id: page.id })}
            className={`w-full text-left rounded-xl px-3 py-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${pageSelected ? 'border-blue-500 bg-blue-500/5' : 'border-transparent hover:border-line'}`}>
            <span className="text-[11px] text-muted">Page {pageIndex + 1} / {def.pages.length}{page.logic?.showIf ? ' · conditionnelle' : ''}{page.logic?.next?.length ? ` · ${page.logic.next.length} saut(s)` : ''}</span>
            <span className="block text-sm font-semibold text-ink">{page.title || 'Page sans titre'}</span>
            {page.description && <span className="block text-xs text-dim">{page.description}</span>}
          </button>
          {mode === 'render' && FormRenderer ? (
            <RenderMode def={def} page={page} ctx={ctx} />
          ) : (
            <CanvasList cid={pageContainer(page.id)} items={page.items || []} ctx={ctx} root />
          )}
        </div>
      </div>
    </div>
  );
}

function RenderMode({ def, page, ctx }) {
  const { setNodeRef, isOver } = useDroppable({ id: `c-drop:${pageContainer(page.id)}`, data: { cid: pageContainer(page.id) } });
  // Page seule, toutes conditions retirées : chaque élément est visible et cliquable.
  const single = useMemo(() => ({ ...def, pages: [{ ...page, logic: undefined, items: (page.items || []).map(stripVisibility) }] }), [def, page]);
  const [answers, setAnswers] = useState({});
  const selectedId = ctx.selection?.kind === 'item' ? ctx.selection.id : null;
  return (
    <div ref={setNodeRef} className={`rounded-xl ${isOver ? 'ring-2 ring-blue-500' : ''}`}>
      <SafeBoundary resetKey={def.updatedAt}>
        <Suspense fallback={<p className="p-4 text-sm text-dim">Chargement du rendu…</p>}>
          <FormRenderer definition={resolveSources(single, ctx.context)} answers={answers} onAnswersChange={setAnswers} mode="preview" device="desktop"
            highlightItemId={selectedId} onItemClick={id => ctx.select({ kind: 'item', id })} context={ctx.context} />
        </Suspense>
      </SafeBoundary>
      <p className="text-[11px] text-muted text-center mt-2">Clique sur un élément pour le sélectionner. Les conditions d'affichage sont ignorées dans ce mode.</p>
    </div>
  );
}

function CanvasList({ cid, items, ctx, root = false }) {
  const { setNodeRef, isOver } = useDroppable({ id: `c-drop:${cid}`, data: { cid } });
  return (
    <SortableContext items={items.map(it => `c:${it.id}`)} strategy={verticalListSortingStrategy}>
      <div className="space-y-0">
        {items.map((it, i) => (
          <div key={it.id}>
            <InsertBar cid={cid} index={i} ctx={ctx} />
            <CanvasItem item={it} index={i} count={items.length} cid={cid} ctx={ctx} />
          </div>
        ))}
        <InsertBar cid={cid} index={items.length} ctx={ctx} last />
        <div ref={setNodeRef}
          className={`rounded-xl border-2 border-dashed text-center text-xs transition-colors ${isOver ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-line text-muted'} ${items.length && !ctx.dragging ? 'h-2 border-transparent' : root && !items.length ? 'py-10' : 'py-3'}`}>
          {(!items.length || ctx.dragging) && (items.length ? 'Déposer ici (fin)' : root ? 'Page vide : glisse un élément de la palette ici ou utilise « + »' : 'Dépose un élément ici')}
        </div>
      </div>
    </SortableContext>
  );
}

function InsertBar({ cid, index, ctx, last = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!ctx.canWrite) return <div className="h-2" />;
  return (
    <div ref={ref} className={`relative group ${last ? 'h-7' : 'h-5'} flex items-center`}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-transparent group-hover:bg-blue-500/40 group-focus-within:bg-blue-500/40" aria-hidden="true" />
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={last ? 'Ajouter un élément à la fin' : `Insérer un élément en position ${index + 1}`}
        className={`relative mx-auto w-6 h-6 rounded-full border bg-surface text-dim flex items-center justify-center shadow-sm transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 hover:text-blue-600 hover:border-blue-500 ${last || open ? 'opacity-100' : 'opacity-40 group-hover:opacity-100 focus:opacity-100'} border-line`}>
        <Plus size={13} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choisir un élément à insérer" className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-[min(22rem,90vw)] max-h-96 overflow-auto bg-surface border border-line rounded-xl shadow-2xl p-2"
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <Palette compact draggable={false} autoFocus onAdd={type => { ctx.insertNew(type, cid, index); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

function Badges({ item }) {
  const out = [];
  if (item.kind === 'question') out.push(<span key="t" className="text-[10px] text-muted">{TYPE_LABEL[item.type] || item.type}</span>);
  if (item.key) out.push(<span key="k" className="font-mono text-[10px] text-muted truncate max-w-28">{item.key}</span>);
  if (item.showIf) out.push(<span key="s" className="badge badge-amber" title={`Afficher si ${item.showIf}`}><Filter size={10} aria-hidden="true" />condition</span>);
  if (typeof item.required === 'string') out.push(<span key="r" className="badge badge-amber" title={`Obligatoire si ${item.required}`}>obligatoire si…</span>);
  if (item.readOnlyIf) out.push(<span key="ro" className="badge badge-neutral"><Lock size={10} aria-hidden="true" />lecture seule si…</span>);
  if (item.sensitive) out.push(<span key="se" className="badge badge-rose"><EyeOff size={10} aria-hidden="true" />sensible</span>);
  if (item.repeat) out.push(<span key="re" className="badge badge-brand"><Repeat size={10} aria-hidden="true" />répétable</span>);
  if (item.score) out.push(<span key="sc" className="badge badge-violet">noté</span>);
  return out;
}

function CanvasItem({ item, index, count, cid, ctx }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `c:${item.id}`, data: { kind: 'item' }, disabled: !ctx.canWrite });
  const selected = ctx.selection?.kind === 'item' && ctx.selection.id === item.id;
  const onSelect = (e) => { e.stopPropagation(); ctx.select({ kind: 'item', id: item.id }); };
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group/item relative rounded-xl border bg-surface transition-shadow ${isDragging ? 'opacity-40' : ''} ${selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-line hover:border-line-strong'} ${isOver && ctx.dragging ? 'shadow-[0_-3px_0_0_rgb(59,130,246)]' : ''}`}
      data-item-id={item.id}
      onClick={onSelect}>
      <div className="flex items-center gap-1 px-2 pt-1.5">
        {ctx.canWrite && (
          <button type="button" className="p-1 -ml-1 text-muted hover:text-ink cursor-grab touch-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            aria-label={`Déplacer « ${itemLabel(item)} »`} {...attributes} {...listeners} onClick={e => e.stopPropagation()}>
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          <Badges item={item} />
        </div>
        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button type="button" className="btn-ghost !p-1 lg:hidden" aria-label={`Modifier « ${itemLabel(item)} »`} onClick={() => ctx.select({ kind: 'item', id: item.id }, { showProps: true })}><Pencil size={13} aria-hidden="true" /></button>
          {ctx.canWrite && (
            <>
              <button type="button" className="btn-ghost !p-1" disabled={index === 0} aria-label={`Monter « ${itemLabel(item)} »`} onClick={() => ctx.moveWithin(item.id, cid, index - 1)}><ArrowUp size={13} aria-hidden="true" /></button>
              <button type="button" className="btn-ghost !p-1" disabled={index === count - 1} aria-label={`Descendre « ${itemLabel(item)} »`} onClick={() => ctx.moveWithin(item.id, cid, index + 1)}><ArrowDown size={13} aria-hidden="true" /></button>
              <button type="button" className="btn-ghost !p-1" aria-label={`Dupliquer « ${itemLabel(item)} »`} onClick={() => ctx.duplicate(item.id)}><Copy size={13} aria-hidden="true" /></button>
              <button type="button" className="btn-ghost !p-1 hover:!text-red-600" aria-label={`Supprimer « ${itemLabel(item)} »`} onClick={() => ctx.remove(item.id)}><Trash2 size={13} aria-hidden="true" /></button>
            </>
          )}
        </div>
      </div>
      <div className="px-3 pb-3 pt-1">
        {item.kind === 'section' ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">{item.title || 'Section'}</p>
            {item.description && <p className="text-xs text-dim">{item.description}</p>}
            <div className="border-l-2 border-line pl-2" onClick={e => e.stopPropagation()}>
              <CanvasList cid={sectionContainer(item.id)} items={item.items || []} ctx={ctx} />
            </div>
            {item.repeat && <p className="text-[11px] text-blue-600">+ {item.repeat.addLabel || 'Ajouter'} (min {item.repeat.min ?? 0}, max {item.repeat.max ?? '∞'})</p>}
          </div>
        ) : item.kind === 'columns' ? (
          <div className={`grid gap-2 ${item.columns?.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`} onClick={e => e.stopPropagation()}>
            {(item.columns || []).map((col, i) => (
              <div key={i} className="rounded-lg border border-dashed border-line p-1">
                <CanvasList cid={columnContainer(item.id, i)} items={col || []} ctx={ctx} />
              </div>
            ))}
          </div>
        ) : (
          <ItemPreview item={item} />
        )}
      </div>
    </div>
  );
}
