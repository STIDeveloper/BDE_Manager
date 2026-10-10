// ============================================================
// Onglet « Construire » : structure | canevas | propriétés,
// glisser-déposer unifié (@dnd-kit) entre palette, arbre et canevas.
// ============================================================
import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ListTree, LayoutDashboard, SlidersHorizontal, PlusSquare } from 'lucide-react';
import { findItem, pageContainer, moveItem, itemLabel } from '../defOps.js';
import { Segmented } from '../ui.jsx';
import Structure from './Structure.jsx';
import Canvas from './Canvas.jsx';
import Palette from './Palette.jsx';
import { paletteLabel } from './paletteData.js';
import Properties from './Properties.jsx';

/** Collisions : l'élément le plus petit sous le pointeur (le plus profond), pages à part. */
function collision(args) {
  const activeId = String(args.active.id);
  const within = pointerWithin(args);
  const hits = within.length ? within : closestCenter(args);
  const rectOf = id => args.droppableRects.get(id);
  const area = c => { const r = rectOf(c.id); return r ? r.width * r.height : Infinity; };
  if (activeId.startsWith('pg:')) {
    const pages = hits.filter(c => String(c.id).startsWith('pg:'));
    return pages.length ? pages : closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => String(c.id).startsWith('pg:')) });
  }
  const usable = hits.filter(c => String(c.id) !== activeId);
  return [...usable].sort((a, b) => area(a) - area(b)).slice(0, 1);
}

/** Identifiant de dépôt → { cid, index }. */
function resolveTarget(def, overId) {
  const o = String(overId);
  if (o.startsWith('s:') || o.startsWith('c:')) {
    const f = findItem(def, o.slice(2));
    return f ? { cid: f.container, index: f.index, overItem: f.item.id } : null;
  }
  if (o.startsWith('s-drop:') || o.startsWith('c-drop:')) return { cid: o.slice(7), index: undefined };
  if (o.startsWith('pg:')) return { cid: pageContainer(o.slice(3)), index: undefined };
  return null;
}

export default function BuildTab({ ctx: baseCtx }) {
  const { def } = baseCtx;
  const [leftTab, setLeftTab] = useState('palette');
  const [active, setActive] = useState(null);
  const ctx = useMemo(() => ({ ...baseCtx, dragging: active }), [baseCtx, active]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const overlayLabel = useMemo(() => {
    if (!active) return '';
    const a = String(active);
    if (a.startsWith('pal:')) return `+ ${paletteLabel(a.slice(4))}`;
    if (a.startsWith('pg:')) return def.pages.find(p => p.id === a.slice(3))?.title || 'Page';
    return itemLabel(findItem(def, a.slice(2))?.item);
  }, [active, def]);

  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over || !ctx.canWrite) return;
    const aid = String(a.id);
    const oid = String(over.id);
    if (aid === oid) return;
    if (aid.startsWith('pg:')) {
      if (!oid.startsWith('pg:')) return;
      const from = def.pages.findIndex(p => p.id === aid.slice(3));
      const to = def.pages.findIndex(p => p.id === oid.slice(3));
      ctx.movePage(from, to);
      return;
    }
    const target = resolveTarget(def, oid);
    if (!target) return;
    if (aid.startsWith('pal:')) {
      ctx.insertNew(aid.slice(4), target.cid, target.index);
      return;
    }
    const id = aid.slice(2);
    if (target.overItem === id) return;
    const next = moveItem(def, id, target.cid, target.index);
    if (next === def) { ctx.notify('Déplacement impossible', 'Un bloc ne peut pas être déposé à l\'intérieur de lui-même.'); return; }
    ctx.update(next, { snapshot: 'Réorganisation' });
    const page = def.pages.find(p => target.cid === pageContainer(p.id));
    if (page) ctx.setCurrentPageId(page.id);
  };

  const pane = ctx.mobilePane;
  const paneCls = id => (pane === id ? 'block' : 'hidden lg:block');

  return (
    <DndContext sensors={sensors} collisionDetection={collision}
      onDragStart={({ active: a }) => setActive(String(a.id))} onDragCancel={() => setActive(null)} onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: 'Pour déplacer un élément, appuie sur Espace ou Entrée, utilise les flèches, puis Espace ou Entrée pour déposer. Échap annule.' },
        announcements: {
          onDragStart: () => 'Élément saisi.',
          onDragOver: ({ over }) => (over ? 'Au-dessus d\'une zone de dépôt.' : 'Hors zone de dépôt.'),
          onDragEnd: ({ over }) => (over ? 'Élément déposé.' : 'Élément relâché hors zone.'),
          onDragCancel: () => 'Déplacement annulé.',
        },
      }}>
      <div className="lg:hidden mb-3">
        <Segmented label="Zone affichée" value={pane} onChange={ctx.setMobilePane}
          options={[{ value: 'structure', label: 'Structure', icon: ListTree }, { value: 'canvas', label: 'Aperçu', icon: LayoutDashboard }, { value: 'props', label: 'Propriétés', icon: SlidersHorizontal }]} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_20rem] xl:grid-cols-[17rem_minmax(0,1fr)_22rem] items-start">
        <aside className={`${paneCls('structure')} lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto space-y-3 min-w-0`} aria-label="Structure et palette">
          <Segmented label="Panneau de gauche" value={leftTab} onChange={setLeftTab}
            options={[{ value: 'palette', label: 'Ajouter', icon: PlusSquare }, { value: 'structure', label: 'Structure', icon: ListTree }]} />
          {leftTab === 'palette' ? (
            ctx.canWrite ? <Palette onAdd={type => ctx.insertNew(type)} /> : <p className="text-xs text-muted">Lecture seule : tu n'as pas le droit de modifier ce formulaire.</p>
          ) : <Structure ctx={ctx} />}
        </aside>
        <section className={`${paneCls('canvas')} min-w-0`} aria-label="Canevas">
          <Canvas ctx={ctx} />
        </section>
        <aside className={`${paneCls('props')} lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto min-w-0`} aria-label="Propriétés">
          <fieldset disabled={!ctx.canWrite} className="bg-surface border border-line rounded-2xl p-3 min-w-0">
            <Properties def={def} selection={ctx.selection} update={ctx.update} onSelect={ctx.propsAction} testAnswers={ctx.testAnswers} context={ctx.context} />
          </fieldset>
        </aside>
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <div className="px-3 py-2 rounded-lg bg-surface border border-blue-500 shadow-xl text-xs font-medium text-ink max-w-64 truncate">{overlayLabel}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

