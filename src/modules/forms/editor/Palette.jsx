// Palette des éléments (types de questions + blocs de mise en page),
// glissable vers le canevas / la structure, ou cliquable.
import { useMemo, useState, useId } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Search } from 'lucide-react';
import { QUESTION_TYPES } from '../../../forms/schema.js';
import { IconByName } from '../ui.jsx';
import { BLOCKS } from './paletteData.js';

const GROUPS = [...new Set(QUESTION_TYPES.map(t => t.group))];
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function EntryButton({ entry, onAdd, compact, extraProps = {}, refFn, dim }) {
  const Icon = entry.iconCmp;
  return (
    <button
      ref={refFn}
      type="button"
      {...extraProps}
      aria-label={`Ajouter : ${entry.label}`}
      onClick={() => onAdd(entry.type)}
      className={`w-full flex items-center gap-2 px-2 ${compact ? 'py-1.5' : 'py-2'} rounded-lg border border-line bg-surface text-left text-xs text-ink hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 touch-none ${dim ? 'opacity-40' : ''}`}
    >
      <span className="text-dim shrink-0">{Icon ? <Icon size={14} aria-hidden="true" /> : <IconByName name={entry.icon} size={14} />}</span>
      <span className="truncate">{entry.label}</span>
    </button>
  );
}

function DraggableEntry({ entry, onAdd, compact }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pal:${entry.type}`, data: { from: 'palette', type: entry.type } });
  return <li><EntryButton entry={entry} onAdd={onAdd} compact={compact} refFn={setNodeRef} dim={isDragging} extraProps={{ ...attributes, role: undefined, onPointerDown: listeners?.onPointerDown, 'aria-roledescription': 'élément de palette déplaçable' }} /></li>;
}

function Entry({ entry, onAdd, compact, draggable }) {
  if (draggable) return <DraggableEntry entry={entry} onAdd={onAdd} compact={compact} />;
  return <li><EntryButton entry={entry} onAdd={onAdd} compact={compact} /></li>;
}

export default function Palette({ onAdd, compact = false, draggable = true, autoFocus = false }) {
  const uid = useId();
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = fold(q.trim());
    const match = e => !needle || fold(e.label).includes(needle) || fold(e.group || '').includes(needle) || fold(e.hint || '').includes(needle);
    const out = GROUPS.map(g => ({ group: g, entries: QUESTION_TYPES.filter(t => t.group === g).filter(match) })).filter(g => g.entries.length);
    const blocks = BLOCKS.map(b => ({ ...b, iconCmp: b.icon, group: 'Mise en page' })).filter(match);
    if (blocks.length) out.push({ group: 'Mise en page', entries: blocks });
    return out;
  }, [q]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <label htmlFor={`${uid}-q`} className="sr-only">Rechercher un type d'élément</label>
        <input id={`${uid}-q`} autoFocus={autoFocus} className="input !py-1.5 pl-8 text-xs" placeholder="Rechercher (email, date, créneaux…)" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {draggable && <p className="text-[11px] text-muted">Clique pour ajouter, ou glisse vers le canevas.</p>}
      {!groups.length && <p className="text-xs text-muted">Aucun type ne correspond.</p>}
      {groups.map(g => (
        <section key={g.group} aria-label={g.group}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">{g.group}</h4>
          <ul className="grid grid-cols-2 gap-1">
            {g.entries.map(e => <Entry key={e.type} entry={e} onAdd={onAdd} compact={compact} draggable={draggable} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}
