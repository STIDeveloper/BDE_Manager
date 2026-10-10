// Arbre de structure : pages et éléments, glisser-déposer pour réordonner
// et déplacer entre pages / sections / colonnes.
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Copy, GripVertical, Plus, Trash2, ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { QUESTION_TYPES } from '../../../forms/schema.js';
import { pageContainer, sectionContainer, columnContainer, itemLabel } from '../defOps.js';
import { IconByName } from '../ui.jsx';

const TYPE_ICON = Object.fromEntries(QUESTION_TYPES.map(t => [t.type, t.icon]));

export default function Structure({ ctx }) {
  const { def } = ctx;
  return (
    <div className="space-y-2">
      <SortableContext items={def.pages.map(p => `pg:${p.id}`)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2">
          {def.pages.map((p, i) => <PageNode key={p.id} page={p} index={i} ctx={ctx} />)}
        </ol>
      </SortableContext>
      {ctx.canWrite && (
        <button type="button" className="btn-secondary !py-1.5 text-xs w-full" onClick={() => ctx.addPage()}>
          <Plus size={14} aria-hidden="true" /> Ajouter une page
        </button>
      )}
    </div>
  );
}

function PageNode({ page, index, ctx }) {
  const { def } = ctx;
  const [open, setOpen] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `pg:${page.id}`, data: { kind: 'page' }, disabled: !ctx.canWrite });
  const selected = ctx.selection?.kind === 'page' && ctx.selection.id === page.id;
  const current = ctx.currentPageId === page.id;
  const draggingItem = ctx.dragging && !String(ctx.dragging).startsWith('pg:');
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-xl border bg-surface ${isDragging ? 'opacity-50' : ''} ${isOver && draggingItem ? 'border-blue-500 ring-2 ring-blue-500/30' : current ? 'border-line-strong' : 'border-line'}`}>
      <div className={`flex items-center gap-1 p-1.5 rounded-t-xl ${selected ? 'bg-blue-500/10' : ''}`}>
        {ctx.canWrite && (
          <button type="button" className="p-1 text-muted hover:text-ink cursor-grab touch-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-label={`Déplacer la page ${page.title || index + 1}`} {...attributes} {...listeners}>
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        <button type="button" className="p-0.5 text-muted hover:text-ink rounded" aria-label={open ? 'Replier la page' : 'Déplier la page'} aria-expanded={open} onClick={() => setOpen(o => !o)}>
          {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        <button type="button" onClick={() => ctx.select({ kind: 'page', id: page.id })} className="flex-1 min-w-0 text-left text-xs font-semibold text-ink truncate rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
          <span className="text-muted font-normal">{index + 1}.</span> {page.title || 'Page sans titre'}
          {page.logic?.showIf && <Filter size={11} className="inline ml-1 text-amber-600" aria-label="page conditionnelle" />}
        </button>
        {ctx.canWrite && (
          <>
            <button type="button" className="btn-ghost !p-1" disabled={index === 0} aria-label={`Monter la page ${index + 1}`} onClick={() => ctx.movePage(index, index - 1)}><ArrowUp size={12} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" disabled={index === def.pages.length - 1} aria-label={`Descendre la page ${index + 1}`} onClick={() => ctx.movePage(index, index + 1)}><ArrowDown size={12} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" aria-label={`Dupliquer la page ${index + 1}`} onClick={() => ctx.duplicatePage(page.id)}><Copy size={12} aria-hidden="true" /></button>
            <button type="button" className="btn-ghost !p-1" disabled={def.pages.length <= 1} aria-label={`Supprimer la page ${index + 1}`} onClick={() => ctx.removePage(page.id)}><Trash2 size={12} aria-hidden="true" /></button>
          </>
        )}
      </div>
      {open && (
        <div className="px-1.5 pb-1.5">
          <TreeList cid={pageContainer(page.id)} items={page.items || []} ctx={ctx} depth={0} />
        </div>
      )}
    </li>
  );
}

function TreeList({ cid, items, ctx, depth }) {
  const { setNodeRef, isOver } = useDroppable({ id: `s-drop:${cid}`, data: { cid } });
  return (
    <SortableContext items={items.map(it => `s:${it.id}`)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-0.5" style={{ paddingLeft: depth ? 10 : 0 }}>
        {items.map(it => <TreeRow key={it.id} item={it} ctx={ctx} depth={depth} />)}
        <li ref={setNodeRef} className={`rounded-md text-[10px] text-center transition-colors ${ctx.dragging ? 'h-6 border border-dashed ' + (isOver ? 'border-blue-500 bg-blue-500/10 text-blue-600' : 'border-line text-muted') : items.length ? 'h-1' : 'h-6 text-muted'} flex items-center justify-center`}>
          {(ctx.dragging || !items.length) ? (items.length ? 'Déposer à la fin' : 'Vide — dépose un élément ici') : null}
        </li>
      </ul>
    </SortableContext>
  );
}

function TreeRow({ item, ctx, depth }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `s:${item.id}`, data: { kind: 'item' }, disabled: !ctx.canWrite });
  const selected = ctx.selection?.kind === 'item' && ctx.selection.id === item.id;
  const icon = item.kind === 'question' ? TYPE_ICON[item.type] : item.kind === 'section' ? 'Square' : 'FileText';
  const required = item.required === true || (item.type === 'consent' && item.required !== false);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'opacity-40' : ''}>
      <div className={`flex items-center gap-1 rounded-md pr-1 ${selected ? 'bg-blue-500/15' : 'hover:bg-elevated'} ${isOver && ctx.dragging ? 'shadow-[inset_0_2px_0_0_rgb(59,130,246)]' : ''}`}>
        {ctx.canWrite && (
          <button type="button" className="p-1 text-muted hover:text-ink cursor-grab touch-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-label={`Déplacer « ${itemLabel(item)} »`} {...attributes} {...listeners}>
            <GripVertical size={12} aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={() => ctx.select({ kind: 'item', id: item.id })} aria-current={selected ? 'true' : undefined}
          className="flex-1 min-w-0 flex items-center gap-1.5 py-1 text-left text-xs text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60">
          <span className="text-dim shrink-0"><IconByName name={icon} size={12} /></span>
          <span className="truncate">{itemLabel(item)}</span>
          {required && <span className="text-red-500 shrink-0" aria-label="obligatoire">*</span>}
          {(item.showIf || typeof item.required === 'string') && <Filter size={10} className="text-amber-600 shrink-0" aria-label="conditionnel" />}
        </button>
      </div>
      {item.kind === 'section' && <TreeList cid={sectionContainer(item.id)} items={item.items || []} ctx={ctx} depth={depth + 1} />}
      {item.kind === 'columns' && (item.columns || []).map((col, i) => (
        <div key={i} style={{ paddingLeft: 10 }}>
          <p className="text-[10px] text-muted pl-1">Colonne {i + 1}</p>
          <TreeList cid={columnContainer(item.id, i)} items={col || []} ctx={ctx} depth={depth + 1} />
        </div>
      ))}
    </li>
  );
}
