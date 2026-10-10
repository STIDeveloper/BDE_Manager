// Classement : glisser-déposer (@dnd-kit, souris / tactile / clavier) +
// boutons Monter / Descendre accessibles. Chargé à la demande (lazy).

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical } from 'lucide-react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function Row({ id, index, total, label, onMove, readOnly }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: readOnly });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined, boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,.18)' : undefined };
  return (
    <li ref={setNodeRef} style={style} className="fr-rank-item">
      <button type="button" className="fr-rank-handle" aria-label={`Déplacer « ${label} » (glisser, ou Espace puis flèches)`} disabled={readOnly} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <span className="fr-rank-num" aria-hidden="true">{index + 1}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <button type="button" className="fr-iconbtn" aria-label={`Monter « ${label} » (position ${index + 1} sur ${total})`} disabled={readOnly || index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp size={16} aria-hidden="true" />
      </button>
      <button type="button" className="fr-iconbtn" aria-label={`Descendre « ${label} » (position ${index + 1} sur ${total})`} disabled={readOnly || index === total - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

export default function Ranking({ value, onChange, ids, ariaDescribedBy, readOnly, rt }) {
  const options = rt.options;
  const order = useMemo(() => {
    const keys = options.map(o => String(o.value));
    const cur = Array.isArray(value) ? value.map(String).filter(k => keys.includes(k)) : [];
    return [...cur, ...keys.filter(k => !cur.includes(k))];
  }, [options, value]);
  const byKey = useMemo(() => new Map(options.map(o => [String(o.value), o])), [options]);
  const answered = Array.isArray(value) && value.length > 0;
  const [announce, setAnnounce] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const commit = keys => onChange(keys.map(k => byKey.get(k).value));
  const move = (from, to) => {
    if (to < 0 || to >= order.length) return;
    const next = arrayMove(order, from, to);
    commit(next);
    const o = byKey.get(order[from]);
    setAnnounce(`« ${o?.label || order[from]} » est maintenant en position ${to + 1} sur ${order.length}.`);
  };
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    move(order.indexOf(active.id), order.indexOf(over.id));
  };
  return (
    <div aria-describedby={ariaDescribedBy}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
        accessibility={{ announcements: {
          onDragStart: ({ active }) => `« ${byKey.get(active.id)?.label || active.id} » saisi.`,
          onDragOver: ({ over }) => (over ? `Au-dessus de la position ${order.indexOf(over.id) + 1}.` : ''),
          onDragEnd: ({ over }) => (over ? `Déposé en position ${order.indexOf(over.id) + 1}.` : 'Déplacement annulé.'),
          onDragCancel: () => 'Déplacement annulé.',
        }, screenReaderInstructions: { draggable: 'Appuie sur Espace pour saisir, flèches pour déplacer, Espace pour déposer, Échap pour annuler.' } }}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ol id={ids.control} tabIndex={-1} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }} aria-labelledby={ids.label}>
            {order.map((k, i) => (
              <Row key={k} id={k} index={i} total={order.length} label={byKey.get(k)?.label || k} onMove={move} readOnly={readOnly} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!answered && !readOnly && options.length > 0 && (
        <button type="button" className="fr-btn fr-btn-secondary" style={{ marginTop: 8 }} onClick={() => commit(order)}>
          <Check size={16} aria-hidden="true" /> Garder cet ordre
        </button>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}
