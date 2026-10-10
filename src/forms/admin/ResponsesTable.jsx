// Tableau des réponses : rendu fenêtré (milliers de lignes), colonnes
// choisies / réordonnées / persistées, tris, regroupements, sélection
// multiple et traitement en masse.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Columns3, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Lock, Inbox, RotateCcw } from 'lucide-react';
import { STATUS_BADGE, statusesOf, groupRows, periodKey, periodLabel } from './analytics.js';
import { defaultVisible } from './columns.js';
import { readPref, writePref } from './prefs.js';
import { sortRows } from './responsesRepo.js';
import BulkBar from './BulkBar.jsx';

const ROW_H = 40;
const OVERSCAN = 8;
const MASK = '•••••';

export default function ResponsesTable({ ctx }) {
  const uid = useId();
  const { def, filtered, columns, dims, selected, setSelected, revealed } = ctx;
  const prefKey = `cols:${def.id}`;
  const [colPref, setColPref] = useState(() => readPref(prefKey, null));
  const visibleIds = useMemo(() => {
    const ids = (colPref?.order || defaultVisible(columns)).filter(id => columns.some(c => c.id === id));
    return ids.length ? ids : defaultVisible(columns);
  }, [colPref, columns]);
  const visibleCols = useMemo(() => visibleIds.map(id => columns.find(c => c.id === id)).filter(Boolean), [visibleIds, columns]);
  const saveCols = (order) => { const v = order ? { order } : null; setColPref(v); writePref(prefKey, v || undefined); };

  const [sort, setSort] = useState(() => readPref(`sort:${def.id}`, { id: '__submittedAt', dir: 'desc' }));
  const [groupBy, setGroupBy] = useState(() => readPref(`group:${def.id}`, ''));
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showCols, setShowCols] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find(c => c.id === sort.id) || columns[0];
    return sortRows(filtered, { dir: sort.dir, get: r => (col.id === '__submittedAt' ? r.submittedAt : col.value(r)) });
  }, [filtered, sort, columns]);

  // Regroupement : par question / statut / période
  const items = useMemo(() => {
    if (!groupBy) return sorted.map(r => ({ type: 'row', row: r, key: r.id }));
    let groups;
    if (groupBy.startsWith('period:')) {
      const p = groupBy.slice(7);
      groups = groupRows(sorted, { order: null, sortKeys: true, values: r => { const k = periodKey(r.submittedAt, p); return k ? [{ value: k, label: periodLabel(k, p) }] : []; } });
    } else {
      const dim = dims.find(d => d.id === groupBy);
      groups = dim ? groupRows(sorted, dim) : [{ value: 'all', label: 'Toutes', rows: sorted }];
    }
    const out = [];
    groups.forEach(g => {
      out.push({ type: 'group', group: g, key: `g:${g.value}` });
      if (!collapsed.has(g.value)) g.rows.forEach(r => out.push({ type: 'row', row: r, key: `${g.value}:${r.id}` }));
    });
    return out;
  }, [sorted, groupBy, dims, collapsed]);

  // Fenêtre visible
  const scroller = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(560);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => setViewH(el.clientHeight || 560);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN);
  const windowItems = items.slice(start, end);
  const totalW = 44 + visibleCols.reduce((a, c) => a + (c.width || 140), 0);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map(r => r.id)));
  const toggle = (id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sortBy = (id) => {
    const next = sort.id === id ? { id, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' };
    setSort(next);
    writePref(`sort:${def.id}`, next);
  };
  const statuses = statusesOf(def);

  const cell = (c, r) => {
    if (c.sensitive && !revealed) return <span className="text-muted" title="Donnée sensible masquée"><Lock size={11} className="inline -mt-0.5" aria-hidden="true" /> {MASK}</span>;
    if (c.id === '__status') {
      const s = statuses.find(x => x.id === r.status);
      return <span className={`badge ${STATUS_BADGE[s?.color] || 'badge-neutral'}`}>{s?.label || r.status}</span>;
    }
    const v = c.get(r);
    if (c.id === '__source' && r.pending) return <span className="badge badge-amber">{v} · en attente</span>;
    return v;
  };

  const groupOptions = [['', 'Aucun regroupement'], ['__status', 'Par statut'], ['period:day', 'Par jour'], ['period:week', 'Par semaine'], ['period:month', 'Par mois'],
    ...dims.filter(d => !d.id.startsWith('__')).map(d => [d.id, `Par réponse : ${d.label}`]), ...dims.filter(d => ['__tags', '__source', '__pole'].includes(d.id)).map(d => [d.id, `Par ${d.label.toLowerCase()}`])];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary !py-1.5" aria-expanded={showCols} onClick={() => setShowCols(s => !s)}><Columns3 size={15} aria-hidden="true" /> Colonnes ({visibleCols.length})</button>
        <label htmlFor={`${uid}-g`} className="sr-only">Regrouper</label>
        <select id={`${uid}-g`} className="input !w-auto max-w-full !py-1.5" value={groupBy} onChange={e => { setGroupBy(e.target.value); writePref(`group:${def.id}`, e.target.value); setCollapsed(new Set()); }}>
          {groupOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-dim">Clique sur un en-tête pour trier · Entrée pour ouvrir une réponse</span>
      </div>

      {showCols && <ColumnsPanel columns={columns} visibleIds={visibleIds} onChange={saveCols} />}

      {selected.size > 0 && <BulkBar ctx={ctx} />}

      {filtered.length === 0 ? (
        <div className="bg-surface border border-line rounded-2xl p-10 text-center space-y-2">
          <Inbox size={32} className="mx-auto text-muted" aria-hidden="true" />
          <p className="text-sm text-dim">{ctx.rows.length ? 'Aucune réponse ne correspond aux filtres.' : 'Aucune réponse pour l\'instant.'}</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div ref={scroller} className="overflow-auto relative" style={{ height: 'min(70vh, 640px)' }} onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            role="grid" aria-rowcount={items.length + 1} aria-colcount={visibleCols.length + 1} aria-label="Réponses">
            <div style={{ width: totalW, minWidth: '100%' }}>
              <div role="row" aria-rowindex={1} className="sticky top-0 z-10 flex bg-elevated border-b border-line text-xs font-semibold text-dim" style={{ height: ROW_H }}>
                <div role="columnheader" className="w-11 shrink-0 flex items-center justify-center">
                  <input type="checkbox" aria-label="Tout sélectionner (réponses filtrées)" checked={allSelected} onChange={toggleAll} />
                </div>
                {visibleCols.map(c => (
                  <div key={c.id} role="columnheader" aria-sort={sort.id === c.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ width: c.width || 140 }} className="shrink-0 px-2 flex items-center">
                    <button type="button" className="flex items-center gap-1 truncate hover:text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" onClick={() => sortBy(c.id)} title={c.label}>
                      <span className="truncate">{c.label}</span>
                      {sort.id === c.id && (sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />)}
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ height: items.length * ROW_H, position: 'relative' }}>
                {windowItems.map((it, i) => {
                  const idx = start + i;
                  const top = idx * ROW_H;
                  if (it.type === 'group') {
                    const g = it.group;
                    const isCol = collapsed.has(g.value);
                    return (
                      <div key={it.key} role="row" aria-rowindex={idx + 2} className="absolute left-0 right-0 flex items-center gap-2 px-2 bg-elevated/70 border-b border-line text-sm" style={{ top, height: ROW_H }}>
                        <button type="button" className="inline-flex items-center gap-1 font-semibold text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" aria-expanded={!isCol}
                          onClick={() => setCollapsed(s => { const n = new Set(s); if (n.has(g.value)) n.delete(g.value); else n.add(g.value); return n; })}>
                          {isCol ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />} {g.label}
                        </button>
                        <span className="badge badge-neutral">{g.rows.length}</span>
                        <button type="button" className="text-xs text-dim underline ml-2" onClick={() => setSelected(s => new Set([...s, ...g.rows.map(r => r.id)]))}>sélectionner le groupe</button>
                      </div>
                    );
                  }
                  const r = it.row;
                  const isSel = selected.has(r.id);
                  return (
                    <div key={it.key} role="row" aria-rowindex={idx + 2} aria-selected={isSel} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') ctx.openRow(r.id); if (e.key === ' ' && e.target === e.currentTarget) { e.preventDefault(); toggle(r.id); } }}
                      onClick={() => ctx.openRow(r.id)}
                      className={`absolute left-0 flex items-center border-b border-line/70 text-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/60 ${isSel ? 'bg-blue-500/[0.07]' : 'hover:bg-elevated'}`}
                      style={{ top, height: ROW_H, width: totalW, minWidth: '100%' }}>
                      <div role="gridcell" className="w-11 shrink-0 flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Sélectionner la réponse du ${c0(ctx.columns, r)}`} checked={isSel} onChange={() => toggle(r.id)} />
                      </div>
                      {visibleCols.map(c => (
                        <div key={c.id} role="gridcell" style={{ width: c.width || 140 }} className={`shrink-0 px-2 truncate ${c.numeric ? 'tabular-nums text-right' : ''} ${c.kind === 'meta' && c.id !== '__respondent' ? 'text-dim' : 'text-ink'}`}>
                          {cell(c, r)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="px-3 py-1.5 text-[11px] text-muted border-t border-line">{filtered.length} réponse(s) · {selected.size} sélectionnée(s) · lignes {items.length ? start + 1 : 0}–{end} affichées (rendu fenêtré)</p>
        </div>
      )}
    </div>
  );
}

const c0 = (columns, r) => columns[0].get(r);

function ColumnsPanel({ columns, visibleIds, onChange }) {
  const order = [...visibleIds, ...columns.map(c => c.id).filter(id => !visibleIds.includes(id))];
  const move = (id, d) => {
    const list = [...visibleIds];
    const i = list.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    onChange(list);
  };
  return (
    <div className="bg-surface border border-line rounded-2xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">Colonnes affichées (ordre conservé sur cet appareil)</p>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onChange(null)}><RotateCcw size={12} aria-hidden="true" /> Par défaut</button>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 max-h-72 overflow-auto">
        {order.map(id => {
          const c = columns.find(x => x.id === id);
          if (!c) return null;
          const on = visibleIds.includes(id);
          return (
            <li key={id} className="flex items-center gap-1 rounded-lg px-2 py-1 bg-elevated">
              <label className="flex items-center gap-2 text-sm text-ink flex-1 min-w-0">
                <input type="checkbox" checked={on} onChange={() => onChange(on ? visibleIds.filter(x => x !== id) : [...visibleIds, id])} />
                <span className="truncate">{c.label}</span>
                {c.sensitive && <Lock size={11} className="text-muted shrink-0" aria-label="sensible" />}
              </label>
              {on && <>
                <button type="button" className="btn-ghost !p-1" aria-label={`Monter ${c.label}`} onClick={() => move(id, -1)}><ArrowUp size={12} aria-hidden="true" /></button>
                <button type="button" className="btn-ghost !p-1" aria-label={`Descendre ${c.label}`} onClick={() => move(id, 1)}><ArrowDown size={12} aria-hidden="true" /></button>
              </>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
